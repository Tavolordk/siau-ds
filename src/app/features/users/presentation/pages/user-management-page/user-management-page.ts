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

interface DetailFieldViewModel {
    readonly key: string;
    readonly label: string;
    readonly value: string;
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

    protected readonly filteredUsers = computed(() => this.users());
    protected readonly canGoPrevious = computed(() => this.pagination().paginaActual > 1);
    protected readonly canGoNext = computed(() => this.pagination().paginaActual < this.pagination().totalPaginas);
    protected readonly detailTitle = computed(() => this.selectedUser()?.fullName ?? 'Detalle del usuario');

    protected readonly detailSubtitle = computed(() => {
        const user = this.selectedUser();

        if (!user) {
            return 'Consulta individual de usuario';
        }

        return `${user.username} · ID ${user.userId}`;
    });

    protected readonly detailFields = computed<readonly DetailFieldViewModel[]>(() => {
        const datos = this.selectedUserDetail()?.datos ?? null;

        if (!datos) {
            return [];
        }

        return Object.entries(datos).map(([key, value]) => ({
            key,
            label: this.formatDetailLabel(key),
            value: this.formatDetailValue(value),
        }));
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
            this.detailErrorMessage.set('No se puede consultar el detalle porque el usuario no tiene ID.');
            this.selectedUser.set(user);
            this.selectedUserDetail.set(null);
            this.isDetailOpen.set(true);
            return;
        }

        this.selectedUser.set(user);
        this.selectedUserDetail.set(null);
        this.detailErrorMessage.set(null);
        this.isDetailLoading.set(true);
        this.isDetailOpen.set(true);

        this.usersFacade
            .getUserDetail(user.userId)
            .pipe(finalize(() => this.isDetailLoading.set(false)))
            .subscribe({
                next: (detail) => {
                    this.selectedUserDetail.set(detail);
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

    private formatDetailLabel(key: string): string {
        return key
            .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^./, (value) => value.toUpperCase());
    }

    private formatDetailValue(value: unknown): string {
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

        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
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