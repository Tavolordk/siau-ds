import { inject } from '@angular/core';
import { SiauStep } from '../../../../../../shared/ui';
import {
    AccountStatus,
    AssignedSystemProfile,
    CurpValidationMessageTone,
    CurpValidationStatus,
    ProfileOrigin,
    UserRegistrationForm,
} from '../models/user-registration-wizard.models';
import { UserRegistrationPresenter } from './user-registration.presenter';
import { UserRegistrationState } from '../state/user-registration.state';
import { UserRegistrationViewFacade } from './user-registration-view.facade';

/**
 * Contexto común para los fragmentos visuales del wizard.
 *
 * Los subcomponentes de presentación comparten las mismas instancias de
 * estado/presenter/fachada provistas por el wizard padre. De esta forma el
 * HTML puede dividirse por dominio sin duplicar lógica ni crear estado local.
 */
export abstract class UserRegistrationTemplateContext {
    protected readonly state = inject(UserRegistrationState);
    protected readonly presenter = inject(UserRegistrationPresenter);
    protected readonly view = inject(UserRegistrationViewFacade);

    protected readonly readonlyMode = this.state.readonlyMode;
    protected readonly activeStepId = this.state.activeStepId;
    protected readonly editEnabled = this.state.editEnabled;
    protected readonly completedSteps = this.state.completedSteps;
    protected readonly form = this.state.form;
    protected readonly isSubmitting = this.state.isSubmitting;
    protected readonly isDraftLoading = this.state.isDraftLoading;
    protected readonly isDraftSaving = this.state.isDraftSaving;
    protected readonly isDraftDeleting = this.state.isDraftDeleting;
    protected readonly draftId = this.state.draftId;
    protected readonly draftMessage = this.state.draftMessage;
    protected readonly draftError = this.state.draftError;
    protected readonly deleteDraftConfirmationOpen = this.state.deleteDraftConfirmationOpen;
    protected readonly formErrors = this.state.formErrors;
    protected readonly saveSuccess = this.state.saveSuccess;
    protected readonly renapoLookupStatus = this.state.renapoLookupStatus;
    protected readonly renapoMessage = this.state.renapoMessage;
    protected readonly renapoMessageVisible = this.state.renapoMessageVisible;
    protected readonly curpLocked = this.state.curpLocked;
    protected readonly curpUnlockChecked = this.state.curpUnlockChecked;
    protected readonly curpValidationSummary = this.state.curpValidationSummary;
    protected readonly selectedSystem = this.state.selectedSystem;
    protected readonly selectedRole = this.state.selectedRole;
    protected readonly selectedProfileOrigin = this.state.selectedProfileOrigin;
    protected readonly assignedSystemProfiles = this.state.assignedSystemProfiles;
    protected readonly assignmentProfileCarouselIndex = this.state.assignmentProfileCarouselIndex;
    protected readonly commissionProfileCarouselIndex = this.state.commissionProfileCarouselIndex;
    protected readonly profileResetNotice = this.state.profileResetNotice;
    protected readonly editStructureScope = this.state.editStructureScope;
    protected readonly detailRoleOptionsBySystem = this.state.detailRoleOptionsBySystem;
    protected readonly structureProfileLookupStatus = this.state.structureProfileLookupStatus;
    protected readonly structureProfileMessage = this.state.structureProfileMessage;
    protected readonly showPassword = this.state.showPassword;
    protected readonly showConfirmPassword = this.state.showConfirmPassword;
    protected readonly genderOptions = this.state.genderOptions;
    protected readonly civilStatusOptions = this.state.civilStatusOptions;
    protected readonly userTypeOptions = this.state.userTypeOptions;
    protected readonly systemOptions = this.state.systemOptions;
    protected readonly roleOptions = this.state.roleOptions;
    protected readonly institutionTypeOptions = this.state.institutionTypeOptions;
    protected readonly stateOptions = this.state.stateOptions;
    protected readonly municipalityOptions = this.state.municipalityOptions;
    protected readonly institutionOptions = this.state.institutionOptions;
    protected readonly decentralizedBodyOptions = this.state.decentralizedBodyOptions;
    protected readonly administrativeUnitOptions = this.state.administrativeUnitOptions;
    protected readonly commissionMunicipalityOptions = this.state.commissionMunicipalityOptions;
    protected readonly commissionInstitutionOptions = this.state.commissionInstitutionOptions;
    protected readonly commissionDecentralizedBodyOptions = this.state.commissionDecentralizedBodyOptions;
    protected readonly commissionAdministrativeUnitOptions = this.state.commissionAdministrativeUnitOptions;

    protected readonly assignmentDecentralizedBodyLocked = this.presenter.assignmentDecentralizedBodyLocked;
    protected readonly assignmentAdministrativeUnitEnabled = this.presenter.assignmentAdministrativeUnitEnabled;
    protected readonly assignmentDecentralizedBodyChoices = this.presenter.assignmentDecentralizedBodyChoices;
    protected readonly assignmentAdministrativeUnitChoices = this.presenter.assignmentAdministrativeUnitChoices;
    protected readonly assignmentDecentralizedBodyHint = this.presenter.assignmentDecentralizedBodyHint;
    protected readonly assignmentAdministrativeUnitHint = this.presenter.assignmentAdministrativeUnitHint;
    protected readonly commissionDecentralizedBodyLocked = this.presenter.commissionDecentralizedBodyLocked;
    protected readonly commissionAdministrativeUnitEnabled = this.presenter.commissionAdministrativeUnitEnabled;
    protected readonly commissionDecentralizedBodyChoices = this.presenter.commissionDecentralizedBodyChoices;
    protected readonly commissionAdministrativeUnitChoices = this.presenter.commissionAdministrativeUnitChoices;
    protected readonly commissionDecentralizedBodyHint = this.presenter.commissionDecentralizedBodyHint;
    protected readonly commissionAdministrativeUnitHint = this.presenter.commissionAdministrativeUnitHint;
    protected readonly assignmentRequiresEntity = this.presenter.assignmentRequiresEntity;
    protected readonly assignmentRequiresMunicipality = this.presenter.assignmentRequiresMunicipality;
    protected readonly commissionRequiresEntity = this.presenter.commissionRequiresEntity;
    protected readonly commissionRequiresMunicipality = this.presenter.commissionRequiresMunicipality;
    protected readonly canConfigureCommission = this.presenter.canConfigureCommission;
    protected readonly assignmentAssignedProfiles = this.presenter.assignmentAssignedProfiles;
    protected readonly commissionAssignedProfiles = this.presenter.commissionAssignedProfiles;
    protected readonly assignmentCarouselProfile = this.presenter.assignmentCarouselProfile;
    protected readonly commissionCarouselProfile = this.presenter.commissionCarouselProfile;
    protected readonly activeProfileOrigin = this.presenter.activeProfileOrigin;
    protected readonly selectedProfileOriginLabel = this.presenter.selectedProfileOriginLabel;
    protected readonly assignmentEditLocked = this.presenter.assignmentEditLocked;
    protected readonly commissionEditLocked = this.presenter.commissionEditLocked;
    protected readonly assignmentProfilesLocked = this.presenter.assignmentProfilesLocked;
    protected readonly commissionProfilesLocked = this.presenter.commissionProfilesLocked;
    protected readonly showAssignmentProfilesChangeWarning = this.presenter.showAssignmentProfilesChangeWarning;
    protected readonly showCommissionProfilesChangeWarning = this.presenter.showCommissionProfilesChangeWarning;
    protected readonly canAssignProfiles = this.presenter.canAssignProfiles;
    protected readonly canSelectProfiles = this.presenter.canSelectProfiles;
    protected readonly structureProfileHint = this.presenter.structureProfileHint;
    protected readonly emailRequired = this.presenter.emailRequired;
    protected readonly phoneRequired = this.presenter.phoneRequired;
    protected readonly selectedSystemIsSiau = this.presenter.selectedSystemIsSiau;
    protected readonly hasAssignedSiauProfile = this.presenter.hasAssignedSiauProfile;
    protected readonly isSiauProfileLocked = this.presenter.isSiauProfileLocked;
    protected readonly siauProfileLockMessage = this.presenter.siauProfileLockMessage;
    protected readonly isSelectedSiauProfileBlocked = this.presenter.isSelectedSiauProfileBlocked;
    protected readonly availableRoleOptions = this.presenter.availableRoleOptions;
    protected readonly canAddSelectedProfile = this.presenter.canAddSelectedProfile;
    protected readonly shouldShowRoleSelect = this.presenter.shouldShowRoleSelect;
    protected readonly trustLevelOptions = this.presenter.trustLevelOptions;
    protected readonly profileOptions = this.presenter.profileOptions;
    protected readonly stepOrder = this.presenter.stepOrder;
    protected readonly steps = this.presenter.steps;
    protected readonly activeIndex = this.presenter.activeIndex;
    protected readonly activeStepNumber = this.presenter.activeStepNumber;
    protected readonly stepProgressSegments = this.presenter.stepProgressSegments;
    protected readonly headerBadge = this.presenter.headerBadge;
    protected readonly isEditMode = this.presenter.isEditMode;
    protected readonly rfcPrefix = this.presenter.rfcPrefix;
    protected readonly rfcRequired = this.presenter.rfcRequired;
    protected readonly rfcHint = this.presenter.rfcHint;
    protected readonly isFormDisabled = this.presenter.isFormDisabled;
    protected readonly isDraftBusy = this.presenter.isDraftBusy;
    protected readonly hasBackendDraft = this.presenter.hasBackendDraft;
    protected readonly isCurpInputDisabled = this.presenter.isCurpInputDisabled;
    protected readonly isRenapoPersonalDataDisabled = this.presenter.isRenapoPersonalDataDisabled;
    protected readonly isBirthDateInputDisabled = this.presenter.isBirthDateInputDisabled;
    protected readonly showCurpUnlock = this.presenter.showCurpUnlock;
    protected readonly renapoStatusTitle = this.presenter.renapoStatusTitle;
    protected readonly renapoStatusIcon = this.presenter.renapoStatusIcon;
    protected readonly curpValidationSummaryForDisplay = this.presenter.curpValidationSummaryForDisplay;
    protected readonly currentStepErrors = this.presenter.currentStepErrors;
    protected readonly submitError = this.presenter.submitError;
    protected readonly primaryButtonLabel = this.presenter.primaryButtonLabel;
    protected readonly primaryButtonIcon = this.presenter.primaryButtonIcon;

    protected dismissRenapoMessage(): void { this.view.dismissRenapoMessage(); }
    protected dismissSubmitError(): void { this.view.dismissSubmitError(); }
    protected dismissCurrentStepErrors(): void { this.view.dismissCurrentStepErrors(); }
    protected dismissStructureProfileError(): void { this.view.dismissStructureProfileError(); }
    protected dismissProfileResetNotice(): void { this.view.dismissProfileResetNotice(); }
    protected selectProfileOrigin(origin: ProfileOrigin): void { this.view.selectProfileOrigin(origin); }
    protected previousProfile(origin: ProfileOrigin): void { this.view.previousProfile(origin); }
    protected nextProfile(origin: ProfileOrigin): void { this.view.nextProfile(origin); }
    protected getProfileCarouselIndex(origin: ProfileOrigin): number { return this.view.getProfileCarouselIndex(origin); }
    protected enableEditing(): void { this.view.enableEditing(this.readonlyMode()); }
    protected goToStep(stepId: string): void { this.view.goToStep(stepId); }
    protected nextStep(): void { this.view.nextStep(); }
    protected previousStep(): void { this.view.previousStep(); }
    protected submit(): void { this.view.submit(); }
    protected updateForm<K extends keyof UserRegistrationForm>(key: K, value: UserRegistrationForm[K] | string | null): void { this.view.updateForm(key, value); }
    protected updateCurp(value: string): void { this.view.updateCurp(value); }
    protected updateRfc(value: string): void { this.view.updateRfc(value); }
    protected toggleCurpUnlock(checked: boolean): void { this.view.toggleCurpUnlock(checked); }
    protected toggleCommissionSection(checked: boolean): void { this.view.toggleCommissionSection(checked); }
    protected updateAssignmentInstitutionType(value: string | null): void { this.view.updateAssignmentInstitutionType(value); }
    protected updateAssignmentEntity(value: string | null): void { this.view.updateAssignmentEntity(value); }
    protected updateAssignmentMunicipality(value: string | null): void { this.view.updateAssignmentMunicipality(value); }
    protected updateAssignmentInstitution(value: string | null): void { this.view.updateAssignmentInstitution(value); }
    protected updateAssignmentDecentralizedBody(value: string | null): void { this.view.updateAssignmentDecentralizedBody(value); }
    protected updateAssignmentAdministrativeUnit(value: string | null): void { this.view.updateAssignmentAdministrativeUnit(value); }
    protected updateCommissionInstitutionType(value: string | null): void { this.view.updateCommissionInstitutionType(value); }
    protected updateCommissionEntity(value: string | null): void { this.view.updateCommissionEntity(value); }
    protected updateCommissionMunicipality(value: string | null): void { this.view.updateCommissionMunicipality(value); }
    protected updateCommissionInstitution(value: string | null): void { this.view.updateCommissionInstitution(value); }
    protected updateCommissionDecentralizedBody(value: string | null): void { this.view.updateCommissionDecentralizedBody(value); }
    protected updateCommissionAdministrativeUnit(value: string | null): void { this.view.updateCommissionAdministrativeUnit(value); }
    protected toggleProfile(profile: string): void { this.view.toggleProfile(profile); }
    protected updateSelectedSystem(value: string | null): void { this.view.updateSelectedSystem(value); }
    protected updateSelectedRole(value: string | null): void { this.view.updateSelectedRole(value); }
    protected addAssignedProfile(): void { this.view.addAssignedProfile(); }
    protected removeAssignedProfile(id: string): void { this.view.removeAssignedProfile(id); }
    protected canRemoveAssignedProfile(profile: AssignedSystemProfile): boolean { return this.view.canRemoveAssignedProfile(profile); }
    protected togglePasswordVisibility(): void { this.view.togglePasswordVisibility(); }
    protected toggleConfirmPasswordVisibility(): void { this.view.toggleConfirmPasswordVisibility(); }
    protected isAccountStatusDisabled(status: AccountStatus): boolean { return this.view.isAccountStatusDisabled(status); }
    protected setAccountStatus(status: AccountStatus): void { this.view.setAccountStatus(status); }
    protected getReadonlyModeTitle(): string { return this.view.getReadonlyModeTitle(); }
    protected getReadonlyModeDescription(): string { return this.view.getReadonlyModeDescription(); }
    protected getStepIcon(step: SiauStep): string { return this.view.getStepIcon(step); }
    protected getStepClass(step: SiauStep, index: number): string { return this.view.getStepClass(step, index); }
    protected getCurpValidationStatusLabel(status: CurpValidationStatus): string { return this.view.getCurpValidationStatusLabel(status); }
    protected getCurpValidationStatusClass(status: CurpValidationStatus): string { return this.view.getCurpValidationStatusClass(status); }
    protected getCurpValidationMessageClass(tone: CurpValidationMessageTone): string { return this.view.getCurpValidationMessageClass(tone); }
    protected deleteRegistrationDraft(): void { this.view.deleteRegistrationDraft(); }
    protected closeDeleteDraftConfirmation(): void { this.view.closeDeleteDraftConfirmation(); }
    protected confirmDeleteRegistrationDraft(): void { this.view.confirmDeleteRegistrationDraft(); }
    protected isLastStep(): boolean { return this.view.isLastStep(); }
    protected minimumBirthDate(): string { return this.view.minimumBirthDate(); }
    protected maximumBirthDate(): string { return this.view.maximumBirthDate(); }
    protected fieldError(key: string): string | null { return this.view.fieldError(key); }
    protected maximumTodayDate(): string { return this.view.maximumTodayDate(); }
}
