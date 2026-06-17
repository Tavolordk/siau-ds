import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    input,
    output,
    signal,
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

type AccountStatus = 'active' | 'disabled' | 'suspended';

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
    readonly closed = output<void>();

    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly destroyRef = inject(DestroyRef);

    protected readonly activeStepId = signal<WizardStepId>('personal-data');
    protected readonly completedSteps = signal<readonly WizardStepId[]>([]);
    protected readonly form = signal<UserRegistrationForm>({ ...INITIAL_FORM });

    protected readonly selectedSystem = signal<string>('');
    protected readonly selectedRole = signal<string>('');
    protected readonly assignedSystemProfiles = signal<AssignedSystemProfile[]>([]);

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
        return `${this.activeIndex() + 1}/${this.stepOrder.length} secciones`;
    });

    constructor() {
        this.loadCatalogos();
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
        this.stepOrder.forEach((stepId) => this.markCompleted(stepId));
        this.closed.emit();
        this.resetWizard();
    }

    protected updateForm<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K] | string | null,
    ): void {
        this.form.update((current) => ({
            ...current,
            [key]: value ?? '',
        }));
    }

    protected updateAssignmentInstitutionType(value: string | null): void {
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
        if (this.isAssignmentFederalInstitution()) {
            this.updateForm('municipality', '');
            return;
        }

        this.updateForm('municipality', value);
    }

    protected updateAssignmentInstitution(value: string | null): void {
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
        this.form.update((current) => ({
            ...current,
            decentralizedBody: value ?? '',
            administrativeUnit: '',
        }));
        this.administrativeUnitOptions.set([]);
        this.loadAssignmentChildren(value || this.form().institution, this.administrativeUnitOptions);
    }

    protected updateCommissionInstitutionType(value: string | null): void {
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
        if (this.isCommissionFederalInstitution()) {
            this.updateForm('commissionMunicipality', '');
            return;
        }

        this.updateForm('commissionMunicipality', value);
    }

    protected updateCommissionInstitution(value: string | null): void {
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
        this.selectedSystem.set(value ?? '');
    }

    protected updateSelectedRole(value: string | null): void {
        this.selectedRole.set(value ?? '');
    }

    protected addAssignedProfile(): void {
        const system = this.selectedSystem();
        const role = this.selectedRole();

        if (!system || !role) {
            return;
        }

        const systemOption = this.systemOptions().find((item) => item.value === system);
        const roleOption = this.roleOptions().find((item) => item.value === role);

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
        this.assignedSystemProfiles.update((current) => current.filter((item) => item.id !== id));
    }

    protected togglePasswordVisibility(): void {
        this.showPassword.update((value) => !value);
    }

    protected toggleConfirmPasswordVisibility(): void {
        this.showConfirmPassword.update((value) => !value);
    }

    protected setAccountStatus(status: AccountStatus): void {
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
        this.form.set({ ...INITIAL_FORM, profiles: [] });
        this.selectedSystem.set('');
        this.selectedRole.set('');
        this.assignedSystemProfiles.set([]);
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
                    this.roleOptions.set(catalogos.roles);
                    this.institutionTypeOptions.set(catalogos.tiposInstitucion);
                    this.stateOptions.set(catalogos.estados);
                },
                error: (error: unknown) => {
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