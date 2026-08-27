import { inject, Injectable } from '@angular/core';
import { AuthStorage } from '../../../../../../core/auth/data-access/auth.storage';
import { SiauSelectOption } from '../../../../../../shared/ui';
import { UserRegistrationNotificationService, StructureEmailCatalogs } from '../submission/user-registration-notification.service';
import { BorradorGuardarRequest, BorradorItem } from '../../../../domain/models/user-record.model';
import { UserRegistrationDraftProfileService } from '../drafts/user-registration-draft-profile.service';
import { UserRegistrationDraftContext, UserRegistrationDraftCoordinator } from '../drafts/user-registration-draft.coordinator';
import { UserRegistrationProfileContext, UserRegistrationProfileController } from '../profiles/user-registration-profile.controller';
import { UserRegistrationStructureContext } from '../structure/user-registration-structure.controller';
import { UserRegistrationCatalogCoordinator, UserRegistrationCatalogState } from '../structure/user-registration-catalog.coordinator';
import { UserRegistrationSubmissionContext } from '../submission/user-registration-submission.coordinator';
import { UserRegistrationValidationCoordinator, UserRegistrationValidationState } from '../validation/user-registration-validation.coordinator';
import { UserRegistrationValidationContext, UserRegistrationValidator } from '../validation/user-registration.validator';
import { UserRegistrationEditScopeController } from '../editing/user-registration-edit-scope.controller';
import { UserRegistrationFieldController } from '../editing/user-registration-field.controller';
import { UserRegistrationNavigationController } from '../navigation/user-registration-navigation.controller';
import { UserRegistrationIdentityCoordinator } from '../identity/user-registration-identity.coordinator';
import { UserRegistrationPresenter } from '../view/user-registration.presenter';
import { UserRegistrationResetService } from '../lifecycle/user-registration-reset.service';
import { UserRegistrationState } from '../state/user-registration.state';
import { UserRegistrationFormRules } from '../validation/user-registration-form.rules';
import {
    ALL_WIZARD_STEPS,
    AssignedSystemProfile,
    ProfileOrigin,
    UserRegistrationForm,
    WizardStepId,
} from '../models/user-registration-wizard.models';

/**
 * Ensambla los contextos requeridos por los coordinadores del wizard.
 *
 * De esta forma el componente deja de repetir grandes objetos de adaptación
 * y cada coordinador sigue recibiendo únicamente las capacidades que necesita.
 */
@Injectable()
export class UserRegistrationContextFactory {
    private readonly state = inject(UserRegistrationState);
    private readonly presenter = inject(UserRegistrationPresenter);
    private readonly authStorage = inject(AuthStorage);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly validator = inject(UserRegistrationValidator);
    private readonly validationCoordinator = inject(UserRegistrationValidationCoordinator);
    private readonly profileController = inject(UserRegistrationProfileController);
    private readonly draftCoordinator = inject(UserRegistrationDraftCoordinator);
    private readonly catalogCoordinator = inject(UserRegistrationCatalogCoordinator);
    private readonly editScopeController = inject(UserRegistrationEditScopeController);
    private readonly fieldController = inject(UserRegistrationFieldController);
    private readonly navigationController = inject(UserRegistrationNavigationController);
    private readonly identityCoordinator = inject(UserRegistrationIdentityCoordinator);
    private readonly resetService = inject(UserRegistrationResetService);
    private readonly draftProfileService = inject(UserRegistrationDraftProfileService);
    private readonly notificationService = inject(UserRegistrationNotificationService);

    submission(): UserRegistrationSubmissionContext {
        return {
            form: this.state.form,
            formErrors: this.state.formErrors,
            isSubmitting: this.state.isSubmitting,
            saveSuccess: this.state.saveSuccess,
            assignedProfiles: () => this.state.assignedSystemProfiles(),
            userTypeOptions: () => this.state.userTypeOptions(),
            renapoLookupStatus: () => this.state.renapoLookupStatus(),
            detailCurpValidated: () => this.state.detailCurpValidated(),
            user: () => this.state.user(),
            userDetail: () => this.state.userDetail(),
            readonlyMode: () => this.state.readonlyMode(),
            isFormDisabled: () => this.presenter.isFormDisabled(),
            isEditMode: () => this.presenter.isEditMode(),
            validateAllSteps: () => this.validateAllSteps(),
            resolveCurrentUserId: () => this.resolveCurrentUserId(),
            resolveAssignedSystemId: (profile) => this.resolveAssignedSystemId(profile),
            stepOrder: () => this.presenter.stepOrder(),
            markCompleted: (stepId) => this.navigationController.markCompleted(stepId),
            initialStructureSnapshot: () => this.state.initialStructureEmailSnapshot(),
            initialProfiles: () => this.state.initialAssignedProfiles(),
            structureEmailCatalogs: () => this.structureEmailCatalogs(),
            resolveSystemLabel: (system) => this.resolveSystemLabel(system),
            resolveRoleLabel: (system, role, systemLabel, roleDescription) =>
                this.resolveRoleLabel(system, role, systemLabel, roleDescription),
            deleteDraftAfterSuccess: () => this.draftCoordinator.deleteAfterSuccess(this.draft()),
            clearSubmitError: () => this.fieldController.clearFieldError('submit'),
        };
    }

    validationState(): UserRegistrationValidationState {
        return {
            activeStepId: this.state.activeStepId,
            form: this.state.form,
            formErrors: this.state.formErrors,
            stepOrder: () => this.presenter.stepOrder(),
            context: () => this.validationContext(),
        };
    }

    validationContext(): UserRegistrationValidationContext {
        return {
            isEditMode: this.presenter.isEditMode(),
            assignmentRequiresEntity: this.presenter.assignmentRequiresEntity(),
            assignmentRequiresMunicipality: this.presenter.assignmentRequiresMunicipality(),
            commissionRequiresEntity: this.presenter.commissionRequiresEntity(),
            commissionRequiresMunicipality: this.presenter.commissionRequiresMunicipality(),
            assignedProfiles: this.state.assignedSystemProfiles(),
            initialIdentitySnapshot: this.state.initialIdentitySnapshot(),
            initialEditFormSnapshot: this.state.initialEditFormSnapshot(),
            initialAssignedProfiles: this.state.initialAssignedProfiles(),
        };
    }

    profile(): UserRegistrationProfileContext {
        return {
            form: this.state.form,
            formErrors: this.state.formErrors,
            selectedSystem: this.state.selectedSystem,
            selectedRole: this.state.selectedRole,
            systemOptions: this.state.systemOptions,
            roleOptions: this.state.roleOptions,
            assignedSystemProfiles: this.state.assignedSystemProfiles,
            assignmentProfileCarouselIndex: this.state.assignmentProfileCarouselIndex,
            commissionProfileCarouselIndex: this.state.commissionProfileCarouselIndex,
            profileResetNotice: this.state.profileResetNotice,
            completedSteps: this.state.completedSteps,
            structureProfileLookupStatus: this.state.structureProfileLookupStatus,
            structureProfileMessage: this.state.structureProfileMessage,
            open: () => this.state.open(),
            mode: () => this.state.mode(),
            isEditMode: () => this.presenter.isEditMode(),
            isFormDisabled: () => this.presenter.isFormDisabled(),
            isSubmitting: () => this.state.isSubmitting(),
            isDraftBusy: () => this.presenter.isDraftBusy(),
            canSelectProfiles: () => this.presenter.canSelectProfiles(),
            activeProfileOrigin: () => this.presenter.activeProfileOrigin(),
            availableRoleOptions: () => this.presenter.availableRoleOptions(),
            isProfileOriginLocked: (origin) => this.presenter.isProfileOriginLocked(origin),
            claimEditStructureScope: (origin, changed, resetProfileCatalog) =>
                this.editScopeController.claim(
                    origin,
                    changed,
                    resetProfileCatalog,
                    () => this.resetStructureProfileCatalog(),
                ),
            loadProfileOptionsForSystem: (system) => this.loadProfileOptionsForSystem(system),
            resetStructureProfileCatalog: () => this.resetStructureProfileCatalog(),
            clearFieldError: (key) => this.fieldController.clearFieldError(key),
            saveDraftAfterProfileChange: () => this.draftCoordinator.saveAfterProfileChange(this.draft()),
            isSiauSystem: (system, label) => this.presenter.isSiauSystem(system, label),
            isRoleAlreadyAssigned: (system, role) => this.presenter.isRoleAlreadyAssigned(system, role),
            findStructureRoleOptionsForSystem: (system) =>
                this.catalogCoordinator.findStructureRoleOptionsForSystem(system, this.catalog()),
        };
    }

    draft(): UserRegistrationDraftContext {
        return {
            activeStepId: this.state.activeStepId,
            completedSteps: this.state.completedSteps,
            form: this.state.form,
            assignedSystemProfiles: this.state.assignedSystemProfiles,
            draftId: this.state.draftId,
            draftMessage: this.state.draftMessage,
            draftError: this.state.draftError,
            isDraftLoading: this.state.isDraftLoading,
            isDraftSaving: this.state.isDraftSaving,
            isDraftDeleting: this.state.isDraftDeleting,
            deleteDraftConfirmationOpen: this.state.deleteDraftConfirmationOpen,
            institutionOptions: this.state.institutionOptions,
            decentralizedBodyOptions: this.state.decentralizedBodyOptions,
            administrativeUnitOptions: this.state.administrativeUnitOptions,
            commissionInstitutionOptions: this.state.commissionInstitutionOptions,
            commissionDecentralizedBodyOptions: this.state.commissionDecentralizedBodyOptions,
            commissionAdministrativeUnitOptions: this.state.commissionAdministrativeUnitOptions,
            roleOptions: this.state.roleOptions,
            structureRoleOptionsBySystem: this.state.structureRoleOptionsBySystem,
            userTypeOptions: this.state.userTypeOptions,
            isEditMode: () => this.presenter.isEditMode(),
            isDraftBusy: () => this.presenter.isDraftBusy(),
            isSubmitting: () => this.state.isSubmitting(),
            resolveCurrentUserId: () => this.resolveCurrentUserId(),
            resolveAssignedSystemId: (profile) => this.resolveAssignedSystemId(profile),
            ensureDefaultSiauProfile: () => this.profileController.ensureDefaultSiauProfile(this.profile()),
            consultEcccAndPersonal: () => this.identityCoordinator.consultEcccAndPersonal(this.state.form),
            isWizardStep: (value): value is WizardStepId => this.isWizardStep(value),
            loadHydratedAssignmentCatalogs: (form) => this.loadHydratedAssignmentCatalogs(form),
            resetWizard: () => this.resetWizard(),
            knownSystemOptions: () => this.presenter.knownSystemOptions(),
            stepOrder: () => this.presenter.stepOrder(),
        };
    }

    structure(): UserRegistrationStructureContext {
        return {
            form: this.state.form,
            formErrors: this.state.formErrors,
            editStructureScope: this.state.editStructureScope,
            selectedProfileOrigin: this.state.selectedProfileOrigin,
            municipalityOptions: this.state.municipalityOptions,
            institutionOptions: this.state.institutionOptions,
            decentralizedBodyOptions: this.state.decentralizedBodyOptions,
            administrativeUnitOptions: this.state.administrativeUnitOptions,
            commissionMunicipalityOptions: this.state.commissionMunicipalityOptions,
            commissionInstitutionOptions: this.state.commissionInstitutionOptions,
            commissionDecentralizedBodyOptions: this.state.commissionDecentralizedBodyOptions,
            commissionAdministrativeUnitOptions: this.state.commissionAdministrativeUnitOptions,
            isFormDisabled: () => this.presenter.isFormDisabled(),
            isSubmitting: () => this.state.isSubmitting(),
            isEditMode: () => this.presenter.isEditMode(),
            canConfigureCommission: () => this.presenter.canConfigureCommission(),
            assignmentRequiresEntity: () => this.presenter.assignmentRequiresEntity(),
            assignmentRequiresMunicipality: () => this.presenter.assignmentRequiresMunicipality(),
            commissionRequiresEntity: () => this.presenter.commissionRequiresEntity(),
            commissionRequiresMunicipality: () => this.presenter.commissionRequiresMunicipality(),
            assignmentDecentralizedBodyLocked: () => this.presenter.assignmentDecentralizedBodyLocked(),
            commissionDecentralizedBodyLocked: () => this.presenter.commissionDecentralizedBodyLocked(),
            claimEditStructureScope: (origin, changed, resetProfileCatalog) =>
                this.editScopeController.claim(
                    origin,
                    changed,
                    resetProfileCatalog,
                    () => this.resetStructureProfileCatalog(),
                ),
            bumpAssignmentCatalogGeneration: () => this.catalogCoordinator.bumpAssignmentCatalogGeneration(),
            bumpCommissionCatalogGeneration: () => this.catalogCoordinator.bumpCommissionCatalogGeneration(),
            clearAllProfilesAfterCreationContextChange: (message) =>
                this.profileController.clearAllAfterCreationContextChange(message, this.profile()),
            clearProfilesForOrigin: (origin, message) =>
                this.profileController.clearForOrigin(origin, message, this.profile()),
            clearProfilesAfterAssignmentInstitutionChange: (previous, next) =>
                this.profileController.clearAfterAssignmentInstitutionChange(previous, next, this.profile()),
            clearProfilesAfterCommissionInstitutionChange: (previous, next) =>
                this.profileController.clearAfterCommissionInstitutionChange(previous, next, this.profile()),
            resetStructureProfileCatalog: () => this.resetStructureProfileCatalog(),
            refreshCommissionStructureConflict: () =>
                this.validationCoordinator.refreshCommissionStructureConflict(this.validationState()),
            requiresEntityForInstitution: (value) => this.requiresEntityForInstitution(value),
            requiresMunicipalityForInstitution: (value) => this.requiresMunicipalityForInstitution(value),
            loadMunicipalities: (stateValue, target, context) =>
                this.catalogCoordinator.loadMunicipalities(stateValue, target, context, this.catalog()),
            loadAssignmentInstitutions: () => this.catalogCoordinator.loadAssignmentInstitutions(this.catalog()),
            loadAssignmentDecentralizedBodies: () => this.catalogCoordinator.loadAssignmentDecentralizedBodies(this.catalog()),
            loadAssignmentAdministrativeUnits: () => this.catalogCoordinator.loadAssignmentAdministrativeUnits(this.catalog()),
            loadCommissionInstitutions: () => this.catalogCoordinator.loadCommissionInstitutions(this.catalog()),
            loadCommissionDecentralizedBodies: () => this.catalogCoordinator.loadCommissionDecentralizedBodies(this.catalog()),
            loadCommissionAdministrativeUnits: () => this.catalogCoordinator.loadCommissionAdministrativeUnits(this.catalog()),
            normalizeSelectValue: (value) => this.validator.normalizeSelectValue(value),
            clearFieldError: (key) => this.fieldController.clearFieldError(key),
        };
    }

    catalog(): UserRegistrationCatalogState {
        return {
            form: this.state.form,
            catalogosReady: this.state.catalogosReady,
            genderOptions: this.state.genderOptions,
            civilStatusOptions: this.state.civilStatusOptions,
            userTypeOptions: this.state.userTypeOptions,
            allSystemOptions: this.state.allSystemOptions,
            systemOptions: this.state.systemOptions,
            roleOptions: this.state.roleOptions,
            institutionTypeOptions: this.state.institutionTypeOptions,
            stateOptions: this.state.stateOptions,
            municipalityOptions: this.state.municipalityOptions,
            institutionOptions: this.state.institutionOptions,
            decentralizedBodyOptions: this.state.decentralizedBodyOptions,
            administrativeUnitOptions: this.state.administrativeUnitOptions,
            commissionMunicipalityOptions: this.state.commissionMunicipalityOptions,
            commissionInstitutionOptions: this.state.commissionInstitutionOptions,
            commissionDecentralizedBodyOptions: this.state.commissionDecentralizedBodyOptions,
            commissionAdministrativeUnitOptions: this.state.commissionAdministrativeUnitOptions,
            selectedSystem: this.state.selectedSystem,
            selectedRole: this.state.selectedRole,
            structureProfileLookupStatus: this.state.structureProfileLookupStatus,
            structureProfileMessage: this.state.structureProfileMessage,
            structureRoleOptionsBySystem: this.state.structureRoleOptionsBySystem,
            activeProfileOrigin: () => this.presenter.activeProfileOrigin(),
            selectedProfileOriginLabel: () => this.presenter.selectedProfileOriginLabel(),
            clearFieldError: (key) => this.fieldController.clearFieldError(key),
            ensureDefaultSiauProfile: () => this.profileController.ensureDefaultSiauProfile(this.profile()),
        };
    }


    buildDraftSaveRequest(
        nextStepId: WizardStepId,
        completedSteps: readonly WizardStepId[],
    ): BorradorGuardarRequest {
        return this.draftCoordinator.buildSaveRequest(nextStepId, completedSteps, this.draft());
    }

    loadRegistrationDraft(): void {
        this.draftCoordinator.load(this.draft());
    }

    restoreProvidedRegistrationDraft(draft: BorradorItem): void {
        this.draftCoordinator.restoreProvided(draft, this.draft());
    }

    requestDeleteDraft(): void {
        this.draftCoordinator.requestDelete(this.draft());
    }

    closeDeleteDraftConfirmation(): void {
        this.draftCoordinator.closeDeleteConfirmation(this.draft());
    }

    confirmDeleteDraft(): void {
        this.draftCoordinator.confirmDelete(this.draft());
    }

    resetWizard(): void {
        this.resetService.reset(() => this.resetStructureProfileCatalog());
    }

    validateAllSteps(): boolean {
        return this.validationCoordinator.validateAllSteps(this.validationState());
    }

    validateStep(stepId: WizardStepId): boolean {
        return this.validationCoordinator.validateStep(stepId, this.validationState());
    }

    validateChangedIdentityFields(): boolean {
        return this.validationCoordinator.validateChangedIdentityFields(this.validationState());
    }

    resolveCurrentUserId(): number | null {
        const userId = Number(this.authStorage.session()?.user.id);
        return Number.isFinite(userId) && userId > 0 ? userId : null;
    }

    resolveAssignedSystemId(profile: AssignedSystemProfile): number {
        const option = this.presenter.findKnownSystemOption(profile.system, profile.systemLabel);
        const metadata = this.optionMetadata(option);
        const metadataId = this.firstNumberValue(metadata, ['id', 'idSistema', 'sistemaId']);
        if (metadataId) {
            return metadataId;
        }
        return this.requireCatalogId(profile.system, 'Selecciona un sistema válido.');
    }

    resolveSystemLabel(systemValue: string): string {
        return this.draftProfileService.resolveSystemLabel(systemValue, this.presenter.knownSystemOptions());
    }

    resolveRoleLabel(
        systemValue: string,
        roleValue: string,
        systemLabel = '',
        roleDescription = '',
    ): string {
        return this.draftProfileService.resolveRoleLabel(
            systemValue,
            roleValue,
            systemLabel,
            roleDescription,
            this.state.structureRoleOptionsBySystem(),
            this.state.roleOptions(),
        );
    }

    refreshAssignedProfileLabels(): void {
        this.draftProfileService.refreshAssignedProfileLabels(
            this.state.assignedSystemProfiles,
            this.presenter.knownSystemOptions(),
            this.state.structureRoleOptionsBySystem(),
            this.state.roleOptions(),
        );
    }


    loadCatalogos(): void {
        this.catalogCoordinator.loadCatalogos(this.catalog());
    }

    loadStructureProfileOptions(structureId: number | undefined): void {
        this.catalogCoordinator.loadStructureProfileOptions(structureId, this.catalog());
    }

    loadMunicipalities(
        stateValue: string | null,
        target: import('@angular/core').WritableSignal<readonly SiauSelectOption[]>,
        context: 'assignment' | 'commission',
    ): void {
        this.catalogCoordinator.loadMunicipalities(stateValue, target, context, this.catalog());
    }

    loadAssignmentInstitutions(): void {
        this.catalogCoordinator.loadAssignmentInstitutions(this.catalog());
    }

    loadAssignmentDecentralizedBodies(): void {
        this.catalogCoordinator.loadAssignmentDecentralizedBodies(this.catalog());
    }

    loadAssignmentAdministrativeUnits(): void {
        this.catalogCoordinator.loadAssignmentAdministrativeUnits(this.catalog());
    }

    loadCommissionInstitutions(): void {
        this.catalogCoordinator.loadCommissionInstitutions(this.catalog());
    }

    loadCommissionDecentralizedBodies(): void {
        this.catalogCoordinator.loadCommissionDecentralizedBodies(this.catalog());
    }

    loadCommissionAdministrativeUnits(): void {
        this.catalogCoordinator.loadCommissionAdministrativeUnits(this.catalog());
    }

    bumpAssignmentCatalogGeneration(): void {
        this.catalogCoordinator.bumpAssignmentCatalogGeneration();
    }

    bumpCommissionCatalogGeneration(): void {
        this.catalogCoordinator.bumpCommissionCatalogGeneration();
    }

    findStructureRoleOptionsForSystem(system: string): readonly SiauSelectOption[] {
        return this.catalogCoordinator.findStructureRoleOptionsForSystem(system, this.catalog());
    }

    ensureDefaultSiauProfile(): void {
        this.profileController.ensureDefaultSiauProfile(this.profile());
    }

    resolveProfileStructureId(
        current: UserRegistrationForm,
        origin: ProfileOrigin = this.presenter.activeProfileOrigin(),
    ): number | undefined {
        return this.validator.resolveProfileStructureId(current, origin);
    }

    loadHydratedAssignmentCatalogs(form: UserRegistrationForm): void {
        this.catalogCoordinator.loadHydratedAssignmentCatalogs(form, this.catalog());
    }

    loadProfileOptionsForSystem(system: string): void {
        this.catalogCoordinator.loadProfileOptionsForSystem(system, this.catalog());
    }

    resetStructureProfileCatalog(): void {
        this.catalogCoordinator.resetStructureProfileCatalog(this.catalog());
    }

    structureEmailCatalogs(): StructureEmailCatalogs {
        return {
            institutionTypes: this.state.institutionTypeOptions(),
            states: this.state.stateOptions(),
            municipalities: this.state.municipalityOptions(),
            institutions: this.state.institutionOptions(),
            decentralizedBodies: this.state.decentralizedBodyOptions(),
            administrativeUnits: this.state.administrativeUnitOptions(),
            commissionMunicipalities: this.state.commissionMunicipalityOptions(),
            commissionInstitutions: this.state.commissionInstitutionOptions(),
            commissionDecentralizedBodies: this.state.commissionDecentralizedBodyOptions(),
            commissionAdministrativeUnits: this.state.commissionAdministrativeUnitOptions(),
        };
    }

    toStructureEmailSnapshot(form: UserRegistrationForm) {
        return this.notificationService.toStructureEmailSnapshot(form, this.structureEmailCatalogs());
    }

    private isWizardStep(value: string): value is WizardStepId {
        return ALL_WIZARD_STEPS.includes(value as WizardStepId);
    }

    private requireCatalogId(value: string, errorMessage: string): number {
        const id = Number(value);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error(errorMessage);
        }
        return id;
    }

    private optionMetadata(option: SiauSelectOption | undefined): Record<string, unknown> {
        const metadata = (option as { metadata?: Record<string, unknown> } | undefined)?.metadata;
        return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? metadata
            : {};
    }

    private firstNumberValue(record: Record<string, unknown>, keys: readonly string[]): number | null {
        for (const key of keys) {
            const value = Number(record[key]);
            if (Number.isFinite(value) && value > 0) {
                return value;
            }
        }
        return null;
    }

    private requiresEntityForInstitution(value: string | null | undefined): boolean {
        const label = this.getInstitutionTypeLabel(value);
        return label.includes('estatal') || label.includes('municipal');
    }

    private requiresMunicipalityForInstitution(value: string | null | undefined): boolean {
        return this.getInstitutionTypeLabel(value).includes('municipal');
    }

    private getInstitutionTypeLabel(value: string | null | undefined): string {
        if (!value) {
            return '';
        }
        const option = this.state.institutionTypeOptions().find((item) => item.value === value);
        return this.formRules.normalizeText(option?.label ?? value);
    }
}
