import { inject, Injectable, WritableSignal } from '@angular/core';
import {
    DUPLICATE_COMMISSION_STRUCTURE_MESSAGE,
    UserRegistrationForm,
    WizardStepId,
} from '../models/user-registration-wizard.models';
import {
    UserRegistrationValidationContext,
    UserRegistrationValidator,
} from './user-registration.validator';

export interface UserRegistrationValidationState {
    readonly activeStepId: WritableSignal<WizardStepId>;
    readonly form: WritableSignal<UserRegistrationForm>;
    readonly formErrors: WritableSignal<Record<string, string>>;
    readonly rfcAvailabilityStatus: WritableSignal<'unvalidated' | 'pending' | 'valid' | 'invalid'>;
    readonly emailAvailabilityStatus: WritableSignal<'unvalidated' | 'pending' | 'valid' | 'invalid'>;
    readonly phoneAvailabilityStatus: WritableSignal<'unvalidated' | 'pending' | 'valid' | 'invalid'>;
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
        const currentErrors = state.formErrors();
        const nextErrors = this.validator.validateStep(stepId, state.form(), state.context());

        if (stepId === 'personal-data' && !state.context().isEditMode) {
            const current = state.form();

            if (!nextErrors['rfc'] && current.rfc.trim()) {
                const rfcStatus = state.rfcAvailabilityStatus();
                if (rfcStatus !== 'valid') {
                    nextErrors['rfc'] = rfcStatus === 'invalid'
                        ? (currentErrors['rfc'] || 'El RFC ya se encuentra registrado o tiene una solicitud en curso.')
                        : rfcStatus === 'pending'
                            ? 'Espera a que termine la validación del RFC.'
                            : 'El RFC debe validarse antes de continuar.';
                }
            }
        }

        if (stepId === 'contact' && !state.context().isEditMode) {
            const current = state.form();

            if (!nextErrors['email'] && current.email.trim()) {
                const emailStatus = state.emailAvailabilityStatus();
                if (emailStatus !== 'valid') {
                    nextErrors['email'] = emailStatus === 'invalid'
                        ? (currentErrors['email'] || 'El correo electrónico ya se encuentra registrado.')
                        : emailStatus === 'pending'
                            ? 'Espera a que termine la validación del correo electrónico.'
                            : 'El correo electrónico debe validarse antes de continuar.';
                }
            }

            if (!nextErrors['phone'] && current.phone.trim()) {
                const phoneStatus = state.phoneAvailabilityStatus();
                if (phoneStatus !== 'valid') {
                    nextErrors['phone'] = phoneStatus === 'invalid'
                        ? (currentErrors['phone'] || 'El teléfono celular ya se encuentra registrado.')
                        : phoneStatus === 'pending'
                            ? 'Espera a que termine la validación del teléfono celular.'
                            : 'El teléfono celular debe validarse antes de continuar.';
                }
            }
        }

        state.formErrors.update((errors) => {
            const cleanErrors = { ...errors };
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
