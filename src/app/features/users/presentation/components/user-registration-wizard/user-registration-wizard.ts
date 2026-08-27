import {
    ChangeDetectionStrategy,
    Component,
    effect,
    DestroyRef,
    inject,
    input,
    output,
    signal,
    untracked,
    WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, map, Observable, of } from 'rxjs';
import { AuthStorage } from '../../../../../core/auth/data-access/auth.storage';
import {
    SiauInput,
    SiauModal,
    SiauSelect,
    SiauSelectOption,
    SiauStep,
} from '../../../../../shared/ui';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UsersFacade } from '../../../application/users.facade';
import {
    BorradorGuardarRequest,
    BorradorItem,
    UserDetailRecord,
    UserRecord,
} from '../../../domain/models/user-record.model';
import {
    MINIMUM_BIRTH_DATE,
    getAdultCutoffDateInput,
} from '../../../../../shared/validation/field-validators';

import {
    AccountStatus,
    UserWizardMode,
    CurpValidationStatus,
    CurpValidationMessageTone,
    ProfileOrigin,
    WizardStepId,
    UserRegistrationForm,
    IdentitySnapshot,
    AssignedSystemProfile,
    StructureEmailSnapshot,
    ALL_WIZARD_STEPS,
    INITIAL_FORM,
} from './user-registration-wizard.models';
import { UserRegistrationFormRules } from './user-registration-form.rules';
import { UserRegistrationState } from './user-registration.state';
import { UserRegistrationPresenter } from './user-registration.presenter';
import { UserRegistrationFieldController } from './user-registration-field.controller';
import { UserRegistrationEditScopeController } from './user-registration-edit-scope.controller';
import {
    UserRegistrationNavigationActions,
    UserRegistrationNavigationController,
} from './user-registration-navigation.controller';
import { UserRegistrationContextFactory } from './user-registration-context.factory';
import { UserRegistrationResetService } from './user-registration-reset.service';
import {
    StructureEmailCatalogs,
    UserRegistrationNotificationService,
} from './user-registration-notification.service';
import { UserProfileMatcher } from './user-profile.matcher';
import { UserRegistrationEditMapper } from './user-registration-edit.mapper';
import { UserRegistrationIdentityCoordinator } from './user-registration-identity.coordinator';
import {
    UserRegistrationCatalogCoordinator,
    UserRegistrationCatalogState,
} from './user-registration-catalog.coordinator';
import { UserRegistrationDraftProfileService } from './user-registration-draft-profile.service';
import {
    UserRegistrationDraftContext,
    UserRegistrationDraftCoordinator,
} from './user-registration-draft.coordinator';
import {
    UserRegistrationProfileContext,
    UserRegistrationProfileController,
} from './user-registration-profile.controller';
import {
    UserRegistrationStructureContext,
    UserRegistrationStructureController,
} from './user-registration-structure.controller';
import {
    UserRegistrationValidationContext,
    UserRegistrationValidator,
} from './user-registration.validator';
import {
    UserRegistrationValidationCoordinator,
    UserRegistrationValidationState,
} from './user-registration-validation.coordinator';
import {
    UserRegistrationSubmissionContext,
    UserRegistrationSubmissionCoordinator,
} from './user-registration-submission.coordinator';

@Component({
    selector: 'app-user-registration-wizard',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauModal, SiauInput, SiauSelect, SiauLucideIcon],
    providers: [
        UserRegistrationIdentityCoordinator,
        UserRegistrationState,
        UserRegistrationPresenter,
        UserRegistrationFieldController,
        UserRegistrationEditScopeController,
        UserRegistrationNavigationController,
        UserRegistrationResetService,
        UserRegistrationContextFactory,
        UserRegistrationCatalogCoordinator,
        UserRegistrationDraftProfileService,
        UserRegistrationDraftCoordinator,
        UserRegistrationProfileController,
        UserRegistrationStructureController,
    ],
    templateUrl: './user-registration-wizard.html',
    styleUrl: './user-registration-wizard.scss',
})
export class UserRegistrationWizard {
    readonly open = input<boolean>(false);
    readonly mode = input<UserWizardMode>('create');
    readonly user = input<UserRecord | null>(null);
    readonly userDetail = input<UserDetailRecord | null>(null);
    readonly readonlyMode = input<boolean>(false);
    readonly draftToOpen = input<BorradorItem | null>(null);
    readonly autoRestoreDraft = input<boolean>(true);
    readonly closed = output<void>();
    readonly saved = output<void>();

    private readonly usersFacade = inject(UsersFacade);
    private readonly authStorage = inject(AuthStorage);
    private readonly destroyRef = inject(DestroyRef);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly notificationService = inject(UserRegistrationNotificationService);
    private readonly validator = inject(UserRegistrationValidator);
    private readonly validationCoordinator = inject(UserRegistrationValidationCoordinator);
    private readonly submissionCoordinator = inject(UserRegistrationSubmissionCoordinator);
    private readonly profileMatcher = inject(UserProfileMatcher);
    private readonly editMapper = inject(UserRegistrationEditMapper);
    private readonly identityCoordinator = inject(UserRegistrationIdentityCoordinator);
    private readonly catalogCoordinator = inject(UserRegistrationCatalogCoordinator);
    private readonly draftProfileService = inject(UserRegistrationDraftProfileService);
    private readonly draftCoordinator = inject(UserRegistrationDraftCoordinator);
    private readonly profileController = inject(UserRegistrationProfileController);
    private readonly structureController = inject(UserRegistrationStructureController);

    private readonly state = inject(UserRegistrationState);
    private readonly presenter = inject(UserRegistrationPresenter);
    private readonly fieldController = inject(UserRegistrationFieldController);
    private readonly editScopeController = inject(UserRegistrationEditScopeController);
    private readonly navigationController = inject(UserRegistrationNavigationController);
    private readonly contextFactory = inject(UserRegistrationContextFactory);

    private hydrationKey = '';
    private readonly catalogosReady = this.state.catalogosReady;

    private get initialIdentitySnapshot(): IdentitySnapshot | null {
        return this.state.initialIdentitySnapshot();
    }
    private set initialIdentitySnapshot(value: IdentitySnapshot | null) {
        this.state.initialIdentitySnapshot.set(value);
    }
    private get initialEditFormSnapshot(): UserRegistrationForm | null {
        return this.state.initialEditFormSnapshot();
    }
    private set initialEditFormSnapshot(value: UserRegistrationForm | null) {
        this.state.initialEditFormSnapshot.set(value);
    }
    private get initialAssignedProfiles(): readonly AssignedSystemProfile[] {
        return this.state.initialAssignedProfiles();
    }
    private set initialAssignedProfiles(value: readonly AssignedSystemProfile[]) {
        this.state.initialAssignedProfiles.set(value);
    }
    private get initialStructureEmailSnapshot(): StructureEmailSnapshot | null {
        return this.state.initialStructureEmailSnapshot();
    }
    private set initialStructureEmailSnapshot(value: StructureEmailSnapshot | null) {
        this.state.initialStructureEmailSnapshot.set(value);
    }

    private readonly detailCurpValidated = this.state.detailCurpValidated;
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
    private readonly structureRoleOptionsBySystem = this.state.structureRoleOptionsBySystem;
    private readonly allSystemOptions = this.state.allSystemOptions;

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
    protected readonly modalTitle = this.presenter.modalTitle;
    protected readonly modalSubtitle = this.presenter.modalSubtitle;
    protected readonly modalIcon = this.presenter.modalIcon;
    protected readonly primaryButtonLabel = this.presenter.primaryButtonLabel;
    protected readonly primaryButtonIcon = this.presenter.primaryButtonIcon;

    constructor() {
        effect(() => {
            this.state.syncInputs(
                this.mode(),
                this.readonlyMode(),
                this.open(),
                this.user(),
                this.userDetail(),
            );
        });

        effect(() => {
            const isOpen = this.open();

            if (isOpen && !this.catalogosReady()) {
                this.contextFactory.loadCatalogos();
            }

            const mode = this.mode();
            const user = this.user();
            const detail = this.userDetail();
            const catalogosReady = this.catalogosReady();
            const draftToOpen = this.draftToOpen();
            const autoRestoreDraft = this.autoRestoreDraft();

            if (!isOpen) {
                this.hydrationKey = '';
                return;
            }

            const userKey = user?.userId ?? user?.username ?? 'sin-usuario';
            const detailKey = detail ? 'con-detalle' : 'sin-detalle';
            const draftKey = draftToOpen?.borradorId ?? 'sin-borrador';
            const nextHydrationKey = `${mode}-${userKey}-${detailKey}-${draftKey}-${autoRestoreDraft}-${catalogosReady}`;

            if (this.hydrationKey === nextHydrationKey) {
                return;
            }

            this.hydrationKey = nextHydrationKey;

            untracked(() => {
                if (mode === 'edit') {
                    // El modal se abre antes de que termine GET /consultas/usuarios.
                    // No hidratamos con un detalle vacío ni antes de tener los
                    // catálogos padre, porque eso deja seleccionados por etiqueta
                    // pero sin IDs válidos para consultar sus hijos.
                    if (!catalogosReady || !detail) {
                        return;
                    }

                    this.hydrateEditForm(detail, user);
                    return;
                }

                this.contextFactory.resetWizard();
                this.editEnabled.set(true);
                this.contextFactory.ensureDefaultSiauProfile();

                if (!catalogosReady) {
                    return;
                }

                if (draftToOpen) {
                    this.contextFactory.restoreProvidedRegistrationDraft(draftToOpen);
                } else if (autoRestoreDraft) {
                    this.contextFactory.loadRegistrationDraft();
                }
            });
        });

        effect(() => {
            /*
             * Dependencias: los catálogos de sistemas/perfiles Y la lista de
             * perfiles asignados. Sin esta última, al restaurar un borrador
             * después de que los catálogos ya cargaron el efecto no vuelve a
             * correr y las etiquetas se quedan en los ids.
             *
             * No hay ciclo: `refreshAssignedProfileLabels` sólo escribe cuando
             * alguna etiqueta cambió, así que la segunda pasada no hace nada.
             */
            this.assignedSystemProfiles();
            this.systemOptions();
            this.allSystemOptions();
            this.structureRoleOptionsBySystem();
            this.roleOptions();
            this.draftProfileService.fallbackOptions();

            untracked(() => this.contextFactory.refreshAssignedProfileLabels());
        });

        effect(() => {
            const shouldLoad =
                this.open() &&
                this.catalogosReady() &&
                this.activeStepId() === 'profiles';
            const current = this.form();

            if (!shouldLoad) {
                return;
            }

            const origin = this.activeProfileOrigin();
            const structureId = this.contextFactory.resolveProfileStructureId(current, origin);

            untracked(() => this.contextFactory.loadStructureProfileOptions(structureId));
        });
    }

    protected dismissRenapoMessage(): void {
        this.renapoMessageVisible.set(false);
    }

    protected dismissSubmitError(): void {
        this.clearFieldError('submit');
    }

    protected dismissCurrentStepErrors(): void {
        const keys = new Set(this.currentStepErrors().map((error) => error.key));
        if (keys.size === 0) {
            return;
        }
        this.formErrors.update((current) => {
            const next = { ...current };
            keys.forEach((key) => delete next[key]);
            return next;
        });
    }

    protected dismissStructureProfileError(): void {
        if (this.structureProfileLookupStatus() === 'error') {
            this.structureProfileLookupStatus.set('idle');
            this.structureProfileMessage.set('');
        }
    }

    protected dismissProfileResetNotice(): void {
        this.profileResetNotice.set(null);
    }

    protected selectProfileOrigin(origin: ProfileOrigin): void {
        this.editScopeController.selectProfileOrigin(origin, () => this.contextFactory.resetStructureProfileCatalog());
    }

    private isProfileOriginLocked(origin: ProfileOrigin): boolean {
        return this.presenter.isProfileOriginLocked(origin);
    }

    private claimEditStructureScope(
        origin: ProfileOrigin,
        changed = true,
        resetProfileCatalog = true,
    ): boolean {
        return this.editScopeController.claim(
            origin,
            changed,
            resetProfileCatalog,
            () => this.contextFactory.resetStructureProfileCatalog(),
        );
    }

    protected previousProfile(origin: ProfileOrigin): void {
        this.profileController.previousProfile(origin, this.contextFactory.profile());
    }

    protected nextProfile(origin: ProfileOrigin): void {
        this.profileController.nextProfile(origin, this.contextFactory.profile());
    }

    protected getProfileCarouselIndex(origin: ProfileOrigin): number {
        return this.profileController.getCarouselIndex(origin, this.contextFactory.profile());
    }

    protected enableEditing(): void {
        if (!this.isEditMode() || this.readonlyMode()) {
            return;
        }

        this.editEnabled.set(true);

        // Los catálogos ya se precargan al hidratar el detalle. Esta segunda
        // llamada es idempotente a nivel de estado y funciona como recuperación
        // si alguna petición de catálogo falló o fue invalidada mientras el
        // detalle todavía estaba abriendo.
        this.contextFactory.loadHydratedAssignmentCatalogs(this.form());
    }

    protected goToStep(stepId: string): void {
        if (this.isWizardStep(stepId)) {
            this.navigationController.goToStep(stepId, this.navigationActions());
        }
    }

    protected nextStep(): void {
        this.navigationController.nextStep(this.navigationActions());
    }

    protected previousStep(): void {
        this.navigationController.previousStep();
    }

    private navigationActions(): UserRegistrationNavigationActions {
        return {
            validateStep: (stepId) => this.contextFactory.validateStep(stepId),
            validateChangedIdentityFields: () => this.contextFactory.validateChangedIdentityFields(),
            consultEcccAndPersonal: () => this.consultEcccAndPersonal(),
            buildDraftSaveRequest: (nextStepId, completedSteps) =>
                this.contextFactory.buildDraftSaveRequest(nextStepId, completedSteps),
        };
    }

    protected closeWizard(): void {
        if (this.isSubmitting() || this.isDraftBusy()) {
            return;
        }

        this.closed.emit();
        this.contextFactory.resetWizard();
    }

    protected closeSaveSuccessModal(): void {
        this.saveSuccess.set(null);
        this.saved.emit();
        this.closed.emit();
        this.contextFactory.resetWizard();
    }

    protected submit(): void {
        this.submissionCoordinator.submit(this.contextFactory.submission());
    }

    protected updateForm<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K] | string | null,
    ): void {
        this.fieldController.updateForm(
            key,
            value,
            (origin) => this.claimEditStructureScope(origin),
        );
    }

    protected updateCurp(value: string): void {
        this.fieldController.updateCurp(value);
    }

    protected updateRfc(value: string): void {
        this.fieldController.updateRfc(value);
    }

    protected toggleCurpUnlock(checked: boolean): void {
        this.fieldController.toggleCurpUnlock(checked);
    }

    protected toggleCommissionSection(checked: boolean): void {
        this.structureController.toggleCommissionSection(checked, this.contextFactory.structure());
    }

    protected updateAssignmentInstitutionType(value: string | null): void {
        this.structureController.updateAssignmentInstitutionType(value, this.contextFactory.structure());
    }

    protected updateAssignmentEntity(value: string | null): void {
        this.structureController.updateAssignmentEntity(value, this.contextFactory.structure());
    }

    protected updateAssignmentMunicipality(value: string | null): void {
        this.structureController.updateAssignmentMunicipality(value, this.contextFactory.structure());
    }

    protected updateAssignmentInstitution(value: string | null): void {
        this.structureController.updateAssignmentInstitution(value, this.contextFactory.structure());
    }

    protected updateAssignmentDecentralizedBody(value: string | null): void {
        this.structureController.updateAssignmentDecentralizedBody(value, this.contextFactory.structure());
    }

    protected updateAssignmentAdministrativeUnit(value: string | null): void {
        this.structureController.updateAssignmentAdministrativeUnit(value, this.contextFactory.structure());
    }

    protected updateCommissionInstitutionType(value: string | null): void {
        this.structureController.updateCommissionInstitutionType(value, this.contextFactory.structure());
    }

    protected updateCommissionEntity(value: string | null): void {
        this.structureController.updateCommissionEntity(value, this.contextFactory.structure());
    }

    protected updateCommissionMunicipality(value: string | null): void {
        this.structureController.updateCommissionMunicipality(value, this.contextFactory.structure());
    }

    protected updateCommissionInstitution(value: string | null): void {
        this.structureController.updateCommissionInstitution(value, this.contextFactory.structure());
    }

    protected updateCommissionDecentralizedBody(value: string | null): void {
        this.structureController.updateCommissionDecentralizedBody(value, this.contextFactory.structure());
    }

    protected updateCommissionAdministrativeUnit(value: string | null): void {
        this.structureController.updateCommissionAdministrativeUnit(value, this.contextFactory.structure());
    }

    protected toggleProfile(profile: string): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.form.update((current) => {
            const exists = current.profiles.includes(profile);

            return {
                ...current,
                profiles: exists
                    ? current.profiles.filter((item) => item !== profile)
                    : [...current.profiles, profile],
            };
        });
    }

    protected isFirstStep(): boolean {
        return this.activeIndex() === 0;
    }

    protected isLastStep(): boolean {
        return this.activeIndex() === this.stepOrder().length - 1;
    }

    protected updateSelectedSystem(value: string | null): void {
        this.profileController.updateSelectedSystem(value, this.contextFactory.profile());
    }

    protected updateSelectedRole(value: string | null): void {
        this.profileController.updateSelectedRole(value, this.contextFactory.profile());
    }

    protected addAssignedProfile(): void {
        this.profileController.addAssignedProfile(this.contextFactory.profile());
    }

    protected removeAssignedProfile(id: string): void {
        this.profileController.removeAssignedProfile(id, this.contextFactory.profile());
    }

    private saveDraftAfterProfileChange(): void {
        this.draftCoordinator.saveAfterProfileChange(this.contextFactory.draft());
    }

    protected canRemoveAssignedProfile(profile: AssignedSystemProfile): boolean {
        return this.profileController.canRemoveAssignedProfile(profile, this.contextFactory.profile());
    }

    private clearProfilesAfterAssignmentInstitutionChange(
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
    ): void {
        this.profileController.clearAfterAssignmentInstitutionChange(
            previousInstitution,
            nextInstitution,
            this.contextFactory.profile(),
        );
    }

    private clearProfilesAfterCommissionInstitutionChange(
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
    ): void {
        this.profileController.clearAfterCommissionInstitutionChange(
            previousInstitution,
            nextInstitution,
            this.contextFactory.profile(),
        );
    }

    private clearAllProfilesAfterCreationContextChange(message: string): void {
        this.profileController.clearAllAfterCreationContextChange(message, this.contextFactory.profile());
    }

    private clearProfilesForOrigin(origin: ProfileOrigin, message: string): void {
        this.profileController.clearForOrigin(origin, message, this.contextFactory.profile());
    }

    protected togglePasswordVisibility(): void {
        this.showPassword.update((value) => !value);
    }

    protected toggleConfirmPasswordVisibility(): void {
        this.showConfirmPassword.update((value) => !value);
    }

    protected isAccountStatusDisabled(_status: AccountStatus): boolean {
        return true;
    }

    protected setAccountStatus(_status: AccountStatus): void {
        return;
    }

    protected getReadonlyModeTitle(): string {
        return this.form().accountStatus === 'blocked'
            ? 'Vista de usuario bloqueado'
            : 'Vista de usuario suspendido';
    }

    protected getReadonlyModeDescription(): string {
        return this.form().accountStatus === 'blocked'
            ? 'El usuario está bloqueado por seguridad. Solo puedes consultar su detalle.'
            : 'El usuario está suspendido. Solo puedes consultar su detalle.';
    }

    protected getStepIcon(step: SiauStep): string {
        return step.completed ? 'check' : step.icon;
    }

    protected getStepClass(step: SiauStep, index: number): string {
        const isActive = index === this.activeIndex();

        return [
            'registration-wizard__step',
            isActive ? 'registration-wizard__step--active' : '',
            step.completed ? 'registration-wizard__step--completed' : '',
        ]
            .join(' ')
            .trim();
    }

    protected getCurpValidationStatusLabel(status: CurpValidationStatus): string {
        return this.formRules.toText(status) || 'Sin información';
    }

    protected getCurpValidationStatusClass(status: CurpValidationStatus): string {
        const normalizedStatus = this.formRules.normalizeText(status);
        const dangerStatuses = ['inactivo', 'reprobado', 'rechazado', 'vencido', 'no vigente'];
        const successStatuses = ['activo', 'aprobado', 'vigente'];
        const isDanger = dangerStatuses.some((value) => normalizedStatus.includes(value));
        const isSuccess =
            !isDanger && successStatuses.some((value) => normalizedStatus.includes(value));
        const tone = isDanger ? 'danger' : isSuccess ? 'success' : 'neutral';

        return `registration-wizard__curp-validation-pill registration-wizard__curp-validation-pill--${tone}`;
    }

    protected getCurpValidationMessageClass(tone: CurpValidationMessageTone): string {
        return `registration-wizard__curp-validation-message registration-wizard__curp-validation-message--${tone}`;
    }

    private consultEcccAndPersonal(): void {
        this.identityCoordinator.consultEcccAndPersonal(this.form);
    }

    private resetRenapoLookupState(): void {
        this.identityCoordinator.resetRenapoLookupState();
    }

    private resetEcccPersonalLookupState(): void {
        this.identityCoordinator.resetEcccPersonalLookupState();
    }

    private hydrateEditForm(detail: UserDetailRecord, user: UserRecord | null): void {
        this.contextFactory.bumpAssignmentCatalogGeneration();
        this.contextFactory.bumpCommissionCatalogGeneration();
        this.resetRenapoLookupState();
        this.resetEcccPersonalLookupState();

        const hydration = this.editMapper.hydrate(
            detail,
            user,
            {
                gender: this.genderOptions,
                civilStatus: this.civilStatusOptions,
                institutionType: this.institutionTypeOptions,
                state: this.stateOptions,
                municipality: this.municipalityOptions,
                institution: this.institutionOptions,
                decentralizedBody: this.decentralizedBodyOptions,
                administrativeUnit: this.administrativeUnitOptions,
                commissionMunicipality: this.commissionMunicipalityOptions,
                commissionInstitution: this.commissionInstitutionOptions,
                commissionDecentralizedBody: this.commissionDecentralizedBodyOptions,
                commissionAdministrativeUnit: this.commissionAdministrativeUnitOptions,
            },
            this.presenter.knownSystemOptions(),
        );

        this.detailCurpValidated.set(hydration.persistedCurpValidated);
        if (hydration.persistedCurpValidated) {
            this.renapoLookupStatus.set('success');
            this.renapoMessage.set(
                'La CURP de este usuario ya fue validada en RENAPO. En edición no se permite volver a consultar RENAPO ni modificar CURP, nombre(s), apellidos o fecha de nacimiento.',
            );
            this.renapoMessageVisible.set(true);
            this.curpLocked.set(true);
            this.curpUnlockChecked.set(false);
        }

        const nextForm = hydration.form;
        const assignedProfiles = [...hydration.assignedProfiles];

        this.activeStepId.set('personal-data');
        this.completedSteps.set([...this.stepOrder()]);
        this.editEnabled.set(false);
        this.form.set(nextForm);
        this.initialIdentitySnapshot = this.formRules.toIdentitySnapshot(nextForm);
        this.initialEditFormSnapshot = this.formRules.toEditFormSnapshot(nextForm);
        this.initialStructureEmailSnapshot = this.contextFactory.toStructureEmailSnapshot(nextForm);
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);
        this.assignedSystemProfiles.set(assignedProfiles);
        this.assignmentProfileCarouselIndex.set(0);
        this.commissionProfileCarouselIndex.set(0);
        this.selectedProfileOrigin.set(nextForm.commissionEnabled ? 'comision' : 'adscripcion');
        this.profileResetNotice.set(null);
        this.editStructureScope.set(null);
        this.initialAssignedProfiles = [...assignedProfiles];
        this.detailRoleOptionsBySystem.set(hydration.roleOptionsBySystem);
        this.contextFactory.loadHydratedAssignmentCatalogs(nextForm);
    }

    protected deleteRegistrationDraft(): void {
        this.contextFactory.requestDeleteDraft();
    }

    protected closeDeleteDraftConfirmation(): void {
        this.contextFactory.closeDeleteDraftConfirmation();
    }

    protected confirmDeleteRegistrationDraft(): void {
        this.contextFactory.confirmDeleteDraft();
    }

    private isWizardStep(value: string): value is WizardStepId {
        return ALL_WIZARD_STEPS.includes(value as WizardStepId);
    }

    private clearFieldError(key: string): void {
        this.fieldController.clearFieldError(key);
    }

    protected minimumBirthDate(): string {
        return MINIMUM_BIRTH_DATE;
    }

    protected maximumBirthDate(): string {
        return getAdultCutoffDateInput();
    }

    /** Error vivo del campo, para pintarlo bajo el input mientras se escribe. */
    protected fieldError(key: string): string | null {
        return this.formErrors()[key] ?? null;
    }

    protected maximumTodayDate(): string {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return this.formRules.formatDateInputValue(today);
    }

}
