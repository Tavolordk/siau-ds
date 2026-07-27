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
import { CatalogosFacade } from '../../../../../core/catalogos';
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
import { UserRegistrationDraftStorage } from '../../../data-access/user-registration-draft.storage';
import { buildUserCredentialsEmailRequest } from '../../../application/user-credentials-email.template';
import {
    ActualizarAdminRequest,
    RegistroAdminRequest,
    RegistroAdminResponse,
    RegistroAsignacion,
    RegistroCuenta,
    RegistroEspecialRequest,
    RegistroEspecialResponse,
    RegistroMedioContacto,
    UserDetailRecord,
    UserRecord,
} from '../../../domain/models/user-record.model';

type AccountStatus = 'active' | 'baja' | 'suspended' | 'blocked';
type UserWizardMode = 'create' | 'edit';
type RenapoLookupStatus = 'idle' | 'loading' | 'success' | 'not-found' | 'error';
type CurpPersonalStatus = 'active' | 'inactive' | 'no-information';
type CurpEcccStatus = 'approved' | 'rejected' | 'no-information';
type CurpValidationStatus = CurpPersonalStatus | CurpEcccStatus;

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
    commissionDependency: string;
    commissionDecentralizedBody: string;
    commissionAdministrativeUnit: string;
    commissionAdmissionDate: string;

    email: string;
    phone: string;
    extension: string;

    profiles: string[];

    username: string;
    password: string;
    confirmPassword: string;
    accountStatus: AccountStatus;
    expressCreation: boolean;
    expressJustification: string;
}

interface IdentitySnapshot {
    readonly curp: string;
    readonly rfc: string;
    readonly birthDate: string;
}

interface CurpValidationSummary {
    readonly personal: CurpPersonalStatus;
    readonly eccc: CurpEcccStatus;
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
    readonly isExpress: boolean;
    readonly hasAccessEmail: boolean;
    readonly accessEmail: string;
    readonly accessPhone: string;
    readonly emailAccepted: boolean;
    readonly emailStatus: string;
    readonly emailMessage: string;
    readonly emailReference: string;
}

const DEFAULT_ACCOUNT_PASSWORD = 'SSPC-PMex-2025';
const DEFAULT_ACCOUNT_PASSWORD_HASH = '$2b$12$HashDePruebaParaElCampo...';

/**
 * Resultado temporal mientras se habilita el servicio de consulta complementaria.
 * Se evita simular una aprobación o una situación laboral que aún no fue validada.
 */
const HARDCODED_CURP_VALIDATION_SUMMARY: CurpValidationSummary = {
    personal: 'no-information',
    eccc: 'no-information',
};

const ALL_WIZARD_STEPS: readonly WizardStepId[] = [
    'personal-data',
    'assignment',
    'commission',
    'documents',
    'contact',
    'profiles',
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
    commissionDependency: '',
    commissionDecentralizedBody: '',
    commissionAdministrativeUnit: '',
    commissionAdmissionDate: '',

    email: '',
    phone: '',
    extension: '',

    profiles: [],

    username: '',
    password: '',
    confirmPassword: '',
    accountStatus: 'active',
    expressCreation: false,
    expressJustification: '',
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
    readonly closed = output<void>();

    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly usersFacade = inject(UsersFacade);
    private readonly correoFacade = inject(CorreoFacade);
    private readonly renapoFacade = inject(RenapoFacade);
    private readonly authStorage = inject(AuthStorage);
    private readonly draftStorage = inject(UserRegistrationDraftStorage);
    private readonly destroyRef = inject(DestroyRef);

    private hydrationKey = '';
    private curpLookupSequence = 0;
    private lastRenapoCurp = '';
    private initialIdentitySnapshot: IdentitySnapshot | null = null;
    private initialEditFormSnapshot: UserRegistrationForm | null = null;
    private initialAssignedProfiles: readonly AssignedSystemProfile[] = [];
    private readonly catalogosReady = signal<boolean>(false);
    private readonly draftPersistenceEnabled = signal<boolean>(false);
    private defaultSiauProfileLoading = false;

    protected readonly activeStepId = signal<WizardStepId>('personal-data');
    protected readonly editEnabled = signal<boolean>(true);
    protected readonly completedSteps = signal<readonly WizardStepId[]>([]);
    protected readonly form = signal<UserRegistrationForm>({ ...INITIAL_FORM });
    protected readonly isSubmitting = signal<boolean>(false);
    protected readonly formErrors = signal<Record<string, string>>({});
    protected readonly saveSuccess = signal<SaveSuccessModalState | null>(null);
    protected readonly recoveredDraftAt = signal<string | null>(null);
    protected readonly renapoLookupStatus = signal<RenapoLookupStatus>('idle');
    protected readonly renapoMessage = signal<string>('');
    protected readonly curpLocked = signal<boolean>(false);
    protected readonly curpUnlockChecked = signal<boolean>(false);
    protected readonly curpValidationSummary = signal<CurpValidationSummary | null>(null);

    protected readonly selectedSystem = signal<string>('');
    protected readonly selectedRole = signal<string>('');
    protected readonly assignedSystemProfiles = signal<AssignedSystemProfile[]>([]);
    protected readonly detailRoleOptionsBySystem = signal<Record<string, readonly SiauSelectOption[]>>({});

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
    protected readonly commissionDependencyOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly commissionDecentralizedBodyOptions = signal<readonly SiauSelectOption[]>([]);
    protected readonly commissionAdministrativeUnitOptions = signal<readonly SiauSelectOption[]>([]);

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

    protected readonly emailRequired = computed(() => true);
    protected readonly phoneRequired = computed(() => true);

    protected readonly hasAssignedSiauProfile = computed(() =>
        this.assignedSystemProfiles().some((profile) =>
            this.isSiauSystem(profile.system, profile.systemLabel),
        ),
    );

    protected readonly availableRoleOptions = computed<readonly SiauSelectOption[]>(() => {
        const system = this.selectedSystem();

        if (!system) {
            return [];
        }

        const catalogRoleOptions = this.roleOptions();
        const sourceOptions = catalogRoleOptions.length > 0
            ? catalogRoleOptions
            : this.findDetailRoleOptionsForSystem(system);

        return sourceOptions.filter(
            (option) => this.isSiauSystem(system) || !this.isRoleAlreadyAssigned(system, option),
        );
    });

    protected readonly canAddSelectedProfile = computed(() => {
        const system = this.selectedSystem();
        const role = this.selectedRole();

        if (!system || !role) {
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

    protected readonly stepOrder = computed<readonly WizardStepId[]>(() => ALL_WIZARD_STEPS);

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

    protected readonly rfcRequired = computed(() => Boolean(this.rfcPrefix()));

    protected readonly rfcHint = computed(() => {
        const prefix = this.rfcPrefix();

        return prefix
            ? `Los primeros 10 caracteres (${prefix}) se generan desde la CURP. Captura sólo los 3 de la homoclave.`
            : 'Captura la CURP para generar automáticamente los primeros 10 caracteres.';
    });

    protected readonly isFormDisabled = computed(() =>
        this.isEditMode() && (this.readonlyMode() || !this.editEnabled()),
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

    protected readonly curpValidationSummaryForPersonalStep = computed(() => {
        if (this.activeStepId() !== 'personal-data') {
            return null;
        }

        return this.curpValidationSummary();
    });

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
            return this.form().expressCreation
                ? 'Creación express activa: captura los datos mínimos y justifica el alta'
                : 'Complete todas las secciones requeridas para crear el acceso';
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

            if (!isOpen) {
                this.hydrationKey = '';
                return;
            }

            const userKey = user?.userId ?? user?.username ?? 'sin-usuario';
            const detailKey = detail ? 'con-detalle' : 'sin-detalle';
            const nextHydrationKey = `${mode}-${userKey}-${detailKey}-${catalogosReady}`;

            if (this.hydrationKey === nextHydrationKey) {
                return;
            }

            this.hydrationKey = nextHydrationKey;

            untracked(() => {
                if (mode === 'edit') {
                    this.draftPersistenceEnabled.set(false);
                    this.hydrateEditForm(detail?.datos ?? {}, user);
                    return;
                }

                this.resetWizard();
                this.restoreRegistrationDraft();
                this.editEnabled.set(true);
                this.draftPersistenceEnabled.set(true);
                this.ensureDefaultSiauProfile();
            });
        });

        effect(() => {
            const shouldPersist =
                this.open() &&
                this.mode() === 'create' &&
                this.draftPersistenceEnabled() &&
                !this.isSubmitting();

            if (!shouldPersist) {
                return;
            }

            const form = this.form();
            const profiles = this.assignedSystemProfiles();
            const activeStepId = this.activeStepId();
            const completedSteps = this.completedSteps();

            untracked(() => {
                if (!this.hasRegistrationDraftContent(form, profiles)) {
                    this.draftStorage.clear();
                    return;
                }

                this.draftStorage.save({
                    form,
                    profiles,
                    activeStepId,
                    completedSteps,
                });
            });
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

        this.markCompleted(current);

        if (currentIndex < stepOrder.length - 1) {
            this.activeStepId.set(stepOrder[currentIndex + 1]);
        }
    }

    protected previousStep(): void {
        const currentIndex = this.activeIndex();
        const stepOrder = this.stepOrder();

        if (currentIndex > 0) {
            this.activeStepId.set(stepOrder[currentIndex - 1]);
        }
    }

    protected closeWizard(): void {
        if (this.isSubmitting()) {
            return;
        }

        this.closed.emit();
        this.resetWizard();
    }

    protected closeSaveSuccessModal(): void {
        if (!this.isEditMode()) {
            this.draftStorage.clear();
        }
        this.saveSuccess.set(null);
        this.closed.emit();
        this.resetWizard();
    }

    protected discardRecoveredDraft(): void {
        if (this.isEditMode()) {
            return;
        }

        this.draftStorage.clear();
        this.resetWizard();
        this.draftPersistenceEnabled.set(true);
        this.ensureDefaultSiauProfile();
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
                        this.saveSuccess.set(this.buildSaveSuccessModalState(response, false));
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

        const isExpress = this.form().expressCreation;
        let saveRequest$: Observable<RegistroAdminResponse | RegistroEspecialResponse>;

        try {
            saveRequest$ = isExpress
                ? this.usersFacade.createSpecialUser(this.buildCreateSpecialUserRequest())
                : this.usersFacade.createAdminUser(this.buildCreateUserRequest());
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
                    this.sendAccessCredentialsEmail(response, isExpress).pipe(
                        map((emailDelivery) => ({ response, emailDelivery })),
                        catchError((error: unknown) =>
                            of({
                                response,
                                emailDelivery: this.toFailedEmailDelivery(error),
                            }),
                        ),
                    ),
                ),
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isSubmitting.set(false)),
            )
            .subscribe({
                next: ({ response, emailDelivery }) => {
                    this.stepOrder().forEach((stepId) => this.markCompleted(stepId));
                    this.draftStorage.clear();
                    this.saveSuccess.set(
                        this.buildSaveSuccessModalState(response, isExpress, emailDelivery),
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

        this.form.update((current) => ({
            ...current,
            [key]: normalizedValue,
        }));

        if (key === 'email' || key === 'phone') {
            this.clearFieldError('email');
            this.clearFieldError('phone');
            return;
        }

        this.clearFieldError(String(key));
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

    protected toggleExpressCreation(checked: boolean): void {
        if (this.isFormDisabled() || this.isSubmitting() || this.isEditMode()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            expressCreation: checked,
        }));

        if (!checked && this.activeStepId() === 'account') {
            this.activeStepId.set('profiles');
        }

        this.formErrors.set({});
    }

    protected toggleCommissionSection(checked: boolean): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (checked && !this.canConfigureCommission()) {
            this.formErrors.update((current) => ({
                ...current,
                commissionInstitutionType:
                    'Primero registra una adscripción válida antes de capturar la comisión.',
            }));
            return;
        }

        this.form.update((current) => ({
            ...current,
            commissionEnabled: checked,
            commissionInstitutionType: checked ? current.commissionInstitutionType : '',
            commissionInstitution: checked ? current.commissionInstitution : '',
            commissionEntity: checked ? current.commissionEntity : '',
            commissionMunicipality: checked ? current.commissionMunicipality : '',
            commissionDependency: checked ? current.commissionDependency : '',
            commissionDecentralizedBody: checked ? current.commissionDecentralizedBody : '',
            commissionAdministrativeUnit: checked ? current.commissionAdministrativeUnit : '',
            commissionAdmissionDate: checked ? current.commissionAdmissionDate : '',
        }));

        if (!checked) {
            this.commissionMunicipalityOptions.set([]);
            this.commissionInstitutionOptions.set([]);
            this.commissionDependencyOptions.set([]);
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
                'commissionAdmissionDate',
            ].forEach((key) => delete next[key]);

            return next;
        });
    }

    protected updateAssignmentInstitutionType(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        const institutionType = value ?? '';
        const requiresEntity = this.requiresEntityForInstitution(institutionType);

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
        }

        this.institutionOptions.set([]);
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        this.loadAssignmentInstitutions();
    }

    protected updateAssignmentEntity(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (!this.assignmentRequiresEntity()) {
            this.form.update((current) => ({
                ...current,
                entity: '',
                municipality: '',
            }));
            this.municipalityOptions.set([]);
            this.loadAssignmentInstitutions();
            return;
        }

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
            this.loadMunicipalities(value, this.municipalityOptions);
        }
        this.loadAssignmentInstitutions();
    }

    protected updateAssignmentMunicipality(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (!this.assignmentRequiresMunicipality()) {
            this.form.update((current) => ({ ...current, municipality: '' }));
            return;
        }

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
    }

    protected updateAssignmentInstitution(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        const institution = value ?? '';
        this.clearAssignedProfilesAfterInstitutionChange(
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
        this.loadAssignmentChildren(value, this.decentralizedBodyOptions);
    }

    protected updateAssignmentDecentralizedBody(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            decentralizedBody: value ?? '',
            administrativeUnit: '',
        }));
        this.administrativeUnitOptions.set([]);
        this.loadAssignmentChildren(value, this.administrativeUnitOptions);
    }

    protected updateCommissionInstitutionType(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        const commissionInstitutionType = value ?? '';
        const requiresEntity = this.requiresEntityForInstitution(commissionInstitutionType);

        this.form.update((current) => ({
            ...current,
            commissionInstitutionType,
            commissionEntity: requiresEntity ? current.commissionEntity : '',
            commissionMunicipality: '',
            commissionInstitution: '',
            commissionDependency: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));

        if (!this.requiresMunicipalityForInstitution(commissionInstitutionType)) {
            this.commissionMunicipalityOptions.set([]);
        }

        this.commissionInstitutionOptions.set([]);
        this.commissionDependencyOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionInstitutions();
    }

    protected updateCommissionEntity(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (!this.commissionRequiresEntity()) {
            this.form.update((current) => ({
                ...current,
                commissionEntity: '',
                commissionMunicipality: '',
            }));
            this.commissionMunicipalityOptions.set([]);
            this.loadCommissionInstitutions();
            return;
        }

        this.form.update((current) => ({
            ...current,
            commissionEntity: value ?? '',
            commissionMunicipality: '',
            commissionInstitution: '',
            commissionDependency: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionMunicipalityOptions.set([]);
        this.commissionInstitutionOptions.set([]);
        this.commissionDependencyOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        if (this.commissionRequiresMunicipality()) {
            this.loadMunicipalities(value, this.commissionMunicipalityOptions);
        }
        this.loadCommissionInstitutions();
    }

    protected updateCommissionMunicipality(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (!this.commissionRequiresMunicipality()) {
            this.form.update((current) => ({ ...current, commissionMunicipality: '' }));
            return;
        }

        this.form.update((current) => ({
            ...current,
            commissionMunicipality: value ?? '',
            commissionInstitution: '',
            commissionDependency: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionInstitutionOptions.set([]);
        this.commissionDependencyOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionInstitutions();
    }

    protected updateCommissionInstitution(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        const commissionInstitution = value ?? '';
        this.clearAssignedProfilesAfterInstitutionChange(
            this.form().commissionInstitution,
            commissionInstitution,
        );

        this.form.update((current) => ({
            ...current,
            commissionInstitution,
            commissionDependency: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionDependencyOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionChildren(value, this.commissionDependencyOptions);
        this.loadCommissionChildren(value, this.commissionDecentralizedBodyOptions);
    }

    protected updateCommissionDependency(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            commissionDependency: value ?? '',
        }));
    }

    protected updateCommissionDecentralizedBody(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            commissionDecentralizedBody: value ?? '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionChildren(
            value,
            this.commissionAdministrativeUnitOptions,
        );
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

        if (!this.canAssignProfiles()) {
            this.formErrors.update((current) => ({
                ...current,
                profiles:
                    'Registra una adscripción o una comisión válida antes de asignar perfiles.',
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
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (!this.canAssignProfiles()) {
            this.formErrors.update((current) => ({
                ...current,
                profiles:
                    'Registra una adscripción o una comisión válida antes de asignar perfiles.',
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

        if (!this.isSiauSystem(system) && this.isRoleAlreadyAssigned(system, roleOption)) {
            return;
        }

        const newItem: AssignedSystemProfile = {
            id: `${system}-${role}-${Date.now()}`,
            system,
            role,
            systemLabel: systemOption.label,
            roleLabel: roleOption.label,
        };

        this.assignedSystemProfiles.update((current) => {
            if (!this.isSiauSystem(system, systemOption.label)) {
                return [...current, newItem];
            }

            // HU07: SIAU siempre conserva un único perfil. Al seleccionar otro,
            // se sustituye el perfil "Usuario" (o el SIAU existente) sin pedir
            // que el administrador lo elimine manualmente.
            return [
                ...current.filter((profile) =>
                    !this.isSiauSystem(profile.system, profile.systemLabel),
                ),
                newItem,
            ];
        });
        this.clearFieldError('profiles');
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);
    }

    protected removeAssignedProfile(id: string): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        const profile = this.assignedSystemProfiles().find((item) => item.id === id);

        if (!profile || !this.canRemoveAssignedProfile(profile)) {
            return;
        }

        this.assignedSystemProfiles.update((current) => current.filter((item) => item.id !== id));
    }

    protected canRemoveAssignedProfile(profile: AssignedSystemProfile): boolean {
        if (!this.isSiauSystem(profile.system, profile.systemLabel)) {
            return true;
        }

        const assignedToSiau = this.assignedSystemProfiles().filter((item) =>
            this.isSiauSystem(item.system, item.systemLabel),
        );

        // El perfil base de SIAU no puede quedar eliminado si es el único que
        // mantiene el usuario para dicho sistema.
        return assignedToSiau.length > 1;
    }

    private clearAssignedProfilesAfterInstitutionChange(
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
    ): void {
        const previousValue = String(previousInstitution ?? '').trim();
        const nextValue = String(nextInstitution ?? '').trim();

        if (!previousValue || previousValue === nextValue) {
            return;
        }

        const hasAssignedProfiles =
            this.assignedSystemProfiles().length > 0 || this.form().profiles.length > 0;

        if (!hasAssignedProfiles) {
            return;
        }

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

        this.formErrors.update((current) => ({
            ...current,
            profiles:
                'La institución cambió. Debes volver a seleccionar los sistemas y perfiles del usuario.',
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
        switch (status) {
            case 'active':
                return 'Activo';
            case 'inactive':
                return 'Inactivo';
            case 'approved':
                return 'Aprobado';
            case 'rejected':
                return 'Reprobado';
            default:
                return 'Sin información';
        }
    }

    protected getCurpValidationStatusClass(status: CurpValidationStatus): string {
        const tone = status === 'active' || status === 'approved'
            ? 'success'
            : status === 'inactive' || status === 'rejected'
                ? 'danger'
                : 'neutral';

        return `registration-wizard__curp-validation-pill registration-wizard__curp-validation-pill--${tone}`;
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

        this.loadHardcodedCurpValidationSummary(normalizedCurp);
        this.curpUnlockChecked.set(false);
        this.curpLocked.set(false);
        this.renapoLookupStatus.set('loading');
        this.renapoMessage.set('Espera un momento mientras validamos la identidad.');

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
                        this.renapoMessage.set(
                            response.mensaje ||
                            'Los datos personales fueron llenados con la información de RENAPO.',
                        );
                        return;
                    }

                    this.renapoLookupStatus.set('not-found');
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

    private resetRenapoLookupState(): void {
        this.curpLookupSequence += 1;
        this.lastRenapoCurp = '';
        this.renapoLookupStatus.set('idle');
        this.renapoMessage.set('');
        this.curpLocked.set(false);
        this.curpUnlockChecked.set(false);
        this.clearCurpValidationSummary();
    }

    private loadHardcodedCurpValidationSummary(curp: string): void {
        if (!this.isValidCurp(curp)) {
            this.clearCurpValidationSummary();
            return;
        }

        this.curpValidationSummary.set({ ...HARDCODED_CURP_VALIDATION_SUMMARY });
    }

    private clearCurpValidationSummary(): void {
        this.curpValidationSummary.set(null);
    }

    private buildSaveSuccessModalState(
        response: RegistroAdminResponse | RegistroEspecialResponse,
        isExpress: boolean,
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
            isExpress,
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
        response: RegistroAdminResponse | RegistroEspecialResponse,
        isExpress: boolean,
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
                isExpress,
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
        const isExpress = current.expressCreation;
        const assignedProfile = this.assignedSystemProfiles()[0] ?? null;

        if (!assignedProfile) {
            throw new Error('Selecciona al menos un sistema y perfil.');
        }

        return {
            datosPersonales: {
                cuip: this.toNullableText(current.cuip),
                curp: this.requireText(current.curp, 'Captura la CURP.').toUpperCase(),
                rfc: this.toNullableText(current.rfc)?.toUpperCase() ?? null,
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
            cuenta: this.buildAccountRequest(assignedProfile),
            comentario: isExpress
                ? this.requireText(
                    current.expressJustification,
                    'Captura la justificación de la creación express.',
                )
                : this.toText(current.expressJustification),
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

            nuevaCuenta: null,

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

    private buildCreateSpecialUserRequest(): RegistroEspecialRequest {
        const current = this.form();
        const assignedProfile = this.assignedSystemProfiles()[0] ?? null;

        if (!assignedProfile) {
            throw new Error('Selecciona al menos un sistema y perfil.');
        }

        return {
            datosPersonales: {
                nombres: this.requireText(current.firstName, 'Captura el nombre.').toUpperCase(),
                primerApellido: this.requireText(current.lastName, 'Captura el primer apellido.').toUpperCase(),
                sexoId: this.requireCatalogId(current.gender, 'Selecciona el sexo.'),
                cuip: this.toNullableText(current.cuip),
                curp: this.toNullableText(current.curp)?.toUpperCase() ?? null,
                rfc: this.toNullableText(current.rfc)?.toUpperCase() ?? null,
                segundoApellido: this.toNullableText(current.secondLastName)?.toUpperCase() ?? null,
                fechaNacimiento: this.toNullableText(current.birthDate),
                estadoCivilId: this.toCatalogId(current.civilStatus) ?? null,
            },
            adscripcion: {
                estructuraId: this.resolveAssignmentStructureId(),
            },
            comision: this.buildSpecialCommissionRequest(),
            medioContacto: this.buildContactRequest(),
            cuenta: this.buildAccountRequest(assignedProfile),
            comentario: this.requireText(
                current.expressJustification,
                'Captura la justificación de la creación express.',
            ),
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-especial-${Date.now()}`,
            },
        };
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
            fechaInicio: this.toNullableText(current.commissionAdmissionDate),
        };
    }

    private buildAccountRequest(assignedProfile: AssignedSystemProfile): RegistroCuenta {
        const password = this.toText(this.form().password) || DEFAULT_ACCOUNT_PASSWORD;

        return {
            password,
            passwordHash: DEFAULT_ACCOUNT_PASSWORD_HASH,
            tipoUsuarioId: this.resolveDefaultCatalogId(this.userTypeOptions(), 1),
            sistemaId: this.resolveAssignedSystemId(assignedProfile),
            perfilId: this.requireCatalogId(
                assignedProfile.role,
                'Selecciona un perfil válido.',
            ),
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

    private buildSpecialCommissionRequest(): { readonly estructuraId: number } | null {
        const current = this.form();

        if (!current.commissionEnabled) {
            return null;
        }

        return {
            estructuraId: this.resolveCommissionStructureId(),
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
                current.commissionDependency,
                current.commissionInstitution,
            ],
            'Selecciona la institución, dependencia, órgano o unidad de comisión.',
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
        const option = this.systemOptions().find(
            (item) =>
                item.value === profile.system ||
                this.normalizeText(item.label) === this.normalizeText(profile.systemLabel) ||
                this.normalizeText(item.value) === this.normalizeText(profile.system),
        );

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
            this.hasText(this.firstValue(commission, ['organoDesconcentrado', 'desconcentrado', 'decentralizedBody'])) ||
            this.hasText(this.firstValue(commission, ['unidadAdministrativa', 'administrativeUnit'])) ||
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
            decentralizedBody: this.resolveRecordSelectValue(
                assignment,
                ['organoDesconcentradoId', 'desconcentradoId', 'idOrganoDesconcentrado'],
                ['organoDesconcentrado', 'desconcentrado', 'decentralizedBody'],
                this.decentralizedBodyOptions,
            ),
            administrativeUnit: this.resolveRecordSelectValue(
                assignment,
                ['unidadAdministrativaId', 'administrativeUnitId', 'idUnidadAdministrativa'],
                ['unidadAdministrativa', 'administrativeUnit'],
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
            commissionDependency: this.resolveRecordSelectValue(
                commission,
                ['dependenciaId', 'idDependencia'],
                ['dependencia', 'dependenciaNombre'],
                this.commissionDependencyOptions,
            ),
            commissionDecentralizedBody: this.resolveRecordSelectValue(
                commission,
                ['organoDesconcentradoId', 'desconcentradoId', 'idOrganoDesconcentrado'],
                ['organoDesconcentrado', 'desconcentrado', 'decentralizedBody'],
                this.commissionDecentralizedBodyOptions,
            ),
            commissionAdministrativeUnit: this.resolveRecordSelectValue(
                commission,
                ['unidadAdministrativaId', 'administrativeUnitId', 'idUnidadAdministrativa'],
                ['unidadAdministrativa', 'administrativeUnit'],
                this.commissionAdministrativeUnitOptions,
            ),
            commissionAdmissionDate: this.toDateInputValue(this.firstValue(commission, ['fechaInicio', 'fechaIngreso'])),

            email: this.resolveHydratedEmail(contact, datos, user),
            phone: this.toText(this.firstValue(contact, ['celular', 'telefono', 'phone']))
                .replace(/\D/g, '')
                .slice(0, 10),
            extension: this.toText(this.firstValue(contact, ['extension'])),

            profiles: [],

            username: this.toText(datos['cuenta']) || user?.username || '',
            password: '',
            confirmPassword: '',
            accountStatus: this.toAccountStatus(this.firstText([datos['estatus'], datos['estatusClave'], user?.status])),
            expressCreation: false,
            expressJustification: this.toText(datos['comentario']),
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
                    this.firstValue(record, ['sistema', 'sistemaClave', 'nombreSistema', 'sistemaNombre']),
                );

                const rawSystemId = this.toText(
                    this.firstValue(record, ['sistemaId', 'idSistema']),
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
                    ]),
                );

                const rawRoleId = this.toText(
                    this.firstValue(record, ['perfilId', 'rolId', 'idPerfil']),
                ); const systemOption =
                    this.systemOptions().find((option) =>
                        this.normalizeText(option.label) === this.normalizeText(rawSystemLabel) ||
                        this.normalizeText(option.value) === this.normalizeText(rawSystemLabel) ||
                        option.value === rawSystemId,
                    ) ?? null;

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

            const systemOption = this.systemOptions().find(
                (option) =>
                    option.value === profile.system ||
                    this.normalizeText(option.label) === this.normalizeText(profile.systemLabel) ||
                    this.normalizeText(option.value) === this.normalizeText(profile.systemLabel),
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

        const systemOption = this.systemOptions().find(
            (option) =>
                option.value === cleanSystem ||
                this.normalizeText(option.value) === this.normalizeText(cleanSystem) ||
                this.normalizeText(option.label) === this.normalizeText(cleanSystem),
        );

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

    private isSiauSystem(systemValue: string, systemLabel = ''): boolean {
        const cleanValue = this.toText(systemValue);
        const option = this.systemOptions().find(
            (item) =>
                item.value === cleanValue ||
                this.normalizeText(item.value) === this.normalizeText(cleanValue) ||
                this.normalizeText(item.label) === this.normalizeText(cleanValue),
        );
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
        const systemOption = this.systemOptions().find(
            (option) =>
                option.value === system ||
                this.normalizeText(option.value) === this.normalizeText(system) ||
                this.normalizeText(option.label) === this.normalizeText(system),
        );

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

    private markCompleted(stepId: WizardStepId): void {
        this.completedSteps.update((current) => {
            if (current.includes(stepId)) {
                return current;
            }

            return [...current, stepId];
        });
    }

    private resetWizard(): void {
        this.draftPersistenceEnabled.set(false);
        this.resetRenapoLookupState();
        this.initialIdentitySnapshot = null;
        this.initialEditFormSnapshot = null;
        this.initialAssignedProfiles = [];
        this.activeStepId.set('personal-data');
        this.completedSteps.set([]);
        this.editEnabled.set(true);
        this.form.set({ ...INITIAL_FORM, profiles: [] });
        this.isSubmitting.set(false);
        this.formErrors.set({});
        this.saveSuccess.set(null);
        this.recoveredDraftAt.set(null);
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);
        this.assignedSystemProfiles.set([]);
        this.detailRoleOptionsBySystem.set({});
        this.showPassword.set(false);
        this.showConfirmPassword.set(false);
        this.municipalityOptions.set([]);
        this.institutionOptions.set([]);
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        this.commissionMunicipalityOptions.set([]);
        this.commissionInstitutionOptions.set([]);
        this.commissionDependencyOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
    }

    private restoreRegistrationDraft(): void {
        const draft = this.draftStorage.load<UserRegistrationForm, AssignedSystemProfile>();

        if (!draft) {
            return;
        }

        const form = this.toRegistrationDraftForm(draft.form);
        const profiles = this.toRegistrationDraftProfiles(draft.profiles);
        const stepOrder = this.stepOrder();
        const activeStepId = this.isWizardStep(draft.activeStepId) && stepOrder.includes(draft.activeStepId)
            ? draft.activeStepId
            : 'personal-data';
        const completedSteps = draft.completedSteps.filter(
            (stepId): stepId is WizardStepId =>
                this.isWizardStep(stepId) && stepOrder.includes(stepId as WizardStepId),
        );

        this.form.set(form);
        this.assignedSystemProfiles.set(profiles);
        this.activeStepId.set(activeStepId);
        this.completedSteps.set(completedSteps);
        this.recoveredDraftAt.set(draft.savedAt);
        this.loadHydratedAssignmentCatalogs(form);
    }

    private hasRegistrationDraftContent(
        form: UserRegistrationForm,
        profiles: readonly AssignedSystemProfile[],
    ): boolean {
        const hasNonDefaultProfile = profiles.some(
            (profile) =>
                !(
                    this.isSiauSystem(profile.system, profile.systemLabel) &&
                    this.isDefaultSiauRole(profile.role, profile.roleLabel)
                ),
        );

        return hasNonDefaultProfile || Object.entries(form).some(([key, value]) => {
            if (key === 'profiles' || key === 'password' || key === 'confirmPassword') {
                return false;
            }

            return typeof value === 'boolean' ? value : this.hasText(value);
        });
    }

    private toRegistrationDraftForm(value: UserRegistrationForm): UserRegistrationForm {
        return {
            ...INITIAL_FORM,
            ...value,
            profiles: [],
            password: '',
            confirmPassword: '',
            commissionEnabled: Boolean(value?.commissionEnabled),
            expressCreation: Boolean(value?.expressCreation),
            accountStatus: this.toAccountStatus(this.toText(value?.accountStatus)),
        };
    }

    private toRegistrationDraftProfiles(value: readonly AssignedSystemProfile[]): AssignedSystemProfile[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((profile, index) => ({
                id: this.toText(profile?.id) || `draft-profile-${index}`,
                system: this.toText(profile?.system),
                systemLabel: this.toText(profile?.systemLabel),
                role: this.toText(profile?.role),
                roleLabel: this.toText(profile?.roleLabel),
            }))
            .filter((profile) => Boolean(profile.system && profile.role));
    }

    private loadHydratedAssignmentCatalogs(form: UserRegistrationForm): void {
        if (this.requiresMunicipalityForInstitution(form.institutionType) && form.entity) {
            this.loadMunicipalities(form.entity, this.municipalityOptions);
        }

        if (form.institutionType) {
            this.loadAssignmentInstitutions();
        }

        if (form.institution) {
            this.loadAssignmentChildren(form.institution, this.decentralizedBodyOptions);
        }

        if (form.decentralizedBody) {
            this.loadAssignmentChildren(form.decentralizedBody, this.administrativeUnitOptions);
        }

        if (!form.commissionEnabled) {
            return;
        }

        if (this.requiresMunicipalityForInstitution(form.commissionInstitutionType) && form.commissionEntity) {
            this.loadMunicipalities(form.commissionEntity, this.commissionMunicipalityOptions);
        }

        if (form.commissionInstitutionType) {
            this.loadCommissionInstitutions();
        }

        if (form.commissionInstitution) {
            this.loadCommissionChildren(form.commissionInstitution, this.commissionDependencyOptions);
            this.loadCommissionChildren(form.commissionInstitution, this.commissionDecentralizedBodyOptions);
        }

        if (form.commissionDecentralizedBody) {
            this.loadCommissionChildren(
                form.commissionDecentralizedBody,
                this.commissionAdministrativeUnitOptions,
            );
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
                    this.systemOptions.set(catalogos.sistemas);
                    this.roleOptions.set([]);
                    this.institutionTypeOptions.update((current) =>
                        this.mergeSelectOptions(current, catalogos.tiposInstitucion),
                    );
                    this.stateOptions.update((current) =>
                        this.mergeSelectOptions(current, catalogos.estados),
                    );
                    this.catalogosReady.set(true);
                    this.ensureDefaultSiauProfile();
                },
                error: (error: unknown) => {
                    this.catalogosReady.set(true);
                    console.error('Error cargando catálogos del usuario.', error);
                },
            });
    }

    private loadProfileOptionsForSystem(systemValue: string): void {
        const sistema = this.resolveSistemaPerfilesQueryValue(systemValue);

        if (!sistema) {
            this.roleOptions.set([]);
            return;
        }

        this.catalogosFacade
            .obtenerSistemaPerfilesOptions(sistema)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    if (this.selectedSystem() !== systemValue) {
                        return;
                    }

                    this.roleOptions.set(options);
                },
                error: (error: unknown) => {
                    if (this.selectedSystem() === systemValue) {
                        this.roleOptions.set(this.findDetailRoleOptionsForSystem(systemValue));
                    }

                    console.error('Error cargando perfiles del sistema.', error);
                },
            });
    }

    private resolveSistemaPerfilesQueryValue(systemValue: string): string {
        const cleanSystem = this.toText(systemValue);

        if (!cleanSystem) {
            return '';
        }

        const systemOption = this.systemOptions().find(
            (option) =>
                option.value === cleanSystem ||
                this.normalizeText(option.value) === this.normalizeText(cleanSystem) ||
                this.normalizeText(option.label) === this.normalizeText(cleanSystem),
        );

        return this.toText(systemOption?.value) || this.toText(systemOption?.label) || cleanSystem;
    }

    private loadMunicipalities(
        stateValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): void {
        const estadoId = this.toCatalogId(stateValue);

        if (!estadoId) {
            target.set([]);
            return;
        }

        this.catalogosFacade
            .obtenerMunicipiosOptions(estadoId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => target.set(this.mergeSelectOptions(options, target())),
                error: (error: unknown) => {
                    console.error('Error cargando municipios.', error);
                },
            });
    }

    private loadAssignmentInstitutions(): void {
        const current = this.form();
        const tipoInstitucionId = this.toCatalogId(current.institutionType);
        const estadoId = !this.requiresEntityForInstitution(current.institutionType)
            ? undefined
            : this.toCatalogId(current.entity);
        const municipioId = !this.requiresMunicipalityForInstitution(current.institutionType)
            ? undefined
            : this.toCatalogId(current.municipality);

        if (!tipoInstitucionId && !estadoId && !municipioId) {
            this.institutionOptions.set([]);
            return;
        }

        this.loadOrgOptions(this.institutionOptions, {
            tipoInstitucionId,
            estadoId,
            municipioId,
        });
    }

    private loadAssignmentChildren(
        parentValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): void {
        const padreId = this.toCatalogId(parentValue);
        const current = this.form();

        if (!padreId) {
            target.set([]);
            return;
        }

        this.loadOrgOptions(target, {
            tipoInstitucionId: this.toCatalogId(current.institutionType),
            estadoId: !this.requiresEntityForInstitution(current.institutionType)
                ? undefined
                : this.toCatalogId(current.entity),
            municipioId: !this.requiresMunicipalityForInstitution(current.institutionType)
                ? undefined
                : this.toCatalogId(current.municipality),
            padreId,
        });
    }

    private loadCommissionInstitutions(): void {
        const current = this.form();
        const tipoInstitucionId = this.toCatalogId(current.commissionInstitutionType);
        const estadoId = !this.requiresEntityForInstitution(current.commissionInstitutionType)
            ? undefined
            : this.toCatalogId(current.commissionEntity);
        const municipioId = !this.requiresMunicipalityForInstitution(current.commissionInstitutionType)
            ? undefined
            : this.toCatalogId(current.commissionMunicipality);

        if (!tipoInstitucionId && !estadoId && !municipioId) {
            this.commissionInstitutionOptions.set([]);
            return;
        }

        this.loadOrgOptions(this.commissionInstitutionOptions, {
            tipoInstitucionId,
            estadoId,
            municipioId,
        });
    }

    private loadCommissionChildren(
        parentValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): void {
        const padreId = this.toCatalogId(parentValue);
        const current = this.form();

        if (!padreId) {
            target.set([]);
            return;
        }

        this.loadOrgOptions(target, {
            tipoInstitucionId: this.toCatalogId(current.commissionInstitutionType),
            estadoId: !this.requiresEntityForInstitution(current.commissionInstitutionType)
                ? undefined
                : this.toCatalogId(current.commissionEntity),
            municipioId: !this.requiresMunicipalityForInstitution(current.commissionInstitutionType)
                ? undefined
                : this.toCatalogId(current.commissionMunicipality),
            padreId,
        });
    }

    private loadOrgOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        query: {
            tipoInstitucionId?: number;
            estadoId?: number;
            municipioId?: number;
            padreId?: number;
        },
    ): void {
        this.catalogosFacade
            .obtenerEstructuraOrgOptions({
                ...query,
                soloActivos: 1,
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => target.set(this.mergeSelectOptions(options, target())),
                error: (error: unknown) => {
                    console.error('Error cargando estructura orgánica.', error);
                },
            });
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
            this.defaultSiauProfileLoading ||
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

        this.defaultSiauProfileLoading = true;
        const system = systemOption.value || systemOption.label;

        this.catalogosFacade
            .obtenerSistemaPerfilesOptions(this.resolveSistemaPerfilesQueryValue(system))
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => {
                    this.defaultSiauProfileLoading = false;
                }),
            )
            .subscribe({
                next: (options) => {
                    if (
                        !this.open() ||
                        this.mode() !== 'create' ||
                        this.assignedSystemProfiles().some((profile) =>
                            this.isSiauSystem(profile.system, profile.systemLabel),
                        )
                    ) {
                        return;
                    }

                    const userRole = options.find((option) =>
                        this.normalizeText(option.label) === 'usuario' ||
                        this.normalizeText(option.value) === 'usuario',
                    );

                    if (!userRole) {
                        console.warn('No se localizó el perfil base "Usuario" para SIAU.');
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
                },
                error: (error: unknown) => {
                    console.error('No fue posible cargar el perfil base de SIAU.', error);
                },
            });
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
        const isExpress = current.expressCreation;
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

                if (
                    this.shouldValidateEditFields(
                        current,
                        ['commissionAdmissionDate', 'admissionDate'],
                    ) &&
                    this.hasText(current.commissionAdmissionDate) &&
                    !this.isCommissionStartDateValid(
                        current.commissionAdmissionDate,
                        current.admissionDate,
                    )
                ) {
                    nextErrors['commissionAdmissionDate'] =
                        'La fecha de inicio de comisión debe ser válida, no posterior a hoy y no anterior a la fecha de ingreso.';
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
            if (this.shouldValidateAssignedProfiles() && this.assignedSystemProfiles().length === 0) {
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

        if (stepId === 'account' && !this.isEditMode()) {
            if (isExpress && !this.hasText(current.expressJustification)) {
                nextErrors['expressJustification'] = 'Justifica por qué se realizará la creación express.';
            }

            if (
                this.hasText(current.password) &&
                this.hasText(current.confirmPassword) &&
                current.password !== current.confirmPassword
            ) {
                nextErrors['confirmPassword'] = 'Las contraseñas no coinciden.';
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
        const identityDocumentsAreOptional = !this.isEditMode() && current.expressCreation;
        const hasCurp = this.hasText(current.curp);
        const hasRfc = this.hasText(current.rfc);
        const hasBirthDate = this.hasText(current.birthDate);
        let validCurp = false;
        let validRfc = false;

        if (!hasCurp && !identityDocumentsAreOptional) {
            errors['curp'] = 'La CURP es obligatoria.';
        } else if (!this.isValidCurp(current.curp)) {
            if (hasCurp) {
                errors['curp'] = 'La CURP no tiene un formato o una fecha válidos.';
            }
        } else {
            validCurp = true;
        }

        if (hasRfc && !this.isValidRfc(current.rfc)) {
            errors['rfc'] = 'El RFC no tiene un formato válido.';
        } else {
            validRfc = hasRfc;
        }

        if (!hasBirthDate && !identityDocumentsAreOptional) {
            errors['birthDate'] = 'La fecha de nacimiento es obligatoria.';
        } else if (hasBirthDate && !this.isValidDateInput(current.birthDate)) {
            errors['birthDate'] = 'La fecha de nacimiento no es válida.';
        } else if (hasBirthDate && !this.isDateOnOrBeforeToday(current.birthDate)) {
            errors['birthDate'] = 'La fecha de nacimiento no puede ser posterior a la fecha actual.';
        } else if (hasBirthDate && !this.isAdult(current.birthDate)) {
            errors['birthDate'] = 'El usuario debe ser mayor de edad.';
        }

        if (validCurp && validRfc && !this.rfcMatchesCurp(current.rfc, current.curp)) {
            errors['rfc'] = 'Los primeros 10 caracteres del RFC deben coincidir con la CURP.';
        }

        if (validRfc && hasBirthDate && !this.rfcBirthDateMatchesDate(current.rfc, current.birthDate)) {
            errors['rfc'] = 'La fecha contenida en el RFC debe coincidir con la fecha de nacimiento.';
        }

        const curpBirthDate = validCurp ? this.getBirthDateFromCurp(current.curp) : null;

        if (curpBirthDate && !this.isAdult(curpBirthDate)) {
            errors['curp'] =
                'La fecha de nacimiento contenida en la CURP corresponde a una persona menor de edad.';
        }

        if (curpBirthDate && hasBirthDate && current.birthDate !== curpBirthDate) {
            errors['birthDate'] =
                'La fecha de nacimiento debe coincidir con la fecha registrada en la CURP.';
        }
    }

    private addPersonalFieldValidationErrors(
        current: UserRegistrationForm,
        errors: Record<string, string>,
    ): void {
        if (
            this.shouldValidateEditFields(current, ['cuip']) &&
            this.hasText(current.cuip) &&
            !/^[A-Z0-9]{20}$/.test(this.toText(current.cuip).toUpperCase())
        ) {
            errors['cuip'] = 'La CUIP debe tener exactamente 20 caracteres alfanuméricos.';
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
            this.hasText(current.position) &&
            !this.isValidTextWithinRange(current.position, 2, 150)
        ) {
            errors['position'] = 'El cargo debe tener entre 2 y 150 caracteres válidos.';
        }

        if (
            this.shouldValidateEditFields(current, ['functions']) &&
            this.hasText(current.functions) &&
            !this.isValidTextWithinRange(current.functions, 5, 500)
        ) {
            errors['functions'] = 'Las funciones deben tener entre 5 y 500 caracteres válidos.';
        }

        if (
            this.shouldValidateEditFields(current, ['employeeNumber']) &&
            this.hasText(current.employeeNumber) &&
            !/^[A-Z0-9\s]{3,20}$/.test(this.toText(current.employeeNumber).toUpperCase())
        ) {
            errors['employeeNumber'] =
                'El número de empleado debe contener de 3 a 20 letras, números o espacios.';
        }
    }

    private hasValidAssignmentForCommission(current: UserRegistrationForm): boolean {
        if (
            !this.hasText(current.institutionType) ||
            !this.hasText(current.institution) ||
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
            /^[A-Z0-9\s]{3,20}$/.test(this.toText(current.employeeNumber).toUpperCase())
        );
    }

    private hasValidCommissionContext(current: UserRegistrationForm): boolean {
        if (
            !current.commissionEnabled ||
            !this.hasText(current.commissionInstitutionType) ||
            !this.hasText(current.commissionInstitution)
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

        return (
            !this.hasText(current.commissionAdmissionDate) ||
            this.isCommissionStartDateValid(current.commissionAdmissionDate, current.admissionDate)
        );
    }

    private hasProfileAssignmentContext(current: UserRegistrationForm): boolean {
        return (
            this.hasValidAssignmentForCommission(current) ||
            this.hasValidCommissionContext(current)
        );
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
                'expressJustification',
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
        if (key === 'expressCreation' || key === 'commissionEnabled') {
            return Boolean(value) as UserRegistrationForm[K];
        }

        const textValue = this.toText(value);

        if (key === 'cuip') {
            return this.normalizeAlphanumericInput(textValue, 20) as UserRegistrationForm[K];
        }

        if (key === 'curp') {
            return this.normalizeAlphanumericInput(textValue, 18) as UserRegistrationForm[K];
        }

        if (this.isNameField(key)) {
            return this.normalizeNameInput(textValue) as UserRegistrationForm[K];
        }

        if (this.shouldUppercaseField(key)) {
            return textValue.toUpperCase() as UserRegistrationForm[K];
        }

        if (key === 'phone') {
            return this.normalizeNumericInput(textValue, 10) as UserRegistrationForm[K];
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
            'position',
            'functions',
            'employeeNumber',
            'username',
            'expressJustification',
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
        const century = /^\d$/.test(curp.charAt(16)) ? 1900 : 2000;
        const birthDate = `${century + shortYear}-${month}-${day}`;

        return this.isValidDateInput(birthDate) ? birthDate : null;
    }

    private isValidRfc(value: string): boolean {
        const rfc = this.toText(value).toUpperCase();

        return /^([A-Z]{3,4})\d{6}[A-Z0-9]{3}$/.test(rfc);
    }

    private isValidEmail(value: string): boolean {
        const email = this.normalizeEmail(value);

        return email.length <= 254 && /^[A-Za-z][A-Za-z0-9._%+-]*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(email);
    }

    private normalizeEmail(value: unknown): string {
        return this.toText(value)
            .normalize('NFKC')
            .replace(/[\u0000-\u001F\u007F-\u009F\u00A0\u200B-\u200D\u2028\u2029\u2060\uFEFF]/g, '')
            .trim();
    }

    private formatPhoneForDisplay(value: unknown): string {
        const digits = this.toText(value).replace(/\D/g, '').slice(0, 10);

        if (digits.length !== 10) {
            return digits;
        }

        return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
    }

    protected maximumBirthDate(): string {
        return this.formatDateInputValue(this.getAdultCutoffDate());
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

    private isValidTextWithinRange(value: string, minimum: number, maximum: number): boolean {
        const text = this.toText(value);

        return (
            text.length >= minimum &&
            text.length <= maximum &&
            /^[A-Z0-9ÁÉÍÓÚÜÑ\s\-.,!#$%&/()=?¿¡+@:;_"]+$/i.test(text)
        );
    }

    private isAdult(dateValue: string): boolean {
        const birthDate = this.parseDateInput(dateValue);

        if (!birthDate) {
            return false;
        }

        return birthDate.getTime() <= this.getAdultCutoffDate().getTime();
    }

    private getAdultCutoffDate(): Date {
        const cutoffDate = new Date();

        cutoffDate.setHours(0, 0, 0, 0);
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 18);

        return cutoffDate;
    }

    private isValidDateInput(value: string): boolean {
        return this.parseDateInput(value) !== null;
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