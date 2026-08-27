import { computed, inject, Injectable } from '@angular/core';
import { SiauSelectOption, SiauStep } from '../../../../../../shared/ui';
import {
    ALL_WIZARD_STEPS,
    AssignedSystemProfile,
    CREATE_WIZARD_STEPS,
    LOCKED_BY_ADMINISTRATIVE_UNIT_HINT,
    ProfileOrigin,
    SCOPED_BY_DECENTRALIZED_BODY_HINT,
    UserProfileOption,
    UserRegistrationForm,
    ValidationMessage,
    WizardStepId,
} from '../models/user-registration-wizard.models';
import { UserRegistrationFormRules } from '../rules/user-registration-form.rules';
import { UserProfileMatcher } from '../profiles/user-profile.matcher';
import { UserRegistrationState } from '../state/user-registration.state';
import {
    UserRegistrationValidationContext,
    UserRegistrationValidator,
} from '../validators/user-registration.validator';

/**
 * View-model derivado del asistente.
 *
 * Sólo contiene estado calculado y reglas de presentación. No modifica datos,
 * no persiste información y no realiza llamadas HTTP.
 */
@Injectable()
export class UserRegistrationPresenter {
    private readonly state = inject(UserRegistrationState);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly validator = inject(UserRegistrationValidator);
    private readonly profileMatcher = inject(UserProfileMatcher);

    readonly assignmentDecentralizedBodyLocked = computed(() => {
        const current = this.state.form();
        return this.hasStructureSelection(current.administrativeUnit) &&
            !this.hasStructureSelection(current.decentralizedBody);
    });

    readonly assignmentAdministrativeUnitEnabled = computed(() => {
        const current = this.state.form();
        if (this.hasStructureSelection(current.decentralizedBody)) {
            return true;
        }
        return this.isFederalInstitutionType(current.institutionType) &&
            this.hasStructureSelection(current.institution);
    });

    readonly assignmentDecentralizedBodyChoices = computed(() =>
        this.validator.withClearOption(this.state.decentralizedBodyOptions()),
    );
    readonly assignmentAdministrativeUnitChoices = computed(() =>
        this.validator.withClearOption(this.state.administrativeUnitOptions()),
    );
    readonly assignmentDecentralizedBodyHint = computed(() =>
        this.assignmentDecentralizedBodyLocked() ? LOCKED_BY_ADMINISTRATIVE_UNIT_HINT : null,
    );
    readonly assignmentAdministrativeUnitHint = computed(() =>
        this.hasStructureSelection(this.state.form().decentralizedBody)
            ? SCOPED_BY_DECENTRALIZED_BODY_HINT
            : null,
    );

    readonly commissionDecentralizedBodyLocked = computed(() => {
        const current = this.state.form();
        return this.hasStructureSelection(current.commissionAdministrativeUnit) &&
            !this.hasStructureSelection(current.commissionDecentralizedBody);
    });

    readonly commissionAdministrativeUnitEnabled = computed(() => {
        const current = this.state.form();
        if (this.hasStructureSelection(current.commissionDecentralizedBody)) {
            return true;
        }
        return this.isFederalInstitutionType(current.commissionInstitutionType) &&
            this.hasStructureSelection(current.commissionInstitution);
    });

    readonly commissionDecentralizedBodyChoices = computed(() =>
        this.validator.withClearOption(this.state.commissionDecentralizedBodyOptions()),
    );
    readonly commissionAdministrativeUnitChoices = computed(() =>
        this.validator.withClearOption(this.state.commissionAdministrativeUnitOptions()),
    );
    readonly commissionDecentralizedBodyHint = computed(() =>
        this.commissionDecentralizedBodyLocked() ? LOCKED_BY_ADMINISTRATIVE_UNIT_HINT : null,
    );
    readonly commissionAdministrativeUnitHint = computed(() =>
        this.hasStructureSelection(this.state.form().commissionDecentralizedBody)
            ? SCOPED_BY_DECENTRALIZED_BODY_HINT
            : null,
    );

    readonly assignmentRequiresEntity = computed(() =>
        this.requiresEntityForInstitution(this.state.form().institutionType),
    );
    readonly assignmentRequiresMunicipality = computed(() =>
        this.requiresMunicipalityForInstitution(this.state.form().institutionType),
    );
    readonly commissionRequiresEntity = computed(() =>
        this.requiresEntityForInstitution(this.state.form().commissionInstitutionType),
    );
    readonly commissionRequiresMunicipality = computed(() =>
        this.requiresMunicipalityForInstitution(this.state.form().commissionInstitutionType),
    );

    readonly canConfigureCommission = computed(() =>
        this.validator.hasValidAssignmentForCommission(
            this.state.form(),
            this.validationContext(),
        ),
    );

    readonly assignmentAssignedProfiles = computed(() =>
        this.state.assignedSystemProfiles().filter((profile) => profile.origin === 'adscripcion'),
    );
    readonly commissionAssignedProfiles = computed(() =>
        this.state.assignedSystemProfiles().filter((profile) => profile.origin === 'comision'),
    );
    readonly assignmentCarouselProfile = computed(() => this.profileAtCarouselIndex('adscripcion'));
    readonly commissionCarouselProfile = computed(() => this.profileAtCarouselIndex('comision'));

    readonly isEditMode = computed(() => this.state.mode() === 'edit');
    readonly activeProfileOrigin = computed<ProfileOrigin>(() =>
        this.isEditMode()
            ? this.state.selectedProfileOrigin()
            : this.state.form().commissionEnabled
                ? 'comision'
                : 'adscripcion',
    );
    readonly selectedProfileOriginLabel = computed(() =>
        this.activeProfileOrigin() === 'comision' ? 'comisión' : 'adscripción',
    );

    readonly assignmentEditLocked = computed(() =>
        this.isEditMode() && this.state.editEnabled() && this.state.editStructureScope() === 'comision',
    );
    readonly commissionEditLocked = computed(() =>
        this.isEditMode() && this.state.editEnabled() && this.state.editStructureScope() === 'adscripcion',
    );
    readonly assignmentProfilesLocked = computed(() => this.isProfileOriginLocked('adscripcion'));
    readonly commissionProfilesLocked = computed(() => this.isProfileOriginLocked('comision'));

    readonly showAssignmentProfilesChangeWarning = computed(() =>
        this.isEditMode() &&
        this.state.editEnabled() &&
        !this.assignmentEditLocked() &&
        (this.assignmentAssignedProfiles().length > 0 || this.state.form().commissionEnabled),
    );
    readonly showCommissionProfilesChangeWarning = computed(() =>
        this.isEditMode() &&
        this.state.editEnabled() &&
        !this.commissionEditLocked() &&
        this.commissionAssignedProfiles().length > 0,
    );

    readonly canAssignProfiles = computed(() =>
        this.validator.hasProfileAssignmentContext(
            this.state.form(),
            this.activeProfileOrigin(),
            this.validationContext(),
        ),
    );
    readonly canSelectProfiles = computed(() =>
        this.canAssignProfiles() &&
        !this.isProfileOriginLocked(this.activeProfileOrigin()) &&
        this.state.structureProfileLookupStatus() === 'success' &&
        this.state.systemOptions().length > 0,
    );

    readonly structureProfileHint = computed(() => {
        const originLabel = this.selectedProfileOriginLabel();
        switch (this.state.structureProfileLookupStatus()) {
            case 'loading':
                return `Consultando los sistemas y perfiles permitidos para la ${originLabel} seleccionada...`;
            case 'error':
                return this.state.structureProfileMessage() || 'No fue posible consultar los perfiles disponibles.';
            case 'success':
                return this.state.systemOptions().length > 0
                    ? `Los perfiles disponibles corresponden a la ${originLabel} seleccionada.`
                    : `La ${originLabel} seleccionada no tiene perfiles configurados.`;
            default:
                return this.activeProfileOrigin() === 'comision'
                    ? 'Completa la comisión para consultar sus perfiles disponibles.'
                    : 'Completa la adscripción para consultar sus perfiles disponibles.';
        }
    });

    readonly emailRequired = computed(() => true);
    readonly phoneRequired = computed(() => true);

    readonly selectedSystemIsSiau = computed(() => {
        const system = this.state.selectedSystem();
        if (!system) {
            return false;
        }
        const option = this.findKnownSystemOption(system);
        return this.isSiauSystem(system, option?.label ?? '');
    });

    readonly hasAssignedSiauProfile = computed(() => {
        const origin = this.activeProfileOrigin();
        return this.state.assignedSystemProfiles().some((profile) =>
            profile.origin === origin && this.isSiauSystem(profile.system, profile.systemLabel),
        );
    });
    readonly isSiauProfileLocked = computed(() =>
        this.selectedSystemIsSiau() && this.hasAssignedSiauProfile(),
    );
    readonly siauProfileLockMessage = computed(() => {
        const origin = this.selectedProfileOriginLabel();
        return `La ${origin} ya tiene un perfil SIAU. Si seleccionas otro perfil SIAU, se sustituirá únicamente el SIAU de esta ${origin}. Los perfiles de otros sistemas no se modifican.`;
    });
    readonly isSelectedSiauProfileBlocked = computed(() => false);

    readonly availableRoleOptions = computed<readonly SiauSelectOption[]>(() => {
        const system = this.state.selectedSystem();
        if (!system || this.isSelectedSiauProfileBlocked()) {
            return [];
        }
        const catalogRoleOptions = this.state.roleOptions();
        const sourceOptions = catalogRoleOptions.length > 0
            ? catalogRoleOptions
            : this.state.structureProfileLookupStatus() === 'success'
                ? []
                : this.findDetailRoleOptionsForSystem(system);
        return sourceOptions.filter((option) => !this.isRoleAlreadyAssigned(system, option));
    });

    readonly canAddSelectedProfile = computed(() => {
        const system = this.state.selectedSystem();
        const role = this.state.selectedRole();
        if (!system || !role || this.isSelectedSiauProfileBlocked()) {
            return false;
        }
        const roleOption = this.availableRoleOptions().find((option) => option.value === role);
        return Boolean(roleOption) && !this.isRoleAlreadyAssigned(system, roleOption!);
    });
    readonly shouldShowRoleSelect = computed(() => true);

    readonly trustLevelOptions: readonly SiauSelectOption[] = [
        { value: 'vigente', label: 'Vigente' },
        { value: 'pendiente', label: 'Pendiente' },
        { value: 'expirado', label: 'Expirado' },
    ];

    readonly profileOptions: readonly UserProfileOption[] = [
        { value: 'admin', label: 'Administrador', description: 'Acceso completo a la administración del sistema.' },
        { value: 'enlace', label: 'Enlace Institucional', description: 'Gestión de usuarios y solicitudes de su institución.' },
        { value: 'usuario', label: 'Usuario', description: 'Acceso operativo a las funciones asignadas.' },
        { value: 'supervisor', label: 'Supervisor Estatal', description: 'Consulta y supervisión de registros estatales.' },
    ];

    readonly stepOrder = computed<readonly WizardStepId[]>(() =>
        this.state.mode() === 'edit' ? ALL_WIZARD_STEPS : CREATE_WIZARD_STEPS,
    );

    readonly steps = computed<readonly SiauStep[]>(() => {
        const completed = this.state.completedSteps();
        const visibleSteps = this.stepOrder();
        return ([
            { id: 'personal-data', label: 'Datos Personales', icon: 'user', completed: completed.includes('personal-data') },
            { id: 'assignment', label: 'Adscripción', icon: 'building-2', completed: completed.includes('assignment') },
            { id: 'commission', label: 'Comisión', icon: 'briefcase', completed: completed.includes('commission') },
            { id: 'documents', label: 'Archivos', icon: 'file-text', completed: completed.includes('documents') },
            { id: 'contact', label: 'Medio de Contacto', icon: 'phone', completed: completed.includes('contact') },
            { id: 'profiles', label: 'Perfiles', icon: 'shield', completed: completed.includes('profiles') },
            { id: 'account', label: 'Cuenta', icon: 'key-round', completed: completed.includes('account') },
        ] satisfies SiauStep[]).filter((step) => visibleSteps.includes(step.id as WizardStepId));
    });

    readonly activeIndex = computed(() => this.stepOrder().indexOf(this.state.activeStepId()));
    readonly activeStepNumber = computed(() => this.activeIndex() + 1);
    readonly stepProgressSegments = computed(() => {
        const activeNumber = this.activeStepNumber();
        return this.stepOrder().map((_, index) => ({
            id: `segment-${index + 1}`,
            active: index < activeNumber,
        }));
    });
    readonly headerBadge = computed(() => {
        const prefix = this.isEditMode() ? 'Edición' : 'Registro';
        return `${prefix} · ${this.activeIndex() + 1}/${this.stepOrder().length} secciones`;
    });

    readonly rfcPrefix = computed(() => this.formRules.getRfcPrefixFromCurp(this.state.form().curp));
    readonly rfcRequired = computed(() => true);
    readonly rfcHint = computed(() => {
        const prefix = this.rfcPrefix();
        return prefix
            ? `Los primeros 10 caracteres (${prefix}) se generan desde la CURP. Captura sólo los 3 de la homoclave.`
            : 'Captura la CURP para generar automáticamente los primeros 10 caracteres.';
    });

    readonly isFormDisabled = computed(() =>
        this.isEditMode() && (this.state.readonlyMode() || !this.state.editEnabled()),
    );
    readonly isDraftBusy = computed(() =>
        this.state.isDraftLoading() || this.state.isDraftSaving() || this.state.isDraftDeleting(),
    );
    readonly hasBackendDraft = computed(() => !this.isEditMode() && this.state.draftId() !== null);

    readonly isCurpInputDisabled = computed(() => {
        if (this.isFormDisabled() || this.state.isSubmitting()) {
            return true;
        }
        if (this.isEditMode() && this.state.detailCurpValidated()) {
            return true;
        }
        return this.state.renapoLookupStatus() === 'loading' ||
            (this.state.curpLocked() && !this.state.curpUnlockChecked());
    });

    readonly isRenapoPersonalDataDisabled = computed(() => {
        if (this.isFormDisabled() || this.state.isSubmitting()) {
            return true;
        }
        if (this.isEditMode() && this.state.detailCurpValidated()) {
            return true;
        }
        return this.state.renapoLookupStatus() === 'loading' ||
            this.state.renapoLookupStatus() === 'success';
    });

    readonly isBirthDateInputDisabled = computed(() => {
        if (this.isFormDisabled() || this.state.isSubmitting()) {
            return true;
        }
        if (this.isEditMode() && this.state.detailCurpValidated()) {
            return true;
        }
        return this.state.renapoLookupStatus() === 'success';
    });

    readonly showCurpUnlock = computed(() =>
        (!this.isEditMode() || !this.state.detailCurpValidated()) &&
        (this.state.curpLocked() || this.state.curpUnlockChecked()),
    );

    readonly renapoStatusTitle = computed(() => {
        switch (this.state.renapoLookupStatus()) {
            case 'loading': return 'Consultando RENAPO';
            case 'success': return 'Validado en RENAPO';
            case 'not-found': return 'CURP sin resultados';
            case 'error': return 'Consulta no disponible';
            default: return '';
        }
    });
    readonly renapoStatusIcon = computed(() => {
        switch (this.state.renapoLookupStatus()) {
            case 'loading': return 'refresh-cw';
            case 'success': return 'circle-check';
            default: return 'triangle-alert';
        }
    });

    readonly curpValidationSummaryForDisplay = computed(() => this.state.curpValidationSummary());
    readonly currentStepErrors = computed<readonly ValidationMessage[]>(() => {
        const errors = this.state.formErrors();
        const stepFields = this.validator.getStepValidationFields(this.state.activeStepId());
        return Object.entries(errors)
            .filter(([key]) => key !== 'submit' && stepFields.includes(key))
            .map(([key, message]) => ({ key, message }));
    });
    readonly submitError = computed(() => this.state.formErrors()['submit'] ?? null);

    readonly modalTitle = computed(() => {
        if (!this.isEditMode()) {
            return 'Registrar Nuevo Usuario';
        }
        return this.state.user()?.fullName || 'Editar usuario';
    });
    readonly modalSubtitle = computed(() => {
        if (!this.isEditMode()) {
            return 'Complete todas las secciones requeridas para crear el acceso';
        }
        const user = this.state.user();
        return user ? `${user.username} · ${user.role}` : 'Consulta y edición de usuario';
    });
    readonly modalIcon = computed(() => this.isEditMode() ? 'user' : 'user-plus');
    readonly primaryButtonLabel = computed(() => {
        if (this.state.isSubmitting()) {
            return this.isEditMode() ? 'Guardando...' : 'Registrando...';
        }
        return this.isEditMode() ? 'Guardar cambios' : 'Registrar Usuario';
    });
    readonly primaryButtonIcon = computed(() => {
        if (this.state.isSubmitting()) {
            return 'loader-circle';
        }
        return this.isEditMode() ? 'save' : 'user-plus';
    });

    isProfileOriginLocked(origin: ProfileOrigin): boolean {
        if (!this.isEditMode()) {
            return false;
        }
        const scope = this.state.editStructureScope();
        if (scope) {
            return scope !== origin;
        }
        const editableOrigin: ProfileOrigin = this.state.form().commissionEnabled
            ? 'comision'
            : 'adscripcion';
        return editableOrigin !== origin;
    }

    findKnownSystemOption(systemValue: string, systemLabel = ''): SiauSelectOption | undefined {
        return this.profileMatcher.findKnownSystemOption(
            systemValue,
            systemLabel,
            this.knownSystemOptions(),
        );
    }

    isSiauSystem(systemValue: string, systemLabel = ''): boolean {
        return this.profileMatcher.isSiauSystem(systemValue, systemLabel, this.knownSystemOptions());
    }

    isRoleAlreadyAssigned(system: string, roleOption: SiauSelectOption): boolean {
        return this.profileMatcher.isRoleAlreadyAssigned(
            system,
            roleOption,
            this.state.assignedSystemProfiles(),
            this.activeProfileOrigin(),
            this.knownSystemOptions(),
        );
    }

    findDetailRoleOptionsForSystem(system: string): readonly SiauSelectOption[] {
        return this.profileMatcher.findDetailRoleOptionsForSystem(
            system,
            this.state.detailRoleOptionsBySystem(),
            this.knownSystemOptions(),
        );
    }

    knownSystemOptions(): readonly SiauSelectOption[] {
        return [...this.state.systemOptions(), ...this.state.allSystemOptions()];
    }

    private profileAtCarouselIndex(origin: ProfileOrigin): AssignedSystemProfile | null {
        const profiles = origin === 'comision'
            ? this.commissionAssignedProfiles()
            : this.assignmentAssignedProfiles();
        if (profiles.length === 0) {
            return null;
        }
        const index = origin === 'comision'
            ? this.state.commissionProfileCarouselIndex()
            : this.state.assignmentProfileCarouselIndex();
        return profiles[Math.min(Math.max(index, 0), profiles.length - 1)] ?? null;
    }

    private hasStructureSelection(value: string | null | undefined): boolean {
        return this.validator.hasStructureSelection(value);
    }

    private toCatalogId(value: string | null | undefined): number | undefined {
        if (!value) {
            return undefined;
        }
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : undefined;
    }

    private isFederalInstitutionType(value: string | null | undefined): boolean {
        return this.toCatalogId(value) === 1 || this.getInstitutionTypeLabel(value).includes('federal');
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

    private validationContext(): UserRegistrationValidationContext {
        return {
            isEditMode: this.isEditMode(),
            assignmentRequiresEntity: this.assignmentRequiresEntity(),
            assignmentRequiresMunicipality: this.assignmentRequiresMunicipality(),
            commissionRequiresEntity: this.commissionRequiresEntity(),
            commissionRequiresMunicipality: this.commissionRequiresMunicipality(),
            assignedProfiles: this.state.assignedSystemProfiles(),
            initialIdentitySnapshot: this.state.initialIdentitySnapshot(),
            initialEditFormSnapshot: this.state.initialEditFormSnapshot(),
            initialAssignedProfiles: this.state.initialAssignedProfiles(),
        };
    }
}
