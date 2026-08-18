import {
    ChangeDetectionStrategy,
    Component,
    computed,
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
import {
    catchError,
    finalize,
    forkJoin,
    map,
    Observable,
    of,
    switchMap,
} from 'rxjs';
import { CatalogoOption, CatalogoRecord, CatalogosFacade } from '../../../../../core/catalogos';
import { AuthStorage } from '../../../../../core/auth/data-access/auth.storage';
import { CorreoDeliveryResult, CorreoFacade } from '../../../../../core/correo';
import { RenapoCurpData, RenapoFacade } from '../../../../../core/renapo';
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
    EcccPersonalApiRepository,
    EcccPersonalLookupRequest,
} from '../../../data-access/eccc-personal-api.repository';
import { buildUserCredentialsEmailRequest } from '../../../application/user-credentials-email.template';
import {
    DraftStructureHierarchies,
    DraftStructureResolver,
    ResolvedDraftStructureHierarchy,
} from '../../../application/draft-structure.resolver';
import {
    ActualizarAdminRequest,
    ActualizarAdminResponse,
    BorradorCatalogos,
    BorradorDatos,
    BorradorGuardarRequest,
    BorradorItem,
    RegistroAdminCuenta,
    RegistroAdminRequest,
    RegistroAdminResponse,
    RegistroAsignacion,
    RegistroMedioContacto,
    UserDetailRecord,
    UserRecord,
} from '../../../domain/models/user-record.model';
import {
    MINIMUM_BIRTH_DATE,
    RESTRICTED_TEXT_LIMITS,
    getAdultCutoffDate,
    getAdultCutoffDateInput,
    getBirthDateError,
    getRestrictedTextError,
    isValidContactEmail,
    sanitizeContactEmailInput,
    sanitizeRestrictedText,
} from '../../../../../shared/validation/field-validators';



type AccountStatus = 'active' | 'baja' | 'suspended' | 'blocked';
type UserWizardMode = 'create' | 'edit';
type RenapoLookupStatus = 'idle' | 'loading' | 'success' | 'not-found' | 'error';
type CurpValidationStatus = string;
type CurpValidationMessageTone = 'loading' | 'success' | 'warning' | 'error';
type StructureProfileLookupStatus = 'idle' | 'loading' | 'success' | 'error';

type WizardStepId =
    | 'personal-data'
    | 'assignment'
    | 'commission'
    | 'documents'
    | 'contact'
    | 'profiles'
    | 'account';

interface UserRegistrationForm {
    cuip: string;
    policeIdentificationKey: string;
    curp: string;
    rfc: string;
    firstName: string;
    lastName: string;
    secondLastName: string;
    birthDate: string;
    gender: string;
    civilStatus: string;

    institutionType: string;
    entity: string;
    municipality: string;
    institution: string;
    decentralizedBody: string;
    administrativeUnit: string;
    position: string;
    functions: string;
    admissionDate: string;
    employeeNumber: string;

    commissionEnabled: boolean;
    commissionInstitutionType: string;
    commissionInstitution: string;
    commissionEntity: string;
    commissionMunicipality: string;
    commissionDecentralizedBody: string;
    commissionAdministrativeUnit: string;
    commissionAdmissionDate: string;

    email: string;
    phone: string;
    profiles: string[];

    username: string;
    password: string;
    confirmPassword: string;
    accountStatus: AccountStatus;
    comment: string;
}

interface IdentitySnapshot {
    readonly curp: string;
    readonly rfc: string;
    readonly birthDate: string;
}

interface CurpValidationSummary {
    readonly personal: string;
    readonly sau: string;
    readonly eccc: string;
    readonly expirationDate: string;
    readonly message: string;
    readonly messageTone: CurpValidationMessageTone;
}

interface UserProfileOption {
    readonly value: string;
    readonly label: string;
    readonly description: string;
}

interface AssignedSystemProfile {
    readonly id: string;
    readonly system: string;
    readonly systemLabel: string;
    readonly role: string;
    readonly roleLabel: string;
    /** Descripción que devuelve el GET de borradores; se usa para resolver clavePerfil. */
    readonly roleDescription?: string;
}

interface SystemProfileFallbackOption extends SiauSelectOption {
    /** descripcionPerfil del catálogo sistema_perfiles. */
    readonly description: string;
}

type StructureSelectionLevel =
    | 'institution'
    | 'dependency'
    | 'decentralized-body'
    | 'administrative-unit';

interface StructureSelection {
    readonly field: keyof UserRegistrationForm;
    readonly level: StructureSelectionLevel;
    readonly value: string;
    readonly catalogId: number | null;
}

interface StructureProfileCatalog {
    readonly systems: readonly SiauSelectOption[];
    readonly rolesBySystem: Readonly<Record<string, readonly SiauSelectOption[]>>;
}

interface ValidationMessage {
    readonly key: string;
    readonly message: string;
}

interface SaveSuccessModalState {
    readonly message: string;
    readonly userNumber: string;
    readonly account: string;
    readonly fullName: string;
    readonly system: string;
    readonly hasAccessEmail: boolean;
    readonly accessEmail: string;
    readonly accessPhone: string;
    readonly emailAccepted: boolean;
    readonly emailStatus: string;
    readonly emailMessage: string;
    readonly emailReference: string;
}

const DEFAULT_NORMAL_SYSTEM_ID = 1;
const DEFAULT_NORMAL_PROFILE_ID = 267;
const NO_APLICA_VALUE = '__NO_APLICA__';
const NO_APLICA_OPTION: SiauSelectOption = {
    value: NO_APLICA_VALUE,
    label: 'NO APLICA',
};
/**
 * Ids de cat_tipo_estructura usados por sp_cat_estructura_organizacional_obtener.
 * Los OAD y las Unidades Administrativas son hermanos: ambos cuelgan directo de
 * la institución (padreId = institución). Una UA también puede colgar de un OAD
 * (UA_OAD, las "nietas"), y para eso se vuelve a consultar con padreId = OAD.
 */
const TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO = 2;
const TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA = 4;

/**
 * El <option> placeholder del select nativo está deshabilitado, así que se
 * agrega una opción explícita para poder deshacer la selección y liberar el
 * nivel hermano que quedó bloqueado.
 */
const CLEAR_SELECTION_VALUE = '__SIN_SELECCION__';
const CLEAR_SELECTION_OPTION: SiauSelectOption = {
    value: CLEAR_SELECTION_VALUE,
    label: 'SIN SELECCIÓN',
};

const LOCKED_BY_ADMINISTRATIVE_UNIT_HINT =
    'Bloqueado: ya elegiste una unidad administrativa de la institución.';
const SCOPED_BY_DECENTRALIZED_BODY_HINT =
    'Solo se muestran las unidades del órgano seleccionado.';

const DUPLICATE_COMMISSION_STRUCTURE_MESSAGE =
    'La comisión no puede coincidir con la adscripción en su último nivel seleccionado. Elige otra institución, órgano o unidad administrativa.';

const CREATE_WIZARD_STEPS: readonly WizardStepId[] = [
    'personal-data',
    'assignment',
    'commission',
    'contact',
    'profiles',
];

const ALL_WIZARD_STEPS: readonly WizardStepId[] = [
    ...CREATE_WIZARD_STEPS,
    'account',
];

const INITIAL_FORM: UserRegistrationForm = {
    cuip: '',
    policeIdentificationKey: '',
    curp: '',
    rfc: '',
    firstName: '',
    lastName: '',
    secondLastName: '',
    birthDate: '',
    gender: '',
    civilStatus: '',

    institutionType: '',
    entity: '',
    municipality: '',
    institution: '',
    decentralizedBody: '',
    administrativeUnit: '',
    position: '',
    functions: '',
    admissionDate: '',
    employeeNumber: '',

    commissionEnabled: false,
    commissionInstitutionType: '',
    commissionInstitution: '',
    commissionEntity: '',
    commissionMunicipality: '',
    commissionDecentralizedBody: '',
    commissionAdministrativeUnit: '',
    commissionAdmissionDate: '',

    email: '',
    phone: '',
    profiles: [],

    username: '',
    password: '',
    confirmPassword: '',
    accountStatus: 'active',
    comment: '',
};

@Component({
    selector: 'app-user-registration-wizard',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauModal, SiauInput, SiauSelect, SiauLucideIcon],
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

    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly usersFacade = inject(UsersFacade);
    private readonly draftStructureResolver = inject(DraftStructureResolver);
    private readonly correoFacade = inject(CorreoFacade);
    private readonly renapoFacade = inject(RenapoFacade);
    private readonly ecccPersonalApi = inject(EcccPersonalApiRepository);
    private readonly authStorage = inject(AuthStorage);
    private readonly destroyRef = inject(DestroyRef);

    private hydrationKey = '';
    private curpLookupSequence = 0;
    private ecccPersonalLookupSequence = 0;
    private structureProfileLookupSequence = 0;
    private assignmentCatalogGeneration = 0;
    private commissionCatalogGeneration = 0;
    private loadedProfileStructureId: number | null = null;
    private lastRenapoCurp = '';
    private initialIdentitySnapshot: IdentitySnapshot | null = null;
    private initialEditFormSnapshot: UserRegistrationForm | null = null;
    private initialAssignedProfiles: readonly AssignedSystemProfile[] = [];
    private readonly catalogosReady = signal<boolean>(false);

    protected readonly activeStepId = signal<WizardStepId>('personal-data');
    protected readonly editEnabled = signal<boolean>(true);
    protected readonly completedSteps = signal<readonly WizardStepId[]>([]);
    protected readonly form = signal<UserRegistrationForm>({ ...INITIAL_FORM });
    protected readonly isSubmitting = signal<boolean>(false);
    protected readonly isDraftLoading = signal<boolean>(false);
    protected readonly isDraftSaving = signal<boolean>(false);
    protected readonly isDraftDeleting = signal<boolean>(false);
    protected readonly draftId = signal<number | null>(null);
    protected readonly draftMessage = signal<string>('');
    protected readonly draftError = signal<string>('');
    protected readonly deleteDraftConfirmationOpen = signal<boolean>(false);
    protected readonly formErrors = signal<Record<string, string>>({});
    protected readonly saveSuccess = signal<SaveSuccessModalState | null>(null);
    protected readonly renapoLookupStatus = signal<RenapoLookupStatus>('idle');
    protected readonly renapoMessage = signal<string>('');
    protected readonly renapoMessageVisible = signal<boolean>(false);
    protected readonly curpLocked = signal<boolean>(false);
    protected readonly curpUnlockChecked = signal<boolean>(false);
    protected readonly curpValidationSummary = signal<CurpValidationSummary | null>(null);

    protected readonly selectedSystem = signal<string>('');
    protected readonly selectedRole = signal<string>('');
    protected readonly assignedSystemProfiles = signal<AssignedSystemProfile[]>([]);
    protected readonly detailRoleOptionsBySystem = signal<Record<string, readonly SiauSelectOption[]>>({});
    protected readonly structureProfileLookupStatus = signal<StructureProfileLookupStatus>('idle');
    protected readonly structureProfileMessage = signal<string>('');
    private readonly structureRoleOptionsBySystem = signal<Record<string, readonly SiauSelectOption[]>>({});
    private readonly allSystemOptions = signal<readonly SiauSelectOption[]>([]);

    /**
     * Perfiles traídos de `sistema_perfiles` (catálogo global por sistema). Es
     * el respaldo para etiquetar un perfil cuando `estructura_perfil` no lo
     * devuelve para la estructura del borrador.
     */
    private readonly systemProfileFallbackOptions =
        signal<Record<string, readonly SystemProfileFallbackOption[]>>({});
    private readonly requestedProfileFallbacks = new Set<string>();

    protected readonly showPassword = signal<boolean>(false);
    protected readonly showConfirmPassword = signal<boolean>(false);

    protected readonly genderOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly civilStatusOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly userTypeOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly systemOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly roleOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly institutionTypeOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly stateOptions = signal<readonly SiauSelectOption[]>([]);

    protected readonly municipalityOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly institutionOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly decentralizedBodyOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly administrativeUnitOptions = signal<readonly SiauSelectOption[]>([]);

    protected readonly commissionMunicipalityOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly commissionInstitutionOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly commissionDecentralizedBodyOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly commissionAdministrativeUnitOptions = signal<readonly SiauSelectOption[]>([]);

    // --- OAD y Unidad Administrativa como niveles hermanos (adscripción) ---

    /** El OAD se bloquea cuando la UA elegida cuelga directo de la institución. */
    protected readonly assignmentDecentralizedBodyLocked = computed(() => {
        const current = this.form();

        return (
            this.hasStructureSelection(current.administrativeUnit) &&
            !this.hasStructureSelection(current.decentralizedBody)
        );
    });

    /** La UA se habilita con la institución (federal) o con el OAD elegido. */
    protected readonly assignmentAdministrativeUnitEnabled = computed(() => {
        const current = this.form();

        if (this.hasStructureSelection(current.decentralizedBody)) {
            return true;
        }

        return (
            this.isFederalInstitutionType(current.institutionType) &&
            this.hasStructureSelection(current.institution)
        );
    });

    protected readonly assignmentDecentralizedBodyChoices = computed(() =>
        this.withClearOption(this.decentralizedBodyOptions()),
    );

    protected readonly assignmentAdministrativeUnitChoices = computed(() =>
        this.withClearOption(this.administrativeUnitOptions()),
    );

    protected readonly assignmentDecentralizedBodyHint = computed(() =>
        this.assignmentDecentralizedBodyLocked() ? LOCKED_BY_ADMINISTRATIVE_UNIT_HINT : null,
    );

    protected readonly assignmentAdministrativeUnitHint = computed(() =>
        this.hasStructureSelection(this.form().decentralizedBody)
            ? SCOPED_BY_DECENTRALIZED_BODY_HINT
            : null,
    );

    // --- OAD y Unidad Administrativa como niveles hermanos (comisión) ---

    protected readonly commissionDecentralizedBodyLocked = computed(() => {
        const current = this.form();

        return (
            this.hasStructureSelection(current.commissionAdministrativeUnit) &&
            !this.hasStructureSelection(current.commissionDecentralizedBody)
        );
    });

    protected readonly commissionAdministrativeUnitEnabled = computed(() => {
        const current = this.form();

        if (this.hasStructureSelection(current.commissionDecentralizedBody)) {
            return true;
        }

        return (
            this.isFederalInstitutionType(current.commissionInstitutionType) &&
            this.hasStructureSelection(current.commissionInstitution)
        );
    });

    protected readonly commissionDecentralizedBodyChoices = computed(() =>
        this.withClearOption(this.commissionDecentralizedBodyOptions()),
    );

    protected readonly commissionAdministrativeUnitChoices = computed(() =>
        this.withClearOption(this.commissionAdministrativeUnitOptions()),
    );

    protected readonly commissionDecentralizedBodyHint = computed(() =>
        this.commissionDecentralizedBodyLocked() ? LOCKED_BY_ADMINISTRATIVE_UNIT_HINT : null,
    );

    protected readonly commissionAdministrativeUnitHint = computed(() =>
        this.hasStructureSelection(this.form().commissionDecentralizedBody)
            ? SCOPED_BY_DECENTRALIZED_BODY_HINT
            : null,
    );

    protected readonly assignmentRequiresEntity = computed(() =>
        this.requiresEntityForInstitution(this.form().institutionType),
    );

    protected readonly assignmentRequiresMunicipality = computed(() =>
        this.requiresMunicipalityForInstitution(this.form().institutionType),
    );

    protected readonly commissionRequiresEntity = computed(() =>
        this.requiresEntityForInstitution(this.form().commissionInstitutionType),
    );

    protected readonly commissionRequiresMunicipality = computed(() =>
        this.requiresMunicipalityForInstitution(this.form().commissionInstitutionType),
    );

    /** HU05: la comisión sólo se captura después de una adscripción válida. */
    protected readonly canConfigureCommission = computed(() =>
        this.hasValidAssignmentForCommission(this.form()),
    );

    /** HU07: la asignación manual de accesos requiere estructura válida. */
    protected readonly canAssignProfiles = computed(() =>
        this.hasProfileAssignmentContext(this.form()),
    );

    protected readonly canSelectProfiles = computed(() =>
        this.canAssignProfiles() &&
        this.structureProfileLookupStatus() === 'success' &&
        this.systemOptions().length > 0,
    );

    protected readonly structureProfileHint = computed(() => {
        switch (this.structureProfileLookupStatus()) {
            case 'loading':
                return 'Consultando los sistemas y perfiles permitidos para la estructura seleccionada...';
            case 'error':
                return this.structureProfileMessage() || 'No fue posible consultar los perfiles disponibles.';
            case 'success':
                return this.systemOptions().length > 0
                    ? 'Los perfiles disponibles corresponden a la institución seleccionada.'
                    : 'La institución seleccionada no tiene perfiles configurados.';
            default:
                return 'Completa la adscripción o la comisión para consultar los perfiles disponibles.';
        }
    });

    protected readonly emailRequired = computed(() => true);
    protected readonly phoneRequired = computed(() => true);

    protected readonly hasAssignedSiauProfile = computed(() =>
        this.assignedSystemProfiles().some((profile) =>
            this.isSiauSystem(profile.system, profile.systemLabel),
        ),
    );

    protected readonly isSelectedSiauProfileBlocked = computed(() => {
        const system = this.selectedSystem();

        return Boolean(system) && this.isSiauSystem(system) && this.hasAssignedSiauProfile();
    });

    protected readonly availableRoleOptions = computed<readonly SiauSelectOption[]>(() => {
        const system = this.selectedSystem();

        if (!system || this.isSelectedSiauProfileBlocked()) {
            return [];
        }

        const catalogRoleOptions = this.roleOptions();
        const sourceOptions = catalogRoleOptions.length > 0
            ? catalogRoleOptions
            : this.structureProfileLookupStatus() === 'success'
                ? []
                : this.findDetailRoleOptionsForSystem(system);

        return sourceOptions.filter(
            (option) => !this.isRoleAlreadyAssigned(system, option),
        );
    });

    protected readonly canAddSelectedProfile = computed(() => {
        const system = this.selectedSystem();
        const role = this.selectedRole();

        if (!system || !role || this.isSelectedSiauProfileBlocked()) {
            return false;
        }

        const roleOption = this.availableRoleOptions().find((option) => option.value === role);

        return Boolean(roleOption) && !this.isRoleAlreadyAssigned(system, roleOption!);
    });

    protected readonly shouldShowRoleSelect = computed(() => true);

    protected readonly trustLevelOptions: readonly SiauSelectOption[] = [
        { value: 'vigente', label: 'Vigente' },
        { value: 'pendiente', label: 'Pendiente' },
        { value: 'expirado', label: 'Expirado' },
    ];

    protected readonly profileOptions: readonly UserProfileOption[] = [
        {
            value: 'admin',
            label: 'Administrador',
            description: 'Acceso completo a la administración del sistema.',
        },
        {
            value: 'enlace',
            label: 'Enlace Institucional',
            description: 'Gestión de usuarios y solicitudes de su institución.',
        },
        {
            value: 'usuario',
            label: 'Usuario',
            description: 'Acceso operativo a las funciones asignadas.',
        },
        {
            value: 'supervisor',
            label: 'Supervisor Estatal',
            description: 'Consulta y supervisión de registros estatales.',
        },
    ];

    protected readonly stepOrder = computed<readonly WizardStepId[]>(() =>
        this.mode() === 'edit' ? ALL_WIZARD_STEPS : CREATE_WIZARD_STEPS,
    );

    protected readonly steps = computed<readonly SiauStep[]>(() => {
        const completed = this.completedSteps();
        const visibleSteps = this.stepOrder();

        return ([
            {
                id: 'personal-data',
                label: 'Datos Personales',
                icon: 'user',
                completed: completed.includes('personal-data'),
            },
            {
                id: 'assignment',
                label: 'Adscripción',
                icon: 'building-2',
                completed: completed.includes('assignment'),
            },
            {
                id: 'commission',
                label: 'Comisión',
                icon: 'briefcase',
                completed: completed.includes('commission'),
            },
            {
                id: 'documents',
                label: 'Archivos',
                icon: 'file-text',
                completed: completed.includes('documents'),
            },
            {
                id: 'contact',
                label: 'Medio de Contacto',
                icon: 'phone',
                completed: completed.includes('contact'),
            },
            {
                id: 'profiles',
                label: 'Perfiles',
                icon: 'shield',
                completed: completed.includes('profiles'),
            },
            {
                id: 'account',
                label: 'Cuenta',
                icon: 'key-round',
                completed: completed.includes('account'),
            },
        ] satisfies SiauStep[]).filter((step) =>
            visibleSteps.includes(step.id as WizardStepId),
        );
    });

    protected readonly activeIndex = computed(() => {
        return this.stepOrder().indexOf(this.activeStepId());
    });

    protected readonly activeStepNumber = computed(() => this.activeIndex() + 1);

    protected readonly stepProgressSegments = computed(() => {
        const activeNumber = this.activeStepNumber();

        return this.stepOrder().map((_, index) => ({
            id: `segment-${index + 1}`,
            active: index < activeNumber,
        }));
    });

    protected readonly headerBadge = computed(() => {
        const prefix = this.isEditMode() ? 'Edición' : 'Registro';
        return `${prefix} · ${this.activeIndex() + 1}/${this.stepOrder().length} secciones`;
    }); protected readonly isEditMode = computed(() => this.mode() === 'edit');

    protected readonly rfcPrefix = computed(() => this.getRfcPrefixFromCurp(this.form().curp));

    protected readonly rfcRequired = computed(() => !this.isEditMode());

    protected readonly rfcHint = computed(() => {
        const prefix = this.rfcPrefix();

        return prefix
            ? `Los primeros 10 caracteres (${prefix}) se generan desde la CURP. Captura sólo los 3 de la homoclave.`
            : 'Captura la CURP para generar automáticamente los primeros 10 caracteres.';
    });

    protected readonly isFormDisabled = computed(() =>
        this.isEditMode() && (this.readonlyMode() || !this.editEnabled()),
    );

    protected readonly isDraftBusy = computed(() =>
        this.isDraftLoading() || this.isDraftSaving() || this.isDraftDeleting(),
    );

    protected readonly hasBackendDraft = computed(() =>
        !this.isEditMode() && this.draftId() !== null,
    );

    protected readonly isCurpInputDisabled = computed(() => {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return true;
        }

        if (this.isEditMode()) {
            return false;
        }

        return (
            this.renapoLookupStatus() === 'loading' ||
            (this.curpLocked() && !this.curpUnlockChecked())
        );
    });

    protected readonly isRenapoPersonalDataDisabled = computed(() => {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return true;
        }

        return (
            !this.isEditMode() &&
            (this.renapoLookupStatus() === 'loading' || this.renapoLookupStatus() === 'success')
        );
    });

    protected readonly isBirthDateInputDisabled = computed(() => {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return true;
        }

        // Solo RENAPO bloquea los datos que confirmó; si RENAPO no responde o no
        // encuentra la CURP, el administrador debe poder capturar la fecha manualmente.
        return !this.isEditMode() && this.renapoLookupStatus() === 'success';
    });

    protected readonly showCurpUnlock = computed(() =>
        !this.isEditMode() && (this.curpLocked() || this.curpUnlockChecked()),
    );

    protected readonly renapoStatusTitle = computed(() => {
        switch (this.renapoLookupStatus()) {
            case 'loading':
                return 'Consultando RENAPO';
            case 'success':
                return 'Validado en RENAPO';
            case 'not-found':
                return 'CURP sin resultados';
            case 'error':
                return 'Consulta no disponible';
            default:
                return '';
        }
    });

    protected readonly renapoStatusIcon = computed(() => {
        switch (this.renapoLookupStatus()) {
            case 'loading':
                return 'refresh-cw';
            case 'success':
                return 'circle-check';
            default:
                return 'triangle-alert';
        }
    });

    protected dismissRenapoMessage(): void {
        this.renapoMessageVisible.set(false);
    }

    protected dismissSubmitError(): void {
        this.clearFieldError('submit');
    }

    protected dismissCurrentStepErrors(): void {
        const currentStepErrorKeys = new Set(
            this.currentStepErrors().map((error) => error.key),
        );

        if (currentStepErrorKeys.size === 0) {
            return;
        }

        this.formErrors.update((current) => {
            const next = { ...current };
            currentStepErrorKeys.forEach((key) => delete next[key]);
            return next;
        });
    }

    protected dismissStructureProfileError(): void {
        if (this.structureProfileLookupStatus() !== 'error') {
            return;
        }

        this.structureProfileLookupStatus.set('idle');
        this.structureProfileMessage.set('');
    }

    protected readonly curpValidationSummaryForDisplay = computed(() =>
        this.curpValidationSummary(),
    );

    protected readonly currentStepErrors = computed<readonly ValidationMessage[]>(() => {
        const errors = this.formErrors();
        const stepFields = this.getStepValidationFields(this.activeStepId());

        return Object.entries(errors)
            .filter(([key]) => key !== 'submit' && stepFields.includes(key))
            .map(([key, message]) => ({
                key,
                message,
            }));
    });

    /**
     * Los errores provenientes del API no pertenecen a una sección concreta.
     * La creación normal no tiene el paso "Cuenta", por lo que deben mostrarse
     * como una alerta global dentro del asistente.
     */
    protected readonly submitError = computed(() => this.formErrors()['submit'] ?? null);

    protected readonly modalTitle = computed(() => {
        if (!this.isEditMode()) {
            return 'Registrar Nuevo Usuario';
        }

        return this.user()?.fullName || 'Editar usuario';
    });

    protected readonly modalSubtitle = computed(() => {
        if (!this.isEditMode()) {
            return 'Complete todas las secciones requeridas para crear el acceso';
        }

        const user = this.user();

        if (!user) {
            return 'Consulta y edición de usuario';
        }

        return `${user.username} · ${user.role}`;
    });

    protected readonly modalIcon = computed(() => (this.isEditMode() ? 'user' : 'user-plus'));

    protected readonly primaryButtonLabel = computed(() => {
        if (this.isSubmitting()) {
            return this.isEditMode() ? 'Guardando...' : 'Registrando...';
        }

        return this.isEditMode() ? 'Guardar cambios' : 'Registrar Usuario';
    });

    protected readonly primaryButtonIcon = computed(() => {
        if (this.isSubmitting()) {
            return 'loader-circle';
        }

        return this.isEditMode() ? 'save' : 'user-plus';
    });

    constructor() {
        effect(() => {
            const isOpen = this.open();

            if (isOpen && !this.catalogosReady()) {
                this.loadCatalogos();
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
                    this.hydrateEditForm(detail?.datos ?? {}, user);
                    return;
                }

                this.resetWizard();
                this.editEnabled.set(true);
                this.ensureDefaultSiauProfile();

                if (!catalogosReady) {
                    return;
                }

                if (draftToOpen) {
                    this.restoreProvidedRegistrationDraft(draftToOpen);
                } else if (autoRestoreDraft) {
                    this.loadRegistrationDraft();
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
            this.systemProfileFallbackOptions();

            untracked(() => this.refreshAssignedProfileLabels());
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

            const structureId = this.resolveProfileStructureId(current);

            untracked(() => this.loadStructureProfileOptions(structureId));
        });
    }

    protected enableEditing(): void {
        if (!this.isEditMode() || this.readonlyMode()) {
            return;
        }

        this.editEnabled.set(true);
    }

    protected goToStep(stepId: string): void {
        if (!this.isWizardStep(stepId)) {
            return;
        }

        if (this.isEditMode()) {
            const currentStep = this.activeStepId();

            if (
                currentStep === 'personal-data' &&
                stepId !== currentStep &&
                !this.validateChangedIdentityFields()
            ) {
                return;
            }

            this.activeStepId.set(stepId);
            return;
        }

        const current = this.activeStepId();
        const stepOrder = this.stepOrder();
        const currentIndex = stepOrder.indexOf(current);
        const targetIndex = stepOrder.indexOf(stepId);

        if (targetIndex < 0) {
            return;
        }

        if (targetIndex > currentIndex && !this.validateStep(current)) {
            return;
        }

        this.activeStepId.set(stepId);
    }

    protected nextStep(): void {
        const current = this.activeStepId();
        const stepOrder = this.stepOrder();
        const currentIndex = stepOrder.indexOf(current);

        if (
            (this.isEditMode() && current === 'personal-data' && !this.validateChangedIdentityFields()) ||
            (!this.isEditMode() && !this.validateStep(current))
        ) {
            return;
        }

        if (this.isEditMode()) {
            if (current === 'personal-data') {
                this.consultEcccAndPersonal();
            }

            this.markCompleted(current);

            if (currentIndex < stepOrder.length - 1) {
                this.activeStepId.set(stepOrder[currentIndex + 1]);
            }
            return;
        }

        if (this.isDraftBusy() || currentIndex >= stepOrder.length - 1) {
            return;
        }

        const nextStepId = stepOrder[currentIndex + 1];
        const completedSteps = this.withCompletedStep(current);

        // El borrador es una ayuda de persistencia, no debe bloquear el alta.
        // Una vez que el paso actual pasó sus validaciones, el usuario continúa
        // aunque la llamada de guardado falle.
        this.completedSteps.set(completedSteps);
        this.activeStepId.set(nextStepId);

        if (current === 'personal-data') {
            this.consultEcccAndPersonal();
        }

        let request: BorradorGuardarRequest;

        try {
            request = this.buildDraftSaveRequest(nextStepId, completedSteps);
        } catch {
            this.draftMessage.set('');
            this.draftError.set('No se pudo guardar el borrador. Puedes continuar con el registro.');
            return;
        }

        this.isDraftSaving.set(true);
        this.draftError.set('');
        this.draftMessage.set('Guardando avance...');

        this.usersFacade
            .saveRegistrationDraft(request)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isDraftSaving.set(false)),
            )
            .subscribe({
                next: (response) => {
                    const savedDraftId = response.datos?.borradorId;
                    if (savedDraftId && savedDraftId > 0) {
                        this.draftId.set(savedDraftId);
                    }

                    this.draftMessage.set(response.mensaje?.trim() || 'Avance guardado.');
                },
                error: () => {
                    this.draftMessage.set('');
                    this.draftError.set('No se pudo guardar el borrador. Puedes continuar con el registro.');
                },
            });
    }

    protected previousStep(): void {
        const currentIndex = this.activeIndex();
        const stepOrder = this.stepOrder();

        if (currentIndex > 0) {
            this.activeStepId.set(stepOrder[currentIndex - 1]);
        }
    }

    protected closeWizard(): void {
        if (this.isSubmitting() || this.isDraftBusy()) {
            return;
        }

        this.closed.emit();
        this.resetWizard();
    }

    protected closeSaveSuccessModal(): void {
        this.saveSuccess.set(null);
        this.saved.emit();
        this.closed.emit();
        this.resetWizard();
    }


    protected submit(): void {
        if (this.readonlyMode() || this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        // Evita dejar visible el error del intento anterior mientras se reintenta el registro.
        this.clearFieldError('submit');

        if (this.isEditMode()) {
            if (!this.validateAllSteps()) {
                return;
            }

            let updateRequest: ActualizarAdminRequest;

            try {
                updateRequest = this.buildUpdateUserRequest();
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Revisa la información capturada.';
                this.formErrors.update((current) => ({ ...current, submit: message }));
                return;
            }

            this.isSubmitting.set(true);
            this.usersFacade.updateAdminUser(updateRequest)
                .pipe(
                    takeUntilDestroyed(this.destroyRef),
                    finalize(() => this.isSubmitting.set(false)),
                )
                .subscribe({
                    next: (response) => {
                        this.stepOrder().forEach((stepId) => this.markCompleted(stepId));
                        this.saveSuccess.set(this.buildUpdateSuccessModalState(response));
                    },
                    error: (error: unknown) => {
                        const message = error instanceof Error
                            ? error.message
                            : 'No fue posible actualizar el usuario.';
                        this.formErrors.update((current) => ({ ...current, submit: message }));
                        console.error('Error actualizando usuario.', error);
                    },
                });
            return;
        }

        if (!this.validateAllSteps()) {
            return;
        }

        let saveRequest$: Observable<RegistroAdminResponse>;

        try {
            saveRequest$ = this.usersFacade.createAdminUser(this.buildCreateUserRequest());
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Revisa la información capturada.';

            this.formErrors.update((current) => ({
                ...current,
                submit: message,
            }));
            console.error(error);
            return;
        }

        this.isSubmitting.set(true);

        saveRequest$
            .pipe(
                switchMap((response) =>
                    this.requestTemporaryPassword(response).pipe(
                        switchMap((temporaryPassword) =>
                            this.sendAccessCredentialsEmail(
                                response,
                                temporaryPassword,
                            ),
                        ),
                        map((emailDelivery) => ({ response, emailDelivery })),
                        catchError((error: unknown) =>
                            of({
                                response,
                                emailDelivery: this.toFailedEmailDelivery(error),
                            }),
                        ),
                    ),
                ),
                switchMap(({ response, emailDelivery }) =>
                    this.deleteRegistrationDraftAfterSuccess().pipe(
                        map(() => ({ response, emailDelivery })),
                    ),
                ),
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isSubmitting.set(false)),
            )
            .subscribe({
                next: ({ response, emailDelivery }) => {
                    this.stepOrder().forEach((stepId) => this.markCompleted(stepId));
                    this.saveSuccess.set(
                        this.buildSaveSuccessModalState(response, emailDelivery),
                    );
                },
                error: (error: unknown) => {
                    const message =
                        error instanceof Error
                            ? error.message
                            : 'No fue posible registrar el usuario.';

                    this.formErrors.update((current) => ({
                        ...current,
                        submit: message,
                    }));

                    console.error('Error registrando usuario.', error);
                },
            });
    }

    protected updateForm<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K] | string | null,
    ): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (key === 'curp') {
            this.updateCurp(this.toText(value));
            return;
        }

        if (key === 'rfc') {
            this.updateRfc(this.toText(value));
            return;
        }

        const normalizedValue = this.normalizeFormInputValue(key, value);
        const previousValue = this.form()[key];

        this.form.update((current) => ({
            ...current,
            [key]: normalizedValue,
        }));

        // Sólo los campos que forman parte del body de /api/general/consulta
        // invalidan lo que se está mostrando. El cache de consultas terminadas
        // se conserva para reutilizar cualquier combinación ya consultada.
        if (
            normalizedValue !== previousValue &&
            (key === 'cuip' ||
                key === 'firstName' ||
                key === 'lastName' ||
                key === 'secondLastName' ||
                key === 'birthDate')
        ) {
            this.clearCurpValidationSummary();
        }

        if (key === 'email' || key === 'phone') {
            this.clearFieldError('email');
            this.clearFieldError('phone');
            return;
        }

        this.clearFieldError(String(key));
        this.applyLiveFieldValidation(key, normalizedValue);
    }

    /**
     * Los pasos sólo se validaban al presionar "Siguiente", así que el usuario
     * no sabía qué campo estaba mal. Cargo, Funciones y Fecha de nacimiento se
     * revisan ahora en cada tecla y el mensaje se pinta bajo el propio campo.
     */
    private applyLiveFieldValidation<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K],
    ): void {
        const text = this.toText(value);
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
        } else if (key === 'comment' && text) {
            message = getRestrictedTextError(
                text,
                RESTRICTED_TEXT_LIMITS.comment.min,
                RESTRICTED_TEXT_LIMITS.comment.max,
                'El comentario',
            );
        } else if (key === 'birthDate' && text) {
            // Cubre el caso de escribir el año a mano: el <input type="date">
            // nativo respeta [min]/[max] sólo desde el calendario.
            message = getBirthDateError(text);
        }

        if (!message) {
            return;
        }

        this.formErrors.update((current) => ({
            ...current,
            [String(key)]: message,
        }));
    }

    protected updateCurp(value: string): void {
        if (this.isCurpInputDisabled()) {
            return;
        }

        if (this.isEditMode()) {
            const curp = this.normalizeFormInputValue('curp', value);
            const previousCurp = this.form().curp;

            if (curp === previousCurp) {
                return;
            }

            this.clearCurpLookupResultsForEdit();

            this.form.update((current) => ({
                ...current,
                curp,
            }));
            this.clearFieldError('curp');
            this.clearFieldError('rfc');
            return;
        }

        const curp = this.normalizeFormInputValue('curp', value);
        const previousCurp = this.form().curp;

        if (curp === previousCurp) {
            return;
        }

        this.clearCurpLookupResultsForEdit();

        this.form.update((current) => ({
            ...current,
            curp,
        }));
        this.clearFieldError('curp');
        this.clearFieldError('rfc');
        this.clearFieldError('birthDate');

        if (curp.length !== 18) {
            return;
        }

        if (!this.isValidCurp(curp)) {
            this.formErrors.update((current) => ({
                ...current,
                curp: 'La CURP no tiene un formato válido.',
            }));
            return;
        }

        this.consultRenapo(curp);
    }

    protected updateRfc(value: string): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        const current = this.form();
        const prefix = this.getRfcPrefixFromCurp(current.curp);
        const rfc = prefix
            ? `${prefix}${this.getRfcHomoclave(value, prefix, current.rfc)}`
            : this.normalizeRfc(value);

        this.form.update((form) => ({
            ...form,
            rfc,
        }));

        if (rfc !== current.rfc) {
            this.clearCurpValidationSummary();
        }

        this.clearFieldError('rfc');
    }

    protected toggleCurpUnlock(checked: boolean): void {
        if (this.isEditMode() || this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (checked) {
            this.curpUnlockChecked.set(true);
            return;
        }

        const currentCurp = this.form().curp;

        if (currentCurp !== this.lastRenapoCurp && !this.isValidCurp(currentCurp)) {
            this.curpUnlockChecked.set(true);
            this.formErrors.update((current) => ({
                ...current,
                curp: 'Completa una CURP válida de 18 caracteres antes de volver a bloquearla.',
            }));
            return;
        }

        this.curpUnlockChecked.set(false);

        if (currentCurp !== this.lastRenapoCurp) {
            this.consultRenapo(currentCurp);
            return;
        }

        this.curpLocked.set(true);
    }

    protected toggleCommissionSection(checked: boolean): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpCommissionCatalogGeneration();

        if (checked && !this.canConfigureCommission()) {
            this.formErrors.update((current) => ({
                ...current,
                commissionInstitutionType:
                    'Primero registra una adscripción válida antes de capturar la comisión.',
            }));
            return;
        }

        if (this.form().commissionEnabled !== checked) {
            this.clearProfilesAfterStructureContextChange(
                checked
                    ? 'Se activó la comisión. Selecciona la institución de comisión para consultar sus perfiles.'
                    : 'Se eliminó la comisión. Debes volver a seleccionar los perfiles de la adscripción.',
            );
        }

        this.form.update((current) => ({
            ...current,
            commissionEnabled: checked,
            commissionInstitutionType: checked ? current.commissionInstitutionType : '',
            commissionInstitution: checked ? current.commissionInstitution : '',
            commissionEntity: checked ? current.commissionEntity : '',
            commissionMunicipality: checked ? current.commissionMunicipality : '',
            commissionDecentralizedBody: checked ? current.commissionDecentralizedBody : '',
            commissionAdministrativeUnit: checked ? current.commissionAdministrativeUnit : '',
            commissionAdmissionDate: checked ? current.commissionAdmissionDate : '',
        }));

        if (!checked) {
            this.commissionMunicipalityOptions.set([]);
            this.commissionInstitutionOptions.set([]);
            this.commissionDecentralizedBodyOptions.set([]);
            this.commissionAdministrativeUnitOptions.set([]);
        }

        this.formErrors.update((current) => {
            const next = { ...current };

            [
                'commissionInstitutionType',
                'commissionEntity',
                'commissionMunicipality',
                'commissionInstitution',
                'commissionDecentralizedBody',
                'commissionAdministrativeUnit',
                'commissionAdmissionDate',
            ].forEach((key) => delete next[key]);

            return next;
        });

        this.refreshCommissionStructureConflict();
    }

    protected updateAssignmentInstitutionType(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpAssignmentCatalogGeneration();

        const institutionType = value ?? '';
        const requiresEntity = this.requiresEntityForInstitution(institutionType);

        this.clearProfilesAfterAssignmentInstitutionChange(this.form().institution, '');

        this.form.update((current) => ({
            ...current,
            institutionType,
            entity: requiresEntity ? current.entity : '',
            municipality: '',
            institution: '',
            decentralizedBody: '',
            administrativeUnit: '',
        }));

        if (!this.requiresMunicipalityForInstitution(institutionType)) {
            this.municipalityOptions.set([]);
        } else {
            this.municipalityOptions.set([]);

            const preservedEntity = this.form().entity;

            if (preservedEntity) {
                this.loadMunicipalities(preservedEntity, this.municipalityOptions, 'assignment');
            }
        }

        this.institutionOptions.set([]);
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        this.loadAssignmentInstitutions();
        this.refreshCommissionStructureConflict();
    }

    protected updateAssignmentEntity(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpAssignmentCatalogGeneration();

        if (!this.assignmentRequiresEntity()) {
            this.clearProfilesAfterAssignmentInstitutionChange(this.form().institution, '');
            this.form.update((current) => ({
                ...current,
                entity: '',
                municipality: '',
            }));
            this.municipalityOptions.set([]);
            this.loadAssignmentInstitutions();
            this.refreshCommissionStructureConflict();
            return;
        }

        this.clearProfilesAfterAssignmentInstitutionChange(this.form().institution, '');

        this.form.update((current) => ({
            ...current,
            entity: value ?? '',
            municipality: '',
            institution: '',
            decentralizedBody: '',
            administrativeUnit: '',
        }));
        this.municipalityOptions.set([]);
        this.institutionOptions.set([]);
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        if (this.assignmentRequiresMunicipality()) {
            this.loadMunicipalities(value, this.municipalityOptions, 'assignment');
        }
        this.loadAssignmentInstitutions();
        this.refreshCommissionStructureConflict();
    }

    protected updateAssignmentMunicipality(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpAssignmentCatalogGeneration();

        if (!this.assignmentRequiresMunicipality()) {
            this.form.update((current) => ({ ...current, municipality: '' }));
            return;
        }

        this.clearProfilesAfterAssignmentInstitutionChange(this.form().institution, '');

        this.form.update((current) => ({
            ...current,
            municipality: value ?? '',
            institution: '',
            decentralizedBody: '',
            administrativeUnit: '',
        }));
        this.institutionOptions.set([]);
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        this.loadAssignmentInstitutions();
        this.refreshCommissionStructureConflict();
    }

    protected updateAssignmentInstitution(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpAssignmentCatalogGeneration();

        const institution = value ?? '';
        this.clearProfilesAfterAssignmentInstitutionChange(
            this.form().institution,
            institution,
        );

        this.form.update((current) => ({
            ...current,
            institution,
            decentralizedBody: '',
            administrativeUnit: '',
        }));
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        // OAD y UA son hermanos: los dos catálogos se piden con padreId = institución.
        this.loadAssignmentDecentralizedBodies();
        this.loadAssignmentAdministrativeUnits();
        this.refreshCommissionStructureConflict();
    }

    protected updateAssignmentDecentralizedBody(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (this.assignmentDecentralizedBodyLocked()) {
            return;
        }

        this.bumpAssignmentCatalogGeneration();

        const decentralizedBody = this.normalizeSelectValue(value);

        // El catálogo de perfiles se consulta con el último nivel seleccionado,
        // por lo que cambiar el OAD invalida los perfiles ya elegidos.
        this.clearProfilesAfterAssignmentInstitutionChange(
            this.form().decentralizedBody,
            decentralizedBody,
        );

        this.form.update((current) => ({
            ...current,
            decentralizedBody,
            administrativeUnit: '',
        }));
        this.clearFieldError('decentralizedBody');
        this.administrativeUnitOptions.set([]);
        // Con OAD elegido las UA se acotan a sus hijas; sin OAD vuelven al
        // nivel de institución.
        this.loadAssignmentAdministrativeUnits();
        this.refreshCommissionStructureConflict();
    }

    protected updateAssignmentAdministrativeUnit(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpAssignmentCatalogGeneration();

        const administrativeUnit = this.normalizeSelectValue(value);

        this.clearProfilesAfterAssignmentInstitutionChange(
            this.form().administrativeUnit,
            administrativeUnit,
        );
        this.form.update((current) => ({
            ...current,
            administrativeUnit,
        }));
        this.clearFieldError('administrativeUnit');
        this.refreshCommissionStructureConflict();
    }

    protected updateCommissionInstitutionType(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpCommissionCatalogGeneration();

        const commissionInstitutionType = value ?? '';
        const requiresEntity = this.requiresEntityForInstitution(commissionInstitutionType);

        this.clearProfilesAfterCommissionInstitutionChange(this.form().commissionInstitution, '');

        this.form.update((current) => ({
            ...current,
            commissionInstitutionType,
            commissionEntity: requiresEntity ? current.commissionEntity : '',
            commissionMunicipality: '',
            commissionInstitution: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));

        if (!this.requiresMunicipalityForInstitution(commissionInstitutionType)) {
            this.commissionMunicipalityOptions.set([]);
        } else {
            this.commissionMunicipalityOptions.set([]);

            const preservedEntity = this.form().commissionEntity;

            if (preservedEntity) {
                this.loadMunicipalities(preservedEntity, this.commissionMunicipalityOptions, 'commission');
            }
        }

        this.commissionInstitutionOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionInstitutions();
        this.refreshCommissionStructureConflict();
    }

    protected updateCommissionEntity(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpCommissionCatalogGeneration();

        if (!this.commissionRequiresEntity()) {
            this.clearProfilesAfterCommissionInstitutionChange(this.form().commissionInstitution, '');
            this.form.update((current) => ({
                ...current,
                commissionEntity: '',
                commissionMunicipality: '',
            }));
            this.commissionMunicipalityOptions.set([]);
            this.loadCommissionInstitutions();
            this.refreshCommissionStructureConflict();
            return;
        }

        this.clearProfilesAfterCommissionInstitutionChange(this.form().commissionInstitution, '');

        this.form.update((current) => ({
            ...current,
            commissionEntity: value ?? '',
            commissionMunicipality: '',
            commissionInstitution: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionMunicipalityOptions.set([]);
        this.commissionInstitutionOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        if (this.commissionRequiresMunicipality()) {
            this.loadMunicipalities(value, this.commissionMunicipalityOptions, 'commission');
        }
        this.loadCommissionInstitutions();
        this.refreshCommissionStructureConflict();
    }

    protected updateCommissionMunicipality(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpCommissionCatalogGeneration();

        if (!this.commissionRequiresMunicipality()) {
            this.form.update((current) => ({ ...current, commissionMunicipality: '' }));
            return;
        }

        this.clearProfilesAfterCommissionInstitutionChange(this.form().commissionInstitution, '');

        this.form.update((current) => ({
            ...current,
            commissionMunicipality: value ?? '',
            commissionInstitution: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionInstitutionOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionInstitutions();
        this.refreshCommissionStructureConflict();
    }

    protected updateCommissionInstitution(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpCommissionCatalogGeneration();

        const commissionInstitution = value ?? '';
        this.clearProfilesAfterCommissionInstitutionChange(
            this.form().commissionInstitution,
            commissionInstitution,
        );

        this.form.update((current) => ({
            ...current,
            commissionInstitution,
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionDecentralizedBodies();
        this.loadCommissionAdministrativeUnits();
        this.refreshCommissionStructureConflict();
    }


    protected updateCommissionDecentralizedBody(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (this.commissionDecentralizedBodyLocked()) {
            return;
        }

        this.bumpCommissionCatalogGeneration();

        const commissionDecentralizedBody = this.normalizeSelectValue(value);

        this.clearProfilesAfterCommissionInstitutionChange(
            this.form().commissionDecentralizedBody,
            commissionDecentralizedBody,
        );

        this.form.update((current) => ({
            ...current,
            commissionDecentralizedBody,
            commissionAdministrativeUnit: '',
        }));
        this.clearFieldError('commissionDecentralizedBody');
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionAdministrativeUnits();
        this.refreshCommissionStructureConflict();
    }

    protected updateCommissionAdministrativeUnit(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.bumpCommissionCatalogGeneration();

        const commissionAdministrativeUnit = this.normalizeSelectValue(value);

        this.clearProfilesAfterCommissionInstitutionChange(
            this.form().commissionAdministrativeUnit,
            commissionAdministrativeUnit,
        );
        this.form.update((current) => ({
            ...current,
            commissionAdministrativeUnit,
        }));
        this.clearFieldError('commissionAdministrativeUnit');
        this.refreshCommissionStructureConflict();
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
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (!this.canSelectProfiles()) {
            this.formErrors.update((current) => ({
                ...current,
                profiles:
                    this.structureProfileMessage() ||
                    'Consulta los perfiles disponibles para la institución antes de asignarlos.',
            }));
            return;
        }

        const system = value ?? '';

        this.selectedSystem.set(system);
        this.selectedRole.set('');
        this.roleOptions.set([]);

        this.loadProfileOptionsForSystem(system);
    }

    protected updateSelectedRole(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.selectedRole.set(value ?? '');
    }

    protected addAssignedProfile(): void {
        if (this.isFormDisabled() || this.isSubmitting() || this.isDraftBusy()) {
            return;
        }

        if (!this.canSelectProfiles()) {
            this.formErrors.update((current) => ({
                ...current,
                profiles:
                    this.structureProfileMessage() ||
                    'Consulta los perfiles disponibles para la institución antes de asignarlos.',
            }));
            return;
        }

        const system = this.selectedSystem();
        const role = this.selectedRole();

        if (!system || !role) {
            return;
        }

        const systemOption = this.systemOptions().find(
            (item) =>
                item.value === system ||
                this.normalizeText(item.label) === this.normalizeText(system),
        );

        const roleOption = this.availableRoleOptions().find((item) => item.value === role);

        if (!systemOption || !roleOption) {
            return;
        }

        const isSiau = this.isSiauSystem(system, systemOption.label);

        if (isSiau && this.hasAssignedSiauProfile()) {
            this.formErrors.update((current) => ({
                ...current,
                profiles:
                    'SIAU ya tiene un perfil asignado. Elimina el perfil listado antes de agregar otro perfil de SIAU.',
            }));
            return;
        }

        if (this.isRoleAlreadyAssigned(system, roleOption)) {
            return;
        }

        const newItem: AssignedSystemProfile = {
            id: `${system}-${role}-${Date.now()}`,
            system,
            role,
            systemLabel: systemOption.label,
            roleLabel: roleOption.label,
        };

        this.assignedSystemProfiles.update((current) => [...current, newItem]);
        this.clearFieldError('profiles');
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);

        // El perfil forma parte del borrador. Al agregarlo se persiste de inmediato
        // para no depender de que el usuario vuelva a presionar "Siguiente".
        this.saveDraftAfterProfileChange();
    }

    protected removeAssignedProfile(id: string): void {
        if (this.isFormDisabled() || this.isSubmitting() || this.isDraftBusy()) {
            return;
        }

        const profile = this.assignedSystemProfiles().find((item) => item.id === id);

        if (!profile || !this.canRemoveAssignedProfile(profile)) {
            return;
        }

        this.assignedSystemProfiles.update((current) => current.filter((item) => item.id !== id));
        this.clearFieldError('profiles');

        // También se persiste la eliminación. Si ya no queda ningún perfil,
        // buildDraftSaveRequest enviará sistemaId/perfilId como null.
        this.saveDraftAfterProfileChange();
    }

    private saveDraftAfterProfileChange(): void {
        if (this.isEditMode() || this.isDraftBusy()) {
            return;
        }

        let request: BorradorGuardarRequest;

        try {
            request = this.buildDraftSaveRequest(this.activeStepId(), this.completedSteps());
        } catch {
            this.draftMessage.set('');
            this.draftError.set(
                'No se pudo guardar el cambio de perfil en el borrador. Puedes continuar con el registro.',
            );
            return;
        }

        this.isDraftSaving.set(true);
        this.draftError.set('');
        this.draftMessage.set('Guardando cambio de perfil...');

        this.usersFacade
            .saveRegistrationDraft(request)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isDraftSaving.set(false)),
            )
            .subscribe({
                next: (response) => {
                    const savedDraftId = response.datos?.borradorId;
                    if (savedDraftId && savedDraftId > 0) {
                        this.draftId.set(savedDraftId);
                    }

                    this.draftMessage.set(response.mensaje?.trim() || 'Cambio de perfil guardado.');
                },
                error: () => {
                    this.draftMessage.set('');
                    this.draftError.set(
                        'No se pudo guardar el cambio de perfil en el borrador. Puedes continuar con el registro.',
                    );
                },
            });
    }

    protected canRemoveAssignedProfile(_profile: AssignedSystemProfile): boolean {
        // Un perfil SIAU debe poder eliminarse para que el administrador pueda
        // seleccionar otro. La exclusividad se valida al agregar, no al eliminar.
        return true;
    }

    private clearProfilesAfterAssignmentInstitutionChange(
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
    ): void {
        // Cuando existe comisión, los perfiles provienen de la institución de comisión.
        // Cambiar adscripción no debe borrar ni alterar ese contexto independiente.
        if (this.form().commissionEnabled) {
            return;
        }

        this.clearAssignedProfilesAfterInstitutionChange(
            previousInstitution,
            nextInstitution,
            'La estructura de adscripción cambió. Debes volver a seleccionar los sistemas y perfiles del usuario.',
        );
    }

    private clearProfilesAfterCommissionInstitutionChange(
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
    ): void {
        if (!this.form().commissionEnabled) {
            return;
        }

        this.clearAssignedProfilesAfterInstitutionChange(
            previousInstitution,
            nextInstitution,
            'La estructura de comisión cambió. Debes volver a seleccionar los sistemas y perfiles del usuario.',
        );
    }

    private clearAssignedProfilesAfterInstitutionChange(
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
        message: string,
    ): void {
        const previousValue = String(previousInstitution ?? '').trim();
        const nextValue = String(nextInstitution ?? '').trim();

        if (previousValue === nextValue) {
            return;
        }

        this.clearProfilesAfterStructureContextChange(message);
    }

    private clearProfilesAfterStructureContextChange(message: string): void {
        this.resetStructureProfileCatalog();

        const hasAssignedProfiles =
            this.assignedSystemProfiles().length > 0 || this.form().profiles.length > 0;

        this.assignedSystemProfiles.set([]);
        this.form.update((current) => ({
            ...current,
            profiles: [],
        }));
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);

        this.completedSteps.update((current) =>
            current.filter((stepId) => stepId !== 'profiles'),
        );

        if (!hasAssignedProfiles) {
            this.clearFieldError('profiles');
            return;
        }

        this.formErrors.update((current) => ({
            ...current,
            profiles: message,
        }));
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
        return this.toText(status) || 'Sin información';
    }

    protected getCurpValidationStatusClass(status: CurpValidationStatus): string {
        const normalizedStatus = this.normalizeText(status);
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

    private consultRenapo(curp: string): void {
        const normalizedCurp = this.toText(curp).toUpperCase();

        if (!this.isValidCurp(normalizedCurp)) {
            return;
        }

        const requestSequence = ++this.curpLookupSequence;

        // Cada consulta representa una nueva validación de identidad: se vuelve
        // a generar el prefijo del RFC desde la CURP y se exige capturar de nuevo
        // la homoclave de tres caracteres.
        this.form.update((current) => ({
            ...current,
            rfc: this.buildRfcFromCurp(normalizedCurp),
        }));
        this.clearFieldError('rfc');

        this.clearCurpValidationSummary();
        this.curpUnlockChecked.set(false);
        this.curpLocked.set(false);
        this.renapoLookupStatus.set('loading');
        this.renapoMessage.set('Espera un momento mientras validamos la identidad.');
        this.renapoMessageVisible.set(true);

        this.renapoFacade
            .consultarCurp(normalizedCurp)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    if (
                        requestSequence !== this.curpLookupSequence ||
                        this.form().curp !== normalizedCurp
                    ) {
                        return;
                    }

                    this.lastRenapoCurp = normalizedCurp;
                    this.curpLocked.set(true);

                    if (response.exito && response.datos && this.hasCompleteRenapoPersonalData(response.datos)) {
                        this.applyRenapoPersonalData(response.datos, normalizedCurp);
                        this.renapoLookupStatus.set('success');
                        this.renapoMessageVisible.set(true);
                        this.renapoMessage.set(
                            response.mensaje ||
                            'Los datos personales fueron llenados con la información de RENAPO.',
                        );
                        return;
                    }

                    this.renapoLookupStatus.set('not-found');
                    this.renapoMessageVisible.set(true);
                    this.renapoMessage.set(
                        'RENAPO no encontró información para esta CURP. Captura manualmente nombre(s), apellidos, sexo y fecha de nacimiento.',
                    );
                },
                error: (error: unknown) => {
                    if (
                        requestSequence !== this.curpLookupSequence ||
                        this.form().curp !== normalizedCurp
                    ) {
                        return;
                    }

                    this.lastRenapoCurp = normalizedCurp;
                    this.curpLocked.set(true);
                    this.renapoLookupStatus.set('error');
                    this.renapoMessageVisible.set(true);
                    this.renapoMessage.set(
                        'No fue posible consultar RENAPO. Puedes reintentar o capturar manualmente nombre(s), apellidos, sexo y fecha de nacimiento.',
                    );
                    console.error('Error consultando CURP en RENAPO.', error);
                },
            });
    }

    private applyRenapoPersonalData(data: RenapoCurpData, requestedCurp: string): void {
        const returnedCurp = this.toText(data.curp).toUpperCase();
        const curp = returnedCurp || requestedCurp;
        const gender = this.resolveRenapoGender(data.sexo);

        this.form.update((current) => ({
            ...current,
            curp,
            firstName: this.normalizeNameInput(data.nombre),
            lastName: this.normalizeNameInput(data.primerApellido),
            secondLastName: this.normalizeNameInput(data.segundoApellido),
            birthDate: this.toDateInputValue(data.fechaNacimiento) || this.getBirthDateFromCurp(curp) || current.birthDate,
            gender: gender || current.gender,
        }));

        this.formErrors.update((current) => {
            const next = { ...current };

            ['curp', 'rfc', 'firstName', 'lastName', 'birthDate', 'gender'].forEach((key) => {
                delete next[key];
            });

            return next;
        });

        // Si RENAPO devuelve a una persona menor de edad (o una fecha que no se
        // pudo interpretar) se marca de inmediato en vez de dejar avanzar el
        // wizard y fallar hasta el guardado.
        this.applyLiveFieldValidation('birthDate', this.form().birthDate);
    }

    private clearRenapoPersonalData(): void {
        this.form.update((current) => ({
            ...current,
            firstName: '',
            lastName: '',
            secondLastName: '',
            birthDate: '',
            gender: '',
        }));

        this.formErrors.update((current) => {
            const next = { ...current };

            ['firstName', 'lastName', 'birthDate', 'gender'].forEach((key) => {
                delete next[key];
            });

            return next;
        });
    }

    /**
     * Una CURP diferente invalida por completo la respuesta anterior: se oculta
     * el mensaje, se cancela su secuencia y se limpian los datos autollenados
     * antes de mostrar el resultado de la nueva consulta.
     */
    private clearCurpLookupResultsForEdit(): void {
        const hadRenapoResult =
            this.lastRenapoCurp !== '' ||
            this.renapoLookupStatus() !== 'idle';

        if (hadRenapoResult) {
            this.clearRenapoPersonalData();
        }

        this.resetRenapoLookupState();
    }

    private resolveRenapoGender(value: string): string {
        const gender = this.normalizeText(value);

        if (!gender) {
            return '';
        }

        const aliases = gender === 'h'
            ? ['h', 'hombre', 'masculino']
            : gender === 'm'
                ? ['m', 'mujer', 'femenino']
                : [gender];

        const option = this.genderOptions().find((item) => {
            const metadata = this.optionMetadata(item);
            const candidates = [
                item.value,
                item.label,
                metadata['sexo'],
                metadata['clave'],
                metadata['codigo'],
                metadata['descripcion'],
            ].map((candidate) => this.normalizeText(this.toText(candidate)));

            return candidates.some((candidate) => aliases.includes(candidate));
        });

        return option?.value ?? '';
    }

    private consultEcccAndPersonal(): void {
        const request = this.buildEcccPersonalLookupRequest(this.form());

        if (!request) {
            this.clearCurpValidationSummary();
            return;
        }

        const lookupKey = JSON.stringify(request);

        // Cada vez que Datos Personales pasa sus validaciones y "Siguiente"
        // permite avanzar, se realiza una nueva consulta integral. No se
        // reutilizan resultados anteriores, incluso si el body es idéntico.
        const requestSequence = ++this.ecccPersonalLookupSequence;
        this.curpValidationSummary.set({
            personal: 'Consultando...',
            sau: 'Consultando...',
            eccc: 'Consultando...',
            expirationDate: 'Consultando...',
            message: 'Consultando información de Personal, SAU y ECCC...',
            messageTone: 'loading',
        });

        this.ecccPersonalApi
            .consultarIntegral(request)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    const currentRequest = this.buildEcccPersonalLookupRequest(this.form());
                    const currentLookupKey = currentRequest ? JSON.stringify(currentRequest) : '';

                    if (
                        requestSequence !== this.ecccPersonalLookupSequence ||
                        lookupKey !== currentLookupKey
                    ) {
                        return;
                    }

                    const personal = response.personal?.[0] ?? null;
                    const personalStatus = response.personalConsultado
                        ? response.personalEncontrado
                            ? this.toText(personal?.estatusPersonal) || 'Encontrado'
                            : 'No encontrado'
                        : 'No consultado';

                    const sauUsername = this.toText(response.sau?.usuario?.usuario);
                    const sauStatus = response.sauConsultado
                        ? sauUsername || 'No encontrado'
                        : 'No consultado';

                    const ecccResultado = this.toText(response.eccc?.resultadoIntegral);
                    const ecccVigencia = this.toText(response.eccc?.estatusVigencia);
                    const ecccStatus = response.ecccConsultado
                        ? [ecccResultado, ecccVigencia]
                            .filter((value, index, values) => value && values.indexOf(value) === index)
                            .join(' · ') || 'Sin información'
                        : 'No consultado';

                    const expirationDate = response.ecccConsultado
                        ? this.toDateInputValue(response.eccc?.fechaVencimiento ?? '') ||
                        this.toText(response.eccc?.fechaVencimiento) ||
                        'Sin información'
                        : 'No consultado';

                    const hasAnyResult =
                        response.personalEncontrado ||
                        Boolean(response.sau?.usuario) ||
                        Boolean(response.eccc);

                    const summary: CurpValidationSummary = {
                        personal: personalStatus,
                        sau: sauStatus,
                        eccc: ecccStatus,
                        expirationDate,
                        message:
                            this.toText(response.mensaje) ||
                            (hasAnyResult
                                ? 'La consulta integral se realizó correctamente.'
                                : 'La consulta se realizó correctamente, pero no se encontró información.'),
                        messageTone: hasAnyResult ? 'success' : 'warning',
                    };

                    this.curpValidationSummary.set(summary);
                },
                error: (error: unknown) => {
                    const currentRequest = this.buildEcccPersonalLookupRequest(this.form());
                    const currentLookupKey = currentRequest ? JSON.stringify(currentRequest) : '';

                    if (
                        requestSequence !== this.ecccPersonalLookupSequence ||
                        lookupKey !== currentLookupKey
                    ) {
                        return;
                    }

                    const errorMessage =
                        error instanceof Error && this.toText(error.message)
                            ? this.toText(error.message)
                            : 'No fue posible consultar la información de Personal, SAU y ECCC.';

                    console.error('Error consultando Personal, SAU y ECCC.', error);

                    const summary: CurpValidationSummary = {
                        personal: 'No disponible',
                        sau: 'No disponible',
                        eccc: 'No disponible',
                        expirationDate: 'No disponible',
                        message: errorMessage,
                        messageTone: 'error',
                    };

                    this.curpValidationSummary.set(summary);
                },
            });
    }

    private buildEcccPersonalLookupRequest(
        form: UserRegistrationForm,
    ): EcccPersonalLookupRequest | null {
        const curp = this.toText(form.curp).toUpperCase();
        const rfc = this.toText(form.rfc).toUpperCase();
        const cuipValue = this.toText(form.cuip).trim();
        const cuip = cuipValue ? cuipValue.toUpperCase() : null;
        const nombre = this.toText(form.firstName).toUpperCase();
        const primerApellido = this.toText(form.lastName).toUpperCase();
        const segundoApellido = this.toText(form.secondLastName).toUpperCase();
        const fechaNacimiento = this.toDateInputValue(form.birthDate);

        if (
            !nombre ||
            !primerApellido ||
            !this.isValidCurp(curp) ||
            !rfc ||
            !fechaNacimiento
        ) {
            return null;
        }

        return {
            curp,
            rfc,
            cuip,
            nombre,
            primerApellido,
            segundoApellido,
            fechaNacimiento,
        };
    }

    private resetRenapoLookupState(): void {
        this.curpLookupSequence += 1;
        this.lastRenapoCurp = '';
        this.renapoLookupStatus.set('idle');
        this.renapoMessage.set('');
        this.renapoMessageVisible.set(false);
        this.curpLocked.set(false);
        this.curpUnlockChecked.set(false);
        this.clearCurpValidationSummary();
    }

    /**
     * Oculta un resultado que ya no corresponde a los valores que se están
     * editando y cancela lógicamente cualquier respuesta anterior en vuelo.
     */
    private clearCurpValidationSummary(): void {
        this.ecccPersonalLookupSequence += 1;
        this.curpValidationSummary.set(null);
    }

    /** Limpieza total al iniciar otro registro/usuario. */
    private resetEcccPersonalLookupState(): void {
        this.ecccPersonalLookupSequence += 1;
        this.curpValidationSummary.set(null);
    }

    private buildUpdateSuccessModalState(
        response: ActualizarAdminResponse,
    ): SaveSuccessModalState {
        const current = this.form();
        const fullName = [
            current.firstName,
            current.lastName,
            current.secondLastName,
        ]
            .map((value) => this.toText(value))
            .filter(Boolean)
            .join(' ');

        return {
            message:
                this.toText(response.mensaje)
                || 'El usuario se actualizó correctamente.',
            userNumber: this.toText(
                response.datos?.usuarioId
                ?? this.user()?.userId
                ?? this.userDetail()?.userId,
            ),
            account: this.toText(this.user()?.username),
            fullName,
            system: '',
            hasAccessEmail: false,
            accessEmail: this.normalizeEmail(current.email),
            accessPhone: this.formatPhoneForDisplay(current.phone),
            emailAccepted: false,
            emailStatus: '',
            emailMessage: '',
            emailReference: '',
        };
    }

    private buildSaveSuccessModalState(
        response: RegistroAdminResponse,
        emailDelivery: CorreoDeliveryResult | null = null,
    ): SaveSuccessModalState {
        const data = response.datos;
        const current = this.form();

        return {
            message: this.toText(response.mensaje) || 'El usuario se guardó correctamente.',
            userNumber: this.toText(data?.usuarioId),
            account: this.toText(data?.cuentaGenerada) || this.toText(data?.cuenta),
            fullName: this.toText(data?.nombreCompleto),
            system: this.toText(data?.sistema),
            hasAccessEmail: emailDelivery !== null,
            accessEmail: this.normalizeEmail(current.email),
            accessPhone: this.formatPhoneForDisplay(current.phone),
            emailAccepted: emailDelivery?.accepted ?? false,
            emailStatus: this.toText(emailDelivery?.status),
            emailMessage: this.toText(emailDelivery?.message),
            emailReference: this.toText(emailDelivery?.correoId),
        };
    }

    private sendAccessCredentialsEmail(
        response: RegistroAdminResponse,
        temporaryPassword: string,
    ): Observable<CorreoDeliveryResult> {
        const current = this.form();
        const data = response.datos;
        const account = this.toText(data?.cuentaGenerada) || this.toText(data?.cuenta);
        const recipient = this.normalizeEmail(current.email);

        if (!account) {
            return of({
                accepted: false,
                message: 'El usuario fue creado, pero la respuesta no incluyó la cuenta para enviar el correo de acceso.',
                status: null,
                correoId: null,
                recipientCount: 0,
                acceptedAtUtc: null,
                traceId: null,
            });
        }

        if (!this.isValidEmail(recipient)) {
            return of({
                accepted: false,
                message: 'El usuario fue creado, pero no se encontró un correo electrónico válido para enviar sus datos de acceso.',
                status: null,
                correoId: null,
                recipientCount: 0,
                acceptedAtUtc: null,
                traceId: null,
            });
        }

        const fullName = this.toText(data?.nombreCompleto) || [
            current.firstName,
            current.lastName,
            current.secondLastName,
        ]
            .map((value) => this.toText(value))
            .filter(Boolean)
            .join(' ');

        return this.correoFacade.send(
            buildUserCredentialsEmailRequest({
                recipient,
                fullName,
                account,
                email: recipient,
                phone: current.phone,
                system: this.toText(data?.sistema) || 'SIAU',
                temporaryPassword,
            }),
        );
    }

    private requestTemporaryPassword(
        response: RegistroAdminResponse,
    ): Observable<string> {
        const account = this.toText(response.datos?.cuentaGenerada)
            || this.toText(response.datos?.cuenta);

        if (!account) {
            return of('').pipe(
                map(() => {
                    throw new Error(
                        'El usuario fue creado, pero la respuesta no incluyó la cuenta necesaria para obtener la contraseña temporal.',
                    );
                }),
            );
        }

        return this.usersFacade.getTemporaryPassword(account).pipe(
            map((passwordResponse) => {
                const temporaryPassword = this.toText(passwordResponse.datos?.passwordTemporal);

                if (!temporaryPassword) {
                    throw new Error(
                        passwordResponse.mensaje?.trim()
                        || 'El usuario fue creado, pero el servicio no devolvió la contraseña temporal.',
                    );
                }

                return temporaryPassword;
            }),
        );
    }

    private deleteRegistrationDraftAfterSuccess(): Observable<void> {
        const borradorId = this.draftId();

        if (!borradorId) {
            return of(void 0);
        }

        return this.usersFacade
            .deleteRegistrationDraft(borradorId, this.resolveCurrentUserId())
            .pipe(
                map(() => {
                    this.draftId.set(null);
                    this.draftMessage.set('');
                    this.draftError.set('');
                }),
                catchError((error: unknown) => {
                    console.warn(
                        'El usuario fue registrado, pero no fue posible limpiar el borrador.',
                        error,
                    );
                    return of(void 0);
                }),
            );
    }

    private toFailedEmailDelivery(error: unknown): CorreoDeliveryResult {
        return {
            accepted: false,
            message:
                error instanceof Error
                    ? error.message
                    : 'El usuario fue creado, pero no fue posible solicitar el envío del correo de acceso.',
            status: null,
            correoId: null,
            recipientCount: 0,
            acceptedAtUtc: null,
            traceId: null,
        };
    }

    private buildCreateUserRequest(): RegistroAdminRequest {
        const current = this.form();
        const assignedProfiles = this.assignedSystemProfiles();
        const assignedProfile = assignedProfiles[0] ?? null;

        return {
            datosPersonales: {
                cuip: this.toNullableText(current.cuip),
                curp: this.requireText(current.curp, 'Captura la CURP.').toUpperCase(),
                rfc: this.requireText(current.rfc, 'Captura el RFC.').toUpperCase(),
                nombres: this.requireText(current.firstName, 'Captura el nombre.').toUpperCase(),
                primerApellido: this.requireText(current.lastName, 'Captura el primer apellido.').toUpperCase(),
                segundoApellido: this.toNullableText(current.secondLastName)?.toUpperCase() ?? null,
                sexoId: this.requireCatalogId(current.gender, 'Selecciona el sexo.'),
                fechaNacimiento: this.requireText(
                    current.birthDate,
                    'Captura la fecha de nacimiento.',
                ),
                estadoCivilId: this.toCatalogId(current.civilStatus) ?? null,
            },
            adscripcion: {
                estructuraId: this.resolveAssignmentStructureId(),
                cargo: this.toNullableText(current.position)?.toUpperCase() ?? null,
                funciones: this.toNullableText(current.functions),
                numeroEmpleado: this.toNullableText(current.employeeNumber),
                fechaInicio: this.toNullableText(current.admissionDate),
            },
            comision: this.buildCommissionRequest(),
            medioContacto: this.buildContactRequest(),
            // `cuenta` mantiene el primer perfil para compatibilidad con el
            // contrato previo; `perfiles` contiene la asignación completa.
            cuenta: this.buildAdminAccountRequest(assignedProfile),
            perfiles: assignedProfiles.length > 0
                ? assignedProfiles.map((profile) => ({
                    idSistema: this.resolveAssignedSystemId(profile),
                    idPerfil: this.requireCatalogId(
                        profile.role,
                        'Selecciona un perfil válido.',
                    ),
                }))
                : null,
            comentario: this.toNullableText(current.comment),
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-admin-${Date.now()}`,
            },
        };
    }

    private buildUpdateUserRequest(): ActualizarAdminRequest {
        const userId =
            this.user()?.userId ??
            this.userDetail()?.userId;

        const current = this.form();
        const assignedProfiles = this.assignedSystemProfiles();

        if (!userId || userId <= 0) {
            throw new Error(
                'No fue posible identificar al usuario que se desea actualizar.',
            );
        }

        if (assignedProfiles.length === 0) {
            throw new Error(
                'Selecciona al menos un sistema y perfil.',
            );
        }

        return {
            usuarioId: userId,

            curp: this.requireText(
                current.curp,
                'Captura la CURP.',
            ).toUpperCase(),

            rfc: this.toNullableText(current.rfc)?.toUpperCase() ?? null,

            nombres: this.requireText(
                current.firstName,
                'Captura el nombre.',
            ).toUpperCase(),

            primerApellido: this.requireText(
                current.lastName,
                'Captura el primer apellido.',
            ).toUpperCase(),

            segundoApellido:
                this.toNullableText(current.secondLastName)
                    ?.toUpperCase() ?? null,

            sexoId: this.requireCatalogId(
                current.gender,
                'Selecciona el sexo.',
            ),

            fechaNacimiento: this.requireText(
                current.birthDate,
                'Captura la fecha de nacimiento.',
            ),

            estadoCivilId: this.toCatalogId(current.civilStatus) ?? null,

            cuip: this.toNullableText(current.cuip),

            adscripcion: {
                estructuraId: this.resolveAssignmentStructureId(),

                cargo:
                    this.toNullableText(current.position)
                        ?.toUpperCase() ?? null,

                funciones: this.toNullableText(
                    current.functions,
                ),

                numeroEmpleado: this.toNullableText(
                    current.employeeNumber,
                ),

                fechaInicio: this.toNullableText(
                    current.admissionDate,
                ),
            },

            comision: this.buildCommissionRequest(),

            contacto: this.buildContactRequest(),

            perfiles: assignedProfiles.map((profile) => ({
                idSistema: this.resolveAssignedSystemId(profile),

                idPerfil: this.requireCatalogId(
                    profile.role,
                    'Selecciona un perfil válido.',
                ),
            })),

            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: 'SIAU-FRONT',
            },
        };
    }

    private resolveAccountStatusId(status: AccountStatus): number {
        switch (status) {
            case 'baja':
                return 2;
            case 'suspended':
                return 3;
            case 'blocked':
                return 4;
            default:
                return 1;
        }
    }

    private buildCommissionRequest(): RegistroAsignacion | null {
        const current = this.form();

        if (!current.commissionEnabled) {
            return null;
        }

        return {
            estructuraId: this.resolveCommissionStructureId(),
            cargo: null,
            funciones: null,
            numeroEmpleado: null,
            fechaInicio: this.isEditMode()
                ? this.toNullableText(current.commissionAdmissionDate)
                : this.requireText(
                    current.commissionAdmissionDate,
                    'Captura la fecha de inicio de la comisión.',
                ),
        };
    }

    private buildAdminAccountRequest(assignedProfile: AssignedSystemProfile | null): RegistroAdminCuenta {
        return {
            tipoUsuarioId: this.resolveDefaultCatalogId(this.userTypeOptions(), 1),
            sistemaId: assignedProfile
                ? this.resolveAssignedSystemId(assignedProfile)
                : DEFAULT_NORMAL_SYSTEM_ID,
            perfilId: assignedProfile
                ? this.requireCatalogId(
                    assignedProfile.role,
                    'Selecciona un perfil válido.',
                )
                : DEFAULT_NORMAL_PROFILE_ID,
            estadoCuentaId: 1,
        };
    }

    private buildContactRequest(): RegistroMedioContacto {
        const current = this.form();
        const correo = this.normalizeEmail(current.email);
        const celular = this.toText(current.phone);

        if (!correo || !celular) {
            throw new Error('Captura el correo electrónico y el teléfono celular.');
        }

        return {
            correo,
            celular,
        };
    }

    private resolveAssignmentStructureId(): number {
        const current = this.form();

        return this.resolveStructureId(
            [
                current.administrativeUnit,
                current.decentralizedBody,
                current.institution,
            ],
            'Selecciona la institución, órgano o unidad de adscripción.',
        );
    }

    private resolveCommissionStructureId(): number {
        const current = this.form();

        return this.resolveStructureId(
            [
                current.commissionAdministrativeUnit,
                current.commissionDecentralizedBody,
                current.commissionInstitution,
            ],
            'Selecciona la institución, órgano o unidad de comisión.',
        );
    }

    private resolveStructureId(values: readonly string[], errorMessage: string): number {
        const value = values.map((item) => this.toCatalogId(item)).find((item) => item !== undefined);

        if (!value) {
            throw new Error(errorMessage);
        }

        return value;
    }

    private resolveAssignedSystemId(profile: AssignedSystemProfile): number {
        const option = this.findKnownSystemOption(profile.system, profile.systemLabel);

        const metadata = this.optionMetadata(option);
        const idFromMetadata = this.firstNumberValue(metadata, ['id', 'idSistema', 'sistemaId']);

        if (idFromMetadata) {
            return idFromMetadata;
        }

        return this.requireCatalogId(profile.system, 'Selecciona un sistema válido.');
    }

    private resolveDefaultCatalogId(options: readonly SiauSelectOption[], fallback: number): number {
        const firstOption = options[0];

        if (!firstOption) {
            return fallback;
        }

        const id = this.toCatalogId(firstOption.value);

        return id ?? fallback;
    }

    private requireCatalogId(value: string, errorMessage: string): number {
        const id = this.toCatalogId(value);

        if (!id) {
            throw new Error(errorMessage);
        }

        return id;
    }

    private requireText(value: string, errorMessage: string): string {
        const text = this.toText(value);

        if (!text) {
            throw new Error(errorMessage);
        }

        return text;
    }

    private toNullableText(value: string | null | undefined): string | null {
        const text = this.toText(value);

        return text || null;
    }

    private hasText(value: unknown): boolean {
        return this.toText(value).length > 0;
    }

    private resolveCurrentUserId(): number | null {
        const rawUserId = this.authStorage.session()?.user.id;
        const userId = Number(rawUserId);

        return Number.isFinite(userId) && userId > 0 ? userId : null;
    }

    private optionMetadata(option: SiauSelectOption | undefined): Record<string, unknown> {
        const metadata = (option as { metadata?: Record<string, unknown> } | undefined)?.metadata;

        return this.toRecord(metadata);
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

    private hydrateEditForm(datos: Record<string, unknown>, user: UserRecord | null): void {
        this.resetRenapoLookupState();
        this.resetEcccPersonalLookupState();

        const personalData = this.toSectionRecord(datos, ['s1DatosPersonales', 'datosPersonales']);
        const assignment = this.toSectionRecord(datos, ['s2Adscripcion', 'adscripcion']);
        const s3Commission = this.toSectionRecord(datos, ['s3Comision']);
        const commission = Object.keys(s3Commission).length > 0
            ? s3Commission
            : this.toSectionRecord(datos, ['comision']);
        const contact = this.toSectionRecord(datos, ['s5Contacto', 'medioContacto', 'contacto']);

        const institutionType = this.resolveRecordSelectValue(
            assignment,
            ['tipoInstitucionId', 'idTipoInstitucion'],
            ['tipoInstitucion', 'tipoInstitucionNombre', 'tipoInstitucionClave'],
            this.institutionTypeOptions,
        );
        const assignmentRequiresEntity = this.requiresEntityForInstitution(institutionType);
        const assignmentEntity = !assignmentRequiresEntity
            ? ''
            : this.resolveRecordSelectValue(
                assignment,
                ['estadoId', 'entidadId', 'idEstado'],
                ['estado', 'entidad', 'estadoNombre'],
                this.stateOptions,
            );

        const commissionInstitutionTypeId = this.toText(commission['tipoInstitucionId']);
        const commissionInstitutionTypeLabel = this.toText(commission['tipoInstitucion']);
        const commissionInstitutionType =
            commissionInstitutionTypeId || commissionInstitutionTypeLabel;

        if (commissionInstitutionType) {
            this.institutionTypeOptions.set(this.mergeSelectOptions(
                [{
                    value: commissionInstitutionType,
                    label: commissionInstitutionTypeLabel || commissionInstitutionType,
                }],
                this.institutionTypeOptions(),
            ));
        }

        const commissionRequiresEntity = this.requiresEntityForInstitution(commissionInstitutionType);
        const commissionEntityId = this.toText(commission['estadoId']);
        const commissionEntityLabel = this.toText(commission['estado']);
        const commissionEntity = !commissionRequiresEntity
            ? ''
            : commissionEntityId || commissionEntityLabel;

        if (commissionEntity) {
            this.stateOptions.set(this.mergeSelectOptions(
                [{
                    value: commissionEntity,
                    label: commissionEntityLabel || commissionEntity,
                }],
                this.stateOptions(),
            ));
        }

        const hasCommissionData =
            this.hasText(this.firstValue(commission, ['tipoInstitucion', 'tipoInstitucionId'])) ||
            this.hasText(this.firstValue(commission, ['estado', 'entidad', 'estadoId'])) ||
            this.hasText(this.firstValue(commission, ['municipio', 'municipioAlcaldia', 'municipioId'])) ||
            this.hasText(this.firstValue(commission, ['institucion', 'institucionId'])) ||
            this.hasText(this.firstValue(commission, ['dependencia', 'dependenciaId'])) ||
            this.hasText(this.firstValue(commission, ['organo', 'organoId', 'organoDesconcentrado', 'desconcentrado', 'decentralizedBody'])) ||
            this.hasText(this.firstValue(commission, ['unidad', 'unidadId', 'unidadAdministrativa', 'administrativeUnit'])) ||
            this.hasText(this.firstValue(commission, ['fechaInicio', 'fechaIngreso'])) ||
            this.hasText(this.firstValue(commission, ['estructuraId', 'estructuraOrgId']));

        const nextForm: UserRegistrationForm = {
            ...INITIAL_FORM,
            cuip: this.toText(this.firstValue(personalData, ['cuip'])),
            policeIdentificationKey: this.toText(
                this.firstValue(personalData, ['claveUnicaIdentificacionPolicial', 'claveIdentificacionPolicial']),
            ),
            curp: this.toText(this.firstValue(personalData, ['curp'])),
            rfc: this.toText(this.firstValue(personalData, ['rfc'])),
            firstName: this.toText(this.firstValue(personalData, ['nombres', 'nombre', 'nombreS'])),
            lastName: this.toText(this.firstValue(personalData, ['primerApellido', 'apellidoPaterno'])),
            secondLastName: this.toText(this.firstValue(personalData, ['segundoApellido', 'apellidoMaterno'])),
            birthDate: this.toDateInputValue(this.firstValue(personalData, ['fechaNacimiento'])),
            gender: this.resolveSelectValue(this.firstValue(personalData, ['sexo', 'sexoId']), this.genderOptions),
            civilStatus: this.resolveSelectValue(
                this.firstValue(personalData, ['estadoCivil', 'estadoCivilId']),
                this.civilStatusOptions,
            ),

            institutionType,
            entity: assignmentEntity,
            municipality: !this.requiresMunicipalityForInstitution(institutionType)
                ? ''
                : this.resolveRecordSelectValue(
                    assignment,
                    ['municipioId', 'municipioAlcaldiaId', 'idMunicipio'],
                    ['municipio', 'municipioAlcaldia', 'municipioNombre'],
                    this.municipalityOptions,
                ),
            institution: this.resolveRecordSelectValue(
                assignment,
                ['institucionId', 'idInstitucion', 'estructuraId'],
                ['institucion', 'institucionNombre', 'estructura'],
                this.institutionOptions,
            ),
            // El detalle (`s2Adscripcion`) usa `organoId`/`organo` y
            // `unidadId`/`unidad`; los alias largos vienen de otros contratos.
            decentralizedBody: this.resolveRecordSelectValue(
                assignment,
                ['organoId', 'organoDesconcentradoId', 'organoAdministrativoDesconcentradoId', 'desconcentradoId', 'idOrganoDesconcentrado', 'idOrgano'],
                ['organo', 'organoDesconcentrado', 'organoAdministrativoDesconcentrado', 'desconcentrado', 'decentralizedBody'],
                this.decentralizedBodyOptions,
            ),
            administrativeUnit: this.resolveRecordSelectValue(
                assignment,
                ['unidadId', 'unidadAdministrativaId', 'administrativeUnitId', 'idUnidadAdministrativa', 'idUnidad'],
                ['unidad', 'unidadAdministrativa', 'administrativeUnit'],
                this.administrativeUnitOptions,
            ),
            position: this.toText(this.firstValue(assignment, ['cargo', 'puesto'])),
            functions: this.toText(this.firstValue(assignment, ['funciones'])),
            admissionDate: this.toDateInputValue(this.firstValue(assignment, ['fechaInicio', 'fechaIngreso'])),
            employeeNumber: this.toText(this.firstValue(assignment, ['numeroEmpleado', 'numEmpleado'])),

            commissionEnabled: hasCommissionData,
            commissionInstitutionType,
            commissionEntity,
            commissionMunicipality: !this.requiresMunicipalityForInstitution(commissionInstitutionType)
                ? ''
                : this.resolveRecordSelectValue(
                    commission,
                    ['municipioId', 'municipioAlcaldiaId', 'idMunicipio'],
                    ['municipio', 'municipioAlcaldia', 'municipioNombre'],
                    this.commissionMunicipalityOptions,
                ),
            commissionInstitution: this.resolveRecordSelectValue(
                commission,
                ['institucionId', 'idInstitucion', 'estructuraId'],
                ['institucion', 'institucionNombre', 'estructura'],
                this.commissionInstitutionOptions,
            ),
            commissionDecentralizedBody: this.resolveRecordSelectValue(
                commission,
                ['organoId', 'organoDesconcentradoId', 'organoAdministrativoDesconcentradoId', 'desconcentradoId', 'idOrganoDesconcentrado', 'idOrgano'],
                ['organo', 'organoDesconcentrado', 'organoAdministrativoDesconcentrado', 'desconcentrado', 'decentralizedBody'],
                this.commissionDecentralizedBodyOptions,
            ),
            commissionAdministrativeUnit: this.resolveRecordSelectValue(
                commission,
                ['unidadId', 'unidadAdministrativaId', 'administrativeUnitId', 'idUnidadAdministrativa', 'idUnidad'],
                ['unidad', 'unidadAdministrativa', 'administrativeUnit'],
                this.commissionAdministrativeUnitOptions,
            ),
            commissionAdmissionDate: this.toDateInputValue(this.firstValue(commission, ['fechaInicio', 'fechaIngreso'])),

            email: this.resolveHydratedEmail(contact, datos, user),
            phone: this.toText(this.firstValue(contact, ['celular', 'telefono', 'phone']))
                .replace(/\D/g, '')
                .slice(0, 10),

            profiles: [],

            username: this.toText(datos['cuenta']) || user?.username || '',
            password: '',
            confirmPassword: '',
            accountStatus: this.toAccountStatus(this.firstText([datos['estatus'], datos['estatusClave'], user?.status])),
            comment: this.toText(datos['comentario']),
        };

        const assignedProfiles = this.toAssignedSystemProfiles(datos['s6Perfiles']);

        this.activeStepId.set('personal-data');
        this.completedSteps.set([...this.stepOrder()]);
        this.editEnabled.set(false);
        this.form.set(nextForm);
        this.initialIdentitySnapshot = this.toIdentitySnapshot(nextForm);
        this.initialEditFormSnapshot = this.toEditFormSnapshot(nextForm);
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);
        this.assignedSystemProfiles.set(assignedProfiles);
        this.initialAssignedProfiles = [...assignedProfiles];
        this.detailRoleOptionsBySystem.set(this.buildDetailRoleOptionsBySystem(assignedProfiles));
        this.loadHydratedAssignmentCatalogs(nextForm);
    }

    private toAssignedSystemProfiles(value: unknown): AssignedSystemProfile[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((item, index) => {
                const record = this.toRecord(item);

                const rawSystemLabel = this.toText(
                    this.firstValue(record, ['sistema', 'sistemaClave', 'nombreSistema', 'sistemaNombre', 'systemLabel']),
                );

                const rawSystemId = this.toText(
                    this.firstValue(record, ['sistemaId', 'idSistema', 'system']),
                );

                const rawRoleLabel = this.toText(
                    this.firstValue(record, [
                        'descripcionPerfil',
                        'perfil',
                        'rol',
                        'perfilClave',
                        'rolClave',
                        'nombrePerfil',
                        'perfilNombre',
                        'roleLabel',
                    ]),
                );

                const rawRoleId = this.toText(
                    this.firstValue(record, ['perfilId', 'rolId', 'idPerfil', 'role']),
                );
                const systemOption = this.findKnownSystemOption(rawSystemId, rawSystemLabel) ?? null;

                const systemValue = systemOption?.value || rawSystemId || rawSystemLabel;
                const systemLabel = rawSystemLabel || systemOption?.label || systemValue;

                const roleValue = rawRoleId || rawRoleLabel;
                const roleLabel = rawRoleLabel;

                if (!systemValue || !systemLabel || !roleValue || !roleLabel) {
                    return null;
                }

                return {
                    id: `${systemValue}-${roleValue}-${index}`,
                    system: systemValue,
                    role: roleValue,
                    systemLabel,
                    roleLabel,
                } satisfies AssignedSystemProfile;
            })
            .filter((item): item is AssignedSystemProfile => item !== null);
    }

    private buildDetailRoleOptionsBySystem(
        profiles: readonly AssignedSystemProfile[],
    ): Record<string, readonly SiauSelectOption[]> {
        const result: Record<string, SiauSelectOption[]> = {};

        profiles.forEach((profile) => {
            if (!profile.system || !profile.systemLabel || !profile.role || !profile.roleLabel) {
                return;
            }

            this.addRoleOptionForSystemKey(result, profile.system, profile);
            this.addRoleOptionForSystemKey(result, profile.systemLabel, profile);

            const systemOption = this.findKnownSystemOption(
                profile.system,
                profile.systemLabel,
            );

            if (systemOption) {
                this.addRoleOptionForSystemKey(result, systemOption.value, profile);
                this.addRoleOptionForSystemKey(result, systemOption.label, profile);
            }
        });

        return result;
    }

    private addRoleOptionForSystemKey(
        accumulator: Record<string, SiauSelectOption[]>,
        systemKey: string,
        profile: AssignedSystemProfile,
    ): void {
        const cleanSystemKey = this.toText(systemKey);

        if (!cleanSystemKey) {
            return;
        }

        const currentOptions = accumulator[cleanSystemKey] ?? [];
        const alreadyExists = currentOptions.some(
            (option) =>
                option.value === profile.role ||
                this.normalizeText(option.label) === this.normalizeText(profile.roleLabel),
        );

        if (alreadyExists) {
            return;
        }

        accumulator[cleanSystemKey] = [
            ...currentOptions,
            {
                value: profile.role,
                label: profile.roleLabel,
            },
        ];
    }

    private findDetailRoleOptionsForSystem(system: string): readonly SiauSelectOption[] {
        const cleanSystem = this.toText(system);

        if (!cleanSystem) {
            return [];
        }

        const roleOptionsBySystem = this.detailRoleOptionsBySystem();

        if (roleOptionsBySystem[cleanSystem]?.length) {
            return roleOptionsBySystem[cleanSystem];
        }

        const systemOption = this.findKnownSystemOption(cleanSystem);

        const candidateKeys = [
            cleanSystem,
            systemOption?.value ?? '',
            systemOption?.label ?? '',
        ].filter(Boolean);

        for (const candidateKey of candidateKeys) {
            const options = roleOptionsBySystem[candidateKey];

            if (options?.length) {
                return options;
            }
        }

        const normalizedSystem = this.normalizeText(cleanSystem);
        const matchedKey = Object.keys(roleOptionsBySystem).find(
            (key) => this.normalizeText(key) === normalizedSystem,
        );

        return matchedKey ? roleOptionsBySystem[matchedKey] ?? [] : [];
    }

    private findKnownSystemOption(
        systemValue: string,
        systemLabel = '',
    ): SiauSelectOption | undefined {
        const cleanValue = this.toText(systemValue);
        const cleanLabel = this.toText(systemLabel);

        return [...this.systemOptions(), ...this.allSystemOptions()].find((option) => {
            const metadataSystemId = this.firstNumberValue(
                this.optionMetadata(option),
                ['idSistema', 'sistemaId', 'IdSistema', 'SistemaId', 'id'],
            );

            return (
                option.value === cleanValue ||
                this.normalizeText(option.value) === this.normalizeText(cleanValue) ||
                this.normalizeText(option.label) === this.normalizeText(cleanValue) ||
                (metadataSystemId !== null && String(metadataSystemId) === cleanValue) ||
                (cleanLabel.length > 0 &&
                    this.normalizeText(option.label) === this.normalizeText(cleanLabel))
            );
        });
    }

    private isSiauSystem(systemValue: string, systemLabel = ''): boolean {
        const cleanValue = this.toText(systemValue);
        const option = this.findKnownSystemOption(cleanValue, systemLabel);
        const candidates = [cleanValue, systemLabel, option?.label ?? '', option?.value ?? ''];

        return candidates.some((candidate) => {
            const normalized = this.normalizeText(candidate);

            return normalized === 'siau' ||
                normalized.includes('siau') ||
                normalized.includes('sistema integral de administracion de usuarios');
        });
    }

    private isDefaultSiauRole(roleValue: string, roleLabel = ''): boolean {
        return [roleValue, roleLabel].some(
            (value) => this.normalizeText(this.toText(value)) === 'usuario',
        );
    }

    private isRoleAlreadyAssigned(system: string, roleOption: SiauSelectOption): boolean {
        const systemOption = this.findKnownSystemOption(system);

        return this.assignedSystemProfiles().some((profile) => {
            const sameSystem =
                profile.system === system ||
                this.normalizeText(profile.system) === this.normalizeText(system) ||
                this.normalizeText(profile.systemLabel) === this.normalizeText(system) ||
                this.normalizeText(profile.system) === this.normalizeText(systemOption?.value ?? '') ||
                this.normalizeText(profile.systemLabel) === this.normalizeText(systemOption?.label ?? '');

            if (!sameSystem) {
                return false;
            }

            return (
                profile.role === roleOption.value ||
                this.normalizeText(profile.role) === this.normalizeText(roleOption.value) ||
                this.normalizeText(profile.roleLabel) === this.normalizeText(roleOption.label)
            );
        });
    }

    private resolveSelectValue(
        rawValue: unknown,
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): string {
        const textValue = this.toText(rawValue);

        if (!textValue) {
            return '';
        }

        const options = target();
        const normalizedValue = this.normalizeText(textValue);
        const matchedOption = options.find(
            (option) =>
                this.normalizeText(option.value) === normalizedValue ||
                this.normalizeText(option.label) === normalizedValue,
        );

        if (matchedOption) {
            return matchedOption.value;
        }

        target.set([
            ...options,
            {
                value: textValue,
                label: textValue,
            },
        ]);

        return textValue;
    }

    private resolveRecordSelectValue(
        record: Record<string, unknown>,
        idKeys: readonly string[],
        labelKeys: readonly string[],
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): string {
        const rawIdValue = this.firstValue(record, idKeys);
        const rawLabelValue = this.firstValue(record, labelKeys);
        const nestedValue = this.toRecord(rawLabelValue);
        const idValue = this.toText(rawIdValue) || this.toText(
            this.firstValue(nestedValue, ['id', 'value', ...idKeys]),
        );
        const labelValue = this.toText(
            this.firstValue(nestedValue, ['descripcion', 'nombre', 'label', ...labelKeys]),
        ) || this.toText(rawLabelValue);

        if (!idValue) {
            return this.resolveSelectValue(labelValue, target);
        }

        const options = target();
        const matchedOption = options.find(
            (option) =>
                option.value === idValue ||
                this.normalizeText(option.value) === this.normalizeText(idValue) ||
                (labelValue && this.normalizeText(option.label) === this.normalizeText(labelValue)),
        );

        if (matchedOption) {
            return matchedOption.value;
        }

        target.set(this.mergeSelectOptions(
            [{ value: idValue, label: labelValue || idValue }],
            options,
        ));

        return idValue;
    }

    private resolveHydratedEmail(
        contact: Record<string, unknown>,
        datos: Record<string, unknown>,
        user: UserRecord | null,
    ): string {
        const candidates = [
            this.firstValue(contact, ['correo', 'email']),
            datos['correo'],
            user?.email,
        ];

        for (const candidate of candidates) {
            const email = this.normalizeEmail(candidate);
            const normalized = this.normalizeText(email);

            if (!email || ['sin correo', 'no registrado', 'no capturado'].includes(normalized)) {
                continue;
            }

            return email;
        }

        return '';
    }

    private toSectionRecord(
        source: Record<string, unknown>,
        keys: readonly string[],
    ): Record<string, unknown> {
        for (const key of keys) {
            const value = source[key];

            if (Array.isArray(value)) {
                const firstRecord = value
                    .map((item) => this.toRecord(item))
                    .find((item) => Object.keys(item).length > 0);

                if (firstRecord) {
                    return firstRecord;
                }
            }

            const record = this.toRecord(value);

            if (Object.keys(record).length > 0) {
                return record;
            }
        }

        return {};
    }

    private firstValue(record: Record<string, unknown>, keys: readonly string[]): unknown {
        return keys.map((key) => record[key]).find((value) => this.toText(value).length > 0) ?? '';
    }

    private firstText(values: readonly unknown[]): string {
        return values.map((value) => this.toText(value)).find((value) => value.length > 0) ?? '';
    }

    private toRecord(value: unknown): Record<string, unknown> {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    }

    private toText(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value).trim();
    }

    private toDateInputValue(value: unknown): string {
        const textValue = this.toText(value);

        if (!textValue) {
            return '';
        }

        // Algunos orígenes legacy entregan fechas como serial de Excel/OLE
        // (por ejemplo, 45100 = 2023-06-23). Se convierte antes de intentar
        // interpretar formatos de texto para evitar mostrar el serial en el input.
        if (/^\d{4,6}(?:\.\d+)?$/.test(textValue)) {
            const serial = Number(textValue);

            if (Number.isFinite(serial) && serial >= 1 && serial <= 100000) {
                const excelEpochUtc = Date.UTC(1899, 11, 30);
                const date = new Date(excelEpochUtc + Math.floor(serial) * 86_400_000);

                if (!Number.isNaN(date.getTime())) {
                    const year = date.getUTCFullYear();
                    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(date.getUTCDate()).padStart(2, '0');

                    return `${year}-${month}-${day}`;
                }
            }
        }

        const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(textValue);

        if (isoMatch) {
            return isoMatch[1];
        }

        const slashDateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(textValue);

        if (slashDateMatch) {
            const [, day, month, year] = slashDateMatch;

            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        const spanishDateMatch = /^(\d{1,2})\s+([a-záéíóúñ.]+)\s+(\d{4})$/i.exec(textValue);

        if (spanishDateMatch) {
            const [, rawDay, rawMonth, rawYear] = spanishDateMatch;
            const monthMap: Record<string, string> = {
                ene: '01',
                enero: '01',
                feb: '02',
                febrero: '02',
                mar: '03',
                marzo: '03',
                abr: '04',
                abril: '04',
                may: '05',
                mayo: '05',
                jun: '06',
                junio: '06',
                jul: '07',
                julio: '07',
                ago: '08',
                agosto: '08',
                sep: '09',
                septiembre: '09',
                oct: '10',
                octubre: '10',
                nov: '11',
                noviembre: '11',
                dic: '12',
                diciembre: '12',
            };
            const month = monthMap[this.normalizeText(rawMonth.replace('.', ''))];

            if (month) {
                return `${rawYear}-${month}-${rawDay.padStart(2, '0')}`;
            }
        }

        return '';
    }

    private toAccountStatus(value: string): AccountStatus {
        const normalizedValue = this.normalizeText(value);

        if (normalizedValue.includes('bloque')) {
            return 'blocked';
        }

        if (normalizedValue.includes('suspend')) {
            return 'suspended';
        }

        if (
            normalizedValue.includes('baja') ||
            normalizedValue.includes('inhabil') ||
            normalizedValue.includes('inactivo') ||
            normalizedValue.includes('deshabil')
        ) {
            return 'baja';
        }

        return 'active';
    }

    private withCompletedStep(stepId: WizardStepId): readonly WizardStepId[] {
        const completed = this.completedSteps();
        return completed.includes(stepId) ? completed : [...completed, stepId];
    }

    private buildDraftSaveRequest(
        _nextStepId: WizardStepId,
        _completedSteps: readonly WizardStepId[],
    ): BorradorGuardarRequest {
        const current = this.form();
        const assignedProfiles = this.assignedSystemProfiles();
        const assignedProfile = assignedProfiles[0] ?? null;
        const draftProfiles = assignedProfiles.map((profile) => ({
            idSistema: this.resolveAssignedSystemId(profile),
            idPerfil: this.requireCatalogId(
                profile.role,
                'Selecciona un perfil válido.',
            ),
        }));

        const datos: BorradorDatos = {
            datosPersonales: {
                cuip: this.toNullableText(current.cuip),
                curp: this.toNullableText(current.curp)?.toUpperCase() ?? null,
                rfc: this.toNullableText(current.rfc)?.toUpperCase() ?? null,
                nombres: this.toNullableText(current.firstName)?.toUpperCase() ?? null,
                primerApellido: this.toNullableText(current.lastName)?.toUpperCase() ?? null,
                segundoApellido: this.toNullableText(current.secondLastName)?.toUpperCase() ?? null,
                sexoId: this.toCatalogId(current.gender) ?? null,
                fechaNacimiento: this.toNullableText(current.birthDate),
                estadoCivilId: this.toCatalogId(current.civilStatus) ?? null,
            },
            adscripcion: {
                estructuraId: this.resolveOptionalAssignmentStructureId(current),
                cargo: this.toNullableText(current.position)?.toUpperCase() ?? null,
                funciones: this.toNullableText(current.functions),
                numeroEmpleado: this.toNullableText(current.employeeNumber),
                fechaInicio: this.toNullableText(current.admissionDate),
            },
            comision: current.commissionEnabled
                ? {
                    estructuraId: this.resolveOptionalCommissionStructureId(current),
                    cargo: null,
                    funciones: null,
                    numeroEmpleado: null,
                    fechaInicio: this.toNullableText(current.commissionAdmissionDate),
                }
                : null,
            medioContacto: {
                correo: this.normalizeEmail(current.email) || null,
                celular: this.toNullableText(current.phone),
            },
            cuenta: {
                tipoUsuarioId: this.resolveDefaultCatalogId(this.userTypeOptions(), 1),
                // Se conserva el primer perfil para que el backend/GET legado
                // continúe resolviendo sus campos de catálogo como hasta ahora.
                sistemaId: assignedProfile
                    ? this.resolveAssignedSystemId(assignedProfile)
                    : null,
                perfilId: assignedProfile
                    ? (this.toCatalogId(assignedProfile.role) ?? null)
                    : null,
            },
            // Fuente completa para recuperar N sistemas/perfiles del borrador.
            perfiles: draftProfiles,
            comentario: this.toNullableText(current.comment),
        };

        return {
            /*
             * `borradorId: null` le dice al backend que es un borrador NUEVO y
             * que debe crearlo. En cuanto responde con el id asignado, ese id
             * queda en `draftId` y los siguientes "Siguiente" de esta misma
             * solicitud lo reenvían para ACTUALIZAR el mismo borrador, en vez
             * de sembrar uno por cada paso.
             *
             * Al abrir un borrador desde la lista, `draftId` ya viene con su id
             * desde el primer guardado, así que siempre actualiza.
             */
            borradorId: this.draftId(),
            datos,
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId() ?? 0,
                correlationId: this.createDraftCorrelationId(),
            },
        };
    }

    private resolveOptionalAssignmentStructureId(current: UserRegistrationForm): number | null {
        return this.toCatalogId(current.administrativeUnit)
            ?? this.toCatalogId(current.decentralizedBody)
            ?? this.toCatalogId(current.institution)
            ?? null;
    }

    private resolveOptionalCommissionStructureId(current: UserRegistrationForm): number | null {
        return this.toCatalogId(current.commissionAdministrativeUnit)
            ?? this.toCatalogId(current.commissionDecentralizedBody)
            ?? this.toCatalogId(current.commissionInstitution)
            ?? null;
    }

    private createDraftCorrelationId(): string {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        return `siau-borrador-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    private loadRegistrationDraft(): void {
        if (this.isEditMode() || this.isDraftLoading()) {
            return;
        }

        this.isDraftLoading.set(true);
        this.draftError.set('');
        this.draftMessage.set('Buscando un borrador pendiente...');

        this.usersFacade
            .getRegistrationDraft(this.resolveCurrentUserId())
            .pipe(
                switchMap((draft) => {
                    if (!draft?.datos) {
                        return of({
                            draft,
                            hierarchies: {
                                assignment: null,
                                commission: null,
                            } as DraftStructureHierarchies,
                        });
                    }

                    return this.resolveDraftStructureHierarchies(draft).pipe(
                        map((hierarchies) => ({ draft, hierarchies })),
                        catchError((error: unknown) => {
                            console.error(
                                'No fue posible reconstruir la jerarquía de la estructura del borrador.',
                                error,
                            );

                            return of({
                                draft,
                                hierarchies: {
                                    assignment: null,
                                    commission: null,
                                } as DraftStructureHierarchies,
                            });
                        }),
                    );
                }),
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isDraftLoading.set(false)),
            )
            .subscribe({
                next: ({ draft, hierarchies }) => {
                    this.applyRegistrationDraft(draft, hierarchies);
                },
                error: (error: unknown) => {
                    this.draftMessage.set('');
                    this.draftError.set(
                        error instanceof Error
                            ? error.message
                            : 'No fue posible recuperar el borrador del registro.',
                    );
                },
            });
    }

    private restoreProvidedRegistrationDraft(draft: BorradorItem): void {
        if (this.isEditMode() || this.isDraftLoading()) {
            return;
        }

        // El id se fija de entrada: aunque el contenido no se pueda restaurar,
        // lo que el usuario capture debe ACTUALIZAR este borrador y no crear
        // uno nuevo.
        this.draftId.set(draft.borradorId);

        if (!draft.datos) {
            this.draftError.set('El borrador seleccionado no contiene información recuperable.');
            return;
        }

        this.isDraftLoading.set(true);
        this.draftError.set('');
        this.draftMessage.set('Recuperando el borrador seleccionado...');

        this.resolveDraftStructureHierarchies(draft)
            .pipe(
                map((hierarchies) => ({ draft, hierarchies })),
                catchError((error: unknown) => {
                    console.error(
                        'No fue posible reconstruir la jerarquía de la estructura del borrador.',
                        error,
                    );

                    return of({
                        draft,
                        hierarchies: {
                            assignment: null,
                            commission: null,
                        } as DraftStructureHierarchies,
                    });
                }),
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isDraftLoading.set(false)),
            )
            .subscribe({
                next: ({ draft: selectedDraft, hierarchies }) => {
                    this.applyRegistrationDraft(selectedDraft, hierarchies);
                },
                error: (error: unknown) => {
                    this.draftMessage.set('');
                    this.draftError.set(
                        error instanceof Error
                            ? error.message
                            : 'No fue posible recuperar el borrador seleccionado.',
                    );
                },
            });
    }

    private applyRegistrationDraft(
        draft: BorradorItem | null,
        hierarchies: DraftStructureHierarchies,
    ): void {
        if (!draft?.datos) {
            this.draftMessage.set('');
            return;
        }

        const restoredForm = this.restoreFormFromDraftData(
            draft.datos,
            hierarchies,
        );
        const restoredProfiles = this.restoreProfilesFromDraftData(draft.datos, draft.catalogos);

        this.draftId.set(draft.borradorId);
        this.form.set({
            ...restoredForm,
            profiles: restoredProfiles.map((profile) => profile.role),
        });
        this.seedResolvedDraftStructureOptions(hierarchies);
        this.assignedSystemProfiles.set(restoredProfiles);
        if (!restoredProfiles.length) {
            this.ensureDefaultSiauProfile();
        }

        const inferredStep = this.inferDraftStep(draft.datos);
        const requestedStep = draft.pasoActual || inferredStep;
        // Compatibilidad con borradores antiguos que todavía guardaron el paso Archivos.
        const normalizedRequestedStep: WizardStepId | string = requestedStep === 'documents'
            ? 'contact'
            : requestedStep;
        const activeStep = this.isWizardStep(normalizedRequestedStep)
            && CREATE_WIZARD_STEPS.includes(normalizedRequestedStep)
            ? normalizedRequestedStep
            : 'personal-data';

        this.activeStepId.set(activeStep);
        this.completedSteps.set(this.inferCompletedDraftSteps(activeStep));
        this.draftMessage.set('Borrador recuperado. Puedes continuar donde lo dejaste.');

        // Al abrir/restaurar cualquier borrador se vuelve a consultar la
        // información integral con los datos personales ya guardados. La
        // validación se muestra en el sidebar (y en móvil) independientemente
        // del paso en el que quedó el borrador; no es necesario regresar a
        // Datos Personales para consultar ni para ver Personal, SAU y ECCC.
        this.consultEcccAndPersonal();

        const unresolvedAssignment = Boolean(
            draft.datos.adscripcion.estructuraId && !hierarchies.assignment,
        );
        const unresolvedCommission = Boolean(
            draft.datos.comision?.estructuraId && !hierarchies.commission,
        );
        const partialAssignment = Boolean(
            hierarchies.assignment?.institution
            && !hierarchies.assignment.institutionType,
        );
        const partialCommission = Boolean(
            hierarchies.commission?.institution
            && !hierarchies.commission.institutionType,
        );

        if (unresolvedAssignment || unresolvedCommission) {
            this.draftError.set(
                'Se recuperó el borrador, pero no fue posible reconstruir toda la jerarquía de adscripción. Vuelve a seleccionar los catálogos faltantes.',
            );
        } else if (partialAssignment || partialCommission) {
            this.draftMessage.set(
                'Borrador recuperado. La estructura guardada se muestra en el primer nivel; si necesitas cambiarla, vuelve a elegir el tipo de institución.',
            );
        }

        this.loadHydratedAssignmentCatalogs(this.form());
    }

    private restoreFormFromDraftData(
        datos: BorradorDatos,
        hierarchies: DraftStructureHierarchies,
    ): UserRegistrationForm {
        const personal = datos.datosPersonales;
        const assignment = datos.adscripcion;
        const commission = datos.comision;
        const contact = datos.medioContacto;
        const assignmentHierarchy = hierarchies.assignment;
        const commissionHierarchy = hierarchies.commission;

        return {
            ...INITIAL_FORM,
            cuip: personal.cuip ?? '',
            curp: personal.curp ?? '',
            rfc: personal.rfc ?? '',
            firstName: personal.nombres ?? '',
            lastName: personal.primerApellido ?? '',
            secondLastName: personal.segundoApellido ?? '',
            birthDate: this.toDateInputValue(personal.fechaNacimiento),
            gender: personal.sexoId ? String(personal.sexoId) : '',
            civilStatus: personal.estadoCivilId ? String(personal.estadoCivilId) : '',

            // El borrador solo persiste el último estructuraId. Al recuperarlo se
            // reconstruye la cadena de padres para volver a llenar todos los
            // selects de adscripción. Si no puede resolverse la ruta, los
            // selects jerárquicos quedan vacíos para no mostrar el último hijo
            // incorrectamente como si fuera una institución.
            institutionType: assignmentHierarchy?.institutionType ?? '',
            entity: assignmentHierarchy?.entity ?? '',
            municipality: assignmentHierarchy?.municipality ?? '',
            institution: assignmentHierarchy?.institution ?? '',
            decentralizedBody: assignmentHierarchy?.decentralizedBody ?? '',
            administrativeUnit: assignmentHierarchy?.administrativeUnit ?? '',
            position: assignment.cargo ?? '',
            functions: assignment.funciones ?? '',
            admissionDate: this.toDateInputValue(assignment.fechaInicio),
            employeeNumber: assignment.numeroEmpleado ?? '',

            commissionEnabled: Boolean(commission),
            commissionInstitutionType: commissionHierarchy?.institutionType ?? '',
            commissionEntity: commissionHierarchy?.entity ?? '',
            commissionMunicipality: commissionHierarchy?.municipality ?? '',
            commissionInstitution: commissionHierarchy?.institution ?? '',
            commissionDecentralizedBody: commissionHierarchy?.decentralizedBody ?? '',
            commissionAdministrativeUnit: commissionHierarchy?.administrativeUnit ?? '',
            commissionAdmissionDate: this.toDateInputValue(commission?.fechaInicio),

            email: contact.correo ?? '',
            phone: (contact.celular ?? '').replace(/\D/g, '').slice(0, 10),
            comment: datos.comentario ?? '',
            password: '',
            confirmPassword: '',
        };
    }

    /**
     * El GET de borradores sólo regresa el último `estructuraId` seleccionado.
     * La reconstrucción de institución -> OAD -> UA vive en
     * `DraftStructureResolver`, que recorre el árbol de catálogos hacia abajo
     * porque los SP no permiten leer un registro por id ni subir al padre.
     */
    private resolveDraftStructureHierarchies(
        draft: BorradorItem,
    ): Observable<DraftStructureHierarchies> {
        return this.draftStructureResolver.resolverJerarquias(draft);
    }

    private seedResolvedDraftStructureOptions(
        hierarchies: DraftStructureHierarchies,
    ): void {
        this.seedResolvedStructureOptions(
            hierarchies.assignment,
            this.institutionOptions,
            this.decentralizedBodyOptions,
            this.administrativeUnitOptions,
        );
        this.seedResolvedStructureOptions(
            hierarchies.commission,
            this.commissionInstitutionOptions,
            this.commissionDecentralizedBodyOptions,
            this.commissionAdministrativeUnitOptions,
        );
    }

    private seedResolvedStructureOptions(
        hierarchy: ResolvedDraftStructureHierarchy | null,
        institutions: WritableSignal<readonly SiauSelectOption[]>,
        decentralizedBodies: WritableSignal<readonly SiauSelectOption[]>,
        administrativeUnits: WritableSignal<readonly SiauSelectOption[]>,
    ): void {
        institutions.set(hierarchy?.institutionOption ? [hierarchy.institutionOption] : []);
        decentralizedBodies.set(
            hierarchy?.decentralizedBodyOption ? [hierarchy.decentralizedBodyOption] : [],
        );
        administrativeUnits.set(
            hierarchy?.administrativeUnitOption ? [hierarchy.administrativeUnitOption] : [],
        );
    }

    private restoreProfilesFromDraftData(
        datos: BorradorDatos,
        catalogos: BorradorCatalogos | null,
    ): AssignedSystemProfile[] {
        const sourceProfiles = datos.perfiles.length > 0
            ? datos.perfiles
            : datos.cuenta.sistemaId && datos.cuenta.perfilId
                ? [{
                    idSistema: datos.cuenta.sistemaId,
                    idPerfil: datos.cuenta.perfilId,
                }]
                : [];

        const seen = new Set<string>();

        return sourceProfiles.flatMap((profile, index) => {
            const systemId = profile.idSistema;
            const profileId = profile.idPerfil;

            if (!systemId || !profileId) {
                return [];
            }

            const systemValue = String(systemId);
            const roleValue = String(profileId);
            const key = `${systemValue}:${roleValue}`;

            if (seen.has(key)) {
                return [];
            }
            seen.add(key);

            /*
             * El GET actual sólo resuelve las etiquetas del perfil singular de
             * `cuenta`, que corresponde al primer elemento. Para el resto se
             * usan los catálogos `sistema_perfiles`; el efecto que llama a
             * `refreshAssignedProfileLabels` vuelve a resolverlos cuando esos
             * catálogos terminan de cargar.
             */
            const systemLabel = this.resolveSystemLabel(systemValue)
                || (index === 0 ? this.toText(catalogos?.sistema ?? '') : '')
                || systemValue;

            const roleDescription = index === 0
                ? this.toText(catalogos?.perfil ?? '')
                : '';

            return [{
                id: `${systemValue}:${roleValue}`,
                system: systemValue,
                systemLabel,
                role: roleValue,
                roleLabel: this.resolveRoleLabel(
                    systemValue,
                    roleValue,
                    systemLabel,
                    roleDescription,
                )
                    || roleDescription
                    || roleValue,
                roleDescription,
            }];
        });
    }

    private resolveSystemLabel(systemValue: string): string {
        return this.toText(this.findKnownSystemOption(systemValue)?.label ?? '');
    }

    /**
     * Los roles viven en `structureRoleOptionsBySystem`, indexados por sistema.
     * `roleOptions` sólo contiene los del sistema elegido en el formulario de
     * "Agregar sistema", por eso no sirve para reetiquetar lo ya asignado.
     */
    private resolveRoleLabel(
        systemValue: string,
        roleValue: string,
        systemLabel = '',
        roleDescription = '',
    ): string {
        const rolesBySystem = this.structureRoleOptionsBySystem();
        const fallback = this.systemProfileFallbackOptions();
        const fallbackKey = this.normalizeText(systemLabel);
        const fallbackCandidates = [
            ...(fallback[fallbackKey] ?? []),
            ...Object.values(fallback).flat(),
        ];

        /*
         * El GET de borradores devuelve `descripcionPerfil`, mientras que la UI
         * debe pintar `clavePerfil`. Por eso el catálogo global se intenta
         * resolver primero por descripción y después por perfilId. El id se
         * conserva en `role` para que los guardados posteriores sigan enviando
         * el valor numérico esperado por el backend.
         */
        const normalizedDescription = this.normalizeText(roleDescription);
        const fallbackByDescription = normalizedDescription
            ? fallbackCandidates.find(
                (option) => this.normalizeText(option.description) === normalizedDescription,
            )
            : undefined;

        if (fallbackByDescription) {
            return this.toText(fallbackByDescription.label);
        }

        const fallbackById = fallbackCandidates.find((option) => option.value === roleValue);

        if (fallbackById) {
            return this.toText(fallbackById.label);
        }

        const structureCandidates = [
            ...(rolesBySystem[systemValue] ?? []),
            ...Object.values(rolesBySystem).flat(),
            ...this.roleOptions(),
        ];

        return this.toText(
            structureCandidates.find((option) => option.value === roleValue)?.label ?? '',
        );
    }

    /**
     * El mapper genérico de catálogos prioriza la llave `id`, que en
     * `sistema_perfiles` no siempre es el id del perfil. Se reconstruye el
     * valor a partir de la metadata para poder empatar contra el `perfilId`
     * que guarda el borrador.
     */
    private resolveProfileOptionValue(option: CatalogoOption): string {
        const metadata = this.toRecord(option.metadata);
        const keys = ['perfilId', 'idPerfil', 'sistemaPerfilId', 'perfilSistemaId', 'rolId', 'idRol'];

        for (const key of keys) {
            const value = Number(metadata[key]);

            if (Number.isFinite(value) && value > 0) {
                return String(value);
            }
        }

        return option.value;
    }

    /**
     * Consulta una sola vez los perfiles del sistema por su nombre. Al llenar
     * `systemProfileFallbackOptions` el efecto de reetiquetado vuelve a correr.
     */
    private ensureSystemProfileFallback(systemLabel: string): void {
        const label = this.toText(systemLabel);
        const key = this.normalizeText(label);

        if (!key || this.requestedProfileFallbacks.has(key)) {
            return;
        }

        this.requestedProfileFallbacks.add(key);

        this.catalogosFacade
            .obtenerSistemaPerfilesOptions(label)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    this.systemProfileFallbackOptions.update((current) => ({
                        ...current,
                        [key]: options.map((option) => {
                            const metadata = this.toRecord(option.metadata);

                            return {
                                value: this.resolveProfileOptionValue(option),
                                // En sistema_perfiles la etiqueta que se debe pintar
                                // en un borrador restaurado es la clave funcional.
                                label: this.toText(
                                    metadata['clavePerfil']
                                    ?? metadata['perfilClave']
                                    ?? metadata['rolClave']
                                    ?? option.label,
                                ),
                                description: this.toText(
                                    metadata['descripcionPerfil']
                                    ?? metadata['perfilDescripcion']
                                    ?? option.label,
                                ),
                            };
                        }),
                    }));
                },
                error: (error: unknown) => {
                    console.warn(
                        `No fue posible consultar los perfiles del sistema ${label}.`,
                        error,
                    );
                },
            });
    }

    /**
     * Reetiqueta los perfiles ya asignados cuando llegan los catálogos. Sólo
     * escribe si algo cambió, para no reentrar en el efecto que la dispara.
     */
    private refreshAssignedProfileLabels(): void {
        const current = this.assignedSystemProfiles();

        if (!current.length) {
            return;
        }

        let changed = false;

        const next = current.map((profile) => {
            const systemLabel = this.resolveSystemLabel(profile.system) || profile.systemLabel;
            const fallbackKey = this.normalizeText(systemLabel);

            // El catálogo sistema_perfiles es el que contiene la relación
            // descripcionPerfil -> clavePerfil solicitada para los borradores.
            if (fallbackKey && !this.systemProfileFallbackOptions()[fallbackKey]) {
                this.ensureSystemProfileFallback(systemLabel);
            }

            const roleLabel = this.resolveRoleLabel(
                profile.system,
                profile.role,
                systemLabel,
                profile.roleDescription ?? '',
            ) || profile.roleLabel;

            if (systemLabel === profile.systemLabel && roleLabel === profile.roleLabel) {
                return profile;
            }

            changed = true;

            return { ...profile, systemLabel, roleLabel };
        });

        if (changed) {
            this.assignedSystemProfiles.set(next);
        }
    }

    private inferDraftStep(datos: BorradorDatos): WizardStepId {
        if (datos.cuenta.sistemaId && datos.cuenta.perfilId) {
            return 'profiles';
        }

        if (datos.medioContacto.correo || datos.medioContacto.celular) {
            return 'profiles';
        }

        if (datos.adscripcion.estructuraId) {
            return datos.comision ? 'contact' : 'commission';
        }

        if (
            datos.datosPersonales.curp
            || datos.datosPersonales.nombres
            || datos.datosPersonales.primerApellido
        ) {
            return 'assignment';
        }

        return 'personal-data';
    }

    private inferCompletedDraftSteps(activeStep: WizardStepId): readonly WizardStepId[] {
        const order = this.stepOrder();
        const index = order.indexOf(activeStep);

        return index > 0
            ? order.slice(0, index).filter((step) => CREATE_WIZARD_STEPS.includes(step))
            : [];
    }

    protected deleteRegistrationDraft(): void {
        const borradorId = this.draftId();

        if (!borradorId || this.isDraftBusy() || this.isSubmitting()) {
            return;
        }

        this.deleteDraftConfirmationOpen.set(true);
    }

    protected closeDeleteDraftConfirmation(): void {
        if (this.isDraftDeleting()) {
            return;
        }

        this.deleteDraftConfirmationOpen.set(false);
    }

    protected confirmDeleteRegistrationDraft(): void {
        const borradorId = this.draftId();

        if (!borradorId || this.isDraftDeleting() || this.isSubmitting()) {
            return;
        }

        this.isDraftDeleting.set(true);
        this.draftError.set('');

        this.usersFacade
            .deleteRegistrationDraft(borradorId, this.resolveCurrentUserId())
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isDraftDeleting.set(false)),
            )
            .subscribe({
                next: () => {
                    this.deleteDraftConfirmationOpen.set(false);
                    this.resetWizard();
                    this.ensureDefaultSiauProfile();
                    this.draftMessage.set('Borrador eliminado. Se inició un registro nuevo.');
                },
                error: (error: unknown) => {
                    this.deleteDraftConfirmationOpen.set(false);
                    this.draftError.set(
                        error instanceof Error
                            ? error.message
                            : 'No fue posible eliminar el borrador.',
                    );
                },
            });
    }

    private markCompleted(stepId: WizardStepId): void {
        this.completedSteps.update((current) => {
            if (current.includes(stepId)) {
                return current;
            }

            return [...current, stepId];
        });
    }

    private resetWizard(): void {
        this.resetRenapoLookupState();
        this.resetEcccPersonalLookupState();
        this.initialIdentitySnapshot = null;
        this.initialEditFormSnapshot = null;
        this.initialAssignedProfiles = [];
        this.activeStepId.set('personal-data');
        this.completedSteps.set([]);
        this.editEnabled.set(true);
        this.form.set({ ...INITIAL_FORM, profiles: [] });
        this.isSubmitting.set(false);
        this.isDraftLoading.set(false);
        this.isDraftSaving.set(false);
        this.isDraftDeleting.set(false);
        this.draftId.set(null);
        this.draftMessage.set('');
        this.draftError.set('');
        this.deleteDraftConfirmationOpen.set(false);
        this.formErrors.set({});
        this.saveSuccess.set(null);
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);
        this.assignedSystemProfiles.set([]);
        this.detailRoleOptionsBySystem.set({});
        this.resetStructureProfileCatalog();
        this.showPassword.set(false);
        this.showConfirmPassword.set(false);
        this.municipalityOptions.set([]);
        this.institutionOptions.set([]);
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        this.commissionMunicipalityOptions.set([]);
        this.commissionInstitutionOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
    }





    private loadHydratedAssignmentCatalogs(form: UserRegistrationForm): void {
        if (this.requiresMunicipalityForInstitution(form.institutionType) && form.entity) {
            this.loadMunicipalities(form.entity, this.municipalityOptions, 'assignment');
        }

        if (form.institutionType) {
            this.loadAssignmentInstitutions();
        }

        // Sin tipo de institución no se puede armar una consulta válida de
        // hijos: el borrador recuperado sólo trae la estructura persistida en el
        // nivel de institución, así que se conserva la opción ya sembrada en
        // lugar de disparar una petición incompleta.
        if (form.institutionType && form.institution) {
            this.loadAssignmentDecentralizedBodies();
            this.loadAssignmentAdministrativeUnits();
        }

        if (!form.commissionEnabled) {
            return;
        }

        if (this.requiresMunicipalityForInstitution(form.commissionInstitutionType) && form.commissionEntity) {
            this.loadMunicipalities(form.commissionEntity, this.commissionMunicipalityOptions, 'commission');
        }

        if (form.commissionInstitutionType) {
            this.loadCommissionInstitutions();
        }

        if (form.commissionInstitutionType && form.commissionInstitution) {
            this.loadCommissionDecentralizedBodies();
            this.loadCommissionAdministrativeUnits();
        }
    }

    private isWizardStep(value: string): value is WizardStepId {
        return ALL_WIZARD_STEPS.includes(value as WizardStepId);
    }

    private loadCatalogos(): void {
        forkJoin({
            sexos: this.catalogosFacade.obtenerSexoOptions(),
            estadosCivil: this.catalogosFacade.obtenerEstadoCivilOptions(),
            tiposUsuario: this.catalogosFacade.obtenerTipoUsuarioOptions(),
            sistemas: this.catalogosFacade.obtenerSistemasOptions(),
            tiposInstitucion: this.catalogosFacade.obtenerTipoInstitucionOptions(),
            estados: this.catalogosFacade.obtenerEstadosOptions(),
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (catalogos) => {
                    this.genderOptions.set(catalogos.sexos);
                    this.civilStatusOptions.set(catalogos.estadosCivil);
                    this.userTypeOptions.set(catalogos.tiposUsuario);
                    this.allSystemOptions.set(catalogos.sistemas);
                    this.systemOptions.set(catalogos.sistemas);
                    this.roleOptions.set([]);
                    this.institutionTypeOptions.update((current) =>
                        this.mergeSelectOptions(current, catalogos.tiposInstitucion),
                    );
                    this.stateOptions.update((current) =>
                        this.mergeSelectOptions(current, catalogos.estados),
                    );
                    this.catalogosReady.set(true);
                },
                error: (error: unknown) => {
                    this.catalogosReady.set(true);
                    console.error('Error cargando catálogos del usuario.', error);
                },
            });
    }

    private loadProfileOptionsForSystem(systemValue: string): void {
        if (!systemValue || this.structureProfileLookupStatus() !== 'success') {
            this.roleOptions.set([]);
            return;
        }

        this.roleOptions.set(this.findStructureRoleOptionsForSystem(systemValue));
    }

    private loadStructureProfileOptions(structureId: number | undefined): void {
        if (!structureId) {
            this.resetStructureProfileCatalog();
            this.structureProfileMessage.set(
                this.form().commissionEnabled
                    ? 'Completa la institución de la comisión para consultar sus perfiles.'
                    : 'Completa la institución de adscripción para consultar sus perfiles.',
            );
            return;
        }

        if (
            this.loadedProfileStructureId === structureId &&
            this.structureProfileLookupStatus() === 'success'
        ) {
            return;
        }

        const lookupSequence = ++this.structureProfileLookupSequence;

        this.loadedProfileStructureId = structureId;
        this.structureProfileLookupStatus.set('loading');
        this.structureProfileMessage.set('Consultando perfiles permitidos para la estructura seleccionada...');
        this.systemOptions.set([]);
        this.structureRoleOptionsBySystem.set({});
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);

        this.catalogosFacade
            .obtenerEstructuraPerfil(structureId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (items) => {
                    if (lookupSequence !== this.structureProfileLookupSequence) {
                        return;
                    }

                    const catalog = this.buildStructureProfileCatalog(items);

                    this.systemOptions.set(catalog.systems);
                    this.structureRoleOptionsBySystem.set({ ...catalog.rolesBySystem });
                    this.structureProfileLookupStatus.set('success');
                    this.structureProfileMessage.set(
                        catalog.systems.length > 0
                            ? 'Perfiles disponibles cargados correctamente.'
                            : 'La institución seleccionada no tiene sistemas y perfiles configurados.',
                    );
                    this.clearFieldError('profiles');
                    this.ensureDefaultSiauProfile();
                },
                error: (error: unknown) => {
                    if (lookupSequence !== this.structureProfileLookupSequence) {
                        return;
                    }

                    this.systemOptions.set([]);
                    this.structureRoleOptionsBySystem.set({});
                    this.structureProfileLookupStatus.set('error');
                    this.structureProfileMessage.set(
                        error instanceof Error
                            ? error.message
                            : 'No fue posible consultar los perfiles de la estructura.',
                    );
                    console.error('Error cargando perfiles por estructura.', error);
                },
            });
    }

    private resetStructureProfileCatalog(): void {
        this.structureProfileLookupSequence += 1;
        this.loadedProfileStructureId = null;
        this.structureProfileLookupStatus.set('idle');
        this.structureProfileMessage.set('');
        this.structureRoleOptionsBySystem.set({});
        this.systemOptions.set([]);
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);
    }

    private buildStructureProfileCatalog(
        items: readonly CatalogoRecord[],
    ): StructureProfileCatalog {
        const systems: Array<SiauSelectOption & { metadata?: Record<string, unknown> }> = [];
        const rolesBySystem: Record<string, SiauSelectOption[]> = {};

        items.forEach((item) => {
            const record = this.toRecord(item);
            const nestedSystem = this.toRecord(
                record['sistemaDetalle'] ?? record['sistemaCatalogo'] ?? record['sistema'],
            );
            const nestedProfile = this.toRecord(
                record['perfilDetalle'] ?? record['perfilCatalogo'] ?? record['perfil'],
            );

            const rawSystemId = this.firstText([
                this.firstValue(record, ['sistemaId', 'idSistema', 'SistemaId', 'IdSistema']),
                this.firstValue(nestedSystem, ['id', 'sistemaId', 'idSistema']),
            ]);
            const rawSystemLabel = this.firstText([
                this.firstValue(record, [
                    // El nombre visible debe ser la clave/nombre real del sistema
                    // (p. ej. "SPM"), no su descripcion larga.
                    'sistema',
                    'sistemaNombre',
                    'nombreSistema',
                    'sistemaClave',
                    'claveSistema',
                    'descripcionSistema',
                ]),
                this.firstValue(nestedSystem, [
                    'sistema',
                    'nombre',
                    'clave',
                    'descripcion',
                ]),
            ]);

            const globalSystem = this.allSystemOptions().find((option) => {
                const metadataSystemId = this.firstNumberValue(
                    this.optionMetadata(option),
                    ['id', 'idSistema', 'sistemaId'],
                );

                return (
                    option.value === rawSystemId ||
                    this.normalizeText(option.value) === this.normalizeText(rawSystemId) ||
                    this.normalizeText(option.label) === this.normalizeText(rawSystemLabel) ||
                    (metadataSystemId !== null && String(metadataSystemId) === rawSystemId)
                );
            });
            const systemValue = globalSystem?.value || rawSystemId || rawSystemLabel;
            const systemLabel = rawSystemLabel || globalSystem?.label || systemValue;

            const rawProfileId = this.firstText([
                this.firstValue(record, [
                    'perfilId',
                    'idPerfil',
                    'rolId',
                    'idRol',
                    'PerfilId',
                    'IdPerfil',
                ]),
                this.firstValue(nestedProfile, ['id', 'perfilId', 'idPerfil', 'rolId']),
            ]);
            const rawProfileLabel = this.firstText([
                this.firstValue(record, [
                    'perfilDescripcion',
                    'descripcionPerfil',
                    'nombrePerfil',
                    'perfilNombre',
                    'perfilClave',
                    'clavePerfil',
                    'rolNombre',
                    'rol',
                    'perfil',
                ]),
                this.firstValue(nestedProfile, [
                    'nombre',
                    'descripcion',
                    'clave',
                    'perfil',
                    'rol',
                ]),
            ]);
            const profileValue = rawProfileId || rawProfileLabel;
            const profileLabel = rawProfileLabel || profileValue;

            if (!systemValue || !systemLabel || !profileValue || !profileLabel) {
                return;
            }

            if (!systems.some((option) => option.value === systemValue)) {
                systems.push({
                    value: systemValue,
                    label: systemLabel,
                    metadata: {
                        ...this.optionMetadata(globalSystem),
                        ...record,
                    },
                });
            }

            const profileOption: SiauSelectOption = {
                value: profileValue,
                label: profileLabel,
            };

            [systemValue, systemLabel, globalSystem?.value ?? '', globalSystem?.label ?? '']
                .filter(Boolean)
                .forEach((systemKey) =>
                    this.addStructureRoleOption(rolesBySystem, systemKey, profileOption),
                );
        });

        return { systems, rolesBySystem };
    }

    private addStructureRoleOption(
        accumulator: Record<string, SiauSelectOption[]>,
        systemKey: string,
        profileOption: SiauSelectOption,
    ): void {
        const cleanSystemKey = this.toText(systemKey);

        if (!cleanSystemKey) {
            return;
        }

        const current = accumulator[cleanSystemKey] ?? [];
        const exists = current.some((option) =>
            option.value === profileOption.value ||
            this.normalizeText(option.label) === this.normalizeText(profileOption.label),
        );

        if (!exists) {
            accumulator[cleanSystemKey] = [...current, profileOption];
        }
    }

    private findStructureRoleOptionsForSystem(system: string): readonly SiauSelectOption[] {
        const cleanSystem = this.toText(system);

        if (!cleanSystem) {
            return [];
        }

        const rolesBySystem = this.structureRoleOptionsBySystem();

        if (rolesBySystem[cleanSystem]?.length) {
            return rolesBySystem[cleanSystem];
        }

        const systemOption = [...this.systemOptions(), ...this.allSystemOptions()].find(
            (option) =>
                option.value === cleanSystem ||
                this.normalizeText(option.value) === this.normalizeText(cleanSystem) ||
                this.normalizeText(option.label) === this.normalizeText(cleanSystem),
        );
        const candidateKeys = [cleanSystem, systemOption?.value ?? '', systemOption?.label ?? '']
            .filter(Boolean);

        for (const candidateKey of candidateKeys) {
            const options = rolesBySystem[candidateKey];

            if (options?.length) {
                return options;
            }
        }

        const normalizedSystem = this.normalizeText(cleanSystem);
        const matchedKey = Object.keys(rolesBySystem).find(
            (key) => this.normalizeText(key) === normalizedSystem,
        );

        return matchedKey ? rolesBySystem[matchedKey] ?? [] : [];
    }

    private loadMunicipalities(
        stateValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
        context: 'assignment' | 'commission',
    ): void {
        const estadoId = this.toCatalogId(stateValue);
        const requestGeneration = this.catalogGeneration(context);

        if (!estadoId) {
            target.set(this.hasText(stateValue) ? [NO_APLICA_OPTION] : []);
            return;
        }

        this.catalogosFacade
            .obtenerMunicipiosOptions(estadoId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) {
                        return;
                    }

                    this.setDynamicCatalogOptions(target, options);
                },
                error: (error: unknown) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) {
                        return;
                    }

                    this.resetDynamicCatalogOptions(target);
                    console.error('Error cargando municipios.', error);
                },
            });
    }

    private loadAssignmentInstitutions(): void {
        const current = this.form();
        const tipoInstitucionId = this.toCatalogId(current.institutionType);
        const estadoId = this.requiresEntityForInstitution(current.institutionType)
            ? this.toCatalogId(current.entity)
            : undefined;
        const padreId = this.requiresMunicipalityForInstitution(current.institutionType)
            ? this.toCatalogId(current.municipality)
            : undefined;

        if (
            !tipoInstitucionId ||
            (this.requiresEntityForInstitution(current.institutionType) && !estadoId) ||
            (this.requiresMunicipalityForInstitution(current.institutionType) && !padreId)
        ) {
            this.institutionOptions.set([]);
            return;
        }

        this.loadRegionalOrgOptions(this.institutionOptions, {
            tipoInstitucionId,
            estadoId,
            padreId,
        }, 'assignment');
    }

    private loadAssignmentChildren(
        parentValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
        tipoEstructuraId?: number,
    ): void {
        const padreId = this.toCatalogId(parentValue);
        const current = this.form();

        if (!padreId) {
            target.set(this.hasText(parentValue) ? [NO_APLICA_OPTION] : []);
            return;
        }

        if (this.isFederalInstitutionType(current.institutionType)) {
            this.loadFederalOrgOptions(target, {
                tipoEstructuraId,
                padreId,
            }, 'assignment');
            return;
        }

        this.loadRegionalOrgOptions(target, {
            tipoInstitucionId: this.toCatalogId(current.institutionType),
            estadoId: this.requiresEntityForInstitution(current.institutionType)
                ? this.toCatalogId(current.entity)
                : undefined,
            padreId,
        }, 'assignment');
    }

    /** OAD: siempre hijos directos de la institución (tipoEstructuraId = 2). */
    private loadAssignmentDecentralizedBodies(): void {
        this.loadAssignmentChildren(
            this.form().institution,
            this.decentralizedBodyOptions,
            TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO,
        );
    }

    /**
     * UA (tipoEstructuraId = 4). El padre depende de si ya se eligió un OAD:
     * - sin OAD  -> padreId = institución (mismo nivel que los OAD)
     * - con OAD  -> padreId = OAD (las UA_OAD que cuelgan de ese órgano)
     *
     * En estatal/municipal el catálogo `estructura_org` no distingue tipo de
     * estructura, así que ahí se conserva la cascada institución -> OAD -> UA.
     */
    private loadAssignmentAdministrativeUnits(): void {
        const current = this.form();
        const parentValue = this.resolveAdministrativeUnitParent(
            current.institutionType,
            current.institution,
            current.decentralizedBody,
        );

        if (!parentValue) {
            this.administrativeUnitOptions.set([]);
            return;
        }

        this.loadAssignmentChildren(
            parentValue,
            this.administrativeUnitOptions,
            TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA,
        );
    }

    private loadCommissionDecentralizedBodies(): void {
        this.loadCommissionChildren(
            this.form().commissionInstitution,
            this.commissionDecentralizedBodyOptions,
            TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO,
        );
    }

    private loadCommissionAdministrativeUnits(): void {
        const current = this.form();
        const parentValue = this.resolveAdministrativeUnitParent(
            current.commissionInstitutionType,
            current.commissionInstitution,
            current.commissionDecentralizedBody,
        );

        if (!parentValue) {
            this.commissionAdministrativeUnitOptions.set([]);
            return;
        }

        this.loadCommissionChildren(
            parentValue,
            this.commissionAdministrativeUnitOptions,
            TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA,
        );
    }

    private resolveAdministrativeUnitParent(
        institutionType: string,
        institution: string,
        decentralizedBody: string,
    ): string {
        if (this.hasStructureSelection(decentralizedBody)) {
            return decentralizedBody;
        }

        if (!this.isFederalInstitutionType(institutionType)) {
            return '';
        }

        return this.hasStructureSelection(institution) ? institution : '';
    }

    private loadCommissionInstitutions(): void {
        const current = this.form();
        const tipoInstitucionId = this.toCatalogId(current.commissionInstitutionType);
        const estadoId = this.requiresEntityForInstitution(current.commissionInstitutionType)
            ? this.toCatalogId(current.commissionEntity)
            : undefined;
        const padreId = this.requiresMunicipalityForInstitution(current.commissionInstitutionType)
            ? this.toCatalogId(current.commissionMunicipality)
            : undefined;

        if (
            !tipoInstitucionId ||
            (this.requiresEntityForInstitution(current.commissionInstitutionType) && !estadoId) ||
            (this.requiresMunicipalityForInstitution(current.commissionInstitutionType) && !padreId)
        ) {
            this.commissionInstitutionOptions.set([]);
            return;
        }

        this.loadRegionalOrgOptions(this.commissionInstitutionOptions, {
            tipoInstitucionId,
            estadoId,
            padreId,
        }, 'commission');
    }

    private loadCommissionChildren(
        parentValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
        tipoEstructuraId?: number,
    ): void {
        const padreId = this.toCatalogId(parentValue);
        const current = this.form();

        if (!padreId) {
            target.set(this.hasText(parentValue) ? [NO_APLICA_OPTION] : []);
            return;
        }

        if (this.isFederalInstitutionType(current.commissionInstitutionType)) {
            this.loadFederalOrgOptions(target, {
                tipoEstructuraId,
                padreId,
            }, 'commission');
            return;
        }

        this.loadRegionalOrgOptions(target, {
            tipoInstitucionId: this.toCatalogId(current.commissionInstitutionType),
            estadoId: this.requiresEntityForInstitution(current.commissionInstitutionType)
                ? this.toCatalogId(current.commissionEntity)
                : undefined,
            padreId,
        }, 'commission');
    }

    private loadFederalOrgOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        query: {
            tipoEstructuraId?: number;
            padreId: number;
        },
        context: 'assignment' | 'commission',
    ): void {
        const requestGeneration = this.catalogGeneration(context);

        this.catalogosFacade
            .obtenerEstructuraOrganizacionalOptions({
                tipoEstructuraId: query.tipoEstructuraId,
                padreId: query.padreId,
                soloActivos: 1,
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) {
                        return;
                    }

                    this.setDynamicCatalogOptions(target, options);
                },
                error: (error: unknown) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) {
                        return;
                    }

                    this.resetDynamicCatalogOptions(target);
                    console.error('Error cargando estructura organizacional federal.', error);
                },
            });
    }

    private loadRegionalOrgOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        query: {
            tipoInstitucionId?: number;
            estadoId?: number;
            padreId?: number;
        },
        context: 'assignment' | 'commission',
    ): void {
        const requestGeneration = this.catalogGeneration(context);

        this.catalogosFacade
            .obtenerEstructuraOrgOptions({
                tipoInstitucionId: query.tipoInstitucionId,
                estadoId: query.estadoId,
                padreId: query.padreId,
                soloActivos: 1,
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) {
                        return;
                    }

                    this.setDynamicCatalogOptions(target, options);
                },
                error: (error: unknown) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) {
                        return;
                    }

                    this.resetDynamicCatalogOptions(target);
                    console.error('Error cargando estructura orgánica estatal o municipal.', error);
                },
            });
    }

    private bumpAssignmentCatalogGeneration(): void {
        this.assignmentCatalogGeneration += 1;
    }

    private bumpCommissionCatalogGeneration(): void {
        this.commissionCatalogGeneration += 1;
    }

    private catalogGeneration(context: 'assignment' | 'commission'): number {
        return context === 'assignment'
            ? this.assignmentCatalogGeneration
            : this.commissionCatalogGeneration;
    }

    private isCatalogRequestCurrent(
        context: 'assignment' | 'commission',
        requestGeneration: number,
    ): boolean {
        return requestGeneration === this.catalogGeneration(context);
    }

    private setDynamicCatalogOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        options: readonly SiauSelectOption[],
    ): void {
        const cleanOptions = this.deduplicateSelectOptions(options);
        const preservedSelectedOption = this.preservedSelectedOption(target);

        // Al abrir un detalle, la opción del registro ya viene sembrada con su
        // etiqueta. Si el catálogo llega vacío (o falla) no debe borrarse, o el
        // select se queda en blanco aunque el usuario sí tenga órgano/unidad.
        if (cleanOptions.length === 0) {
            target.set(preservedSelectedOption ? [preservedSelectedOption] : [NO_APLICA_OPTION]);
            return;
        }

        target.set(
            preservedSelectedOption
                ? this.deduplicateSelectOptions([preservedSelectedOption, ...cleanOptions])
                : cleanOptions,
        );
    }

    private preservedSelectedOption(
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): SiauSelectOption | null {
        const selectedValue = this.selectedValueForDynamicTarget(target);

        if (!selectedValue || this.isNoAplicaValue(selectedValue)) {
            return null;
        }

        return target().find((option) => option.value === selectedValue) ?? null;
    }

    /** Vacía un catálogo dinámico sin perder la opción ya seleccionada. */
    private resetDynamicCatalogOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): void {
        const preserved = this.preservedSelectedOption(target);

        target.set(preserved ? [preserved] : [NO_APLICA_OPTION]);
    }

    private selectedValueForDynamicTarget(
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): string {
        const current = this.form();

        if (target === this.municipalityOptions) return current.municipality;
        if (target === this.institutionOptions) return current.institution;
        if (target === this.decentralizedBodyOptions) return current.decentralizedBody;
        if (target === this.administrativeUnitOptions) return current.administrativeUnit;
        if (target === this.commissionMunicipalityOptions) return current.commissionMunicipality;
        if (target === this.commissionInstitutionOptions) return current.commissionInstitution;
        if (target === this.commissionDecentralizedBodyOptions) return current.commissionDecentralizedBody;
        if (target === this.commissionAdministrativeUnitOptions) return current.commissionAdministrativeUnit;

        return '';
    }

    private deduplicateSelectOptions(
        options: readonly SiauSelectOption[],
    ): readonly SiauSelectOption[] {
        const unique = new Map<string, SiauSelectOption>();

        options.forEach((option) => {
            const value = this.toText(option.value);

            if (!value) {
                return;
            }

            const key = this.normalizeText(value);

            if (!unique.has(key)) {
                unique.set(key, option);
            }
        });

        return [...unique.values()];
    }

    private mergeSelectOptions(
        preferredOptions: readonly SiauSelectOption[],
        preservedOptions: readonly SiauSelectOption[],
    ): readonly SiauSelectOption[] {
        const result = [...preferredOptions];

        preservedOptions.forEach((preservedOption) => {
            const alreadyExists = result.some(
                (option) =>
                    option.value === preservedOption.value ||
                    this.normalizeText(option.value) === this.normalizeText(preservedOption.value),
            );

            if (!alreadyExists) {
                result.push(preservedOption);
            }
        });

        return result;
    }

    private toCatalogId(value: string | null | undefined): number | undefined {
        if (!value) {
            return undefined;
        }

        const id = Number(value);

        return Number.isFinite(id) && id > 0 ? id : undefined;
    }

    private ensureDefaultSiauProfile(): void {
        if (
            !this.open() ||
            this.mode() !== 'create' ||
            this.structureProfileLookupStatus() !== 'success' ||
            this.assignedSystemProfiles().some((profile) =>
                this.isSiauSystem(profile.system, profile.systemLabel),
            )
        ) {
            return;
        }

        const systemOption = this.systemOptions().find((option) =>
            this.isSiauSystem(option.value, option.label),
        );

        if (!systemOption) {
            return;
        }

        const system = systemOption.value || systemOption.label;
        const options = this.findStructureRoleOptionsForSystem(system);
        const userRole = options.find((option) =>
            this.normalizeText(option.label) === 'usuario' ||
            this.normalizeText(option.value) === 'usuario',
        );

        if (!userRole) {
            return;
        }

        this.assignedSystemProfiles.update((current) => [
            ...current,
            {
                id: `${system}-${userRole.value}-default`,
                system,
                systemLabel: systemOption.label,
                role: userRole.value,
                roleLabel: userRole.label,
            },
        ]);
    }

    private isFederalInstitutionType(value: string | null | undefined): boolean {
        return (
            this.toCatalogId(value) === 1 ||
            this.getInstitutionTypeLabel(value).includes('federal')
        );
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

        const option = this.institutionTypeOptions().find((item) => item.value === value);

        return this.normalizeText(option?.label ?? value);
    }

    private validateAllSteps(): boolean {
        for (const stepId of this.stepOrder()) {
            if (!this.validateStep(stepId)) {
                this.activeStepId.set(stepId);
                return false;
            }
        }

        return true;
    }

    private validateStep(stepId: WizardStepId): boolean {
        const current = this.form();
        const nextErrors: Record<string, string> = {};

        if (stepId === 'personal-data') {
            if (this.shouldValidateIdentityFields(current)) {
                this.addIdentityValidationErrors(current, nextErrors);
            }

            this.addPersonalFieldValidationErrors(current, nextErrors);

            if (
                this.shouldValidateEditFields(current, ['firstName']) &&
                !this.hasText(current.firstName)
            ) {
                nextErrors['firstName'] = 'El nombre es obligatorio.';
            }

            if (
                this.shouldValidateEditFields(current, ['lastName']) &&
                !this.hasText(current.lastName)
            ) {
                nextErrors['lastName'] = 'El primer apellido es obligatorio.';
            }

            if (
                this.shouldValidateEditFields(current, ['gender']) &&
                !this.hasText(current.gender)
            ) {
                nextErrors['gender'] = 'El sexo es obligatorio.';
            }

        }

        if (stepId === 'assignment') {
            if (
                this.shouldValidateEditFields(current, ['institutionType']) &&
                !this.hasText(current.institutionType)
            ) {
                nextErrors['institutionType'] = 'El tipo de institución es obligatorio.';
            }

            if (
                this.assignmentRequiresEntity() &&
                this.shouldValidateEditFields(current, ['institutionType', 'entity']) &&
                !this.hasText(current.entity)
            ) {
                nextErrors['entity'] = 'La entidad es obligatoria.';
            }

            if (
                this.assignmentRequiresMunicipality() &&
                this.shouldValidateEditFields(current, ['institutionType', 'entity', 'municipality']) &&
                !this.hasText(current.municipality)
            ) {
                nextErrors['municipality'] = 'El municipio o alcaldía es obligatorio.';
            }

            if (
                this.shouldValidateEditFields(
                    current,
                    ['institutionType', 'entity', 'municipality', 'institution'],
                ) &&
                !this.hasText(current.institution)
            ) {
                nextErrors['institution'] = 'La institución es obligatoria.';
            }

            if (
                this.shouldValidateEditFields(current, ['admissionDate']) &&
                !this.hasText(current.admissionDate)
            ) {
                nextErrors['admissionDate'] = 'La fecha de ingreso es obligatoria.';
            }

            if (
                this.shouldValidateEditFields(current, ['admissionDate']) &&
                this.hasText(current.admissionDate) &&
                !this.isDateOnOrBeforeToday(current.admissionDate)
            ) {
                nextErrors['admissionDate'] = 'La fecha de ingreso debe ser válida y no posterior a la fecha actual.';
            }

            if (
                this.shouldValidateEditFields(current, ['employeeNumber']) &&
                !this.hasText(current.employeeNumber)
            ) {
                nextErrors['employeeNumber'] = 'El número de empleado es obligatorio.';
            }

            this.addAssignmentFormatValidationErrors(current, nextErrors);
        }

        if (stepId === 'commission') {
            if (current.commissionEnabled) {
                if (!this.hasValidAssignmentForCommission(current)) {
                    nextErrors['commissionInstitutionType'] =
                        'Primero registra una adscripción válida antes de capturar la comisión.';
                }

                if (
                    this.shouldValidateEditFields(
                        current,
                        ['commissionEnabled', 'commissionInstitutionType'],
                    ) &&
                    !this.hasText(current.commissionInstitutionType)
                ) {
                    nextErrors['commissionInstitutionType'] = 'El tipo de institución de comisión es obligatorio.';
                }

                if (
                    this.commissionRequiresEntity() &&
                    this.shouldValidateEditFields(
                        current,
                        ['commissionEnabled', 'commissionInstitutionType', 'commissionEntity'],
                    ) &&
                    !this.hasText(current.commissionEntity)
                ) {
                    nextErrors['commissionEntity'] = 'La entidad de comisión es obligatoria.';
                }

                if (
                    this.commissionRequiresMunicipality() &&
                    this.shouldValidateEditFields(
                        current,
                        [
                            'commissionEnabled',
                            'commissionInstitutionType',
                            'commissionEntity',
                            'commissionMunicipality',
                        ],
                    ) &&
                    !this.hasText(current.commissionMunicipality)
                ) {
                    nextErrors['commissionMunicipality'] = 'El municipio o alcaldía de comisión es obligatorio.';
                }

                if (
                    this.shouldValidateEditFields(
                        current,
                        [
                            'commissionEnabled',
                            'commissionInstitutionType',
                            'commissionEntity',
                            'commissionMunicipality',
                            'commissionInstitution',
                        ],
                    ) &&
                    !this.hasText(current.commissionInstitution)
                ) {
                    nextErrors['commissionInstitution'] = 'La institución de comisión es obligatoria.';
                }

                const shouldValidateCommissionDate = this.shouldValidateEditFields(
                    current,
                    ['commissionEnabled', 'commissionAdmissionDate', 'admissionDate'],
                );

                if (
                    shouldValidateCommissionDate &&
                    !this.hasText(current.commissionAdmissionDate)
                ) {
                    nextErrors['commissionAdmissionDate'] =
                        'La fecha de inicio de comisión es obligatoria.';
                } else if (
                    shouldValidateCommissionDate &&
                    !this.isCommissionStartDateValid(
                        current.commissionAdmissionDate,
                        current.admissionDate,
                    )
                ) {
                    nextErrors['commissionAdmissionDate'] =
                        'La fecha de inicio de comisión debe ser válida, no posterior a hoy y no anterior a la fecha de ingreso.';
                }

                const structureConflict = this.getAssignmentCommissionStructureConflict(current);

                if (structureConflict) {
                    nextErrors[String(structureConflict.field)] =
                        DUPLICATE_COMMISSION_STRUCTURE_MESSAGE;
                }
            }
        }

        if (stepId === 'contact') {
            const hasEmail = this.hasText(current.email);
            const hasPhone = this.hasText(current.phone);
            const shouldValidateEmail = this.shouldValidateEditFields(current, ['email']); const shouldValidatePhone = this.shouldValidateEditFields(current, ['phone']);

            if (shouldValidateEmail && !hasEmail) {
                nextErrors['email'] = 'El correo electrónico es obligatorio.';
            }

            if (shouldValidatePhone && !hasPhone) {
                nextErrors['phone'] = 'El teléfono celular es obligatorio.';
            }

            if (shouldValidateEmail && hasEmail && !this.isValidEmail(current.email)) {
                nextErrors['email'] = 'El correo electrónico no tiene un formato válido.';
            }

            if (shouldValidatePhone && hasPhone && !/^\d{10}$/.test(current.phone)) {
                nextErrors['phone'] = 'El teléfono celular debe tener 10 dígitos.';
            }
        }

        if (stepId === 'profiles') {
            if (
                this.isEditMode() &&
                this.shouldValidateAssignedProfiles() &&
                this.assignedSystemProfiles().length === 0
            ) {
                nextErrors['profiles'] = 'Debes agregar al menos un sistema y perfil.';
            }

            if (
                this.shouldValidateAssignedProfiles() &&
                this.assignedSystemProfiles().length > 0 &&
                !this.hasProfileAssignmentContext(current)
            ) {
                nextErrors['profiles'] =
                    'Registra una adscripción o una comisión válida antes de asignar perfiles.';
            }
        }

        if (stepId === 'account') {
            const shouldValidateComment = this.shouldValidateEditFields(current, ['comment']);

            if (shouldValidateComment && this.hasText(current.comment)) {
                const commentError = this.getRestrictedTextValidationError(
                    current.comment,
                    5,
                    1000,
                    'El comentario',
                );

                if (commentError) {
                    nextErrors['comment'] = commentError;
                }
            }
        }

        this.formErrors.update((currentErrors) => {
            const cleanErrors = { ...currentErrors };

            this.getStepValidationFields(stepId).forEach((field) => {
                delete cleanErrors[field];
            });

            return {
                ...cleanErrors,
                ...nextErrors,
            };
        });

        return Object.keys(nextErrors).length === 0;
    }

    private addIdentityValidationErrors(
        current: UserRegistrationForm,
        errors: Record<string, string>,
    ): void {
        const hasCurp = this.hasText(current.curp);
        const hasRfc = this.hasText(current.rfc);
        const hasBirthDate = this.hasText(current.birthDate);
        let validCurp = false;
        let validRfc = false;

        if (!hasCurp) {
            errors['curp'] = 'La CURP es obligatoria.';
        } else if (!this.isValidCurp(current.curp)) {
            if (hasCurp) {
                errors['curp'] = 'La CURP no tiene un formato o una fecha válidos.';
            }
        } else {
            validCurp = true;
        }

        if (!hasRfc && !this.isEditMode()) {
            errors['rfc'] = 'El RFC es obligatorio.';
        } else if (hasRfc && !this.isValidRfc(current.rfc)) {
            errors['rfc'] = 'El RFC no tiene un formato válido.';
        } else {
            validRfc = hasRfc;
        }

        const birthDateError = getBirthDateError(current.birthDate);

        if (birthDateError) {
            errors['birthDate'] = birthDateError;
        }

        if (validCurp && validRfc && !this.rfcMatchesCurp(current.rfc, current.curp)) {
            errors['rfc'] = 'Los primeros 10 caracteres del RFC deben coincidir con los datos de la CURP.';
        }

        const hasValidBirthDate = hasBirthDate && this.isValidDateInput(current.birthDate);
        const rfcBirthDateMatches =
            validRfc &&
            hasValidBirthDate &&
            this.rfcBirthDateMatchesDate(current.rfc, current.birthDate);

        if (validRfc && hasValidBirthDate && !rfcBirthDateMatches) {
            errors['rfc'] = 'La fecha contenida en el RFC debe coincidir con la fecha de nacimiento capturada.';
        }

        const curpBirthDate = validCurp ? this.getBirthDateFromCurp(current.curp) : null;
        const curpBirthDateMatches =
            Boolean(curpBirthDate) &&
            hasValidBirthDate &&
            this.areSameCalendarDates(current.birthDate, curpBirthDate ?? '');

        if (curpBirthDate && !this.isBirthDateOnOrAfterMinimum(curpBirthDate)) {
            errors['curp'] = 'La fecha contenida en la CURP no puede ser anterior al 01/01/1900.';
        } else if (curpBirthDate && !this.isAdult(curpBirthDate)) {
            errors['curp'] =
                'La fecha de nacimiento contenida en la CURP corresponde a una persona menor de 18 años.';
        }

        if (hasValidBirthDate) {
            const curpMismatch = Boolean(curpBirthDate) && !curpBirthDateMatches;
            const rfcMismatch = validRfc && !rfcBirthDateMatches;

            if (curpMismatch && rfcMismatch) {
                errors['birthDate'] =
                    'La fecha de nacimiento debe coincidir con las fechas contenidas en la CURP y el RFC.';
            } else if (curpMismatch) {
                errors['birthDate'] =
                    'La fecha de nacimiento debe coincidir con la fecha registrada en la CURP.';
            } else if (rfcMismatch) {
                errors['birthDate'] =
                    'La fecha de nacimiento debe coincidir con la fecha contenida en el RFC.';
            }
        }
    }

    private addPersonalFieldValidationErrors(
        current: UserRegistrationForm,
        errors: Record<string, string>,
    ): void {
        if (
            this.shouldValidateEditFields(current, ['cuip']) &&
            this.hasText(current.cuip) &&
            !this.isValidCuip(current.cuip)
        ) {
            errors['cuip'] =
                'La CUIP debe tener 20 caracteres con formato AAAA999999H999999999: 4 letras, 6 números, H/M y 9 números.';
        }

        this.addNameValidationError(
            current.firstName,
            'firstName',
            'El nombre',
            this.shouldValidateEditFields(current, ['firstName']),
            errors,
        );
        this.addNameValidationError(
            current.lastName,
            'lastName',
            'El primer apellido',
            this.shouldValidateEditFields(current, ['lastName']),
            errors,
        );
        this.addNameValidationError(
            current.secondLastName,
            'secondLastName',
            'El segundo apellido',
            this.shouldValidateEditFields(current, ['secondLastName']),
            errors,
        );
    }

    private isValidCuip(value: unknown): boolean {
        return /^[A-Z]{4}\d{6}[HM]\d{9}$/.test(this.toText(value).toUpperCase());
    }

    private addNameValidationError(
        value: string,
        key: string,
        label: string,
        shouldValidate: boolean,
        errors: Record<string, string>,
    ): void {
        if (!shouldValidate || !this.hasText(value)) {
            return;
        }

        const normalized = this.toText(value).normalize('NFC');

        if (normalized.length > 100 || !/^[\p{L}\s]+$/u.test(normalized)) {
            errors[key] = `${label} debe contener únicamente letras y espacios (máximo 100 caracteres).`;
        }
    }

    private addAssignmentFormatValidationErrors(
        current: UserRegistrationForm,
        errors: Record<string, string>,
    ): void {
        if (
            this.shouldValidateEditFields(current, ['position']) &&
            this.hasText(current.position)
        ) {
            const positionError = this.getRestrictedTextValidationError(
                current.position,
                2,
                150,
                'El cargo',
            );

            if (positionError) {
                errors['position'] = positionError;
            }
        }

        if (
            this.shouldValidateEditFields(current, ['functions']) &&
            this.hasText(current.functions)
        ) {
            const functionsError = this.getRestrictedTextValidationError(
                current.functions,
                5,
                500,
                'Las funciones',
            );

            if (functionsError) {
                errors['functions'] = functionsError;
            }
        }

        if (
            this.shouldValidateEditFields(current, ['employeeNumber']) &&
            this.hasText(current.employeeNumber) &&
            !this.isValidEmployeeNumber(current.employeeNumber)
        ) {
            errors['employeeNumber'] =
                'El número de empleado debe contener de 3 a 20 caracteres: letras, números, espacios o guion.';
        }
    }

    private refreshCommissionStructureConflict(): void {
        const conflict = this.getAssignmentCommissionStructureConflict(this.form());
        const conflictFields: readonly (keyof UserRegistrationForm)[] = [
            'commissionInstitution',
            'commissionDecentralizedBody',
            'commissionAdministrativeUnit',
        ];

        this.formErrors.update((currentErrors) => {
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

    private getAssignmentCommissionStructureConflict(
        current: UserRegistrationForm,
    ): StructureSelection | null {
        if (!current.commissionEnabled) {
            return null;
        }

        const assignment = this.resolveDeepestStructureSelection([
            {
                field: 'administrativeUnit',
                level: 'administrative-unit',
                value: current.administrativeUnit,
            },
            {
                field: 'decentralizedBody',
                level: 'decentralized-body',
                value: current.decentralizedBody,
            },
            {
                field: 'institution',
                level: 'institution',
                value: current.institution,
            },
        ]);
        const commission = this.resolveDeepestStructureSelection([
            {
                field: 'commissionAdministrativeUnit',
                level: 'administrative-unit',
                value: current.commissionAdministrativeUnit,
            },
            {
                field: 'commissionDecentralizedBody',
                level: 'decentralized-body',
                value: current.commissionDecentralizedBody,
            },
            {
                field: 'commissionInstitution',
                level: 'institution',
                value: current.commissionInstitution,
            },
        ]);

        if (!assignment || !commission || assignment.level !== commission.level) {
            return null;
        }

        const sameCatalogId =
            assignment.catalogId !== null &&
            commission.catalogId !== null &&
            assignment.catalogId === commission.catalogId;
        const sameRawValue =
            this.normalizeText(assignment.value) === this.normalizeText(commission.value);

        return sameCatalogId || sameRawValue ? commission : null;
    }

    private resolveDeepestStructureSelection(
        candidates: readonly {
            readonly field: keyof UserRegistrationForm;
            readonly level: StructureSelectionLevel;
            readonly value: string;
        }[],
    ): StructureSelection | null {
        for (const candidate of candidates) {
            const value = this.toText(candidate.value);

            if (!value || this.isNoAplicaValue(value)) {
                continue;
            }

            return {
                ...candidate,
                value,
                catalogId: this.toCatalogId(value) ?? null,
            };
        }

        return null;
    }

    /** Una selección real: con texto y distinta de "NO APLICA". */
    private hasStructureSelection(value: string | null | undefined): boolean {
        return this.hasText(value) && !this.isNoAplicaValue(value);
    }

    /** Traduce la opción "Sin selección" a cadena vacía. */
    private normalizeSelectValue(value: string | null): string {
        const text = this.toText(value);

        return text === CLEAR_SELECTION_VALUE ? '' : text;
    }

    private withClearOption(
        options: readonly SiauSelectOption[],
    ): readonly SiauSelectOption[] {
        if (options.length === 0) {
            return options;
        }

        return [CLEAR_SELECTION_OPTION, ...options];
    }

    private isNoAplicaValue(value: unknown): boolean {
        const normalized = this.normalizeText(this.toText(value));

        return normalized === this.normalizeText(NO_APLICA_VALUE) || normalized === 'no aplica';
    }

    private hasValidAssignmentForCommission(current: UserRegistrationForm): boolean {
        if (
            !this.hasText(current.institutionType) ||
            !this.hasText(current.institution) ||
            this.isNoAplicaValue(current.institution) ||
            !this.hasText(current.admissionDate) ||
            !this.hasText(current.employeeNumber)
        ) {
            return false;
        }

        if (this.requiresEntityForInstitution(current.institutionType) && !this.hasText(current.entity)) {
            return false;
        }

        if (
            this.requiresMunicipalityForInstitution(current.institutionType) &&
            !this.hasText(current.municipality)
        ) {
            return false;
        }

        return (
            this.isDateOnOrBeforeToday(current.admissionDate) &&
            this.isValidEmployeeNumber(current.employeeNumber)
        );
    }

    private hasValidCommissionContext(current: UserRegistrationForm): boolean {
        if (
            !current.commissionEnabled ||
            !this.hasText(current.commissionInstitutionType) ||
            !this.hasText(current.commissionInstitution) ||
            this.isNoAplicaValue(current.commissionInstitution)
        ) {
            return false;
        }

        if (
            this.requiresEntityForInstitution(current.commissionInstitutionType) &&
            !this.hasText(current.commissionEntity)
        ) {
            return false;
        }

        if (
            this.requiresMunicipalityForInstitution(current.commissionInstitutionType) &&
            !this.hasText(current.commissionMunicipality)
        ) {
            return false;
        }

        const hasCommissionStartDate = this.hasText(current.commissionAdmissionDate);
        const unchangedLegacyEdit =
            this.isEditMode() &&
            !this.shouldValidateEditFields(
                current,
                ['commissionEnabled', 'commissionAdmissionDate', 'admissionDate'],
            );

        if (!hasCommissionStartDate) {
            return unchangedLegacyEdit;
        }

        return this.isCommissionStartDateValid(
            current.commissionAdmissionDate,
            current.admissionDate,
        );
    }

    private hasProfileAssignmentContext(current: UserRegistrationForm): boolean {
        return current.commissionEnabled
            ? this.hasValidCommissionContext(current)
            : this.hasValidAssignmentForCommission(current);
    }

    private resolveProfileStructureId(current: UserRegistrationForm): number | undefined {
        // El parámetro estructuraId es el id del ÚLTIMO nivel filtrado por el usuario:
        // unidad administrativa > órgano desconcentrado > institución.
        // Si solo llegó hasta institución, se manda la institución; si llegó hasta
        // unidad administrativa, se manda la unidad administrativa.
        const selection = current.commissionEnabled
            ? this.resolveDeepestStructureSelection([
                {
                    field: 'commissionAdministrativeUnit',
                    level: 'administrative-unit',
                    value: current.commissionAdministrativeUnit,
                },
                {
                    field: 'commissionDecentralizedBody',
                    level: 'decentralized-body',
                    value: current.commissionDecentralizedBody,
                },
                {
                    field: 'commissionInstitution',
                    level: 'institution',
                    value: current.commissionInstitution,
                },
            ])
            : this.resolveDeepestStructureSelection([
                {
                    field: 'administrativeUnit',
                    level: 'administrative-unit',
                    value: current.administrativeUnit,
                },
                {
                    field: 'decentralizedBody',
                    level: 'decentralized-body',
                    value: current.decentralizedBody,
                },
                {
                    field: 'institution',
                    level: 'institution',
                    value: current.institution,
                },
            ]);

        return selection?.catalogId ?? undefined;
    }

    private shouldValidateIdentityFields(current: UserRegistrationForm): boolean {
        if (!this.isEditMode()) {
            return true;
        }

        const initialSnapshot = this.initialIdentitySnapshot;

        if (!initialSnapshot) {
            return true;
        }

        const currentSnapshot = this.toIdentitySnapshot(current);

        return (
            initialSnapshot.curp !== currentSnapshot.curp ||
            initialSnapshot.rfc !== currentSnapshot.rfc ||
            initialSnapshot.birthDate !== currentSnapshot.birthDate
        );
    }

    private shouldValidateEditFields(
        current: UserRegistrationForm,
        fields: readonly (keyof UserRegistrationForm)[],
    ): boolean {
        if (!this.isEditMode()) {
            return true;
        }

        const initialSnapshot = this.initialEditFormSnapshot;

        if (!initialSnapshot) {
            return true;
        }

        return fields.some(
            (field) => !this.areEditFieldValuesEqual(initialSnapshot[field], current[field]),
        );
    }

    private shouldValidateAssignedProfiles(): boolean {
        if (!this.isEditMode()) {
            return true;
        }

        return this.buildAssignedProfileSignature(this.initialAssignedProfiles) !==
            this.buildAssignedProfileSignature(this.assignedSystemProfiles());
    }

    private areEditFieldValuesEqual(
        initialValue: UserRegistrationForm[keyof UserRegistrationForm],
        currentValue: UserRegistrationForm[keyof UserRegistrationForm],
    ): boolean {
        if (Array.isArray(initialValue) && Array.isArray(currentValue)) {
            return (
                initialValue.length === currentValue.length &&
                initialValue.every((value, index) => value === currentValue[index])
            );
        }

        return initialValue === currentValue;
    }

    private buildAssignedProfileSignature(
        profiles: readonly AssignedSystemProfile[],
    ): string {
        return profiles
            .map((profile) => `${profile.system}|${profile.role}`)
            .sort()
            .join('||');
    }

    private validateChangedIdentityFields(): boolean {
        const current = this.form();

        if (!this.shouldValidateIdentityFields(current)) {
            this.clearIdentityFieldErrors();
            return true;
        }

        const nextErrors: Record<string, string> = {};
        this.addIdentityValidationErrors(current, nextErrors);

        this.formErrors.update((currentErrors) => ({
            ...this.withoutIdentityFieldErrors(currentErrors),
            ...nextErrors,
        }));

        return Object.keys(nextErrors).length === 0;
    }

    private clearIdentityFieldErrors(): void {
        this.formErrors.update((currentErrors) => this.withoutIdentityFieldErrors(currentErrors));
    }

    private withoutIdentityFieldErrors(errors: Record<string, string>): Record<string, string> {
        const nextErrors = { ...errors };

        ['curp', 'rfc', 'birthDate'].forEach((field) => delete nextErrors[field]);

        return nextErrors;
    }

    private getStepValidationFields(stepId: WizardStepId): readonly string[] {
        const fieldsByStep: Record<WizardStepId, readonly string[]> = {
            'personal-data': [
                'cuip',
                'curp',
                'rfc',
                'firstName',
                'lastName',
                'secondLastName',
                'gender',
                'civilStatus',
                'birthDate',
            ],
            assignment: [
                'institutionType',
                'entity',
                'municipality',
                'institution',
                'position',
                'functions',
                'admissionDate',
                'employeeNumber',
            ],
            commission: [
                'commissionInstitutionType',
                'commissionEntity',
                'commissionMunicipality',
                'commissionInstitution',
                'commissionDecentralizedBody',
                'commissionAdministrativeUnit',
                'commissionAdmissionDate',
            ],
            documents: [],
            contact: [
                'email',
                'phone',
            ],
            profiles: [
                'profiles',
            ],
            account: [
                'password',
                'confirmPassword',
                'comment',
            ],
        };

        return fieldsByStep[stepId];
    }

    private clearFieldError(key: string): void {
        this.formErrors.update((current) => {
            if (!current[key]) {
                return current;
            }

            const next = { ...current };
            delete next[key];

            return next;
        });
    }

    private normalizeFormInputValue<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K] | string | null,
    ): UserRegistrationForm[K] {
        if (key === 'commissionEnabled') {
            return Boolean(value) as UserRegistrationForm[K];
        }

        const textValue = this.toText(value);

        if (key === 'cuip') {
            return this.normalizeAlphanumericInput(textValue, 20) as UserRegistrationForm[K];
        }

        if (key === 'curp') {
            return this.normalizeAlphanumericInput(textValue, 18) as UserRegistrationForm[K];
        }

        if (key === 'employeeNumber') {
            return this.normalizeEmployeeNumberInput(textValue) as UserRegistrationForm[K];
        }

        if (this.isNameField(key)) {
            return this.normalizeNameInput(textValue) as UserRegistrationForm[K];
        }

        if (key === 'position') {
            return this.normalizeRestrictedTextInput(textValue, 150, true) as UserRegistrationForm[K];
        }

        if (key === 'functions') {
            return this.normalizeRestrictedTextInput(textValue, 500, true) as UserRegistrationForm[K];
        }

        if (key === 'comment') {
            return this.normalizeRestrictedTextInput(textValue, 1000, false) as UserRegistrationForm[K];
        }

        if (this.shouldUppercaseField(key)) {
            return textValue.toUpperCase() as UserRegistrationForm[K];
        }

        if (key === 'phone') {
            return this.normalizeNumericInput(textValue, 10) as UserRegistrationForm[K];
        }

        if (
            key === 'birthDate' ||
            key === 'admissionDate' ||
            key === 'commissionAdmissionDate'
        ) {
            // Sin fallback al texto original: si el origen manda un serial o una
            // cadena que no se puede interpretar, el campo queda vacío en lugar
            // de mostrar basura como "45100" y saltarse las validaciones.
            return this.toDateInputValue(textValue) as UserRegistrationForm[K];
        }

        if (key === 'email') {
            return this.normalizeEmail(textValue) as UserRegistrationForm[K];
        }

        return textValue as UserRegistrationForm[K];
    }

    private shouldUppercaseField(key: keyof UserRegistrationForm): boolean {
        return [
            'cuip',
            'policeIdentificationKey',
            'curp',
            'rfc',
            'firstName',
            'lastName',
            'secondLastName',
            'employeeNumber',
            'username',
        ].includes(key);
    }

    private isNameField(key: keyof UserRegistrationForm): boolean {
        return ['firstName', 'lastName', 'secondLastName'].includes(key);
    }

    private normalizeNameInput(value: unknown): string {
        return this.toText(value)
            .normalize('NFC')
            .replace(/[^\p{L}\s]/gu, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    private normalizeAlphanumericInput(value: unknown, maxLength: number): string {
        return this.toText(value)
            .normalize('NFKC')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, maxLength);
    }

    private normalizeEmployeeNumberInput(value: unknown): string {
        return String(value ?? '')
            .normalize('NFKC')
            .toUpperCase()
            .replace(/[^A-Z0-9\s-]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^\s+/, '')
            .slice(0, 20);
    }

    private isValidEmployeeNumber(value: unknown): boolean {
        return /^(?=.*[A-Z0-9])[A-Z0-9 -]{3,20}$/.test(
            this.toText(value).toUpperCase(),
        );
    }

    private normalizeNumericInput(value: unknown, maxLength: number): string {
        return this.toText(value)
            .normalize('NFKC')
            .replace(/\D/g, '')
            .slice(0, maxLength);
    }

    private isValidCurp(value: string): boolean {
        const curp = this.toText(value).toUpperCase();

        return (
            /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/.test(curp) &&
            this.getBirthDateFromCurp(curp) !== null
        );
    }

    private normalizeRfc(value: string): string {
        return this.normalizeAlphanumericInput(value, 13);
    }

    /**
     * El RFC toma siempre sus primeros 10 caracteres de la CURP. La persona
     * administradora sólo captura la homoclave de tres posiciones.
     */
    private getRfcPrefixFromCurp(value: string): string | null {
        const prefix = this.toText(value).toUpperCase().slice(0, 10);

        return /^[A-Z0-9]{10}$/.test(prefix) ? prefix : null;
    }

    private buildRfcFromCurp(curp: string): string {
        const prefix = this.getRfcPrefixFromCurp(curp);

        return prefix ?? '';
    }

    private getRfcHomoclave(value: string, prefix: string, currentRfc: string): string {
        const entered = this.normalizeRfc(value);

        if (entered.startsWith(prefix)) {
            return entered.slice(prefix.length, prefix.length + 3).replace(/[^A-Z0-9]/g, '');
        }

        const existing = this.normalizeRfc(currentRfc);

        return existing.startsWith(prefix)
            ? existing.slice(prefix.length, prefix.length + 3).replace(/[^A-Z0-9]/g, '')
            : '';
    }

    private rfcMatchesCurp(rfc: string, curp: string): boolean {
        const normalizedRfc = this.toText(rfc).toUpperCase();
        const normalizedCurp = this.toText(curp).toUpperCase();

        return normalizedRfc.slice(0, 10) === normalizedCurp.slice(0, 10);
    }

    private rfcBirthDateMatchesDate(rfc: string, birthDate: string): boolean {
        const rfcDateCode = this.getBirthDateCodeFromRfc(rfc);
        const parsedBirthDate = this.parseDateInput(birthDate);

        if (!rfcDateCode || !parsedBirthDate) {
            return false;
        }

        return rfcDateCode === this.formatRfcBirthDateCode(parsedBirthDate);
    }

    private getBirthDateCodeFromRfc(value: string): string | null {
        const rfc = this.toText(value).toUpperCase();

        if (!this.isValidRfc(rfc)) {
            return null;
        }

        const prefixLength = rfc.length === 13 ? 4 : 3;
        const dateCode = rfc.slice(prefixLength, prefixLength + 6);

        return /^\d{6}$/.test(dateCode) ? dateCode : null;
    }

    private formatRfcBirthDateCode(date: Date): string {
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}${month}${day}`;
    }

    private getBirthDateFromCurp(value: string): string | null {
        const curp = this.toText(value).toUpperCase();

        if (curp.length !== 18) {
            return null;
        }

        const shortYear = Number(curp.slice(4, 6));
        const month = curp.slice(6, 8);
        const day = curp.slice(8, 10);
        const fullYear = this.resolveCurpBirthYear(shortYear);
        const birthDate = `${fullYear}-${month}-${day}`;

        return this.isValidDateInput(birthDate) ? birthDate : null;
    }

    /**
     * Resuelve el siglo usando una ventana móvil respecto del año actual.
     * Esto evita interpretar CURP de prueba como 1908 sólo porque el carácter
     * diferenciador de homonimia sea numérico. Por ejemplo, durante 2026:
     * 08 -> 2008, 26 -> 2026 y 91 -> 1991.
     */
    private resolveCurpBirthYear(shortYear: number): number {
        const currentYear = new Date().getFullYear();
        const currentCentury = Math.floor(currentYear / 100) * 100;
        const candidateYear = currentCentury + shortYear;

        return candidateYear > currentYear ? candidateYear - 100 : candidateYear;
    }

    private isValidRfc(value: string): boolean {
        const rfc = this.toText(value).toUpperCase();

        return /^([A-Z]{3,4})\d{6}[A-Z0-9]{3}$/.test(rfc);
    }

    private isValidEmail(value: string): boolean {
        return isValidContactEmail(this.toText(value));
    }

    private normalizeEmail(value: unknown): string {
        return sanitizeContactEmailInput(value);
    }

    private formatPhoneForDisplay(value: unknown): string {
        const digits = this.toText(value).replace(/\D/g, '').slice(0, 10);

        if (digits.length !== 10) {
            return digits;
        }

        return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
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

        return this.formatDateInputValue(today);
    }

    private isDateOnOrBeforeToday(value: string): boolean {
        const date = this.parseDateInput(value);

        if (!date) {
            return false;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return date.getTime() <= today.getTime();
    }

    private isCommissionStartDateValid(
        commissionDateValue: string,
        admissionDateValue: string,
    ): boolean {
        const commissionDate = this.parseDateInput(commissionDateValue);

        if (!commissionDate || !this.isDateOnOrBeforeToday(commissionDateValue)) {
            return false;
        }

        if (!this.hasText(admissionDateValue)) {
            return true;
        }

        const admissionDate = this.parseDateInput(admissionDateValue);

        return admissionDate !== null && commissionDate.getTime() >= admissionDate.getTime();
    }

    private getRestrictedTextValidationError(
        value: string,
        minimum: number,
        maximum: number,
        label: string,
    ): string | null {
        return getRestrictedTextError(this.toText(value), minimum, maximum, label);
    }

    private normalizeRestrictedTextInput(
        value: unknown,
        maximum: number,
        uppercase: boolean,
    ): string {
        return sanitizeRestrictedText(value, maximum, uppercase);
    }

    private isBirthDateOnOrAfterMinimum(dateValue: string): boolean {
        const birthDate = this.parseDateInput(dateValue);

        if (!birthDate) {
            return false;
        }

        return birthDate.getTime() >= this.getMinimumBirthDate().getTime();
    }

    private isAdult(dateValue: string): boolean {
        const birthDate = this.parseDateInput(dateValue);

        if (!birthDate) {
            return false;
        }

        return birthDate.getTime() <= this.getAdultCutoffDate().getTime();
    }

    private getMinimumBirthDate(): Date {
        return this.parseDateInput(MINIMUM_BIRTH_DATE) as Date;
    }

    private getAdultCutoffDate(): Date {
        return getAdultCutoffDate();
    }

    private isValidDateInput(value: string): boolean {
        return this.parseDateInput(value) !== null;
    }

    private areSameCalendarDates(leftValue: string, rightValue: string): boolean {
        const leftDate = this.parseDateInput(this.toDateInputValue(leftValue) || leftValue);
        const rightDate = this.parseDateInput(this.toDateInputValue(rightValue) || rightValue);

        if (!leftDate || !rightDate) {
            return false;
        }

        return (
            leftDate.getFullYear() === rightDate.getFullYear() &&
            leftDate.getMonth() === rightDate.getMonth() &&
            leftDate.getDate() === rightDate.getDate()
        );
    }

    private parseDateInput(value: string): Date | null {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.toText(value));

        if (!match) {
            return null;
        }

        const [, rawYear, rawMonth, rawDay] = match;
        const year = Number(rawYear);
        const month = Number(rawMonth);
        const day = Number(rawDay);
        const date = new Date(year, month - 1, day);

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) {
            return null;
        }

        date.setHours(0, 0, 0, 0);

        return date;
    }

    private formatDateInputValue(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    } private toEditFormSnapshot(form: UserRegistrationForm): UserRegistrationForm {
        return {
            ...form,
            profiles: [...form.profiles],
        };
    }

    private toIdentitySnapshot(form: UserRegistrationForm): IdentitySnapshot {
        return {
            curp: this.toText(form.curp).toUpperCase(),
            rfc: this.toText(form.rfc).toUpperCase(),
            birthDate: this.toDateInputValue(form.birthDate),
        };
    }

    private normalizeText(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }
    private hasCompleteRenapoPersonalData(data: RenapoCurpData): boolean {
        return (
            this.hasText(data.nombre) &&
            this.hasText(data.primerApellido) &&
            this.hasText(this.resolveRenapoGender(data.sexo))
        );
    }
}