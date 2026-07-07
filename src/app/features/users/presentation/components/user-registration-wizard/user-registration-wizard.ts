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
import { finalize, forkJoin } from 'rxjs';
import { CatalogosFacade } from '../../../../../core/catalogos';
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
    RegistroAdminRequest,
    RegistroAsignacion,
    RegistroEspecialRequest,
    UserDetailRecord,
    UserRecord,
} from '../../../domain/models/user-record.model';

type AccountStatus = 'active' | 'disabled' | 'suspended';
type UserWizardMode = 'create' | 'edit';

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

const DEFAULT_EXPRESS_PASSWORD = 'SSPC-PMex-2025';

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
    private readonly authStorage = inject(AuthStorage);
    private readonly destroyRef = inject(DestroyRef);

    private hydrationKey = '';
    private readonly catalogosReady = signal<boolean>(false);

    protected readonly activeStepId = signal<WizardStepId>('personal-data');
    protected readonly editEnabled = signal<boolean>(true);
    protected readonly completedSteps = signal<readonly WizardStepId[]>([]);
    protected readonly form = signal<UserRegistrationForm>({ ...INITIAL_FORM });
    protected readonly isSubmitting = signal<boolean>(false);
    protected readonly formErrors = signal<Record<string, string>>({});

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

    protected readonly isAssignmentFederalInstitution = computed(() =>
        this.isFederalInstitutionValue(this.form().institutionType),
    );

    protected readonly isCommissionFederalInstitution = computed(() =>
        this.isFederalInstitutionValue(this.form().commissionInstitutionType),
    );

    protected readonly availableRoleOptions = computed<readonly SiauSelectOption[]>(() => {
        const system = this.selectedSystem();

        if (!system) {
            return [];
        }

        const catalogRoleOptions = this.roleOptions();

        if (catalogRoleOptions.length > 0) {
            return catalogRoleOptions;
        }

        return this.findDetailRoleOptionsForSystem(system);
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

    protected readonly stepOrder: readonly WizardStepId[] = [
        'personal-data',
        'assignment',
        'commission',
        'documents',
        'contact',
        'profiles',
        'account',
    ];

    protected readonly steps = computed<readonly SiauStep[]>(() => {
        const completed = this.completedSteps();

        return [
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
        ];
    });

    protected readonly activeIndex = computed(() => {
        return this.stepOrder.indexOf(this.activeStepId());
    });

    protected readonly activeStepNumber = computed(() => this.activeIndex() + 1);

    protected readonly stepProgressSegments = computed(() => {
        const activeNumber = this.activeStepNumber();

        return this.stepOrder.map((_, index) => ({
            id: `segment-${index + 1}`,
            active: index < activeNumber,
        }));
    });

    protected readonly headerBadge = computed(() => {
        const prefix = this.isEditMode() ? 'Edición' : 'Registro';
        return `${prefix} · ${this.activeIndex() + 1}/${this.stepOrder.length} secciones`;
    });

    protected readonly isEditMode = computed(() => this.mode() === 'edit');

    protected readonly isFormDisabled = computed(() =>
        this.isEditMode() && (this.readonlyMode() || !this.editEnabled()),
    );

    protected readonly currentStepErrors = computed<readonly ValidationMessage[]>(() => {
        const errors = this.formErrors();
        const stepFields = this.getStepValidationFields(this.activeStepId());

        return Object.entries(errors)
            .filter(([key]) => stepFields.includes(key))
            .map(([key, message]) => ({
                key,
                message,
            }));
    });

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
                    this.hydrateEditForm(detail?.datos ?? {}, user);
                    return;
                }

                this.resetWizard();
                this.editEnabled.set(true);
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
            this.activeStepId.set(stepId);
            return;
        }

        const current = this.activeStepId();
        const currentIndex = this.stepOrder.indexOf(current);
        const targetIndex = this.stepOrder.indexOf(stepId);

        if (targetIndex > currentIndex && !this.validateStep(current)) {
            return;
        }

        this.activeStepId.set(stepId);
    }

    protected nextStep(): void {
        const current = this.activeStepId();
        const currentIndex = this.stepOrder.indexOf(current);

        if (!this.isEditMode() && !this.validateStep(current)) {
            return;
        }

        this.markCompleted(current);

        if (currentIndex < this.stepOrder.length - 1) {
            this.activeStepId.set(this.stepOrder[currentIndex + 1]);
        }
    }

    protected previousStep(): void {
        const currentIndex = this.activeIndex();

        if (currentIndex > 0) {
            this.activeStepId.set(this.stepOrder[currentIndex - 1]);
        }
    }

    protected closeWizard(): void {
        if (this.isSubmitting()) {
            return;
        }

        this.closed.emit();
        this.resetWizard();
    }

    protected submit(): void {
        if (this.readonlyMode() || this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (this.isEditMode()) {
            this.stepOrder.forEach((stepId) => this.markCompleted(stepId));
            this.closed.emit();
            this.resetWizard();
            return;
        }

        if (!this.validateAllSteps()) {
            return;
        }

        const isExpress = this.form().expressCreation;
        let saveRequest$: ReturnType<UsersFacade['createAdminUser']> | ReturnType<UsersFacade['createSpecialUser']>;

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
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isSubmitting.set(false)),
            )
            .subscribe({
                next: () => {
                    this.stepOrder.forEach((stepId) => this.markCompleted(stepId));
                    this.closed.emit();
                    this.resetWizard();
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

        const normalizedValue = this.normalizeFormInputValue(key, value);

        this.form.update((current) => ({
            ...current,
            [key]: normalizedValue,
        }));

        this.clearFieldError(String(key));
    }

    protected toggleExpressCreation(checked: boolean): void {
        if (this.isFormDisabled() || this.isSubmitting() || this.isEditMode()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            expressCreation: checked,
        }));

        this.formErrors.set({});
    }

    protected toggleCommissionSection(checked: boolean): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
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
        const isFederal = this.isFederalInstitutionValue(institutionType);

        this.form.update((current) => ({
            ...current,
            institutionType,
            entity: isFederal ? '' : current.entity,
            municipality: '',
            institution: '',
            decentralizedBody: '',
            administrativeUnit: '',
        }));

        if (isFederal) {
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

        if (this.isAssignmentFederalInstitution()) {
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
        this.loadMunicipalities(value, this.municipalityOptions);
        this.loadAssignmentInstitutions();
    }

    protected updateAssignmentMunicipality(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (this.isAssignmentFederalInstitution()) {
            this.updateForm('municipality', '');
            return;
        }

        this.updateForm('municipality', value);
    }

    protected updateAssignmentInstitution(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            institution: value ?? '',
            decentralizedBody: '',
            administrativeUnit: '',
        }));
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        this.loadAssignmentChildren(value, this.decentralizedBodyOptions);
        this.loadAssignmentChildren(value, this.administrativeUnitOptions);
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
        this.loadAssignmentChildren(value || this.form().institution, this.administrativeUnitOptions);
    }

    protected updateCommissionInstitutionType(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        const commissionInstitutionType = value ?? '';
        const isFederal = this.isFederalInstitutionValue(commissionInstitutionType);

        this.form.update((current) => ({
            ...current,
            commissionInstitutionType,
            commissionEntity: isFederal ? '' : current.commissionEntity,
            commissionMunicipality: '',
            commissionInstitution: '',
            commissionDependency: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));

        if (isFederal) {
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

        if (this.isCommissionFederalInstitution()) {
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
        this.loadMunicipalities(value, this.commissionMunicipalityOptions);
        this.loadCommissionInstitutions();
    }

    protected updateCommissionMunicipality(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        if (this.isCommissionFederalInstitution()) {
            this.updateForm('commissionMunicipality', '');
            return;
        }

        this.updateForm('commissionMunicipality', value);
    }

    protected updateCommissionInstitution(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            commissionInstitution: value ?? '',
            commissionDependency: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionDependencyOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionChildren(value, this.commissionDependencyOptions);
        this.loadCommissionChildren(value, this.commissionDecentralizedBodyOptions);
        this.loadCommissionChildren(value, this.commissionAdministrativeUnitOptions);
    }

    protected updateCommissionDependency(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            commissionDependency: value ?? '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
        this.loadCommissionChildren(
            value || this.form().commissionInstitution,
            this.commissionDecentralizedBodyOptions,
        );
        this.loadCommissionChildren(
            value || this.form().commissionInstitution,
            this.commissionAdministrativeUnitOptions,
        );
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
            value || this.form().commissionDependency || this.form().commissionInstitution,
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
        return this.activeIndex() === this.stepOrder.length - 1;
    }

    protected updateSelectedSystem(value: string | null): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
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
    }

    protected removeAssignedProfile(id: string): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.assignedSystemProfiles.update((current) => current.filter((item) => item.id !== id));
        this.detailRoleOptionsBySystem.set(this.buildDetailRoleOptionsBySystem(this.assignedSystemProfiles()));
    }

    protected togglePasswordVisibility(): void {
        this.showPassword.update((value) => !value);
    }

    protected toggleConfirmPasswordVisibility(): void {
        this.showConfirmPassword.update((value) => !value);
    }

    protected setAccountStatus(status: AccountStatus): void {
        if (this.isFormDisabled() || this.isSubmitting()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            accountStatus: status,
        }));
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

    private buildCreateUserRequest(): RegistroAdminRequest {
        const current = this.form();
        const isExpress = current.expressCreation;
        const assignedProfile = this.assignedSystemProfiles()[0] ?? null;
        const password = this.toText(current.password);

        if (!assignedProfile && !isExpress) {
            throw new Error('Selecciona al menos un sistema y perfil.');
        }

        if (!password && !isExpress) {
            throw new Error('Captura la contraseña.');
        }

        return {
            datosPersonales: {
                cuip: this.toNullableText(current.cuip),
                curp: this.getRequiredOrOptionalText(
                    current.curp,
                    !isExpress,
                    'Captura la CURP.',
                ).toUpperCase(),
                rfc: this.getRequiredOrOptionalText(
                    current.rfc,
                    !isExpress,
                    'Captura el RFC.',
                ).toUpperCase(),
                nombres: this.requireText(current.firstName, 'Captura el nombre.').toUpperCase(),
                primerApellido: this.requireText(current.lastName, 'Captura el primer apellido.').toUpperCase(),
                segundoApellido: this.toNullableText(current.secondLastName)?.toUpperCase() ?? null,
                sexoId: isExpress
                    ? this.resolveOptionalCatalogId(current.gender, this.genderOptions(), 1)
                    : this.requireCatalogId(current.gender, 'Selecciona el sexo.'),
                fechaNacimiento: this.getRequiredOrOptionalText(
                    current.birthDate,
                    !isExpress,
                    'Captura la fecha de nacimiento.',
                ),
                estadoCivilId: this.resolveDefaultCatalogId(this.civilStatusOptions(), 1),
            },
            adscripcion: {
                estructuraId: this.resolveAssignmentStructureId(),
                cargo: this.toNullableText(current.position)?.toUpperCase() ?? null,
                funciones: this.toNullableText(current.functions),
                numeroEmpleado: this.toNullableText(current.employeeNumber),
                fechaInicio: this.toNullableText(current.admissionDate),
            },
            comision: this.buildCommissionRequest(),
            medioContacto: {
                correo: this.getRequiredOrOptionalText(
                    current.email,
                    !isExpress,
                    'Captura el correo.',
                ),
                celular: this.getRequiredOrOptionalText(
                    current.phone,
                    !isExpress,
                    'Captura el celular.',
                ),
            },
            cuenta: {
                password: password || null,
                passwordHash: password || null,
                tipoUsuarioId: this.resolveDefaultCatalogId(this.userTypeOptions(), 1),
                sistemaId: assignedProfile
                    ? this.resolveAssignedSystemId(assignedProfile)
                    : this.resolveDefaultCatalogId(this.systemOptions(), 1),
                perfilId: assignedProfile
                    ? this.requireCatalogId(assignedProfile.role, 'Selecciona un perfil válido.')
                    : this.resolveDefaultCatalogId(this.roleOptions(), 1),
            },
            comentario: isExpress
                ? this.requireText(
                    current.expressJustification,
                    'Captura la justificación de la creación express.',
                )
                : this.toNullableText(current.expressJustification),
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-admin-${Date.now()}`,
            },
        };
    }

    private buildCreateSpecialUserRequest(): RegistroEspecialRequest {
        const current = this.form();
        const assignedProfile = this.assignedSystemProfiles()[0] ?? null;
        const password = this.toText(current.password) || DEFAULT_EXPRESS_PASSWORD;

        if (!assignedProfile) {
            throw new Error('Selecciona al menos un sistema y perfil.');
        }

        return {
            datosPersonales: {
                nombres: this.requireText(current.firstName, 'Captura el nombre.').toUpperCase(),
                primerApellido: this.requireText(current.lastName, 'Captura el primer apellido.').toUpperCase(),
                sexoId: this.resolveOptionalCatalogId(current.gender, this.genderOptions(), 1),
            },
            adscripcion: {
                estructuraId: this.resolveAssignmentStructureId(),
            },
            comision: this.buildSpecialCommissionRequest(),
            medioContacto: {
                correo: this.requireText(current.email, 'Captura el correo.'),
                celular: this.requireText(current.phone, 'Captura el celular.'),
            },
            cuenta: {
                password: password || null,
                passwordHash: password || null,
                tipoUsuarioId: this.resolveDefaultCatalogId(this.userTypeOptions(), 1),
                sistemaId: this.resolveAssignedSystemId(assignedProfile),
                perfilId: this.requireCatalogId(assignedProfile.role, 'Selecciona un perfil válido.'),
            },
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
            fechaInicio: this.requireText(
                current.commissionAdmissionDate,
                'Captura la fecha de ingreso de comisión.',
            ),
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

    private getRequiredOrOptionalText(
        value: string,
        required: boolean,
        errorMessage: string,
    ): string {
        return required ? this.requireText(value, errorMessage) : this.toText(value);
    }

    private resolveOptionalCatalogId(
        value: string,
        options: readonly SiauSelectOption[],
        fallback: number,
    ): number {
        return this.toCatalogId(value) ?? this.resolveDefaultCatalogId(options, fallback);
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
        const personalData = this.toRecord(datos['s1DatosPersonales']);
        const assignment = this.toRecord(datos['s2Adscripcion']);
        const commission = this.toRecord(datos['s3Comision']);
        const contact = this.toRecord(datos['s5Contacto']);

        const institutionType = this.resolveSelectValue(
            this.firstValue(assignment, ['tipoInstitucion', 'tipoInstitucionId']),
            this.institutionTypeOptions,
        );
        const assignmentIsFederal = this.isFederalInstitutionValue(institutionType);
        const assignmentEntity = assignmentIsFederal
            ? ''
            : this.resolveSelectValue(this.firstValue(assignment, ['estado', 'entidad', 'estadoId']), this.stateOptions);

        const commissionInstitutionType = this.resolveSelectValue(
            this.firstValue(commission, ['tipoInstitucion', 'tipoInstitucionId']),
            this.institutionTypeOptions,
        );
        const commissionIsFederal = this.isFederalInstitutionValue(commissionInstitutionType);
        const commissionEntity = commissionIsFederal
            ? ''
            : this.resolveSelectValue(this.firstValue(commission, ['estado', 'entidad', 'estadoId']), this.stateOptions);

        const hasCommissionData =
            this.hasText(this.firstValue(commission, ['tipoInstitucion', 'tipoInstitucionId'])) ||
            this.hasText(this.firstValue(commission, ['estado', 'entidad', 'estadoId'])) ||
            this.hasText(this.firstValue(commission, ['municipio', 'municipioAlcaldia', 'municipioId'])) ||
            this.hasText(this.firstValue(commission, ['institucion', 'institucionId'])) ||
            this.hasText(this.firstValue(commission, ['dependencia', 'dependenciaId'])) ||
            this.hasText(this.firstValue(commission, ['organoDesconcentrado', 'desconcentrado', 'decentralizedBody'])) ||
            this.hasText(this.firstValue(commission, ['unidadAdministrativa', 'administrativeUnit'])) ||
            this.hasText(this.firstValue(commission, ['fechaInicio', 'fechaIngreso']));

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

            institutionType,
            entity: assignmentEntity,
            municipality: assignmentIsFederal
                ? ''
                : this.resolveSelectValue(
                    this.firstValue(assignment, ['municipio', 'municipioAlcaldia', 'municipioId']),
                    this.municipalityOptions,
                ),
            institution: this.resolveSelectValue(
                this.firstValue(assignment, ['institucion', 'institucionId']),
                this.institutionOptions,
            ),
            decentralizedBody: this.resolveSelectValue(
                this.firstValue(assignment, ['organoDesconcentrado', 'desconcentrado', 'decentralizedBody']),
                this.decentralizedBodyOptions,
            ),
            administrativeUnit: this.resolveSelectValue(
                this.firstValue(assignment, ['unidadAdministrativa', 'administrativeUnit']),
                this.administrativeUnitOptions,
            ),
            position: this.toText(this.firstValue(assignment, ['cargo', 'puesto'])),
            functions: this.toText(this.firstValue(assignment, ['funciones'])),
            admissionDate: this.toDateInputValue(this.firstValue(assignment, ['fechaInicio', 'fechaIngreso'])),
            employeeNumber: this.toText(this.firstValue(assignment, ['numeroEmpleado', 'numEmpleado'])),

            commissionEnabled: hasCommissionData,
            commissionInstitutionType,
            commissionEntity,
            commissionMunicipality: commissionIsFederal
                ? ''
                : this.resolveSelectValue(
                    this.firstValue(commission, ['municipio', 'municipioAlcaldia', 'municipioId']),
                    this.commissionMunicipalityOptions,
                ),
            commissionInstitution: this.resolveSelectValue(
                this.firstValue(commission, ['institucion', 'institucionId']),
                this.commissionInstitutionOptions,
            ),
            commissionDependency: this.resolveSelectValue(
                this.firstValue(commission, ['dependencia', 'dependenciaId']),
                this.commissionDependencyOptions,
            ),
            commissionDecentralizedBody: this.resolveSelectValue(
                this.firstValue(commission, ['organoDesconcentrado', 'desconcentrado', 'decentralizedBody']),
                this.commissionDecentralizedBodyOptions,
            ),
            commissionAdministrativeUnit: this.resolveSelectValue(
                this.firstValue(commission, ['unidadAdministrativa', 'administrativeUnit']),
                this.commissionAdministrativeUnitOptions,
            ),
            commissionAdmissionDate: this.toDateInputValue(this.firstValue(commission, ['fechaInicio', 'fechaIngreso'])),

            email: this.toText(this.firstValue(contact, ['correo', 'email'])) || this.toText(datos['correo']) || user?.email || '',
            phone: this.toText(this.firstValue(contact, ['celular', 'telefono', 'phone'])),
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
        this.completedSteps.set([...this.stepOrder]);
        this.editEnabled.set(false);
        this.form.set(nextForm);
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.roleOptions.set([]);
        this.assignedSystemProfiles.set(assignedProfiles);
        this.detailRoleOptionsBySystem.set(this.buildDetailRoleOptionsBySystem(assignedProfiles));
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
                );

                const systemOption =
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

        if (normalizedValue.includes('suspend')) {
            return 'suspended';
        }

        if (
            normalizedValue.includes('inhabil') ||
            normalizedValue.includes('inactivo') ||
            normalizedValue.includes('baja')
        ) {
            return 'disabled';
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
        this.activeStepId.set('personal-data');
        this.completedSteps.set([]);
        this.editEnabled.set(true);
        this.form.set({ ...INITIAL_FORM, profiles: [] });
        this.isSubmitting.set(false);
        this.formErrors.set({});
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

    private isWizardStep(value: string): value is WizardStepId {
        return this.stepOrder.includes(value as WizardStepId);
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
                    this.institutionTypeOptions.set(catalogos.tiposInstitucion);
                    this.stateOptions.set(catalogos.estados);
                    this.catalogosReady.set(true);
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
                next: (options) => target.set(options),
                error: (error: unknown) => {
                    target.set([]);
                    console.error('Error cargando municipios.', error);
                },
            });
    }

    private loadAssignmentInstitutions(): void {
        const current = this.form();
        const tipoInstitucionId = this.toCatalogId(current.institutionType);
        const estadoId = this.isFederalInstitutionValue(current.institutionType)
            ? undefined
            : this.toCatalogId(current.entity);

        if (!tipoInstitucionId && !estadoId) {
            this.institutionOptions.set([]);
            return;
        }

        this.loadOrgOptions(this.institutionOptions, {
            tipoInstitucionId,
            estadoId,
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
            estadoId: this.isFederalInstitutionValue(current.institutionType)
                ? undefined
                : this.toCatalogId(current.entity),
            padreId,
        });
    }

    private loadCommissionInstitutions(): void {
        const current = this.form();
        const tipoInstitucionId = this.toCatalogId(current.commissionInstitutionType);
        const estadoId = this.isFederalInstitutionValue(current.commissionInstitutionType)
            ? undefined
            : this.toCatalogId(current.commissionEntity);

        if (!tipoInstitucionId && !estadoId) {
            this.commissionInstitutionOptions.set([]);
            return;
        }

        this.loadOrgOptions(this.commissionInstitutionOptions, {
            tipoInstitucionId,
            estadoId,
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
            estadoId: this.isFederalInstitutionValue(current.commissionInstitutionType)
                ? undefined
                : this.toCatalogId(current.commissionEntity),
            padreId,
        });
    }

    private loadOrgOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        query: {
            tipoInstitucionId?: number;
            estadoId?: number;
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
                next: (options) => target.set(options),
                error: (error: unknown) => {
                    target.set([]);
                    console.error('Error cargando estructura orgánica.', error);
                },
            });
    }

    private toCatalogId(value: string | null | undefined): number | undefined {
        if (!value) {
            return undefined;
        }

        const id = Number(value);

        return Number.isFinite(id) && id > 0 ? id : undefined;
    }

    private isFederalInstitutionValue(value: string | null | undefined): boolean {
        if (!value) {
            return false;
        }

        const option = this.institutionTypeOptions().find((item) => item.value === value);
        const label = option?.label ?? value;

        return this.normalizeText(label).includes('federal');
    }

    private validateAllSteps(): boolean {
        for (const stepId of this.stepOrder) {
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
            if (!isExpress || this.hasText(current.curp)) {
                if (!this.hasText(current.curp)) {
                    nextErrors['curp'] = 'La CURP es obligatoria.';
                } else if (!this.isValidCurp(current.curp)) {
                    nextErrors['curp'] = 'La CURP no tiene un formato válido.';
                }
            }

            if (!isExpress || this.hasText(current.rfc)) {
                if (!this.hasText(current.rfc)) {
                    nextErrors['rfc'] = 'El RFC es obligatorio.';
                } else if (!this.isValidRfc(current.rfc)) {
                    nextErrors['rfc'] = 'El RFC no tiene un formato válido.';
                }
            }

            if (!this.hasText(current.firstName)) {
                nextErrors['firstName'] = 'El nombre es obligatorio.';
            }

            if (!this.hasText(current.lastName)) {
                nextErrors['lastName'] = 'El primer apellido es obligatorio.';
            }

            if (!isExpress && !this.hasText(current.gender)) {
                nextErrors['gender'] = 'El sexo es obligatorio.';
            }

            if (!isExpress || this.hasText(current.birthDate)) {
                if (!this.hasText(current.birthDate)) {
                    nextErrors['birthDate'] = 'La fecha de nacimiento es obligatoria.';
                } else if (!this.isAdult(current.birthDate)) {
                    nextErrors['birthDate'] = 'El usuario debe ser mayor de edad.';
                }
            }
        }

        if (stepId === 'assignment') {
            if (!this.hasText(current.institutionType)) {
                nextErrors['institutionType'] = 'El tipo de institución es obligatorio.';
            }

            if (!this.isAssignmentFederalInstitution() && !this.hasText(current.entity)) {
                nextErrors['entity'] = 'La entidad es obligatoria.';
            }

            if (!this.isAssignmentFederalInstitution() && !this.hasText(current.municipality)) {
                nextErrors['municipality'] = 'El municipio o alcaldía es obligatorio.';
            }

            if (!this.hasText(current.institution)) {
                nextErrors['institution'] = 'La institución es obligatoria.';
            }

            if (!this.hasText(current.admissionDate)) {
                nextErrors['admissionDate'] = 'La fecha de ingreso es obligatoria.';
            }

            if (!this.hasText(current.employeeNumber)) {
                nextErrors['employeeNumber'] = 'El número de empleado es obligatorio.';
            }
        }

        if (stepId === 'commission') {
            if (current.commissionEnabled) {
                if (!this.hasText(current.commissionInstitutionType)) {
                    nextErrors['commissionInstitutionType'] = 'El tipo de institución de comisión es obligatorio.';
                }

                if (!this.isCommissionFederalInstitution() && !this.hasText(current.commissionEntity)) {
                    nextErrors['commissionEntity'] = 'La entidad de comisión es obligatoria.';
                }

                if (!this.isCommissionFederalInstitution() && !this.hasText(current.commissionMunicipality)) {
                    nextErrors['commissionMunicipality'] = 'El municipio o alcaldía de comisión es obligatorio.';
                }

                if (!this.hasText(current.commissionInstitution)) {
                    nextErrors['commissionInstitution'] = 'La institución de comisión es obligatoria.';
                }

                if (!this.hasText(current.commissionAdmissionDate)) {
                    nextErrors['commissionAdmissionDate'] = 'La fecha de ingreso de comisión es obligatoria.';
                }
            }
        }

        if (stepId === 'contact') {
            const hasEmail = this.hasText(current.email);
            const hasPhone = this.hasText(current.phone);

            if (isExpress) {
                if (!hasEmail) {
                    nextErrors['email'] = 'El correo electrónico es obligatorio para el registro especial.';
                }

                if (!hasPhone) {
                    nextErrors['phone'] = 'El teléfono celular es obligatorio para el registro especial.';
                }
            } else {
                if (!hasEmail) {
                    nextErrors['email'] = 'El correo electrónico es obligatorio.';
                }

                if (!hasPhone) {
                    nextErrors['phone'] = 'El teléfono celular es obligatorio.';
                }
            }

            if (hasEmail && !this.isValidEmail(current.email)) {
                nextErrors['email'] = 'El correo electrónico no tiene un formato válido.';
            }

            if (hasPhone && !/^\d{10}$/.test(current.phone)) {
                nextErrors['phone'] = 'El teléfono celular debe tener 10 dígitos.';
            }
        }

        if (stepId === 'profiles') {
            if (this.assignedSystemProfiles().length === 0) {
                nextErrors['profiles'] = 'Debes agregar al menos un sistema y perfil.';
            }
        }

        if (stepId === 'account' && !this.isEditMode()) {
            if (isExpress && !this.hasText(current.expressJustification)) {
                nextErrors['expressJustification'] = 'Justifica por qué se realizará la creación express.';
            }

            if (!isExpress && !this.hasText(current.password)) {
                nextErrors['password'] = 'La contraseña es obligatoria.';
            }

            if (!isExpress && !this.hasText(current.confirmPassword)) {
                nextErrors['confirmPassword'] = 'La confirmación de contraseña es obligatoria.';
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

    private getStepValidationFields(stepId: WizardStepId): readonly string[] {
        const fieldsByStep: Record<WizardStepId, readonly string[]> = {
            'personal-data': [
                'curp',
                'rfc',
                'firstName',
                'lastName',
                'gender',
                'birthDate',
            ],
            assignment: [
                'institutionType',
                'entity',
                'municipality',
                'institution',
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
                'submit',
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

        if (this.shouldUppercaseField(key)) {
            return textValue.toUpperCase() as UserRegistrationForm[K];
        }

        if (key === 'phone') {
            return textValue.replace(/\D/g, '').slice(0, 10) as UserRegistrationForm[K];
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

    private isValidCurp(value: string): boolean {
        const curp = this.toText(value).toUpperCase();

        return /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/.test(curp);
    }

    private isValidRfc(value: string): boolean {
        const rfc = this.toText(value).toUpperCase();

        return /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(rfc);
    }

    private isValidEmail(value: string): boolean {
        const email = this.toText(value);

        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    }

    private isAdult(dateValue: string): boolean {
        const birthDate = new Date(`${dateValue}T00:00:00`);

        if (Number.isNaN(birthDate.getTime())) {
            return false;
        }

        const today = new Date();

        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const dayDiff = today.getDate() - birthDate.getDate();

        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
            age -= 1;
        }

        return age >= 18;
    }

    private normalizeText(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }
}