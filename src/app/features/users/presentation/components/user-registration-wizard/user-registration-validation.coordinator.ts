import { inject, Injectable, WritableSignal } from '@angular/core';
import {
    DUPLICATE_COMMISSION_STRUCTURE_MESSAGE,
    UserRegistrationForm,
    WizardStepId,
} from './user-registration-wizard.models';
import {
    UserRegistrationValidationContext,
    UserRegistrationValidator,
} from './user-registration.validator';

export interface UserRegistrationValidationState {
    readonly activeStepId: WritableSignal<WizardStepId>;
    readonly form: WritableSignal<UserRegistrationForm>;
    readonly formErrors: WritableSignal<Record<string, string>>;
    readonly stepOrder: () => readonly WizardStepId[];
    readonly context: () => UserRegistrationValidationContext;
}

/** Orquesta validación y estado de errores; las reglas siguen en UserRegistrationValidator. */
@Injectable({ providedIn: 'root' })
export class UserRegistrationValidationCoordinator {
    private readonly validator = inject(UserRegistrationValidator);

    validateAllSteps(state: UserRegistrationValidationState): boolean {
        for (const stepId of state.stepOrder()) {
            if (!this.validateStep(stepId, state)) {
                state.activeStepId.set(stepId);
                return false;
            }
        }
        return true;
    }

    validateStep(stepId: WizardStepId, state: UserRegistrationValidationState): boolean {
        const nextErrors = this.validator.validateStep(stepId, state.form(), state.context());

        state.formErrors.update((currentErrors) => {
            const cleanErrors = { ...currentErrors };
            this.validator.getStepValidationFields(stepId).forEach((field) => delete cleanErrors[field]);
            return { ...cleanErrors, ...nextErrors };
        });

        return Object.keys(nextErrors).length === 0;
    }

    refreshCommissionStructureConflict(state: UserRegistrationValidationState): void {
        const conflict = this.validator.getAssignmentCommissionStructureConflict(state.form());
        const conflictFields: readonly (keyof UserRegistrationForm)[] = [
            'commissionInstitution',
            'commissionDecentralizedBody',
            'commissionAdministrativeUnit',
        ];

        state.formErrors.update((currentErrors) => {
            const next = { ...currentErrors };
            conflictFields.forEach((field) => {
                if (next[String(field)] === DUPLICATE_COMMISSION_STRUCTURE_MESSAGE) {
                    delete next[String(field)];
                }
            });
            if (conflict) {
                next[String(conflict.field)] = DUPLICATE_COMMISSION_STRUCTURE_MESSAGE;
            }
            return next;
        });
    }

    validateChangedIdentityFields(state: UserRegistrationValidationState): boolean {
        const current = state.form();
        const context = state.context();

        if (!this.validator.shouldValidateIdentityFields(current, context)) {
            this.clearIdentityFieldErrors(state);
            return true;
        }

        const nextErrors: Record<string, string> = {};
        this.validator.addIdentityValidationErrors(current, nextErrors);
        state.formErrors.update((currentErrors) => ({
            ...this.validator.withoutIdentityFieldErrors(currentErrors),
            ...nextErrors,
        }));
        return Object.keys(nextErrors).length === 0;
    }

    clearIdentityFieldErrors(state: UserRegistrationValidationState): void {
        state.formErrors.update((currentErrors) =>
            this.validator.withoutIdentityFieldErrors(currentErrors),
        );
    }
}
