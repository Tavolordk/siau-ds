import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { UsersFacade } from '../../../../application/facades/users.facade';
import { BorradorGuardarRequest } from '../../../../domain/models/user-record.model';
import { WizardStepId } from '../models/user-registration-wizard.models';
import { UserRegistrationState } from '../state/user-registration.state';
import { UserRegistrationPresenter } from '../view/user-registration.presenter';

export interface UserRegistrationNavigationActions {
    readonly validateStep: (stepId: WizardStepId) => boolean;
    readonly validateChangedIdentityFields: () => boolean;
    readonly consultEcccAndPersonal: () => void;
    readonly buildDraftSaveRequest: (
        nextStepId: WizardStepId,
        completedSteps: readonly WizardStepId[],
    ) => BorradorGuardarRequest;
}

/** Navegación entre pasos y guardado automático del avance. */
@Injectable()
export class UserRegistrationNavigationController {
    private readonly state = inject(UserRegistrationState);
    private readonly presenter = inject(UserRegistrationPresenter);
    private readonly usersFacade = inject(UsersFacade);
    private readonly destroyRef = inject(DestroyRef);

    goToStep(stepId: WizardStepId, actions: UserRegistrationNavigationActions): void {
        const current = this.state.activeStepId();
        if (stepId === current) {
            return;
        }

        if (this.presenter.isEditMode()) {
            if (
                current === 'personal-data' &&
                !actions.validateChangedIdentityFields()
            ) {
                return;
            }
            this.state.activeStepId.set(stepId);
            return;
        }

        if (this.state.isDraftLoading() || this.state.isDraftDeleting()) {
            return;
        }

        const order = this.presenter.stepOrder();
        const currentIndex = order.indexOf(current);
        const targetIndex = order.indexOf(stepId);
        if (currentIndex < 0 || targetIndex < 0) {
            return;
        }

        const movingForward = targetIndex > currentIndex;
        if (movingForward && !actions.validateStep(current)) {
            return;
        }

        const completedSteps = movingForward
            ? this.withCompletedStep(current)
            : this.state.completedSteps();

        this.saveDraftAndNavigate(stepId, completedSteps, actions, () => {
            if (movingForward && current === 'personal-data') {
                actions.consultEcccAndPersonal();
            }
        });
    }

    nextStep(actions: UserRegistrationNavigationActions): void {
        const current = this.state.activeStepId();
        const order = this.presenter.stepOrder();
        const currentIndex = order.indexOf(current);

        if (
            (this.presenter.isEditMode() &&
                current === 'personal-data' &&
                !actions.validateChangedIdentityFields()) ||
            (!this.presenter.isEditMode() && !actions.validateStep(current))
        ) {
            return;
        }

        if (this.presenter.isEditMode()) {
            if (current === 'personal-data') {
                actions.consultEcccAndPersonal();
            }
            this.markCompleted(current);
            if (currentIndex < order.length - 1) {
                this.state.activeStepId.set(order[currentIndex + 1]);
            }
            return;
        }

        if (
            this.state.isDraftLoading() ||
            this.state.isDraftDeleting() ||
            currentIndex < 0 ||
            currentIndex >= order.length - 1
        ) {
            return;
        }

        const nextStepId = order[currentIndex + 1];
        const completedSteps = this.withCompletedStep(current);

        this.saveDraftAndNavigate(nextStepId, completedSteps, actions, () => {
            if (current === 'personal-data') {
                actions.consultEcccAndPersonal();
            }
        });
    }

    previousStep(actions: UserRegistrationNavigationActions): void {
        const currentIndex = this.presenter.activeIndex();
        if (currentIndex <= 0) {
            return;
        }

        const previousStepId = this.presenter.stepOrder()[currentIndex - 1];

        if (this.presenter.isEditMode()) {
            const current = this.state.activeStepId();
            if (
                current === 'personal-data' &&
                !actions.validateChangedIdentityFields()
            ) {
                return;
            }
            this.state.activeStepId.set(previousStepId);
            return;
        }

        if (this.state.isDraftLoading() || this.state.isDraftDeleting()) {
            return;
        }

        this.saveDraftAndNavigate(
            previousStepId,
            this.state.completedSteps(),
            actions,
        );
    }

    markCompleted(stepId: WizardStepId): void {
        this.state.completedSteps.update((current) =>
            current.includes(stepId) ? current : [...current, stepId],
        );
    }

    withCompletedStep(stepId: WizardStepId): readonly WizardStepId[] {
        const completed = this.state.completedSteps();
        return completed.includes(stepId) ? completed : [...completed, stepId];
    }

    private saveDraftAndNavigate(
        targetStepId: WizardStepId,
        completedSteps: readonly WizardStepId[],
        actions: UserRegistrationNavigationActions,
        afterNavigation?: () => void,
    ): void {
        let request: BorradorGuardarRequest;

        try {
            request = actions.buildDraftSaveRequest(targetStepId, completedSteps);
        } catch {
            this.state.draftMessage.set('');
            this.state.draftError.set(
                'No se pudo preparar el guardado del borrador. Puedes continuar con el registro.',
            );
            this.completeNavigation(targetStepId, completedSteps, afterNavigation);
            return;
        }

        this.state.isDraftSaving.set(true);
        this.state.draftError.set('');
        this.state.draftMessage.set('Guardando avance...');

        this.usersFacade
            .saveRegistrationDraft(request)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.state.isDraftSaving.set(false)),
            )
            .subscribe({
                next: (response) => {
                    const savedDraftId = response.datos?.borradorId;
                    if (savedDraftId && savedDraftId > 0) {
                        this.state.draftId.set(savedDraftId);
                    }

                    this.state.draftMessage.set(response.mensaje?.trim() || 'Avance guardado.');
                },
                error: () => {
                    this.state.draftMessage.set('');
                    this.state.draftError.set(
                        'No se pudo guardar el borrador. Puedes continuar con el registro.',
                    );
                },
            });

        this.completeNavigation(targetStepId, completedSteps, afterNavigation);
    }

    private completeNavigation(
        targetStepId: WizardStepId,
        completedSteps: readonly WizardStepId[],
        afterNavigation?: () => void,
    ): void {
        this.state.completedSteps.set(completedSteps);
        this.state.activeStepId.set(targetStepId);
        afterNavigation?.();
    }
}
