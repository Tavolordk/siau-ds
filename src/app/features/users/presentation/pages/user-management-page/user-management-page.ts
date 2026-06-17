import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, Subject } from 'rxjs';
import { SiauModal } from '../../../../../shared/ui/components/modal/modal';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UsersFacade } from '../../../application/users.facade';
import {
    UserDetailRecord,
    UserPagination,
    UserRecord,
    UsersQuery,
} from '../../../domain/models/user-record.model';
import { UserRegistrationWizard } from '../../components/user-registration-wizard/user-registration-wizard';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'dark' | 'light';

type DetailStepId =
    | 'personal-data'
    | 'assignment'
    | 'commission'
    | 'documents'
    | 'contact'
    | 'profiles'
    | 'account';

interface DetailStepViewModel {
    readonly id: DetailStepId;
    readonly label: string;
    readonly title: string;
    readonly description: string;
    readonly icon: string;
    readonly completed: boolean;
    readonly required: boolean;
}

interface DetailProfileViewModel {
    readonly id: string;
    readonly systemLabel: string;
    readonly roleLabel: string;
}

interface DetailDocumentViewModel {
    readonly id: string;
    readonly label: string;
    readonly fileName: string;
    readonly description: string;
}

interface DetailDisplayForm {
    readonly cuip: string;
    readonly policeIdentificationKey: string;
    readonly curp: string;
    readonly rfc: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly secondLastName: string;
    readonly birthDate: string;
    readonly gender: string;

    readonly institutionType: string;
    readonly entity: string;
    readonly municipality: string;
    readonly institution: string;
    readonly decentralizedBody: string;
    readonly administrativeUnit: string;
    readonly position: string;
    readonly functions: string;
    readonly admissionDate: string;
    readonly employeeNumber: string;

    readonly commissionInstitutionType: string;
    readonly commissionInstitution: string;
    readonly commissionEntity: string;
    readonly commissionMunicipality: string;
    readonly commissionDependency: string;
    readonly commissionDecentralizedBody: string;
    readonly commissionAdministrativeUnit: string;

    readonly email: string;
    readonly phone: string;
    readonly extension: string;

    readonly username: string;
    readonly password: string;
    readonly confirmPassword: string;
    readonly accountStatus: string;

    readonly profiles: readonly DetailProfileViewModel[];
    readonly documents: readonly DetailDocumentViewModel[];
}

const DEFAULT_PAGINATION: UserPagination = {
    totalRegistros: 0,
    totalPaginas: 1,
    paginaActual: 1,
    porPagina: 20,
};

const EMPTY_DETAIL_FORM: DetailDisplayForm = {
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

    username: '',
    password: '',
    confirmPassword: '',
    accountStatus: '',

    profiles: [],
    documents: [],
};

@Component({
    selector: 'app-user-management-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, SiauLucideIcon, SiauModal, UserRegistrationWizard],
    templateUrl: './user-management-page.html',
    styleUrl: './user-management-page.scss',
})
export class UserManagementPage {
    private readonly usersFacade = inject(UsersFacade);
    private readonly searchTermChanges = new Subject<string>();

    protected readonly searchTerm = signal<string>('');
    protected readonly isRegistrationOpen = signal<boolean>(false);
    protected readonly users = signal<readonly UserRecord[]>([]);
    protected readonly pagination = signal<UserPagination>(DEFAULT_PAGINATION);
    protected readonly isLoading = signal<boolean>(false);
    protected readonly errorMessage = signal<string | null>(null);

    protected readonly isDetailOpen = signal<boolean>(false);
    protected readonly isDetailLoading = signal<boolean>(false);
    protected readonly detailErrorMessage = signal<string | null>(null);
    protected readonly selectedUser = signal<UserRecord | null>(null);
    protected readonly selectedUserDetail = signal<UserDetailRecord | null>(null);
    protected readonly activeDetailStepId = signal<DetailStepId>('personal-data');

    protected readonly detailStepOrder: readonly DetailStepId[] = [
        'personal-data',
        'assignment',
        'commission',
        'documents',
        'contact',
        'profiles',
        'account',
    ];

    protected readonly filteredUsers = computed(() => this.users());
    protected readonly canGoPrevious = computed(() => this.pagination().paginaActual > 1);
    protected readonly canGoNext = computed(() => this.pagination().paginaActual < this.pagination().totalPaginas);

    protected readonly detailTitle = computed(() => this.selectedUser()?.fullName ?? 'Detalle del usuario');

    protected readonly detailSubtitle = computed(() => {
        const user = this.selectedUser();

        if (!user) {
            return 'Consulta individual de usuario';
        }

        return `${user.username} · ${user.email}`;
    });

    protected readonly detailForm = computed<DetailDisplayForm>(() => {
        const datos = this.selectedUserDetail()?.datos ?? null;

        if (!datos) {
            return EMPTY_DETAIL_FORM;
        }

        return this.toDetailDisplayForm(datos);
    });

    protected readonly detailSteps = computed<readonly DetailStepViewModel[]>(() => [
        {
            id: 'personal-data',
            label: 'Datos Personales',
            title: 'Datos Personales',
            description: 'Información de identidad oficial del usuario en el sistema',
            icon: 'user',
            completed: true,
            required: true,
        },
        {
            id: 'assignment',
            label: 'Adscripción',
            title: 'Adscripción',
            description: 'Centro de trabajo y datos laborales del usuario',
            icon: 'building-2',
            completed: true,
            required: true,
        },
        {
            id: 'commission',
            label: 'Comisión',
            title: 'Comisión',
            description: 'Datos de comisión interinstitucional si aplica',
            icon: 'briefcase',
            completed: true,
            required: false,
        },
        {
            id: 'documents',
            label: 'Archivos',
            title: 'Archivos',
            description: 'Carga de documentos de identidad y laborales',
            icon: 'file-text',
            completed: true,
            required: false,
        },
        {
            id: 'contact',
            label: 'Medio de Contacto',
            title: 'Medio de Contacto',
            description: 'Información de comunicación del usuario en el sistema',
            icon: 'phone',
            completed: true,
            required: true,
        },
        {
            id: 'profiles',
            label: 'Perfiles',
            title: 'Perfiles',
            description: 'Nivel de acceso y sistema asignado al usuario',
            icon: 'shield',
            completed: true,
            required: true,
        },
        {
            id: 'account',
            label: 'Cuenta',
            title: 'Cuenta',
            description: 'Credenciales y estado de la cuenta de acceso',
            icon: 'key-round',
            completed: true,
            required: true,
        },
    ]);

    protected readonly activeDetailStep = computed<DetailStepViewModel | null>(() => {
        const steps = this.detailSteps();

        if (!steps.length) {
            return null;
        }

        return steps.find((step) => step.id === this.activeDetailStepId()) ?? steps[0];
    });

    protected readonly activeDetailIndex = computed(() => {
        const index = this.detailStepOrder.indexOf(this.activeDetailStepId());
        return index >= 0 ? index : 0;
    });

    protected readonly activeDetailStepNumber = computed(() => this.activeDetailIndex() + 1);

    protected readonly detailHeaderBadge = computed(() => 'Completo');

    protected readonly detailProgressSegments = computed(() => {
        const activeNumber = this.activeDetailStepNumber();

        return this.detailStepOrder.map((_, index) => ({
            id: `detail-segment-${index + 1}`,
            active: index < activeNumber,
        }));
    });

    protected readonly canGoPreviousDetailStep = computed(() => this.activeDetailIndex() > 0);

    protected readonly canGoNextDetailStep = computed(() => this.activeDetailIndex() < this.detailStepOrder.length - 1);

    constructor() {
        this.searchTermChanges
            .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
            .subscribe((term) => this.loadUsers(1, term));

        this.loadUsers();
    }

    protected updateSearchTerm(value: string): void {
        const normalizedValue = String(value ?? '');
        this.searchTerm.set(normalizedValue);
        this.searchTermChanges.next(normalizedValue.trim());
    }

    protected searchNow(): void {
        this.loadUsers(1);
    }

    protected reloadUsers(): void {
        this.loadUsers(this.pagination().paginaActual);
    }

    protected previousPage(): void {
        if (!this.canGoPrevious()) {
            return;
        }

        this.loadUsers(this.pagination().paginaActual - 1);
    }

    protected nextPage(): void {
        if (!this.canGoNext()) {
            return;
        }

        this.loadUsers(this.pagination().paginaActual + 1);
    }

    protected openRegistration(): void {
        this.isRegistrationOpen.set(true);
    }

    protected closeRegistration(): void {
        this.isRegistrationOpen.set(false);
    }

    protected openUserDetail(user: UserRecord): void {
        if (!user.userId) {
            this.detailErrorMessage.set('No se puede consultar el detalle porque el usuario no tiene identificador interno.');
            this.selectedUser.set(user);
            this.selectedUserDetail.set(null);
            this.activeDetailStepId.set('personal-data');
            this.isDetailOpen.set(true);
            return;
        }

        this.selectedUser.set(user);
        this.selectedUserDetail.set(null);
        this.activeDetailStepId.set('personal-data');
        this.detailErrorMessage.set(null);
        this.isDetailLoading.set(true);
        this.isDetailOpen.set(true);

        this.usersFacade
            .getUserDetail(user.userId)
            .pipe(finalize(() => this.isDetailLoading.set(false)))
            .subscribe({
                next: (detail) => {
                    this.selectedUserDetail.set(detail);
                    this.activeDetailStepId.set('personal-data');
                },
                error: (error: unknown) => {
                    this.selectedUserDetail.set(null);
                    this.detailErrorMessage.set(this.toFriendlyError(error));
                },
            });
    }

    protected closeUserDetail(): void {
        this.isDetailOpen.set(false);
        this.selectedUserDetail.set(null);
        this.detailErrorMessage.set(null);
        this.isDetailLoading.set(false);
        this.activeDetailStepId.set('personal-data');
    }

    protected goToDetailStep(stepId: DetailStepId): void {
        this.activeDetailStepId.set(stepId);
    }

    protected previousDetailStep(): void {
        const currentIndex = this.activeDetailIndex();

        if (currentIndex <= 0) {
            return;
        }

        this.activeDetailStepId.set(this.detailStepOrder[currentIndex - 1]);
    }

    protected nextDetailStep(): void {
        const currentIndex = this.activeDetailIndex();

        if (currentIndex >= this.detailStepOrder.length - 1) {
            return;
        }

        this.activeDetailStepId.set(this.detailStepOrder[currentIndex + 1]);
    }

    protected saveDetailChanges(): void {
        this.closeUserDetail();
    }

    protected getDetailStepClass(step: DetailStepViewModel, index: number): string {
        const isActive = index === this.activeDetailIndex();

        return [
            'registration-wizard__step',
            isActive ? 'registration-wizard__step--active' : '',
            step.completed ? 'registration-wizard__step--completed' : '',
        ]
            .join(' ')
            .trim();
    }

    protected isDetailStepCompleted(step: DetailStepViewModel): boolean {
        return step.completed;
    }

    protected getRoleTone(role: UserRecord['role']): BadgeTone {
        const value = this.normalizeForCompare(role);

        if (value.includes('admin')) {
            return 'neutral';
        }

        if (value.includes('enlace')) {
            return 'info';
        }

        if (value.includes('supervisor')) {
            return 'dark';
        }

        return 'light';
    }

    protected getStatusTone(status: UserRecord['status']): BadgeTone {
        const value = this.normalizeForCompare(status);

        if (value.includes('activo') && !value.includes('inactivo')) {
            return 'success';
        }

        if (value.includes('suspend')) {
            return 'warning';
        }

        if (value.includes('inhabil') || value.includes('inactivo') || value.includes('baja')) {
            return 'danger';
        }

        return 'info';
    }

    protected getRegistryTone(status: UserRecord['rnpsp']): BadgeTone {
        const value = this.normalizeForCompare(status);
        return value.includes('registrado') && !value.includes('no') ? 'success' : 'danger';
    }

    protected getTrustTone(status: UserRecord['trust']): BadgeTone {
        const value = this.normalizeForCompare(status);

        if (value.includes('vigente') || value.includes('aprobado')) {
            return 'success';
        }

        if (value.includes('expir') || value.includes('vencid')) {
            return 'warning';
        }

        return 'info';
    }

    protected getToggleTitle(status: UserRecord['status']): string {
        const value = this.normalizeForCompare(status);
        return value.includes('inhabil') || value.includes('inactivo') ? 'Activar' : 'Inhabilitar';
    }

    private loadUsers(page = 1, search = this.searchTerm().trim()): void {
        const query: UsersQuery = {
            busqueda: search || undefined,
            pagina: page,
            porPagina: this.pagination().porPagina,
        };

        this.isLoading.set(true);
        this.errorMessage.set(null);

        this.usersFacade
            .getUsers(query)
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (response) => {
                    this.users.set(response.usuarios);
                    this.pagination.set(response.paginacion);
                },
                error: (error: unknown) => {
                    this.users.set([]);
                    this.pagination.set({
                        ...DEFAULT_PAGINATION,
                        porPagina: query.porPagina ?? DEFAULT_PAGINATION.porPagina,
                    });
                    this.errorMessage.set(this.toFriendlyError(error));
                },
            });
    }

    private toDetailDisplayForm(datos: Record<string, unknown>): DetailDisplayForm {
        const personal = this.toRecord(datos['s1DatosPersonales']);
        const assignment = this.toRecord(datos['s2Adscripcion']);
        const commission = this.toRecord(datos['s3Comision']);
        const contact = this.toRecord(datos['s5Contacto']);
        const profiles = this.toArray(datos['s6Perfiles']);
        const documents = this.toArray(datos['s4Archivos']);

        return {
            cuip: this.readText(personal, 'cuip'),
            policeIdentificationKey: this.readFirstText(personal, ['claveUnicaIdentificacionPolicial', 'policeIdentificationKey']),
            curp: this.readText(personal, 'curp'),
            rfc: this.readText(personal, 'rfc'),
            firstName: this.readText(personal, 'nombres'),
            lastName: this.readText(personal, 'primerApellido'),
            secondLastName: this.readText(personal, 'segundoApellido'),
            birthDate: this.toDateOnly(this.readText(personal, 'fechaNacimiento')),
            gender: this.readText(personal, 'sexo'),

            institutionType: this.readText(assignment, 'tipoInstitucion'),
            entity: this.readText(assignment, 'estado'),
            municipality: this.readFirstText(assignment, ['municipio', 'alcaldia']),
            institution: this.readText(assignment, 'institucion'),
            decentralizedBody: this.readFirstText(assignment, ['organoDesconcentrado', 'dependencia']),
            administrativeUnit: this.readFirstText(assignment, ['unidadAdministrativa', 'unidad']),
            position: this.readText(assignment, 'cargo'),
            functions: this.readText(assignment, 'funciones'),
            admissionDate: this.toDateOnly(this.readText(assignment, 'fechaInicio')),
            employeeNumber: this.readText(assignment, 'numeroEmpleado'),

            commissionInstitutionType: this.readText(commission, 'tipoInstitucion'),
            commissionInstitution: this.readText(commission, 'institucion'),
            commissionEntity: this.readText(commission, 'estado'),
            commissionMunicipality: this.readFirstText(commission, ['municipio', 'alcaldia']),
            commissionDependency: this.readFirstText(commission, ['dependencia', 'cargo']),
            commissionDecentralizedBody: this.readText(commission, 'organoDesconcentrado'),
            commissionAdministrativeUnit: this.readFirstText(commission, ['unidadAdministrativa', 'unidad']),

            email: this.readText(contact, 'correo') || this.readText(datos, 'correo'),
            phone: this.readFirstText(contact, ['celular', 'telefono', 'phone']),
            extension: this.readFirstText(contact, ['extension', 'ext']),

            username: this.readText(datos, 'cuenta'),
            password: '',
            confirmPassword: '',
            accountStatus: this.readText(datos, 'estatus'),

            profiles: profiles.map((item, index) => this.toProfileViewModel(item, index)),
            documents: documents.map((item, index) => this.toDocumentViewModel(item, index)),
        };
    }

    private toProfileViewModel(value: unknown, index: number): DetailProfileViewModel {
        const record = this.toRecord(value);
        const systemLabel = this.readText(record, 'sistema');
        const roleLabel = this.readText(record, 'perfil');

        return {
            id: `profile-${index}`,
            systemLabel,
            roleLabel,
        };
    }

    private toDocumentViewModel(value: unknown, index: number): DetailDocumentViewModel {
        const record = this.toRecord(value);
        const label = this.readFirstText(record, ['tipoDocumento', 'tipo', 'nombre', 'label']) || `Documento ${index + 1}`;
        const fileName = this.readFirstText(record, ['nombreArchivo', 'archivo', 'fileName', 'url']);
        const description = this.readFirstText(record, ['descripcion', 'description', 'estatus']);

        return {
            id: `document-${index}`,
            label,
            fileName,
            description,
        };
    }

    private readText(record: Record<string, unknown>, key: string): string {
        const value = record[key];

        if (value === null || value === undefined) {
            return '';
        }

        if (typeof value === 'string') {
            return value.trim();
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }

        return '';
    }

    private readFirstText(record: Record<string, unknown>, keys: readonly string[]): string {
        return keys.map((key) => this.readText(record, key)).find((value) => value.length > 0) ?? '';
    }

    private toRecord(value: unknown): Record<string, unknown> {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value as Record<string, unknown>;
        }

        return {};
    }

    private toArray(value: unknown): readonly unknown[] {
        return Array.isArray(value) ? value : [];
    }

    private toDateOnly(value: string): string {
        if (!value) {
            return '';
        }

        const match = value.match(/^\d{4}-\d{2}-\d{2}/);
        return match ? match[0] : value;
    }

    private normalizeForCompare(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    private toFriendlyError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        return 'Ocurrió un error inesperado al consultar usuarios.';
    }
}
