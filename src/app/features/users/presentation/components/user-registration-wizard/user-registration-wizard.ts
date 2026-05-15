import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
    SiauButton,
    SiauDivider,
    SiauFileUpload,
    SiauInput,
    SiauModal,
    SiauSelect,
    SiauSelectOption,
    SiauStep,
    SiauStepper,
} from '../../../../../shared/ui';

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
    institution: string;
    dependency: string;
    corporation: string;
    area: string;
    position: string;
    commissionType: string;
    commissionStart: string;
    commissionEnd: string;
    officePhone: string;
    mobilePhone: string;
    email: string;
    alternativeEmail: string;
    system: string;
    profile: string;
    username: string;
    temporaryPassword: string;
}

const INITIAL_FORM: UserRegistrationForm = {
    firstName: '',
    lastName: '',
    secondLastName: '',
    curp: '',
    rfc: '',
    birthDate: '',
    gender: '',
    institution: '',
    dependency: '',
    corporation: '',
    area: '',
    position: '',
    commissionType: '',
    commissionStart: '',
    commissionEnd: '',
    officePhone: '',
    mobilePhone: '',
    email: '',
    alternativeEmail: '',
    system: '',
    profile: '',
    username: '',
    temporaryPassword: '',
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
        SiauDivider,
        SiauFileUpload,
    ],
    templateUrl: './user-registration-wizard.html',
    styleUrl: './user-registration-wizard.scss',
})
export class UserRegistrationWizard {
    readonly open = input<boolean>(false);
    readonly closed = output<void>();

    protected readonly activeStepId = signal<WizardStepId>('personal-data');
    protected readonly completedSteps = signal<readonly WizardStepId[]>([]);
    protected readonly form = signal<UserRegistrationForm>(INITIAL_FORM);

    protected readonly genderOptions: readonly SiauSelectOption[] = [
        { value: 'M', label: 'Mujer' },
        { value: 'H', label: 'Hombre' },
        { value: 'N', label: 'No especificado' },
    ];

    protected readonly institutionOptions: readonly SiauSelectOption[] = [
        { value: 'sspc', label: 'Secretaría de Seguridad y Protección Ciudadana' },
        { value: 'sesnsp', label: 'Secretariado Ejecutivo del Sistema Nacional de Seguridad Pública' },
        { value: 'guardia-nacional', label: 'Guardia Nacional' },
    ];

    protected readonly dependencyOptions: readonly SiauSelectOption[] = [
        { value: 'administracion', label: 'Administración' },
        { value: 'seguridad', label: 'Seguridad Pública' },
        { value: 'tecnologias', label: 'Tecnologías de la Información' },
    ];

    protected readonly corporationOptions: readonly SiauSelectOption[] = [
        { value: 'corporacion-central', label: 'Corporación Central' },
        { value: 'corporacion-estatal', label: 'Corporación Estatal' },
        { value: 'corporacion-operativa', label: 'Corporación Operativa' },
    ];

    protected readonly areaOptions: readonly SiauSelectOption[] = [
        { value: 'usuarios', label: 'Administración de Usuarios' },
        { value: 'operacion', label: 'Operación' },
        { value: 'soporte', label: 'Soporte Institucional' },
    ];

    protected readonly commissionOptions: readonly SiauSelectOption[] = [
        { value: 'temporal', label: 'Temporal' },
        { value: 'permanente', label: 'Permanente' },
        { value: 'especial', label: 'Especial' },
    ];

    protected readonly systemOptions: readonly SiauSelectOption[] = [
        { value: 'siau', label: 'SIAU' },
        { value: 'rnpsp', label: 'RNPSP' },
        { value: 'control-confianza', label: 'Control de confianza' },
    ];

    protected readonly profileOptions: readonly SiauSelectOption[] = [
        { value: 'admin', label: 'Administrador' },
        { value: 'enlace', label: 'Enlace Institucional' },
        { value: 'usuario', label: 'Usuario' },
        { value: 'supervisor', label: 'Supervisor Estatal' },
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

    protected readonly steps = computed<readonly SiauStep[]>(() => {
        const completed = this.completedSteps();

        return [
            {
                id: 'personal-data',
                label: 'Datos personales',
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
                icon: 'badge',
                completed: completed.includes('commission'),
            },
            {
                id: 'documents',
                label: 'Archivos',
                icon: 'folder',
                completed: completed.includes('documents'),
            },
            {
                id: 'contact',
                label: 'Medios de contacto',
                icon: 'contact_phone',
                completed: completed.includes('contact'),
            },
            {
                id: 'profiles',
                label: 'Perfiles',
                icon: 'admin_panel_settings',
                completed: completed.includes('profiles'),
            },
            {
                id: 'account',
                label: 'Cuenta',
                icon: 'lock',
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
            return;
        }

        this.closed.emit();
        this.resetWizard();
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

    protected updateForm<K extends keyof UserRegistrationForm>(key: K, value: string | null): void {
        this.form.update((current) => ({
            ...current,
            [key]: value ?? '',
        }));
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
        this.form.set(INITIAL_FORM);
    }

    private isWizardStep(value: string): value is WizardStepId {
        return this.stepOrder.includes(value as WizardStepId);
    }
}