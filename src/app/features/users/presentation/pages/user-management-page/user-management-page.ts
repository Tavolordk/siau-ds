import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, Subject, timeout } from 'rxjs';
import { AuthStorage } from '../../../../../core/auth/data-access/auth.storage';
import { SiauModal } from '../../../../../shared/ui';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UsersFacade } from '../../../application/users.facade';
import {
    SolicitudOperacionRequest,
    UserDetailRecord,
    UserPagination,
    UserRecord,
    UsersQuery,
} from '../../../domain/models/user-record.model';
import { UserRegistrationWizard } from '../../components/user-registration-wizard/user-registration-wizard';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'dark' | 'light';
type UserWizardMode = 'create' | 'edit';

const DEFAULT_PAGINATION: UserPagination = {
    totalRegistros: 0,
    totalPaginas: 1,
    paginaActual: 1,
    porPagina: 8,
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
    private readonly authStorage = inject(AuthStorage);
    private readonly searchTermChanges = new Subject<string>();

    private detailRequestSequence = 0;

    protected readonly searchTerm = signal<string>('');
    protected readonly users = signal<readonly UserRecord[]>([]);
    protected readonly pagination = signal<UserPagination>(DEFAULT_PAGINATION);
    protected readonly isLoading = signal<boolean>(false);
    protected readonly errorMessage = signal<string | null>(null);

    protected readonly isUserWizardOpen = signal<boolean>(false);
    protected readonly userWizardMode = signal<UserWizardMode>('create');
    protected readonly selectedUser = signal<UserRecord | null>(null);
    protected readonly selectedUserDetail = signal<UserDetailRecord | null>(null);
    protected readonly isDetailLoading = signal<boolean>(false);

    protected readonly isBajaModalOpen = signal<boolean>(false);
    protected readonly bajaTargetUser = signal<UserRecord | null>(null);
    protected readonly bajaComment = signal<string>('');
    protected readonly bajaCommentError = signal<string | null>(null);
    protected readonly isBajaSubmitting = signal<boolean>(false);

    protected readonly isStatusModalOpen = signal<boolean>(false);
    protected readonly statusTargetUser = signal<UserRecord | null>(null);
    protected readonly statusComment = signal<string>('');
    protected readonly statusCommentError = signal<string | null>(null);
    protected readonly isStatusSubmitting = signal<boolean>(false);

    protected readonly filteredUsers = computed(() => this.users());
    protected readonly canGoPrevious = computed(() => this.pagination().paginaActual > 1);
    protected readonly canGoNext = computed(() => this.pagination().paginaActual < this.pagination().totalPaginas);

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
        this.detailRequestSequence++;
        this.userWizardMode.set('create');
        this.selectedUser.set(null);
        this.selectedUserDetail.set(null);
        this.isDetailLoading.set(false);
        this.errorMessage.set(null);
        this.isUserWizardOpen.set(true);
    }

    protected openUserDetail(user: UserRecord): void {
        if (this.isUserBaja(user)) {
            this.errorMessage.set('El usuario ya está dado de baja y no puede editarse.');
            return;
        }

        const userId = this.resolveTargetUserId(user);

        if (!userId) {
            this.errorMessage.set('No se puede consultar el detalle porque el usuario no tiene identificador interno.');
            return;
        }

        const requestId = ++this.detailRequestSequence;

        this.selectedUser.set(user);
        this.selectedUserDetail.set(null);
        this.userWizardMode.set('edit');
        this.errorMessage.set(null);
        this.isDetailLoading.set(true);
        this.isUserWizardOpen.set(true);

        this.usersFacade
            .getUserDetail(userId)
            .pipe(timeout(15000))
            .subscribe({
                next: (detail) => {
                    if (requestId !== this.detailRequestSequence) {
                        return;
                    }

                    this.selectedUserDetail.set(detail);
                    this.isDetailLoading.set(false);
                },
                error: (error: unknown) => {
                    if (requestId !== this.detailRequestSequence) {
                        return;
                    }

                    this.selectedUserDetail.set(null);
                    this.isDetailLoading.set(false);
                    this.errorMessage.set(this.toFriendlyError(error));
                },
            });
    }

    protected closeUserWizard(): void {
        this.detailRequestSequence++;
        this.isDetailLoading.set(false);
        this.isUserWizardOpen.set(false);
        this.userWizardMode.set('create');
        this.selectedUser.set(null);
        this.selectedUserDetail.set(null);
    }

    protected openBajaModal(user: UserRecord): void {
        this.bajaTargetUser.set(user);
        this.bajaComment.set('');
        this.bajaCommentError.set(null);
        this.errorMessage.set(null);
        this.isBajaModalOpen.set(true);

        if (this.isUserBaja(user)) {
            this.bajaCommentError.set('El usuario ya está dado de baja.');
            return;
        }

        if (!this.resolveTargetUserId(user)) {
            this.bajaCommentError.set('No se encontró el identificador interno del usuario. Revisa el mapeo de usuarioId.');
        }
    }

    protected closeBajaModal(): void {
        if (this.isBajaSubmitting()) {
            return;
        }

        this.isBajaModalOpen.set(false);
        this.bajaTargetUser.set(null);
        this.bajaComment.set('');
        this.bajaCommentError.set(null);
    }

    protected updateBajaComment(value: string): void {
        const normalizedValue = String(value ?? '').toUpperCase();

        this.bajaComment.set(normalizedValue);

        if (normalizedValue.trim()) {
            this.bajaCommentError.set(null);
        }
    }

    protected confirmDarDeBajaUsuario(): void {
        const user = this.bajaTargetUser();
        const userId = this.resolveTargetUserId(user);

        if (!user || !userId) {
            this.bajaCommentError.set('No se puede dar de baja porque el usuario no tiene identificador interno.');
            return;
        }

        if (this.isUserBaja(user)) {
            this.bajaCommentError.set('El usuario ya está dado de baja.');
            return;
        }

        const comentarioNormalizado = this.bajaComment().trim().toUpperCase();

        if (!comentarioNormalizado) {
            this.bajaCommentError.set('El comentario de baja es obligatorio.');
            return;
        }

        const request: SolicitudOperacionRequest = {
            usuarioId: userId,
            comentario: comentarioNormalizado,
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-baja-${Date.now()}`,
            },
        };

        this.isBajaSubmitting.set(true);
        this.errorMessage.set(null);
        this.bajaCommentError.set(null);

        this.usersFacade
            .darDeBajaUsuario(request)
            .pipe(finalize(() => this.isBajaSubmitting.set(false)))
            .subscribe({
                next: () => {
                    this.isBajaSubmitting.set(false);
                    this.isBajaModalOpen.set(false);
                    this.bajaTargetUser.set(null);
                    this.bajaComment.set('');
                    this.bajaCommentError.set(null);
                    this.reloadUsers();
                },
                error: (error: unknown) => {
                    this.bajaCommentError.set(this.toFriendlyError(error));
                },
            });
    }

    protected openStatusModal(user: UserRecord): void {
        this.statusTargetUser.set(user);
        this.statusComment.set('');
        this.statusCommentError.set(null);
        this.errorMessage.set(null);
        this.isStatusModalOpen.set(true);

        if (this.isUserBaja(user) || this.isUserInactiveNonReactivable(user)) {
            this.statusCommentError.set('La cuenta inhabilitada o dada de baja no es reactivable.');
            return;
        }

        if (!this.resolveTargetUserId(user)) {
            this.statusCommentError.set('No se encontró el identificador interno del usuario. Revisa el mapeo de usuarioId.');
        }
    }

    protected closeStatusModal(): void {
        if (this.isStatusSubmitting()) {
            return;
        }

        this.isStatusModalOpen.set(false);
        this.statusTargetUser.set(null);
        this.statusComment.set('');
        this.statusCommentError.set(null);
    }

    protected updateStatusComment(value: string): void {
        const normalizedValue = String(value ?? '').toUpperCase();

        this.statusComment.set(normalizedValue);

        if (normalizedValue.trim()) {
            this.statusCommentError.set(null);
        }
    }

    protected confirmToggleUserStatus(): void {
        const user = this.statusTargetUser();
        const userId = this.resolveTargetUserId(user);

        if (!user || !userId) {
            this.statusCommentError.set('No se puede procesar la operación porque el usuario no tiene identificador interno.');
            return;
        }

        if (this.isUserBaja(user) || this.isUserInactiveNonReactivable(user)) {
            this.statusCommentError.set('La cuenta inhabilitada o dada de baja no es reactivable.');
            return;
        }

        const comentarioNormalizado = this.statusComment().trim().toUpperCase();

        if (!comentarioNormalizado) {
            this.statusCommentError.set('El comentario es obligatorio.');
            return;
        }

        const request: SolicitudOperacionRequest = {
            usuarioId: userId,
            comentario: comentarioNormalizado,
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-status-${Date.now()}`,
            },
        };

        const operation$ = this.isUserSuspended(user)
            ? this.usersFacade.reactivarUsuario(request)
            : this.usersFacade.suspenderUsuario(request);

        this.isStatusSubmitting.set(true);
        this.errorMessage.set(null);
        this.statusCommentError.set(null);

        operation$
            .pipe(finalize(() => this.isStatusSubmitting.set(false)))
            .subscribe({
                next: () => {
                    this.isStatusSubmitting.set(false);
                    this.isStatusModalOpen.set(false);
                    this.statusTargetUser.set(null);
                    this.statusComment.set('');
                    this.statusCommentError.set(null);
                    this.reloadUsers();
                },
                error: (error: unknown) => {
                    this.statusCommentError.set(this.toFriendlyError(error));
                },
            });
    }

    protected getToggleTitle(status: UserRecord['status']): string {
        return this.isSuspendedStatus(status) ? 'Habilitar' : 'Inhabilitar';
    }

    protected getToggleIcon(status: UserRecord['status']): string {
        return this.isSuspendedStatus(status) ? 'check' : 'ban';
    }

    protected getToggleActionClass(status: UserRecord['status']): string {
        return this.isSuspendedStatus(status)
            ? 'users-table__action users-table__action--activate'
            : 'users-table__action users-table__action--ban';
    }

    protected getStatusModalTitle(): string {
        const user = this.statusTargetUser();

        return user && this.isUserSuspended(user) ? 'Habilitar usuario' : 'Inhabilitar usuario';
    }

    protected getStatusModalSubtitle(): string {
        const user = this.statusTargetUser();

        return user && this.isUserSuspended(user)
            ? 'Esta acción reactivará el acceso del usuario seleccionado'
            : 'Esta acción suspenderá temporalmente el acceso del usuario seleccionado';
    }

    protected getStatusModalIcon(): string {
        const user = this.statusTargetUser();

        return user && this.isUserSuspended(user) ? 'check' : 'ban';
    }

    protected getStatusModalBadge(): string {
        const user = this.statusTargetUser();

        return user && this.isUserSuspended(user)
            ? 'Solicitud de reactivación'
            : 'Solicitud de suspensión';
    }

    protected getStatusModalWarning(): string {
        const user = this.statusTargetUser();

        return user && this.isUserSuspended(user)
            ? 'El usuario suspendido volverá a tener acceso cuando la operación sea procesada correctamente.'
            : 'El usuario quedará suspendido y no podrá acceder mientras esté en ese estado.';
    }

    protected getStatusCommentPlaceholder(): string {
        const user = this.statusTargetUser();

        return user && this.isUserSuspended(user)
            ? 'ESCRIBE EL MOTIVO DE LA REACTIVACIÓN'
            : 'ESCRIBE EL MOTIVO DE LA SUSPENSIÓN';
    }

    protected getStatusConfirmLabel(): string {
        const user = this.statusTargetUser();

        return user && this.isUserSuspended(user)
            ? 'Confirmar reactivación'
            : 'Confirmar suspensión';
    }

    protected isStatusReactivateOperation(): boolean {
        const user = this.statusTargetUser();

        return user ? this.isUserSuspended(user) : false;
    }

    protected shouldShowStatusButton(user: UserRecord): boolean {
        if (this.isUserBaja(user) || this.isUserInactiveNonReactivable(user)) {
            return false;
        }

        return true;
    }

    protected shouldShowDeleteButton(user: UserRecord): boolean {
        if (this.isUserBaja(user) || this.isUserSuspended(user) || this.isUserInactiveNonReactivable(user)) {
            return false;
        }

        return true;
    }

    protected isUserBaja(user: UserRecord): boolean {
        const status = this.normalizeForCompare(`${user.status} ${user.statusKey}`);

        if (!status) {
            return false;
        }

        if (
            status.includes('no dado de baja') ||
            status.includes('no baja') ||
            status.includes('sin baja')
        ) {
            return false;
        }

        return (
            status === 'baja' ||
            status === 'bajado' ||
            status === 'dado de baja' ||
            status.includes(' dado de baja') ||
            status.includes(' estatus baja') ||
            status.includes(' baja ')
        );
    }

    protected isUserSuspended(user: UserRecord): boolean {
        const status = this.normalizeForCompare(`${user.status} ${user.statusKey}`);

        return this.isSuspendedStatus(status);
    }

    protected isUserInactiveNonReactivable(user: UserRecord): boolean {
        const status = this.normalizeForCompare(`${user.status} ${user.statusKey}`);

        if (this.isUserSuspended(user)) {
            return false;
        }

        return (
            status.includes('inhabil') ||
            status.includes('inactivo') ||
            status.includes('deshabil')
        );
    }

    private isSuspendedStatus(status: string): boolean {
        const value = this.normalizeForCompare(status);

        return (
            value.includes('suspend') ||
            value.includes('suspension') ||
            value.includes('suspendido') ||
            value.includes('suspendida')
        );
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

    private isUserInactiveStatus(status: string): boolean {
        const value = this.normalizeForCompare(status);

        return (
            value.includes('inhabil') ||
            value.includes('inactivo')
        );
    }

    private resolveCurrentUserId(): number | null {
        const rawUserId = this.authStorage.session()?.user.id;
        const userId = Number(rawUserId);

        return Number.isFinite(userId) && userId > 0 ? userId : null;
    }

    private resolveTargetUserId(user: UserRecord | null): number | null {
        if (!user) {
            return null;
        }

        const record = user as unknown as Record<string, unknown>;

        return this.toPositiveNumber(
            user.userId ??
            record['usuarioId'] ??
            record['idUsuario'] ??
            record['id_usuario'] ??
            record['id'] ??
            record['usuarioID'],
        );
    }

    private toPositiveNumber(value: unknown): number | null {
        const numberValue = Number(value);

        return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
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
            if (error.name === 'TimeoutError') {
                return 'El servicio de detalle tardó demasiado en responder.';
            }

            return error.message;
        }

        return 'Ocurrió un error inesperado al consultar usuarios.';
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

        if (
            value.includes('suspend') ||
            value.includes('suspendido') ||
            value.includes('suspension')
        ) {
            return 'warning';
        }

        if (
            value.includes('inhabil') ||
            value.includes('inactivo') ||
            value.includes('deshabil') ||
            value.includes('baja')
        ) {
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
}