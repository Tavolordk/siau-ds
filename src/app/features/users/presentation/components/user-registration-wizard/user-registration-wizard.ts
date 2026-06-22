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
import { forkJoin } from 'rxjs';
import { CatalogosFacade } from '../../../../../core/catalogos';
import {
    SiauInput,
    SiauModal,
    SiauSelect,
    SiauSelectOption,
    SiauStep,
} from '../../../../../shared/ui';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserDetailRecord, UserRecord } from '../../../domain/models/user-record.model';

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

    commissionInstitutionType: string;
    commissionInstitution: string;
    commissionEntity: string;
    commissionMunicipality: string;
    commissionDependency: string;
    commissionDecentralizedBody: string;
    commissionAdministrativeUnit: string;

    email: string;
    phone: string;
    extension: string;

    profiles: string[];

    username: string;
    password: string;
    confirmPassword: string;
    accountStatus: AccountStatus;
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

    commissionInstitutionType: '',
    commissionInstitution: '',
    commissionEntity: '',
    commissionMunicipality: '',
    commissionDependency: '',
    commissionDecentralizedBody: '',
    commissionAdministrativeUnit: '',

    email: '',
    phone: '',
    extension: '',

    profiles: [],

    username: '',
    password: '',
    confirmPassword: '',
    accountStatus: 'active',
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
    readonly closed = output<void>();

    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly destroyRef = inject(DestroyRef);

    private hydrationKey = '';
    private readonly catalogosReady = signal<boolean>(false);

    protected readonly activeStepId = signal<WizardStepId>('personal-data');
    protected readonly editEnabled = signal<boolean>(true);
    protected readonly completedSteps = signal<readonly WizardStepId[]>([]);
    protected readonly form = signal<UserRegistrationForm>({ ...INITIAL_FORM });

    protected readonly selectedSystem = signal<string>('');
    protected readonly selectedRole = signal<string>('');
    protected readonly assignedSystemProfiles = signal<AssignedSystemProfile[]>([]);
    protected readonly detailRoleOptionsBySystem = signal<Record<string, readonly SiauSelectOption[]>>({});

    protected readonly showPassword = signal<boolean>(false);
    protected readonly showConfirmPassword = signal<boolean>(false);

    protected readonly genderOptions = signal<readonly SiauSelectOption[]>([]);
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
        if (!this.isEditMode()) {
            return this.roleOptions();
        }

        const system = this.selectedSystem();

        if (!system) {
            return [];
        }

        return this.findDetailRoleOptionsForSystem(system);
    });

    protected readonly shouldShowRoleSelect = computed(() => {
        if (!this.isEditMode()) {
            return true;
        }

        return Boolean(this.selectedSystem()) && this.availableRoleOptions().length > 0;
    });

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

    protected readonly isFormDisabled = computed(() => this.isEditMode() && !this.editEnabled());

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

    protected readonly primaryButtonLabel = computed(() =>
        this.isEditMode() ? 'Guardar cambios' : 'Registrar Usuario',
    );

    protected readonly primaryButtonIcon = computed(() => (this.isEditMode() ? 'save' : 'user-plus'));

    constructor() {
        this.loadCatalogos();

        effect(() => {
            const isOpen = this.open();
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
        if (!this.isEditMode()) {
            return;
        }

        this.editEnabled.set(true);
    }

    protected goToStep(stepId: string): void {
        if (this.isWizardStep(stepId)) {
            this.activeStepId.set(stepId);
        }
    }

    protected nextStep(): void {
        const current = this.activeStepId();
        const currentIndex = this.stepOrder.indexOf(current);

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
        this.closed.emit();
        this.resetWizard();
    }

    protected submit(): void {
        if (this.isFormDisabled()) {
            return;
        }

        this.stepOrder.forEach((stepId) => this.markCompleted(stepId));
        this.closed.emit();
        this.resetWizard();
    }

    protected updateForm<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K] | string | null,
    ): void {
        if (this.isFormDisabled()) {
            return;
        }

        this.form.update((current) => ({
            ...current,
            [key]: value ?? '',
        }));
    }

    protected updateAssignmentInstitutionType(value: string | null): void {
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
            return;
        }

        if (this.isAssignmentFederalInstitution()) {
            this.updateForm('municipality', '');
            return;
        }

        this.updateForm('municipality', value);
    }

    protected updateAssignmentInstitution(value: string | null): void {
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
            return;
        }

        if (this.isCommissionFederalInstitution()) {
            this.updateForm('commissionMunicipality', '');
            return;
        }

        this.updateForm('commissionMunicipality', value);
    }

    protected updateCommissionInstitution(value: string | null): void {
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
            return;
        }

        this.selectedSystem.set(value ?? '');
        this.selectedRole.set('');
    }

    protected updateSelectedRole(value: string | null): void {
        if (this.isFormDisabled()) {
            return;
        }

        this.selectedRole.set(value ?? '');
    }

    protected addAssignedProfile(): void {
        if (this.isFormDisabled()) {
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
        this.selectedSystem.set('');
        this.selectedRole.set('');
    }

    protected removeAssignedProfile(id: string): void {
        if (this.isFormDisabled()) {
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
        if (this.isFormDisabled()) {
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

            email: this.toText(this.firstValue(contact, ['correo', 'email'])) || this.toText(datos['correo']) || user?.email || '',
            phone: this.toText(this.firstValue(contact, ['celular', 'telefono', 'phone'])),
            extension: this.toText(this.firstValue(contact, ['extension'])),

            profiles: [],

            username: this.toText(datos['cuenta']) || user?.username || '',
            password: '',
            confirmPassword: '',
            accountStatus: this.toAccountStatus(this.firstText([datos['estatus'], datos['estatusClave'], user?.status])),
        };

        const assignedProfiles = this.toAssignedSystemProfiles(datos['s6Perfiles']);

        this.activeStepId.set('personal-data');
        this.completedSteps.set([...this.stepOrder]);
        this.editEnabled.set(false);
        this.form.set(nextForm);
        this.selectedSystem.set('');
        this.selectedRole.set('');
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
                    this.firstValue(record, ['perfil', 'rol', 'perfilClave', 'rolClave', 'nombrePerfil', 'perfilNombre']),
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

                /*
                 * Por ahora no usamos catálogo global de perfiles.
                 * Solo se pinta el perfil que venga en s6Perfiles.
                 * Si el detalle no trae nombre de perfil, no se agrega.
                 */
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

        if (normalizedValue.includes('inhabil') || normalizedValue.includes('inactivo') || normalizedValue.includes('baja')) {
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
        this.selectedSystem.set('');
        this.selectedRole.set('');
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
            sistemas: this.catalogosFacade.obtenerSistemasOptions(),
            roles: this.catalogosFacade.obtenerTipoUsuarioOptions(),
            tiposInstitucion: this.catalogosFacade.obtenerTipoInstitucionOptions(),
            estados: this.catalogosFacade.obtenerEstadosOptions(),
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (catalogos) => {
                    this.genderOptions.set(catalogos.sexos);
                    this.systemOptions.set(catalogos.sistemas);

                    /*
                     * Se conserva para creación.
                     * En edición NO se usa hasta que backend defina perfiles por sistema.
                     */
                    this.roleOptions.set(catalogos.roles);

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

    private normalizeText(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }
}