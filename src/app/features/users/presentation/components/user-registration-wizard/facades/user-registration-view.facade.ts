import { inject, Injectable } from '@angular/core';
import { SiauStep } from '../../../../../../shared/ui';
import { MINIMUM_BIRTH_DATE, getAdultCutoffDateInput } from '../../../../../../shared/validation/field-validators';
import { UserRegistrationContextFactory } from '../factories/user-registration-context.factory';
import { UserRegistrationEditScopeController } from '../controllers/user-registration-edit-scope.controller';
import { UserRegistrationFieldController } from '../controllers/user-registration-field.controller';
import { UserRegistrationFormRules } from '../rules/user-registration-form.rules';
import { UserRegistrationIdentityCoordinator } from '../coordinators/user-registration-identity.coordinator';
import { UserRegistrationNavigationActions, UserRegistrationNavigationController } from '../controllers/user-registration-navigation.controller';
import { UserRegistrationPresenter } from '../presenters/user-registration.presenter';
import { UserRegistrationProfileController } from '../controllers/user-registration-profile.controller';
import { UserRegistrationState } from '../state/user-registration.state';
import { UserRegistrationStructureController } from '../controllers/user-registration-structure.controller';
import { UserRegistrationSubmissionCoordinator } from '../coordinators/user-registration-submission.coordinator';
import {
    ALL_WIZARD_STEPS,
    AccountStatus,
    AssignedSystemProfile,
    CurpValidationMessageTone,
    CurpValidationStatus,
    ProfileOrigin,
    UserRegistrationForm,
    WizardStepId,
} from '../models/user-registration-wizard.models';

/**
 * Fachada de acciones de la vista.
 *
 * El componente Angular queda como adaptador de inputs/outputs y el template
 * conserva sus bindings. Esta clase coordina acciones de UI sobre servicios ya
 * separados; no implementa persistencia ni contratos HTTP.
 */
@Injectable()
export class UserRegistrationViewFacade {
    private readonly state = inject(UserRegistrationState);
    private readonly presenter = inject(UserRegistrationPresenter);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly fieldController = inject(UserRegistrationFieldController);
    private readonly editScopeController = inject(UserRegistrationEditScopeController);
    private readonly navigation = inject(UserRegistrationNavigationController);
    private readonly contextFactory = inject(UserRegistrationContextFactory);
    private readonly identity = inject(UserRegistrationIdentityCoordinator);
    private readonly profiles = inject(UserRegistrationProfileController);
    private readonly structure = inject(UserRegistrationStructureController);
    private readonly submission = inject(UserRegistrationSubmissionCoordinator);

    dismissRenapoMessage(): void { this.state.renapoMessageVisible.set(false); }
    dismissSubmitError(): void { this.fieldController.clearFieldError('submit'); }
    dismissProfileResetNotice(): void { this.state.profileResetNotice.set(null); }

    dismissCurrentStepErrors(): void {
        const keys = new Set(this.presenter.currentStepErrors().map((error) => error.key));
        if (!keys.size) return;
        this.state.formErrors.update((current) => {
            const next = { ...current };
            keys.forEach((key) => delete next[key]);
            return next;
        });
    }

    dismissStructureProfileError(): void {
        if (this.state.structureProfileLookupStatus() !== 'error') return;
        this.state.structureProfileLookupStatus.set('idle');
        this.state.structureProfileMessage.set('');
    }

    selectProfileOrigin(origin: ProfileOrigin): void {
        this.editScopeController.selectProfileOrigin(origin, () => this.contextFactory.resetStructureProfileCatalog());
    }

    previousProfile(origin: ProfileOrigin): void { this.profiles.previousProfile(origin, this.contextFactory.profile()); }
    nextProfile(origin: ProfileOrigin): void { this.profiles.nextProfile(origin, this.contextFactory.profile()); }
    getProfileCarouselIndex(origin: ProfileOrigin): number { return this.profiles.getCarouselIndex(origin, this.contextFactory.profile()); }

    enableEditing(readonlyMode: boolean): void {
        if (!this.presenter.isEditMode() || readonlyMode) return;
        this.state.editEnabled.set(true);
        this.contextFactory.loadHydratedAssignmentCatalogs(this.state.form());
    }

    goToStep(stepId: string): void {
        if (this.isWizardStep(stepId)) this.navigation.goToStep(stepId, this.navigationActions());
    }
    nextStep(): void { this.navigation.nextStep(this.navigationActions()); }
    previousStep(): void { this.navigation.previousStep(); }

    closeWizard(onClosed: () => void): void {
        if (this.state.isSubmitting() || this.presenter.isDraftBusy()) return;
        onClosed();
        this.contextFactory.resetWizard();
    }

    closeSaveSuccessModal(onSaved: () => void, onClosed: () => void): void {
        this.state.saveSuccess.set(null);
        onSaved();
        onClosed();
        this.contextFactory.resetWizard();
    }

    submit(): void { this.submission.submit(this.contextFactory.submission()); }

    updateForm<K extends keyof UserRegistrationForm>(key: K, value: UserRegistrationForm[K] | string | null): void {
        this.fieldController.updateForm(key, value, (origin) => this.claimEditStructureScope(origin));
    }
    updateCurp(value: string): void { this.fieldController.updateCurp(value); }
    updateRfc(value: string): void { this.fieldController.updateRfc(value); }
    toggleCurpUnlock(checked: boolean): void { this.fieldController.toggleCurpUnlock(checked); }

    toggleCommissionSection(checked: boolean): void { this.structure.toggleCommissionSection(checked, this.contextFactory.structure()); }
    updateAssignmentInstitutionType(value: string | null): void { this.structure.updateAssignmentInstitutionType(value, this.contextFactory.structure()); }
    updateAssignmentEntity(value: string | null): void { this.structure.updateAssignmentEntity(value, this.contextFactory.structure()); }
    updateAssignmentMunicipality(value: string | null): void { this.structure.updateAssignmentMunicipality(value, this.contextFactory.structure()); }
    updateAssignmentInstitution(value: string | null): void { this.structure.updateAssignmentInstitution(value, this.contextFactory.structure()); }
    updateAssignmentDecentralizedBody(value: string | null): void { this.structure.updateAssignmentDecentralizedBody(value, this.contextFactory.structure()); }
    updateAssignmentAdministrativeUnit(value: string | null): void { this.structure.updateAssignmentAdministrativeUnit(value, this.contextFactory.structure()); }
    updateCommissionInstitutionType(value: string | null): void { this.structure.updateCommissionInstitutionType(value, this.contextFactory.structure()); }
    updateCommissionEntity(value: string | null): void { this.structure.updateCommissionEntity(value, this.contextFactory.structure()); }
    updateCommissionMunicipality(value: string | null): void { this.structure.updateCommissionMunicipality(value, this.contextFactory.structure()); }
    updateCommissionInstitution(value: string | null): void { this.structure.updateCommissionInstitution(value, this.contextFactory.structure()); }
    updateCommissionDecentralizedBody(value: string | null): void { this.structure.updateCommissionDecentralizedBody(value, this.contextFactory.structure()); }
    updateCommissionAdministrativeUnit(value: string | null): void { this.structure.updateCommissionAdministrativeUnit(value, this.contextFactory.structure()); }

    toggleProfile(profile: string): void {
        if (this.presenter.isFormDisabled() || this.state.isSubmitting()) return;
        this.state.form.update((current) => ({
            ...current,
            profiles: current.profiles.includes(profile)
                ? current.profiles.filter((item) => item !== profile)
                : [...current.profiles, profile],
        }));
    }

    isFirstStep(): boolean { return this.presenter.activeIndex() === 0; }
    isLastStep(): boolean { return this.presenter.activeIndex() === this.presenter.stepOrder().length - 1; }
    updateSelectedSystem(value: string | null): void { this.profiles.updateSelectedSystem(value, this.contextFactory.profile()); }
    updateSelectedRole(value: string | null): void { this.profiles.updateSelectedRole(value, this.contextFactory.profile()); }
    addAssignedProfile(): void { this.profiles.addAssignedProfile(this.contextFactory.profile()); }
    removeAssignedProfile(id: string): void { this.profiles.removeAssignedProfile(id, this.contextFactory.profile()); }
    canRemoveAssignedProfile(profile: AssignedSystemProfile): boolean { return this.profiles.canRemoveAssignedProfile(profile, this.contextFactory.profile()); }
    togglePasswordVisibility(): void { this.state.showPassword.update((value) => !value); }
    toggleConfirmPasswordVisibility(): void { this.state.showConfirmPassword.update((value) => !value); }
    isAccountStatusDisabled(_status: AccountStatus): boolean { return true; }
    setAccountStatus(_status: AccountStatus): void { return; }

    getReadonlyModeTitle(): string {
        return this.state.form().accountStatus === 'blocked' ? 'Vista de usuario bloqueado' : 'Vista de usuario suspendido';
    }
    getReadonlyModeDescription(): string {
        return this.state.form().accountStatus === 'blocked'
            ? 'El usuario está bloqueado por seguridad. Solo puedes consultar su detalle.'
            : 'El usuario está suspendido. Solo puedes consultar su detalle.';
    }
    getStepIcon(step: SiauStep): string { return step.completed ? 'check' : step.icon; }
    getStepClass(step: SiauStep, index: number): string {
        return [
            'registration-wizard__step',
            index === this.presenter.activeIndex() ? 'registration-wizard__step--active' : '',
            step.completed ? 'registration-wizard__step--completed' : '',
        ].join(' ').trim();
    }
    getCurpValidationStatusLabel(status: CurpValidationStatus): string { return this.formRules.toText(status) || 'Sin información'; }
    getCurpValidationStatusClass(status: CurpValidationStatus): string {
        const normalized = this.formRules.normalizeText(status);
        const danger = ['inactivo', 'reprobado', 'rechazado', 'vencido', 'no vigente'].some((value) => normalized.includes(value));
        const success = !danger && ['activo', 'aprobado', 'vigente'].some((value) => normalized.includes(value));
        return `registration-wizard__curp-validation-pill registration-wizard__curp-validation-pill--${danger ? 'danger' : success ? 'success' : 'neutral'}`;
    }
    getCurpValidationMessageClass(tone: CurpValidationMessageTone): string {
        return `registration-wizard__curp-validation-message registration-wizard__curp-validation-message--${tone}`;
    }

    deleteRegistrationDraft(): void { this.contextFactory.requestDeleteDraft(); }
    closeDeleteDraftConfirmation(): void { this.contextFactory.closeDeleteDraftConfirmation(); }
    confirmDeleteRegistrationDraft(): void { this.contextFactory.confirmDeleteDraft(); }
    minimumBirthDate(): string { return MINIMUM_BIRTH_DATE; }
    maximumBirthDate(): string { return getAdultCutoffDateInput(); }
    fieldError(key: string): string | null { return this.state.formErrors()[key] ?? null; }
    maximumTodayDate(): string {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.formRules.formatDateInputValue(today);
    }

    private claimEditStructureScope(origin: ProfileOrigin): boolean {
        return this.editScopeController.claim(origin, true, true, () => this.contextFactory.resetStructureProfileCatalog());
    }

    private consultEcccAndPersonal(): void { this.identity.consultEcccAndPersonal(this.state.form); }

    private navigationActions(): UserRegistrationNavigationActions {
        return {
            validateStep: (stepId) => this.contextFactory.validateStep(stepId),
            validateChangedIdentityFields: () => this.contextFactory.validateChangedIdentityFields(),
            consultEcccAndPersonal: () => this.consultEcccAndPersonal(),
            buildDraftSaveRequest: (nextStepId, completedSteps) => this.contextFactory.buildDraftSaveRequest(nextStepId, completedSteps),
        };
    }

    private isWizardStep(value: string): value is WizardStepId {
        return ALL_WIZARD_STEPS.includes(value as WizardStepId);
    }
}
