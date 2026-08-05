import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, finalize, forkJoin, of, Subject, timeout } from 'rxjs';
import { AuthStorage } from '../../../../../core/auth/data-access/auth.storage';
import { CatalogoOption, CatalogosFacade } from '../../../../../core/catalogos';
import { SiauModal } from '../../../../../shared/ui';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UsersFacade } from '../../../application/users.facade';
import {
    SolicitudOperacionRequest,
    SolicitudOperacionResponse,
    UserDetailRecord,
    UserPagination,
    UserRecord,
    UsersQuery,
} from '../../../domain/models/user-record.model';
import { UserRegistrationWizard } from '../../components/user-registration-wizard/user-registration-wizard';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'dark' | 'light';
type UserWizardMode = 'create' | 'edit';
type AccountOperationKind = 'baja' | 'suspension' | 'reactivacion' | 'desbloqueo';
type UserFilterKey = 'tipoUsuarioId' | 'estadoCuentaId' | 'sistemaId';
type UserFilterGroupKey = 'account-access';
type UserFilterTabKey = 'all' | UserFilterGroupKey;
type UserTableTabKey = 'general' | 'access' | 'validations';

interface UserFilterValues {
    readonly tipoUsuarioId: string;
    readonly estadoCuentaId: string;
    readonly sistemaId: string;
}

interface UserFilterDefinition {
    readonly key: UserFilterKey;
    readonly label: string;
    readonly emptyLabel: string;
    readonly group: UserFilterGroupKey;
    readonly options: readonly CatalogoOption[];
}

interface UserFilterTab {
    readonly id: UserFilterTabKey;
    readonly label: string;
}

interface UserTableTab {
    readonly id: UserTableTabKey;
    readonly label: string;
    readonly shortLabel: string;
}

interface UserFilterChip {
    readonly key: UserFilterKey;
    readonly label: string;
    readonly value: string;
}

interface AccountOperationSuccessState {
    readonly operation: AccountOperationKind;
    readonly title: string;
    readonly heading: string;
    readonly message: string;
    readonly icon: string;
    readonly badge: string;
    readonly newStatus: string;
    readonly fullName: string;
    readonly username: string;
    readonly email: string;
    readonly userId: number;
}

const DEFAULT_PAGINATION: UserPagination = {
    totalRegistros: 0,
    totalPaginas: 1,
    paginaActual: 1,
    porPagina: 8,
};

const EMPTY_USER_FILTERS: UserFilterValues = {
    tipoUsuarioId: '',
    estadoCuentaId: '',
    sistemaId: '',
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
    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly searchTermChanges = new Subject<string>();

    private detailRequestSequence = 0;

    protected readonly searchTerm = signal<string>('');
    protected readonly isFilterPanelOpen = signal<boolean>(false);
    protected readonly filterCatalogSearch = signal<string>('');
    protected readonly selectedFilterTab = signal<UserFilterTabKey>('all');
    protected readonly selectedTableTab = signal<UserTableTabKey>('general');
    protected readonly draftFilterKeys = signal<readonly UserFilterKey[]>([]);
    protected readonly draftFilters = signal<UserFilterValues>({ ...EMPTY_USER_FILTERS });
    protected readonly appliedFilters = signal<UserFilterValues>({ ...EMPTY_USER_FILTERS });
    protected readonly userTypeOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly accountStatusOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly systemOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly isFilterCatalogLoading = signal<boolean>(true);
    protected readonly filterCatalogMessage = signal<string | null>(null);
    protected readonly users = signal<readonly UserRecord[]>([]);
    protected readonly pagination = signal<UserPagination>(DEFAULT_PAGINATION);
    protected readonly isLoading = signal<boolean>(false);
    protected readonly errorMessage = signal<string | null>(null);
    protected readonly informationMessage = signal<string | null>(null);

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

    protected readonly operationSuccess = signal<AccountOperationSuccessState | null>(null);

    protected readonly filteredUsers = computed(() => this.users());
    protected readonly filterTabs: readonly UserFilterTab[] = [
        { id: 'all', label: 'Todos' },
        { id: 'account-access', label: 'Cuenta y acceso' },
    ];
    protected readonly tableTabs: readonly UserTableTab[] = [
        { id: 'general', label: 'Datos generales', shortLabel: 'General' },
        { id: 'access', label: 'Acceso y roles', shortLabel: 'Acceso' },
        { id: 'validations', label: 'Validaciones', shortLabel: 'Validaciones' },
    ];
    protected readonly filterDefinitions = computed<readonly UserFilterDefinition[]>(() => [
        {
            key: 'tipoUsuarioId',
            label: 'Tipo de usuario',
            emptyLabel: 'Selecciona un tipo de usuario',
            group: 'account-access',
            options: this.userTypeOptions(),
        },
        {
            key: 'estadoCuentaId',
            label: 'Estado de cuenta',
            emptyLabel: 'Selecciona un estado de cuenta',
            group: 'account-access',
            options: this.accountStatusOptions(),
        },
        {
            key: 'sistemaId',
            label: 'Sistema',
            emptyLabel: 'Selecciona un sistema',
            group: 'account-access',
            options: this.systemOptions(),
        },
    ]);
    protected readonly visibleFilterDefinitions = computed<readonly UserFilterDefinition[]>(() => {
        const search = this.normalizeForCompare(this.filterCatalogSearch());
        const selectedTab = this.selectedFilterTab();

        return this.filterDefinitions().filter((filter) => {
            const matchesTab = selectedTab === 'all' || filter.group === selectedTab;
            const matchesSearch = !search || this.normalizeForCompare(filter.label).includes(search);
            return matchesTab && matchesSearch;
        });
    });
    protected readonly selectableFilterDefinitions = computed<readonly UserFilterDefinition[]>(() =>
        this.filterDefinitions().filter((filter) => !this.isFilterDefinitionDisabled(filter)),
    );
    protected readonly effectiveDraftFilters = computed<UserFilterValues>(() => {
        const selectedKeys = new Set(this.draftFilterKeys());
        const draft = this.draftFilters();

        return {
            tipoUsuarioId: selectedKeys.has('tipoUsuarioId') ? draft.tipoUsuarioId : '',
            estadoCuentaId: selectedKeys.has('estadoCuentaId') ? draft.estadoCuentaId : '',
            sistemaId: selectedKeys.has('sistemaId') ? draft.sistemaId : '',
        };
    });
    protected readonly activeFilterCount = computed(() =>
        Object.values(this.appliedFilters()).filter((value) => Boolean(value)).length,
    );
    protected readonly selectedDraftFilterCount = computed(() => this.draftFilterKeys().length);
    protected readonly allDraftFiltersSelected = computed(() => {
        const selectableFilters = this.selectableFilterDefinitions();
        return Boolean(selectableFilters.length)
            && selectableFilters.every((filter) => this.isDraftFilterSelected(filter.key));
    });
    protected readonly someDraftFiltersSelected = computed(() =>
        this.selectedDraftFilterCount() > 0 && !this.allDraftFiltersSelected(),
    );
    protected readonly hasIncompleteDraftFilters = computed(() => {
        const filters = this.draftFilters();
        return this.draftFilterKeys().some((key) => !filters[key]);
    });
    protected readonly hasPendingFilterChanges = computed(() =>
        JSON.stringify(this.effectiveDraftFilters()) !== JSON.stringify(this.appliedFilters()),
    );
    protected readonly activeFilterChips = computed<readonly UserFilterChip[]>(() => {
        const filters = this.appliedFilters();
        const chips: UserFilterChip[] = [];

        this.pushFilterChip(
            chips,
            'tipoUsuarioId',
            'Tipo de usuario',
            filters.tipoUsuarioId,
            this.userTypeOptions(),
        );
        this.pushFilterChip(
            chips,
            'estadoCuentaId',
            'Estado de cuenta',
            filters.estadoCuentaId,
            this.accountStatusOptions(),
        );
        this.pushFilterChip(
            chips,
            'sistemaId',
            'Sistema',
            filters.sistemaId,
            this.systemOptions(),
        );

        return chips;
    });
    protected readonly shownUsersCount = computed(() => {
        const pagination = this.pagination();
        const totalRecords = Math.max(0, pagination.totalRegistros);
        const pageSize = Math.max(0, pagination.porPagina);
        const previousPagesCount = Math.max(0, pagination.paginaActual - 1) * pageSize;

        return Math.min(totalRecords, previousPagesCount + this.filteredUsers().length);
    });
    protected readonly canGoPrevious = computed(() => this.pagination().paginaActual > 1);
    protected readonly canGoNext = computed(() => this.pagination().paginaActual < this.pagination().totalPaginas);

    constructor() {
        this.searchTermChanges
            .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
            .subscribe((term) => this.loadUsers(1, term));

        this.loadFilterCatalogs();
        this.loadUsers();
    }

    @HostListener('document:keydown.escape')
    protected handleEscapeKey(): void {
        if (this.isFilterPanelOpen()) {
            this.closeFilterPanel();
        }
    }

    protected updateSearchTerm(value: string): void {
        const normalizedValue = String(value ?? '');
        this.searchTerm.set(normalizedValue);
        this.searchTermChanges.next(normalizedValue.trim());
    }

    protected searchNow(): void {
        this.loadUsers(1);
    }

    protected clearSearch(): void {
        if (!this.searchTerm()) {
            return;
        }

        this.searchTerm.set('');
        this.searchTermChanges.next('');
    }

    protected toggleFilterPanel(): void {
        if (this.isFilterPanelOpen()) {
            this.closeFilterPanel();
            return;
        }

        const appliedFilters = this.appliedFilters();
        this.draftFilters.set({ ...appliedFilters });
        this.draftFilterKeys.set(this.getActiveFilterKeys(appliedFilters));
        this.filterCatalogSearch.set('');
        this.selectedFilterTab.set('all');
        this.isFilterPanelOpen.set(true);
    }

    protected closeFilterPanel(): void {
        const appliedFilters = this.appliedFilters();
        this.draftFilters.set({ ...appliedFilters });
        this.draftFilterKeys.set(this.getActiveFilterKeys(appliedFilters));
        this.filterCatalogSearch.set('');
        this.selectedFilterTab.set('all');
        this.isFilterPanelOpen.set(false);
    }

    protected updateFilterCatalogSearch(value: string): void {
        this.filterCatalogSearch.set(String(value ?? ''));
    }

    protected selectFilterTab(tab: UserFilterTabKey): void {
        this.selectedFilterTab.set(tab);
    }

    protected selectTableTab(tab: UserTableTabKey): void {
        this.selectedTableTab.set(tab);
    }

    protected setDraftFilterSelected(key: UserFilterKey, selected: boolean): void {
        if (selected) {
            if (this.isDraftFilterSelected(key)) {
                return;
            }

            const definition = this.filterDefinitions().find((filter) => filter.key === key);
            if (!definition || this.isFilterDefinitionDisabled(definition)) {
                return;
            }

            this.draftFilterKeys.update((keys) => [...keys, key]);
            return;
        }

        this.draftFilterKeys.update((keys) => keys.filter((selectedKey) => selectedKey !== key));
    }

    protected setAllDraftFiltersSelected(selected: boolean): void {
        this.draftFilterKeys.set(
            selected
                ? this.selectableFilterDefinitions().map((filter) => filter.key)
                : [],
        );
    }

    protected isDraftFilterSelected(key: UserFilterKey): boolean {
        return this.draftFilterKeys().includes(key);
    }

    protected isFilterDefinitionDisabled(filter: UserFilterDefinition): boolean {
        return this.isFilterCatalogLoading() || !filter.options.length;
    }

    protected updateDraftFilter(key: UserFilterKey, value: string): void {
        this.draftFilters.update((filters) => ({
            ...filters,
            [key]: String(value ?? ''),
        }));
    }

    protected clearDraftFilters(): void {
        this.draftFilterKeys.set([]);
        this.draftFilters.set({ ...EMPTY_USER_FILTERS });
    }

    protected applyFilters(): void {
        if (this.hasIncompleteDraftFilters()) {
            return;
        }

        this.appliedFilters.set({ ...this.effectiveDraftFilters() });
        this.filterCatalogSearch.set('');
        this.selectedFilterTab.set('all');
        this.isFilterPanelOpen.set(false);
        this.loadUsers(1);
    }

    protected clearAllFilters(): void {
        this.draftFilterKeys.set([]);
        this.draftFilters.set({ ...EMPTY_USER_FILTERS });
        this.appliedFilters.set({ ...EMPTY_USER_FILTERS });
        this.filterCatalogSearch.set('');
        this.selectedFilterTab.set('all');
        this.isFilterPanelOpen.set(false);
        this.loadUsers(1);
    }

    protected removeAppliedFilter(key: UserFilterKey): void {
        const nextFilters: UserFilterValues = {
            ...this.appliedFilters(),
            [key]: '',
        };

        this.appliedFilters.set(nextFilters);
        this.draftFilters.set({ ...nextFilters });
        this.draftFilterKeys.set(this.getActiveFilterKeys(nextFilters));
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
        this.informationMessage.set(null);
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
        this.informationMessage.set(null);
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
        if (this.isCurrentSessionUser(user)) {
            this.errorMessage.set('No puedes dar de baja la cuenta con la que tienes la sesión activa.');
            return;
        }

        this.bajaTargetUser.set(user);
        this.bajaComment.set('');
        this.bajaCommentError.set(null);
        this.errorMessage.set(null);
        this.informationMessage.set(null);
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

        if (this.isCurrentSessionUser(user)) {
            this.bajaCommentError.set('No puedes dar de baja la cuenta con la que tienes la sesión activa.');
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
                next: (response) => {
                    this.isBajaSubmitting.set(false);
                    this.isBajaModalOpen.set(false);
                    this.bajaTargetUser.set(null);
                    this.bajaComment.set('');
                    this.bajaCommentError.set(null);
                    this.showOperationSuccess('baja', user, response);
                },
                error: (error: unknown) => {
                    this.bajaCommentError.set(this.toFriendlyError(error));
                },
            });
    }

    protected openStatusModal(user: UserRecord): void {
        if (this.isCurrentSessionUser(user)) {
            this.errorMessage.set('No puedes suspender la cuenta con la que tienes la sesión activa.');
            return;
        }

        if (this.isUserBaja(user) || this.isUserBlocked(user)) {
            this.errorMessage.set(
                this.isUserBlocked(user)
                    ? 'Utiliza la acción de desbloqueo para esta cuenta.'
                    : 'La cuenta dada de baja no es reactivable.',
            );
            return;
        }

        this.prepareStatusModal(user);
    }

    protected openUnlockModal(user: UserRecord): void {
        if (!this.isUserBlocked(user)) {
            return;
        }

        if (this.isCurrentSessionUser(user)) {
            this.errorMessage.set('No puedes desbloquear la cuenta con la que tienes la sesión activa.');
            return;
        }

        this.prepareStatusModal(user);
    }

    private prepareStatusModal(user: UserRecord): void {
        this.statusTargetUser.set(user);
        this.statusComment.set('');
        this.statusCommentError.set(null);
        this.errorMessage.set(null);
        this.informationMessage.set(null);
        this.isStatusModalOpen.set(true);

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

        if (this.isCurrentSessionUser(user)) {
            this.statusCommentError.set('No puedes cambiar el estatus de la cuenta con la que tienes la sesión activa.');
            return;
        }

        if (this.isUserBaja(user)) {
            this.statusCommentError.set('La cuenta dada de baja no es reactivable.');
            return;
        }

        const comentarioNormalizado = this.statusComment().trim().toUpperCase();

        if (!comentarioNormalizado) {
            this.statusCommentError.set('El comentario es obligatorio.');
            return;
        }

        const operationName: AccountOperationKind = this.isUserBlocked(user)
            ? 'desbloqueo'
            : this.isUserSuspended(user)
                ? 'reactivacion'
                : 'suspension';

        const request: SolicitudOperacionRequest = {
            usuarioId: userId,
            comentario: comentarioNormalizado,
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-${operationName}-${Date.now()}`,
            },
        };

        const operation$ = this.isUserBlocked(user)
            ? this.usersFacade.desbloquearUsuario(request)
            : this.isUserSuspended(user)
                ? this.usersFacade.reactivarUsuario(request)
                : this.usersFacade.suspenderUsuario(request);

        this.isStatusSubmitting.set(true);
        this.errorMessage.set(null);
        this.statusCommentError.set(null);

        operation$
            .pipe(finalize(() => this.isStatusSubmitting.set(false)))
            .subscribe({
                next: (response) => {
                    this.isStatusSubmitting.set(false);
                    this.isStatusModalOpen.set(false);
                    this.statusTargetUser.set(null);
                    this.statusComment.set('');
                    this.statusCommentError.set(null);
                    this.showOperationSuccess(operationName, user, response);
                },
                error: (error: unknown) => {
                    this.statusCommentError.set(this.toFriendlyError(error));
                },
            });
    }

    protected handleUserSaved(): void {
        this.reloadUsers();
    }

    protected closeOperationSuccessModal(): void {
        if (!this.operationSuccess()) {
            return;
        }

        this.operationSuccess.set(null);
        this.reloadUsers();
    }

    private showOperationSuccess(
        operation: AccountOperationKind,
        user: UserRecord,
        response: SolicitudOperacionResponse,
    ): void {
        const config = this.getOperationSuccessConfig(operation);
        const responseUserId = this.toPositiveNumber(response.datos?.usuarioId);

        this.operationSuccess.set({
            operation,
            title: config.title,
            heading: config.heading,
            message: response.mensaje?.trim() || config.defaultMessage,
            icon: config.icon,
            badge: 'Operación exitosa',
            newStatus: config.newStatus,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            userId: responseUserId ?? this.resolveTargetUserId(user) ?? user.userId,
        });
    }

    private getOperationSuccessConfig(operation: AccountOperationKind): {
        readonly title: string;
        readonly heading: string;
        readonly defaultMessage: string;
        readonly icon: string;
        readonly newStatus: string;
    } {
        switch (operation) {
            case 'baja':
                return {
                    title: 'Baja realizada correctamente',
                    heading: 'La cuenta fue dada de baja',
                    defaultMessage: 'La baja del usuario se procesó correctamente.',
                    icon: 'trash-2',
                    newStatus: 'Baja',
                };
            case 'suspension':
                return {
                    title: 'Suspensión realizada correctamente',
                    heading: 'La cuenta fue suspendida',
                    defaultMessage: 'La suspensión del usuario se procesó correctamente.',
                    icon: 'ban',
                    newStatus: 'Suspendido',
                };
            case 'reactivacion':
                return {
                    title: 'Reactivación realizada correctamente',
                    heading: 'La cuenta fue reactivada',
                    defaultMessage: 'La reactivación del usuario se procesó correctamente.',
                    icon: 'circle-check',
                    newStatus: 'Activo',
                };
            case 'desbloqueo':
                return {
                    title: 'Desbloqueo realizado correctamente',
                    heading: 'La cuenta fue desbloqueada',
                    defaultMessage: 'El desbloqueo del usuario se procesó correctamente.',
                    icon: 'unlock',
                    newStatus: 'Activo',
                };
        }

        const unsupportedOperation: never = operation;
        throw new Error(`Operación de cuenta no soportada: ${unsupportedOperation}`);
    }

    protected getToggleTitle(user: UserRecord): string {
        return this.isUserSuspended(user) ? 'Reactivar' : 'Suspender';
    }

    protected getToggleIcon(user: UserRecord): string {
        return this.isUserSuspended(user) ? 'check' : 'ban';
    }

    protected getToggleActionClass(user: UserRecord): string {
        return this.isUserSuspended(user)
            ? 'users-table__action users-table__action--activate'
            : 'users-table__action users-table__action--ban';
    }

    protected getStatusModalTitle(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Desbloquear usuario';
        }

        return user && this.isUserSuspended(user) ? 'Reactivar usuario' : 'Suspender usuario';
    }

    protected getStatusModalSubtitle(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Esta acción desbloqueará el acceso del usuario seleccionado';
        }

        return user && this.isUserSuspended(user)
            ? 'Esta acción reactivará el acceso del usuario seleccionado'
            : 'Esta acción suspenderá temporalmente el acceso del usuario seleccionado';
    }

    protected getStatusModalIcon(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'unlock';
        }

        return user && this.isUserSuspended(user) ? 'check' : 'ban';
    }

    protected getStatusModalBadge(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Solicitud de desbloqueo';
        }

        return user && this.isUserSuspended(user)
            ? 'Solicitud de reactivación'
            : 'Solicitud de suspensión';
    }

    protected getStatusModalWarning(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'El usuario bloqueado recuperará el acceso cuando el desbloqueo se procese correctamente.';
        }

        return user && this.isUserSuspended(user)
            ? 'El usuario suspendido volverá a tener acceso cuando la operación sea procesada correctamente.'
            : 'El usuario quedará suspendido y no podrá acceder mientras esté en ese estado.';
    }

    protected getStatusCommentPlaceholder(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'ESCRIBE EL MOTIVO DEL DESBLOQUEO';
        }

        return user && this.isUserSuspended(user)
            ? 'ESCRIBE EL MOTIVO DE LA REACTIVACIÓN'
            : 'ESCRIBE EL MOTIVO DE LA SUSPENSIÓN';
    }

    protected getStatusConfirmLabel(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Confirmar desbloqueo';
        }

        return user && this.isUserSuspended(user)
            ? 'Confirmar reactivación'
            : 'Confirmar suspensión';
    }

    protected isStatusReactivateOperation(): boolean {
        const user = this.statusTargetUser();

        return user
            ? this.isUserSuspended(user) || this.isUserBlocked(user)
            : false;
    }

    protected shouldShowStatusButton(user: UserRecord): boolean {
        return (
            !this.isCurrentSessionUser(user) &&
            !this.isUserBaja(user) &&
            !this.isUserBlocked(user)
        );
    }

    protected shouldShowUnlockButton(user: UserRecord): boolean {
        return this.isUserBlocked(user) && !this.isCurrentSessionUser(user);
    }

    protected shouldShowDeleteButton(user: UserRecord): boolean {
        return (
            !this.isCurrentSessionUser(user) &&
            !this.isUserBaja(user) &&
            !this.isUserSuspended(user) &&
            !this.isUserBlocked(user)
        );
    }

    protected isCurrentSessionUser(user: UserRecord): boolean {
        const sessionUser = this.authStorage.session()?.user;

        if (!sessionUser) {
            return false;
        }

        const currentUserId = this.toPositiveNumber(sessionUser.id);
        const targetUserId = this.resolveTargetUserId(user);

        if (currentUserId && targetUserId) {
            return currentUserId === targetUserId;
        }

        const currentUsername = this.normalizeForCompare(sessionUser.username);
        const targetUsername = this.normalizeForCompare(user.username);

        return Boolean(currentUsername) && currentUsername === targetUsername;
    }

    protected isUserBaja(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'BAJA';
    }

    protected isUserSuspended(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'SUSPENDIDO';
    }

    protected isUserBlocked(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'BLOQUEADO';
    }

    private getAccountStatusKey(user: UserRecord): string {
        const statusKey = String(user.statusKey ?? '').trim();

        if (statusKey) {
            return this.normalizeAccountStatusKey(statusKey);
        }

        return this.normalizeAccountStatusKey(user.status);
    }

    private normalizeAccountStatusKey(value: string): string {
        const normalizedValue = value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase();

        if (normalizedValue.includes('SUSPEND')) {
            return 'SUSPENDIDO';
        }

        if (normalizedValue.includes('BLOQUE')) {
            return 'BLOQUEADO';
        }

        if (
            normalizedValue === 'BAJA' ||
            normalizedValue.includes('DADO DE BAJA') ||
            normalizedValue.includes('INHABIL') ||
            normalizedValue.includes('DESHABIL') ||
            normalizedValue === 'INACTIVO'
        ) {
            return 'BAJA';
        }

        if (normalizedValue.includes('ACTIVO')) {
            return 'ACTIVO';
        }

        return normalizedValue;
    }

    private getActiveFilterKeys(filters: UserFilterValues): readonly UserFilterKey[] {
        return (Object.keys(filters) as UserFilterKey[]).filter((key) => Boolean(filters[key]));
    }

    private loadUsers(page = 1, search = this.searchTerm().trim()): void {
        const filters = this.appliedFilters();
        const query: UsersQuery = {
            busqueda: search || undefined,
            tipoUsuarioId: this.toOptionalPositiveNumber(filters.tipoUsuarioId),
            estadoCuentaId: this.toOptionalPositiveNumber(filters.estadoCuentaId),
            sistemaId: this.toOptionalPositiveNumber(filters.sistemaId),
            pagina: page,
            porPagina: this.pagination().porPagina,
        };

        this.isLoading.set(true);
        this.errorMessage.set(null);
        this.informationMessage.set(null);

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

    private loadFilterCatalogs(): void {
        this.isFilterCatalogLoading.set(true);
        this.filterCatalogMessage.set(null);

        forkJoin({
            userTypes: this.catalogosFacade
                .obtenerTipoUsuarioOptions()
                .pipe(catchError(() => of([] as readonly CatalogoOption[]))),
            accountStatuses: this.catalogosFacade
                .obtenerCuentaUsuarioOptions()
                .pipe(catchError(() => of([] as readonly CatalogoOption[]))),
            systems: this.catalogosFacade
                .obtenerSistemasOptions()
                .pipe(catchError(() => of([] as readonly CatalogoOption[]))),
        })
            .pipe(finalize(() => this.isFilterCatalogLoading.set(false)))
            .subscribe(({ userTypes, accountStatuses, systems }) => {
                this.userTypeOptions.set(userTypes);
                this.accountStatusOptions.set(accountStatuses);
                this.systemOptions.set(
                    systems
                        .map((option) => this.normalizeSystemOption(option))
                        .filter((option): option is CatalogoOption => option !== null),
                );

                if (!userTypes.length || !accountStatuses.length || !systems.length) {
                    this.filterCatalogMessage.set(
                        'Algunos catálogos de filtros no están disponibles. Puedes seguir usando la búsqueda y los filtros cargados.',
                    );
                }
            });
    }

    private normalizeSystemOption(option: CatalogoOption): CatalogoOption | null {
        const metadata = option.metadata ?? {};
        const id = this.toOptionalPositiveNumber(
            metadata['idSistema'] ?? metadata['sistemaId'] ?? option.value,
        );

        if (!id) {
            return null;
        }

        return {
            ...option,
            value: String(id),
        };
    }

    private pushFilterChip(
        chips: UserFilterChip[],
        key: UserFilterKey,
        label: string,
        value: string,
        options: readonly CatalogoOption[],
    ): void {
        if (!value) {
            return;
        }

        const optionLabel = options.find((option) => option.value === value)?.label ?? value;
        chips.push({ key, label, value: optionLabel });
    }

    private toOptionalPositiveNumber(value: unknown): number | undefined {
        const normalizedValue = Number(value);

        return Number.isFinite(normalizedValue) && normalizedValue > 0
            ? normalizedValue
            : undefined;
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

    protected getStatusTone(user: UserRecord): BadgeTone {
        switch (this.getAccountStatusKey(user)) {
            case 'ACTIVO':
                return 'success';
            case 'SUSPENDIDO':
                return 'warning';
            case 'BAJA':
            case 'BLOQUEADO':
                return 'danger';
            default:
                return 'info';
        }
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