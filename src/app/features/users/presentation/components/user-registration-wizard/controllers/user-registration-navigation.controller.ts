import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { UsersFacade } from '../../../../application/users.facade';
import { BorradorGuardarRequest } from '../../../../domain/models/user-record.model';
import { WizardStepId } from '../models/user-registration-wizard.models';
import { UserRegistrationPresenter } from '../presenters/user-registration.presenter';
import { UserRegistrationState } from '../state/user-registration.state';

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
        if (this.presenter.isEditMode()) {
            const currentStep = this.state.activeStepId();
            if (
                currentStep === 'personal-data' &&
                stepId !== currentStep &&
                !actions.validateChangedIdentityFields()
            ) {
                return;
            }
            this.state.activeStepId.set(stepId);
            return;
        }

        const current = this.state.activeStepId();
        const order = this.presenter.stepOrder();
        const currentIndex = order.indexOf(current);
        const targetIndex = order.indexOf(stepId);
        if (targetIndex < 0) {
            return;
        }
        if (targetIndex > currentIndex && !actions.validateStep(current)) {
            return;
        }
        this.state.activeStepId.set(stepId);
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

        if (this.presenter.isDraftBusy() || currentIndex >= order.length - 1) {
            return;
        }

        const nextStepId = order[currentIndex + 1];
        const completedSteps = this.withCompletedStep(current);
        this.state.completedSteps.set(completedSteps);
        this.state.activeStepId.set(nextStepId);

        if (current === 'personal-data') {
            actions.consultEcccAndPersonal();
        }

        let request: BorradorGuardarRequest;
        try {
            request = actions.buildDraftSaveRequest(nextStepId, completedSteps);
        } catch {
            this.state.draftMessage.set('');
            this.state.draftError.set('No se pudo guardar el borrador. Puedes continuar con el registro.');
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
                    this.state.draftError.set('No se pudo guardar el borrador. Puedes continuar con el registro.');
                },
            });
    }

    previousStep(): void {
        const currentIndex = this.presenter.activeIndex();
        if (currentIndex > 0) {
            this.state.activeStepId.set(this.presenter.stepOrder()[currentIndex - 1]);
        }
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
}
