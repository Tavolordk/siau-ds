import { inject, Injectable } from '@angular/core';
import {
    RESTRICTED_TEXT_LIMITS,
    getBirthDateError,
    getRestrictedTextError,
} from '../../../../../../shared/validation/field-validators';
import { UserRegistrationForm } from '../models/user-registration-wizard.models';
import { UserRegistrationFormRules } from '../validation/user-registration-form.rules';
import { UserRegistrationIdentityCoordinator } from '../identity/user-registration-identity.coordinator';
import { UserRegistrationPresenter } from '../view/user-registration.presenter';
import { UserRegistrationState } from '../state/user-registration.state';

/** Mutaciones de campos personales/contacto del formulario. */
@Injectable()
export class UserRegistrationFieldController {
    private readonly state = inject(UserRegistrationState);
    private readonly presenter = inject(UserRegistrationPresenter);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly identity = inject(UserRegistrationIdentityCoordinator);

    updateForm<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K] | string | null,
        claimEditStructureScope: (origin: 'adscripcion' | 'comision') => boolean,
    ): void {
        if (this.presenter.isFormDisabled() || this.state.isSubmitting()) {
            return;
        }

        if (key === 'curp') {
            this.updateCurp(this.formRules.toText(value));
            return;
        }
        if (key === 'rfc') {
            this.updateRfc(this.formRules.toText(value));
            return;
        }

        const normalizedValue = this.formRules.normalizeFormInputValue(key, value);
        const previousValue = this.state.form()[key];
        const changed = normalizedValue !== previousValue;

        if (
            changed &&
            (key === 'position' || key === 'functions' || key === 'admissionDate' || key === 'employeeNumber') &&
            !claimEditStructureScope('adscripcion')
        ) {
            return;
        }
        if (changed && key === 'commissionAdmissionDate' && !claimEditStructureScope('comision')) {
            return;
        }

        this.state.form.update((current) => ({ ...current, [key]: normalizedValue }));

        if (
            normalizedValue !== previousValue &&
            (key === 'cuip' ||
                key === 'firstName' ||
                key === 'lastName' ||
                key === 'secondLastName' ||
                key === 'birthDate')
        ) {
            this.identity.clearCurpValidationSummary();
        }

        if (key === 'email' || key === 'phone') {
            this.clearFieldError('email');
            this.clearFieldError('phone');
            return;
        }

        this.clearFieldError(String(key));
        this.applyLiveFieldValidation(key, normalizedValue);
    }

    updateCurp(value: string): void {
        if (this.presenter.isCurpInputDisabled()) {
            return;
        }

        const curp = this.formRules.normalizeFormInputValue('curp', value);
        const previousCurp = this.state.form().curp;
        if (curp === previousCurp) {
            return;
        }

        this.identity.clearCurpLookupResultsForEdit(this.state.form, this.state.formErrors);
        this.state.form.update((current) => ({ ...current, curp }));
        this.clearFieldError('curp');
        this.clearFieldError('rfc');
        this.clearFieldError('birthDate');

        if (curp.length !== 18) {
            return;
        }
        if (!this.formRules.isValidCurp(curp)) {
            this.state.formErrors.update((current) => ({
                ...current,
                curp: 'La CURP no tiene un formato válido.',
            }));
            return;
        }

        this.consultRenapo(curp);
    }

    updateRfc(value: string): void {
        if (this.presenter.isFormDisabled() || this.state.isSubmitting()) {
            return;
        }

        const current = this.state.form();
        const prefix = this.formRules.getRfcPrefixFromCurp(current.curp);
        const rfc = prefix
            ? `${prefix}${this.formRules.getRfcHomoclave(value, prefix, current.rfc)}`
            : this.formRules.normalizeRfc(value);

        this.state.form.update((form) => ({ ...form, rfc }));
        if (rfc !== current.rfc) {
            this.identity.clearCurpValidationSummary();
        }
        this.clearFieldError('rfc');
    }

    toggleCurpUnlock(checked: boolean): void {
        if (
            (this.presenter.isEditMode() && this.state.detailCurpValidated()) ||
            this.presenter.isFormDisabled() ||
            this.state.isSubmitting()
        ) {
            return;
        }

        if (checked) {
            this.state.curpUnlockChecked.set(true);
            return;
        }

        const currentCurp = this.state.form().curp;
        if (
            currentCurp !== this.identity.lastRenapoCurp() &&
            !this.formRules.isValidCurp(currentCurp)
        ) {
            this.state.curpUnlockChecked.set(true);
            this.state.formErrors.update((current) => ({
                ...current,
                curp: 'Completa una CURP válida de 18 caracteres antes de volver a bloquearla.',
            }));
            return;
        }

        this.state.curpUnlockChecked.set(false);
        if (currentCurp !== this.identity.lastRenapoCurp()) {
            this.consultRenapo(currentCurp);
            return;
        }
        this.state.curpLocked.set(true);
    }

    consultRenapo(curp = this.state.form().curp): void {
        this.identity.consultRenapo(curp, {
            form: this.state.form,
            formErrors: this.state.formErrors,
            genderOptions: () => this.state.genderOptions(),
            isEditMode: this.presenter.isEditMode(),
            detailCurpValidated: this.state.detailCurpValidated(),
            applyLiveFieldValidation: (field, value) =>
                this.applyLiveFieldValidation(field, value),
        });
    }

    clearFieldError(key: string): void {
        this.state.formErrors.update((current) => {
            if (!current[key]) {
                return current;
            }
            const next = { ...current };
            delete next[key];
            return next;
        });
    }

    private applyLiveFieldValidation<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K],
    ): void {
        const text = this.formRules.toText(value);
        let message: string | null = null;

        if (key === 'position' && text) {
            message = getRestrictedTextError(
                text,
                RESTRICTED_TEXT_LIMITS.position.min,
                RESTRICTED_TEXT_LIMITS.position.max,
                'El cargo',
            );
        } else if (key === 'functions' && text) {
            message = getRestrictedTextError(
                text,
                RESTRICTED_TEXT_LIMITS.functions.min,
                RESTRICTED_TEXT_LIMITS.functions.max,
                'Las funciones',
            );
        } else if (key === 'birthDate' && text) {
            message = getBirthDateError(text);
        }

        if (message) {
            this.state.formErrors.update((current) => ({
                ...current,
                [String(key)]: message,
            }));
        }
    }
}
