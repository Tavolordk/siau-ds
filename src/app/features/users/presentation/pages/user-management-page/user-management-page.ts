import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, Subject } from 'rxjs';
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

interface DetailFieldViewModel {
    readonly key: string;
    readonly label: string;
    readonly value: string;
    readonly placeholder: string;
    readonly required: boolean;
}

interface DetailItemViewModel {
    readonly key: string;
    readonly title: string;
    readonly subtitle: string;
    readonly fields: readonly DetailFieldViewModel[];
}

interface DetailStepViewModel {
    readonly id: DetailStepId;
    readonly label: string;
    readonly title: string;
    readonly description: string;
    readonly icon: string;
    readonly fields: readonly DetailFieldViewModel[];
    readonly items: readonly DetailItemViewModel[];
    readonly emptyMessage: string | null;
}

interface DetailFieldDefinition {
    readonly key: string;
    readonly label: string;
    readonly placeholder: string;
    readonly required?: boolean;
}

const DEFAULT_PAGINATION: UserPagination = {
    totalRegistros: 0,
    totalPaginas: 1,
    paginaActual: 1,
    porPagina: 20,
};

const PERSONAL_DATA_FIELDS: readonly DetailFieldDefinition[] = [
    { key: 'curp', label: 'CURP', placeholder: 'Ej. MARL900101HDFRNS09', required: true },
    { key: 'rfc', label: 'RFC', placeholder: 'Ej. MARL900101AB9', required: true },
    { key: 'nombres', label: 'Nombre(s)', placeholder: 'Nombre(s)', required: true },
    { key: 'primerApellido', label: 'Primer apellido', placeholder: 'Primer apellido', required: true },
    { key: 'segundoApellido', label: 'Segundo apellido', placeholder: 'Segundo apellido' },
    { key: 'sexo', label: 'Sexo', placeholder: 'Sexo' },
    { key: 'fechaNacimiento', label: 'Fecha nacimiento', placeholder: 'dd/mm/aaaa' },
    { key: 'estadoCivil', label: 'Estado civil', placeholder: 'Estado civil' },
    { key: 'cuip', label: 'CUIP', placeholder: 'CUIP' },
];

const ASSIGNMENT_FIELDS: readonly DetailFieldDefinition[] = [
    { key: 'cargo', label: 'Cargo', placeholder: 'Cargo' },
    { key: 'institucion', label: 'Institución', placeholder: 'Institución' },
    { key: 'siglas', label: 'Siglas', placeholder: 'Siglas' },
    { key: 'tipoInstitucion', label: 'Tipo institución', placeholder: 'Tipo institución' },
    { key: 'numeroEmpleado', label: 'Número empleado', placeholder: 'Número empleado' },
    { key: 'fechaInicio', label: 'Fecha inicio', placeholder: 'dd/mm/aaaa' },
    { key: 'estado', label: 'Estado', placeholder: 'Estado' },
    { key: 'funciones', label: 'Funciones', placeholder: 'Funciones' },
];

const CONTACT_FIELDS: readonly DetailFieldDefinition[] = [
    { key: 'correo', label: 'Correo', placeholder: 'correo@dominio.gob.mx' },
    { key: 'celular', label: 'Celular', placeholder: 'Celular' },
];

const ACCOUNT_FIELDS: readonly DetailFieldDefinition[] = [
    { key: 'correo', label: 'Correo', placeholder: 'correo@dominio.gob.mx' },
    { key: 'cuenta', label: 'Cuenta', placeholder: 'Cuenta' },
    { key: 'estatus', label: 'Estatus', placeholder: 'Estatus' },
    { key: 'tipoUsuario', label: 'Tipo usuario', placeholder: 'Tipo usuario' },
];

const PROFILE_FIELDS: readonly DetailFieldDefinition[] = [
    { key: 'perfil', label: 'Perfil', placeholder: 'Perfil' },
    { key: 'sistema', label: 'Sistema', placeholder: 'Sistema' },
];

const DOCUMENT_FIELDS: readonly DetailFieldDefinition[] = [
    { key: 'nombreArchivo', label: 'Nombre archivo', placeholder: 'Nombre archivo' },
    { key: 'tipoDocumento', label: 'Tipo documento', placeholder: 'Tipo documento' },
    { key: 'estatus', label: 'Estatus', placeholder: 'Estatus' },
];

@Component({
    selector: 'app-user-management-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, SiauLucideIcon, UserRegistrationWizard],
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

    protected readonly filteredUsers = computed(() => this.users());
    protected readonly canGoPrevious = computed(() => this.pagination().paginaActual > 1);
    protected readonly canGoNext = computed(() => this.pagination().paginaActual < this.pagination().totalPaginas);

    protected readonly detailTitle = computed(() => this.selectedUser()?.fullName ?? 'Detalle del usuario');

    protected readonly detailSubtitle = computed(() => {
        const user = this.selectedUser();

        if (!user) {
            return 'Consulta individual de usuario';
        }

        return `${user.username} · ${user.role}`;
    });

    protected readonly detailInitials = computed(() => {
        const user = this.selectedUser();
        const baseText = user?.fullName || user?.username || 'Usuario';
        const parts = baseText
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!parts.length) {
            return 'US';
        }

        if (parts.length === 1) {
            return parts[0].slice(0, 2).toUpperCase();
        }

        return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
    });

    protected readonly detailHeaderBadge = computed(() => 'Completo');

    protected readonly detailSteps = computed<readonly DetailStepViewModel[]>(() => {
        const datos = this.selectedUserDetail()?.datos ?? null;

        if (!datos) {
            return [];
        }

        return this.buildDetailSteps(datos);
    });

    protected readonly activeDetailStep = computed<DetailStepViewModel | null>(() => {
        const steps = this.detailSteps();

        if (!steps.length) {
            return null;
        }

        return steps.find((step) => step.id === this.activeDetailStepId()) ?? steps[0];
    });

    protected readonly activeDetailStepNumber = computed(() => {
        const steps = this.detailSteps();

        if (!steps.length) {
            return 1;
        }

        const index = steps.findIndex((step) => step.id === this.activeDetailStepId());
        return index >= 0 ? index + 1 : 1;
    });

    protected readonly detailProgressSegments = computed(() => {
        const total = this.detailSteps().length || 1;

        return Array.from({ length: total }).map((_, index) => ({
            id: `detail-segment-${index + 1}`,
            active: true,
        }));
    });

    protected readonly canGoPreviousDetailStep = computed(() => this.activeDetailStepNumber() > 1);

    protected readonly canGoNextDetailStep = computed(() => {
        const total = this.detailSteps().length;
        return total > 0 && this.activeDetailStepNumber() < total;
    });

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
                    this.activeDetailStepId.set(this.detailSteps()[0]?.id ?? 'personal-data');
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
        const steps = this.detailSteps();
        const currentIndex = steps.findIndex((step) => step.id === this.activeDetailStepId());

        if (currentIndex <= 0) {
            return;
        }

        this.activeDetailStepId.set(steps[currentIndex - 1].id);
    }

    protected nextDetailStep(): void {
        const steps = this.detailSteps();
        const currentIndex = steps.findIndex((step) => step.id === this.activeDetailStepId());

        if (currentIndex < 0 || currentIndex >= steps.length - 1) {
            return;
        }

        this.activeDetailStepId.set(steps[currentIndex + 1].id);
    }

    protected saveDetailChanges(): void {
        this.closeUserDetail();
    }

    protected getDetailStepClass(stepId: DetailStepId): string {
        return [
            'edit-user-modal__step',
            this.activeDetailStepId() === stepId ? 'edit-user-modal__step--active' : '',
        ]
            .join(' ')
            .trim();
    }

    protected isDetailStepCompleted(step: DetailStepViewModel): boolean {
        return Boolean(step.fields.length || step.items.length || step.emptyMessage);
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

    private buildDetailSteps(datos: Record<string, unknown>): readonly DetailStepViewModel[] {
        return [
            this.createFixedDetailStep(
                'personal-data',
                'Datos Personales',
                'Datos Personales',
                'Información de identidad oficial del usuario',
                'user',
                this.toRecord(datos['s1DatosPersonales']),
                PERSONAL_DATA_FIELDS,
            ),
            this.createFixedDetailStep(
                'assignment',
                'Adscripción',
                'Adscripción',
                'Centro de trabajo y datos laborales del usuario',
                'building-2',
                this.toRecord(datos['s2Adscripcion']),
                ASSIGNMENT_FIELDS,
            ),
            this.createMixedDetailStep(
                'commission',
                'Comisión',
                'Comisión',
                'Datos de comisión interinstitucional si aplica',
                'briefcase',
                datos['s3Comision'],
                ASSIGNMENT_FIELDS,
                'Sin comisión registrada.',
            ),
            this.createArrayDetailStep(
                'documents',
                'Archivos',
                'Archivos',
                'Documentos registrados del usuario',
                'file-text',
                datos['s4Archivos'],
                DOCUMENT_FIELDS,
                'Sin archivos registrados.',
            ),
            this.createFixedDetailStep(
                'contact',
                'Medio de Contacto',
                'Medio de Contacto',
                'Correo y teléfono registrados',
                'phone',
                this.toRecord(datos['s5Contacto']),
                CONTACT_FIELDS,
                'Sin medios de contacto registrados.',
            ),
            this.createArrayDetailStep(
                'profiles',
                'Perfiles',
                'Perfiles',
                'Perfiles y sistemas asignados al usuario',
                'shield',
                datos['s6Perfiles'],
                PROFILE_FIELDS,
                'Sin perfiles registrados.',
            ),
            this.createFixedDetailStep(
                'account',
                'Cuenta',
                'Cuenta',
                'Información principal de acceso del usuario',
                'key-round',
                {
                    correo: datos['correo'],
                    cuenta: datos['cuenta'],
                    estatus: datos['estatus'],
                    tipoUsuario: datos['tipoUsuario'],
                },
                ACCOUNT_FIELDS,
                'Sin información de cuenta registrada.',
            ),
        ];
    }

    private createFixedDetailStep(
        id: DetailStepId,
        label: string,
        title: string,
        description: string,
        icon: string,
        record: Record<string, unknown>,
        definitions: readonly DetailFieldDefinition[],
        emptyMessage: string | null = null,
    ): DetailStepViewModel {
        return {
            id,
            label,
            title,
            description,
            icon,
            fields: this.createFieldsFromDefinitions(record, definitions),
            items: [],
            emptyMessage,
        };
    }

    private createMixedDetailStep(
        id: DetailStepId,
        label: string,
        title: string,
        description: string,
        icon: string,
        value: unknown,
        definitions: readonly DetailFieldDefinition[],
        emptyMessage: string,
    ): DetailStepViewModel {
        if (this.isPlainObject(value)) {
            return this.createFixedDetailStep(id, label, title, description, icon, value, definitions, null);
        }

        return {
            id,
            label,
            title,
            description,
            icon,
            fields: [],
            items: [],
            emptyMessage,
        };
    }

    private createArrayDetailStep(
        id: DetailStepId,
        label: string,
        title: string,
        description: string,
        icon: string,
        value: unknown,
        definitions: readonly DetailFieldDefinition[],
        emptyMessage: string,
    ): DetailStepViewModel {
        if (!Array.isArray(value) || !value.length) {
            return {
                id,
                label,
                title,
                description,
                icon,
                fields: [],
                items: [],
                emptyMessage,
            };
        }

        return {
            id,
            label,
            title,
            description,
            icon,
            fields: [],
            items: value.map((item, index) => this.createDetailItem(id, item, index, definitions)),
            emptyMessage: null,
        };
    }

    private createDetailItem(
        sectionId: DetailStepId,
        value: unknown,
        index: number,
        definitions: readonly DetailFieldDefinition[],
    ): DetailItemViewModel {
        const record = this.toRecord(value);
        const title = this.getFirstTextValue(record, ['perfil', 'sistema', 'nombre', 'nombreArchivo', 'archivo']) || `Registro ${index + 1}`;
        const subtitle = this.getFirstTextValue(record, ['sistema', 'estatus', 'tipoDocumento']);

        return {
            key: `${sectionId}-${index}`,
            title,
            subtitle,
            fields: this.createFieldsFromDefinitions(record, definitions),
        };
    }

    private createFieldsFromDefinitions(
        record: Record<string, unknown>,
        definitions: readonly DetailFieldDefinition[],
    ): readonly DetailFieldViewModel[] {
        return definitions.map((definition) => ({
            key: definition.key,
            label: definition.label,
            placeholder: definition.placeholder,
            required: Boolean(definition.required),
            value: this.formatPrimitiveValue(record[definition.key]),
        }));
    }

    private toRecord(value: unknown): Record<string, unknown> {
        return this.isPlainObject(value) ? value : {};
    }

    private getFirstTextValue(record: Record<string, unknown>, keys: readonly string[]): string {
        const value = keys
            .map((key) => record[key])
            .find((item) => typeof item === 'string' && item.trim().length > 0);

        return typeof value === 'string' ? value.trim() : '';
    }

    private formatPrimitiveValue(value: unknown): string {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        if (typeof value === 'boolean') {
            return value ? 'Sí' : 'No';
        }

        if (typeof value === 'number') {
            return String(value);
        }

        if (typeof value === 'string') {
            return this.formatPossibleDate(value);
        }

        return String(value);
    }

    private formatPossibleDate(value: string): string {
        const trimmedValue = value.trim();

        if (!/^\d{4}-\d{2}-\d{2}/.test(trimmedValue)) {
            return trimmedValue;
        }

        const date = new Date(trimmedValue);

        if (Number.isNaN(date.getTime())) {
            return trimmedValue;
        }

        return new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: trimmedValue.includes('T') ? 'short' : undefined,
        }).format(date);
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
