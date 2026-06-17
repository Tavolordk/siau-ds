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

interface DetailFieldViewModel {
    readonly key: string;
    readonly label: string;
    readonly value: string;
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

const DEFAULT_PAGINATION: UserPagination = {
    totalRegistros: 0,
    totalPaginas: 1,
    paginaActual: 1,
    porPagina: 20,
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

    protected readonly detailHeaderBadge = computed(() => 'Completo');

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
            'registration-wizard__step',
            this.activeDetailStepId() === stepId ? 'registration-wizard__step--active' : '',
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

    protected formatDate(value: string | null): string {
        if (!value) {
            return 'No capturado';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
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
        const accountFields = this.objectToFields({
            correo: datos['correo'],
            cuenta: datos['cuenta'],
            estatus: datos['estatus'],
            tipoUsuario: datos['tipoUsuario'],
        });

        const steps: DetailStepViewModel[] = [
            this.createDetailStep(
                'personal-data',
                'Datos Personales',
                'Datos Personales',
                'Información de identidad oficial del usuario',
                'user',
                this.pickOrderedFields(datos['s1DatosPersonales'], [
                    'curp',
                    'rfc',
                    'nombres',
                    'primerApellido',
                    'segundoApellido',
                    'sexo',
                    'fechaNacimiento',
                    'estadoCivil',
                    'cuip',
                ]),
            ),
            this.createDetailStep(
                'assignment',
                'Adscripción',
                'Adscripción',
                'Centro de trabajo y datos laborales del usuario',
                'building-2',
                datos['s2Adscripcion'],
            ),
            this.createDetailStep(
                'commission',
                'Comisión',
                'Comisión',
                'Datos de comisión interinstitucional si aplica',
                'briefcase',
                datos['s3Comision'],
                'Sin comisión registrada.',
            ),
            this.createDetailStep(
                'documents',
                'Archivos',
                'Archivos',
                'Documentos registrados del usuario',
                'file-text',
                datos['s4Archivos'],
                'Sin archivos registrados.',
            ),
            this.createDetailStep(
                'contact',
                'Medio de Contacto',
                'Medio de Contacto',
                'Correo y teléfono registrados',
                'phone',
                datos['s5Contacto'],
                'Sin medios de contacto registrados.',
            ),
            this.createDetailStep(
                'profiles',
                'Perfiles',
                'Perfiles',
                'Perfiles y sistemas asignados al usuario',
                'shield',
                datos['s6Perfiles'],
                'Sin perfiles registrados.',
            ),
            {
                id: 'account',
                label: 'Cuenta',
                title: 'Cuenta',
                description: 'Información principal de acceso del usuario',
                icon: 'key-round',
                fields: accountFields,
                items: [],
                emptyMessage: accountFields.length ? null : 'Sin información de cuenta registrada.',
            },
        ];

        return steps.filter((step) => step.fields.length || step.items.length || step.emptyMessage);
    }

    private pickOrderedFields(value: unknown, keys: readonly string[]): unknown {
        if (!this.isPlainObject(value)) {
            return value;
        }

        const source = value as Record<string, unknown>;
        const ordered: Record<string, unknown> = {};

        keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                ordered[key] = source[key];
            }
        });

        Object.entries(source).forEach(([key, fieldValue]) => {
            if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
                ordered[key] = fieldValue;
            }
        });

        return ordered;
    }

    private createDetailStep(
        id: DetailStepId,
        label: string,
        title: string,
        description: string,
        icon: string,
        value: unknown,
        emptyMessage = 'Sin información registrada.',
    ): DetailStepViewModel {
        if (Array.isArray(value)) {
            return {
                id,
                label,
                title,
                description,
                icon,
                fields: [],
                items: value.map((item, index) => this.createDetailItem(id, item, index)),
                emptyMessage: value.length ? null : emptyMessage,
            };
        }

        if (this.isPlainObject(value)) {
            const fields = this.objectToFields(value as Record<string, unknown>);

            return {
                id,
                label,
                title,
                description,
                icon,
                fields,
                items: [],
                emptyMessage: fields.length ? null : emptyMessage,
            };
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

    private createDetailItem(sectionId: DetailStepId, value: unknown, index: number): DetailItemViewModel {
        if (!this.isPlainObject(value)) {
            return {
                key: `${sectionId}-${index}`,
                title: `Registro ${index + 1}`,
                subtitle: '',
                fields: [
                    {
                        key: `${sectionId}-${index}-value`,
                        label: 'Valor',
                        value: this.formatPrimitiveValue(value),
                    },
                ],
            };
        }

        const record = value as Record<string, unknown>;
        const title =
            this.getFirstTextValue(record, ['perfil', 'sistema', 'nombre', 'nombreArchivo', 'archivo']) ||
            `Registro ${index + 1}`;
        const subtitle = this.getFirstTextValue(record, ['sistema', 'estatus', 'tipoDocumento']);

        return {
            key: `${sectionId}-${index}`,
            title,
            subtitle,
            fields: this.objectToFields(record),
        };
    }

    private objectToFields(value: Record<string, unknown>): readonly DetailFieldViewModel[] {
        return Object.entries(value)
            .filter(([key]) => !this.shouldHideDetailKey(key))
            .filter(([, fieldValue]) => !this.isEmptyValue(fieldValue))
            .flatMap(([key, fieldValue]) => this.valueToFields(key, fieldValue));
    }

    private valueToFields(key: string, value: unknown): readonly DetailFieldViewModel[] {
        if (Array.isArray(value)) {
            if (!value.length) {
                return [];
            }

            if (value.every((item) => !this.isPlainObject(item) && !Array.isArray(item))) {
                return [
                    {
                        key,
                        label: this.formatDetailLabel(key),
                        value: value.map((item) => this.formatPrimitiveValue(item)).join(', '),
                    },
                ];
            }

            return value.flatMap((item, index) => {
                if (!this.isPlainObject(item)) {
                    return [
                        {
                            key: `${key}-${index}`,
                            label: `${this.formatDetailLabel(key)} ${index + 1}`,
                            value: this.formatPrimitiveValue(item),
                        },
                    ];
                }

                return Object.entries(item as Record<string, unknown>)
                    .filter(([nestedKey]) => !this.shouldHideDetailKey(nestedKey))
                    .filter(([, nestedValue]) => !this.isEmptyValue(nestedValue))
                    .map(([nestedKey, nestedValue]) => ({
                        key: `${key}-${index}-${nestedKey}`,
                        label: `${this.formatDetailLabel(key)} ${index + 1} · ${this.formatDetailLabel(nestedKey)}`,
                        value: this.formatPrimitiveValue(nestedValue),
                    }));
            });
        }

        if (this.isPlainObject(value)) {
            return Object.entries(value as Record<string, unknown>)
                .filter(([nestedKey]) => !this.shouldHideDetailKey(nestedKey))
                .filter(([, nestedValue]) => !this.isEmptyValue(nestedValue))
                .map(([nestedKey, nestedValue]) => ({
                    key: `${key}-${nestedKey}`,
                    label: this.formatDetailLabel(nestedKey),
                    value: this.formatPrimitiveValue(nestedValue),
                }));
        }

        return [
            {
                key,
                label: this.formatDetailLabel(key),
                value: this.formatPrimitiveValue(value),
            },
        ];
    }

    private shouldHideDetailKey(key: string): boolean {
        const normalizedKey = key.trim().toLowerCase();

        if (!normalizedKey) {
            return true;
        }

        if (normalizedKey === 'traceid') {
            return true;
        }

        if (normalizedKey.endsWith('id')) {
            return true;
        }

        if (normalizedKey.endsWith('clave')) {
            return true;
        }

        return false;
    }

    private getFirstTextValue(record: Record<string, unknown>, keys: readonly string[]): string {
        const value = keys
            .map((key) => record[key])
            .find((item) => typeof item === 'string' && item.trim().length > 0);

        return typeof value === 'string' ? value.trim() : '';
    }

    private formatDetailLabel(key: string): string {
        const labels: Record<string, string> = {
            correo: 'Correo',
            cuenta: 'Cuenta',
            estatus: 'Estatus',
            tipoUsuario: 'Tipo usuario',
            rfc: 'RFC',
            curp: 'CURP',
            cuip: 'CUIP',
            sexo: 'Sexo',
            nombres: 'Nombre(s)',
            estadoCivil: 'Estado civil',
            primerApellido: 'Primer apellido',
            segundoApellido: 'Segundo apellido',
            fechaNacimiento: 'Fecha nacimiento',
            cargo: 'Cargo',
            estado: 'Estado',
            siglas: 'Siglas',
            funciones: 'Funciones',
            fechaInicio: 'Fecha inicio',
            institucion: 'Institución',
            numeroEmpleado: 'Número empleado',
            tipoInstitucion: 'Tipo institución',
            celular: 'Celular',
            perfil: 'Perfil',
            sistema: 'Sistema',
            rnpsp: 'RNPSP',
            cConfianza: 'C. Confianza',
            fechaAlta: 'Fecha alta',
            fechaActualizacion: 'Fecha actualización',
        };

        if (labels[key]) {
            return labels[key];
        }

        return key
            .replace(/^s\d+/i, '')
            .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^./, (value) => value.toUpperCase());
    }

    private formatPrimitiveValue(value: unknown): string {
        if (value === null || value === undefined || value === '') {
            return 'No capturado';
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

    private isEmptyValue(value: unknown): boolean {
        if (value === null || value === undefined || value === '') {
            return true;
        }

        if (Array.isArray(value)) {
            return value.length === 0;
        }

        if (this.isPlainObject(value)) {
            return Object.keys(value).length === 0;
        }

        return false;
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