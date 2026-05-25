import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
    SiauButton,
    SiauInput,
    SiauModal,
    SiauSelect,
    SiauSelectOption,
    SiauStep,
    SiauStepper,
} from '../../../../../shared/ui';
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
    firstName: string;
    lastName: string;
    secondLastName: string;
    curp: string;
    rfc: string;
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
    firstName: '',
    lastName: '',
    secondLastName: '',
    curp: '',
    rfc: '',
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
    imports: [
        SiauModal,
        SiauStepper,
        SiauInput,
        SiauSelect,
        SiauButton,
        MatIconModule,
    ],
    templateUrl: './user-registration-wizard.html',
    styleUrl: './user-registration-wizard.scss',
})
export class UserRegistrationWizard {
    readonly open = input<boolean>(false);
    readonly closed = output<void>();

    protected readonly activeStepId = signal<WizardStepId>('personal-data');
    protected readonly completedSteps = signal<readonly WizardStepId[]>([]);
    protected readonly form = signal<UserRegistrationForm>({ ...INITIAL_FORM });
    protected readonly selectedSystem = signal<string>('');
    protected readonly selectedRole = signal<string>('');
    protected readonly assignedSystemProfiles = signal<AssignedSystemProfile[]>([]);
    protected readonly showPassword = signal<boolean>(false);
    protected readonly showConfirmPassword = signal<boolean>(false);
    protected readonly genderOptions: readonly SiauSelectOption[] = [
        { value: 'M', label: 'Mujer' },
        { value: 'H', label: 'Hombre' },
        { value: 'N', label: 'No especificado' },
    ];
    protected readonly systemOptions: readonly SiauSelectOption[] = [
        { value: 'siau', label: 'SIAU' },
        { value: 'rnpsp', label: 'RNPSP' },
        { value: 'plataforma-mexico', label: 'Plataforma México' },
        { value: 'control-confianza', label: 'Control de Confianza' },
    ];

    protected readonly roleOptions: readonly SiauSelectOption[] = [
        { value: 'administrador', label: 'Administrador' },
        { value: 'enlace-institucional', label: 'Enlace Institucional' },
        { value: 'usuario', label: 'Usuario' },
        { value: 'supervisor-estatal', label: 'Supervisor Estatal' },
    ];
    protected readonly institutionTypeOptions: readonly SiauSelectOption[] = [
        { value: 'federal', label: 'Federal' },
        { value: 'estatal', label: 'Estatal' },
        { value: 'municipal', label: 'Municipal' },
    ];

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

    protected readonly steps = computed<readonly SiauStep[]>(() => {
        const completed = this.completedSteps();

        return [
            {
                id: 'personal-data',
                label: 'Datos Personales',
                icon: 'person',
                completed: completed.includes('personal-data'),
            },
            {
                id: 'assignment',
                label: 'Adscripción',
                icon: 'account_tree',
                completed: completed.includes('assignment'),
            },
            {
                id: 'commission',
                label: 'Comisión',
                icon: 'business_center',
                completed: completed.includes('commission'),
            },
            {
                id: 'documents',
                label: 'Archivos',
                icon: 'description',
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
                icon: 'vpn_key',
                completed: completed.includes('account'),
            },
        ];
    });

    protected readonly headerBadge = computed(() => {
        return `${this.activeIndex() + 1}/${this.stepOrder.length} secciones`;
    });

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
        value: UserRegistrationForm[K] | string | null
    ): void {
        this.form.update((current) => ({
            ...current,
            [key]: value ?? '',
        }));
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
    }

    private isWizardStep(value: string): value is WizardStepId {
        return this.stepOrder.includes(value as WizardStepId);
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

        const systemOption = this.systemOptions.find((item) => item.value === system);
        const roleOption = this.roleOptions.find((item) => item.value === role);

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
        this.assignedSystemProfiles.update((current) =>
            current.filter((item) => item.id !== id)
        );
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
}