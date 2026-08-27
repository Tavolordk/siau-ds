import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { AuthStorage } from '../../../../../core/auth/data-access/auth.storage';
import { SiauModal } from '../../../../../shared/ui';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UsersFacade } from '../../../application/users.facade';
import {
    BorradorItem,
    UserDetailRecord,
    UserPagination,
    UserRecord,
    UsersQuery,
} from '../../../domain/models/user-record.model';
import { UserRegistrationWizard } from '../../components/user-registration-wizard/user-registration-wizard';
import { UserAccountOperationsController } from './user-account-operations.controller';
import { UserManagementFilterCatalogController } from './user-management-filter-catalog.controller';
import { UserManagementFilterController } from './user-management-filter.controller';
import { UserManagementFilterPresenter } from './user-management-filter.presenter';
import { UserManagementFilterState } from './user-management-filter.state';

import {
    BadgeTone,
    UserWizardMode,
    UserFilterKey,
    UserFilterGroupKey,
    UserFilterTabKey,
    UserFilterDefinition,
    PaginationItem,
    PAGINATION_SIBLINGS,
    DEFAULT_PAGINATION
} from './user-management-page.models';

@Component({
    selector: 'app-user-management-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, SiauLucideIcon, SiauModal, UserRegistrationWizard],
    providers: [
        UserAccountOperationsController,
        UserManagementFilterState,
        UserManagementFilterPresenter,
        UserManagementFilterCatalogController,
        UserManagementFilterController,
    ],
    templateUrl: './user-management-page.html',
    styleUrl: './user-management-page.scss',
})
export class UserManagementPage {
    private readonly usersFacade = inject(UsersFacade);
    private readonly authStorage = inject(AuthStorage);
    private readonly accountOperations = inject(UserAccountOperationsController);
    private readonly filterState = inject(UserManagementFilterState);
    private readonly filterPresenter = inject(UserManagementFilterPresenter);
    private readonly filterCatalogs = inject(UserManagementFilterCatalogController);
    private readonly filterController = inject(UserManagementFilterController);
    private readonly destroyRef = inject(DestroyRef);
    private detailRequestSequence = 0;

    // El estado y la presentación del buscador viven fuera de la página.
    protected readonly isFilterPanelOpen = this.filterState.isFilterPanelOpen;
    protected readonly filterCatalogSearch = this.filterState.filterCatalogSearch;
    protected readonly selectedFilterTab = this.filterState.selectedFilterTab;
    protected readonly draftFilterKeys = this.filterState.draftFilterKeys;
    protected readonly draftFilters = this.filterState.draftFilters;
    protected readonly appliedFilters = this.filterState.appliedFilters;
    protected readonly draftCatalogLabels = this.filterState.draftCatalogLabels;
    protected readonly institutionTypeOptions = this.filterState.institutionTypeOptions;
    protected readonly stateOptions = this.filterState.stateOptions;
    protected readonly municipalityOptions = this.filterState.municipalityOptions;
    protected readonly institutionOptions = this.filterState.institutionOptions;
    protected readonly decentralizedBodyOptions = this.filterState.decentralizedBodyOptions;
    protected readonly administrativeUnitOptions = this.filterState.administrativeUnitOptions;
    protected readonly commissionMunicipalityOptions = this.filterState.commissionMunicipalityOptions;
    protected readonly commissionInstitutionOptions = this.filterState.commissionInstitutionOptions;
    protected readonly commissionDecentralizedBodyOptions = this.filterState.commissionDecentralizedBodyOptions;
    protected readonly commissionAdministrativeUnitOptions = this.filterState.commissionAdministrativeUnitOptions;
    protected readonly accountStatusOptions = this.filterState.accountStatusOptions;
    protected readonly isFilterCatalogLoading = this.filterState.isFilterCatalogLoading;
    protected readonly filterCatalogMessage = this.filterState.filterCatalogMessage;
    protected readonly todayDate = this.filterPresenter.todayDate;

    protected readonly users = signal<readonly UserRecord[]>([]);
    protected readonly pagination = signal<UserPagination>(DEFAULT_PAGINATION);

    /** Página solicitada por el front; fuente de verdad del paginador. */
    protected readonly currentPage = signal<number>(1);
    protected readonly isLoading = signal<boolean>(false);
    protected readonly errorMessage = signal<string | null>(null);
    protected readonly informationMessage = signal<string | null>(null);

    protected readonly isUserWizardOpen = signal<boolean>(false);
    protected readonly userWizardMode = signal<UserWizardMode>('create');
    protected readonly isNewUserMenuOpen = signal<boolean>(false);
    protected readonly isDraftsModalOpen = signal<boolean>(false);
    protected readonly drafts = signal<readonly BorradorItem[]>([]);
    protected readonly isDraftsLoading = signal<boolean>(false);
    protected readonly draftsError = signal<string | null>(null);
    protected readonly draftToOpen = signal<BorradorItem | null>(null);
    protected readonly autoRestoreDraft = signal<boolean>(false);
    protected readonly selectedUser = signal<UserRecord | null>(null);
    protected readonly selectedUserDetail = signal<UserDetailRecord | null>(null);
    protected readonly isDetailLoading = signal<boolean>(false);

    protected readonly isBajaModalOpen = this.accountOperations.isBajaModalOpen;
    protected readonly bajaTargetUser = this.accountOperations.bajaTargetUser;
    protected readonly bajaComment = this.accountOperations.bajaComment;
    protected readonly bajaCommentError = this.accountOperations.bajaCommentError;
    protected readonly isBajaSubmitting = this.accountOperations.isBajaSubmitting;
    protected readonly isStatusModalOpen = this.accountOperations.isStatusModalOpen;
    protected readonly statusTargetUser = this.accountOperations.statusTargetUser;
    protected readonly statusComment = this.accountOperations.statusComment;
    protected readonly statusCommentError = this.accountOperations.statusCommentError;
    protected readonly isStatusSubmitting = this.accountOperations.isStatusSubmitting;
    protected readonly operationSuccess = this.accountOperations.operationSuccess;
    protected readonly isAdminUser = this.accountOperations.isAdminUser;

    protected readonly filteredUsers = computed(() => this.users());
    protected readonly filterTabs = this.filterPresenter.filterTabs;
    protected readonly filterDefinitions = this.filterPresenter.filterDefinitions;
    protected readonly visibleFilterDefinitions = this.filterPresenter.visibleFilterDefinitions;
    protected readonly selectableFilterDefinitions = this.filterPresenter.selectableFilterDefinitions;
    protected readonly selectedFilterDefinitions = this.filterPresenter.selectedFilterDefinitions;
    protected readonly availableFilterDefinitions = this.filterPresenter.availableFilterDefinitions;
    protected readonly effectiveDraftFilters = this.filterPresenter.effectiveDraftFilters;
    protected readonly draftFilterErrors = this.filterPresenter.draftFilterErrors;
    protected readonly filterFormError = this.filterPresenter.filterFormError;
    protected readonly activeFilterCount = this.filterPresenter.activeFilterCount;
    protected readonly selectedDraftFilterCount = this.filterPresenter.selectedDraftFilterCount;
    protected readonly allDraftFiltersSelected = this.filterPresenter.allDraftFiltersSelected;
    protected readonly someDraftFiltersSelected = this.filterPresenter.someDraftFiltersSelected;
    protected readonly hasIncompleteDraftFilters = this.filterPresenter.hasIncompleteDraftFilters;
    protected readonly hasPendingFilterChanges = this.filterPresenter.hasPendingFilterChanges;
    protected readonly activeFilterChips = this.filterPresenter.activeFilterChips;
    protected readonly shownUsersCount = computed(() => {
        const pagination = this.pagination();
        const totalRecords = Math.max(0, pagination.totalRegistros);
        const pageSize = Math.max(0, pagination.porPagina);
        const previousPagesCount = Math.max(0, this.currentPage() - 1) * pageSize;

        return Math.min(totalRecords, previousPagesCount + this.filteredUsers().length);
    });
    protected readonly canGoPrevious = computed(() => this.currentPage() > 1);
    protected readonly canGoNext = computed(() => this.currentPage() < this.pagination().totalPaginas);

    /**
     * Botones numerados del paginador. La primera y la última página siempre
     * son visibles; el resto se recorta con separadores "…" alrededor de la
     * actual, para que 1000 páginas no dibujen 1000 botones.
     *
     *   1 … 499 [500] 501 … 1000
     */
    protected readonly pageItems = computed<readonly PaginationItem[]>(() => {
        const totalPages = Math.max(1, this.pagination().totalPaginas);
        const current = Math.min(Math.max(1, this.currentPage()), totalPages);

        // primera + última + actual + hermanos + los dos separadores
        const maxSlots = PAGINATION_SIBLINGS * 2 + 5;

        if (totalPages <= maxSlots) {
            return this.toPaginationItems(this.pageRange(1, totalPages));
        }

        const leftSibling = Math.max(current - PAGINATION_SIBLINGS, 1);
        const rightSibling = Math.min(current + PAGINATION_SIBLINGS, totalPages);
        const showLeftGap = leftSibling > 2;
        const showRightGap = rightSibling < totalPages - 1;
        const edgeCount = PAGINATION_SIBLINGS * 2 + 3;

        if (!showLeftGap && showRightGap) {
            return this.toPaginationItems([
                ...this.pageRange(1, edgeCount),
                0,
                totalPages,
            ]);
        }

        if (showLeftGap && !showRightGap) {
            return this.toPaginationItems([
                1,
                0,
                ...this.pageRange(totalPages - edgeCount + 1, totalPages),
            ]);
        }

        return this.toPaginationItems([
            1,
            0,
            ...this.pageRange(leftSibling, rightSibling),
            0,
            totalPages,
        ]);
    });

    constructor() {
        if (this.isAdminUser()) {
            this.filterCatalogs.loadInitialCatalogs();
        } else {
            this.isFilterCatalogLoading.set(false);
        }

        this.loadUsers();
    }

    @HostListener('document:keydown.escape')
    protected handleEscapeKey(): void {
        if (this.isNewUserMenuOpen()) {
            this.closeNewUserMenu();
        }

        if (this.isFilterPanelOpen()) {
            this.closeFilterPanel();
        }
    }

    protected toggleFilterPanel(): void { this.filterController.togglePanel(); }
    protected closeFilterPanel(): void { this.filterController.closePanel(); }
    protected updateFilterCatalogSearch(value: string): void { this.filterController.updateSearch(value); }
    protected selectFilterTab(tab: UserFilterTabKey): void { this.filterController.selectTab(tab); }
    protected getFilterGroupLabel(group: UserFilterGroupKey): string { return this.filterPresenter.getFilterGroupLabel(group); }
    protected addDraftFilterFromPicker(event: Event): void { this.filterController.addFromPicker(event); }
    protected addDraftFilter(key: UserFilterKey): void { this.filterController.add(key); }
    protected removeDraftFilter(key: UserFilterKey): void { this.filterController.remove(key); }
    protected setDraftFilterSelected(key: UserFilterKey, selected: boolean): void { this.filterController.setSelected(key, selected); }
    protected setAllDraftFiltersSelected(selected: boolean): void { this.filterController.setAllSelected(selected); }
    protected isDraftFilterSelected(key: UserFilterKey): boolean { return this.filterPresenter.isDraftFilterSelected(key); }
    protected isFilterDefinitionDisabled(filter: UserFilterDefinition): boolean { return this.filterPresenter.isFilterDefinitionDisabled(filter); }
    protected isFilterCheckboxDisabled(filter: UserFilterDefinition): boolean { return this.filterPresenter.isFilterCheckboxDisabled(filter); }
    protected updateDraftFilter(key: UserFilterKey, value: string): void { this.filterController.updateValue(key, value); }
    protected updateCatalogDraftFilter(filter: UserFilterDefinition, label: string): void { this.filterController.updateCatalogValue(filter, label); }
    protected getDraftCatalogLabel(filter: UserFilterDefinition): string { return this.filterPresenter.getDraftCatalogLabel(filter); }
    protected getFilterError(key: UserFilterKey): string | null { return this.filterPresenter.getFilterError(key); }
    protected getFilterPlaceholder(filter: UserFilterDefinition): string { return this.filterPresenter.getFilterPlaceholder(filter); }
    protected clearDraftFilters(): void { this.filterController.clearDraft(); }
    protected applyFilters(): void { this.filterController.apply((page) => this.loadUsers(page)); }
    protected clearAllFilters(): void { this.filterController.clearAll((page) => this.loadUsers(page)); }
    protected removeAppliedFilter(key: UserFilterKey): void { this.filterController.removeApplied(key, (page) => this.loadUsers(page)); }

    protected reloadUsers(): void {
        this.loadUsers(this.currentPage());
    }

    protected previousPage(): void {
        if (!this.canGoPrevious()) {
            return;
        }

        this.loadUsers(this.currentPage() - 1);
    }

    protected nextPage(): void {
        if (!this.canGoNext()) {
            return;
        }

        this.loadUsers(this.currentPage() + 1);
    }

    private pageRange(start: number, end: number): readonly number[] {
        const length = Math.max(0, end - start + 1);

        return Array.from({ length }, (_, index) => start + index);
    }

    /** El 0 representa un separador; `key` mantiene estable el @for. */
    private toPaginationItems(pages: readonly number[]): readonly PaginationItem[] {
        return pages.map((page, index) => ({
            key: page > 0 ? `page-${page}` : `gap-${index}`,
            page,
            isGap: page <= 0,
        }));
    }

    protected goToPage(page: number): void {
        const totalPages = Math.max(1, this.pagination().totalPaginas);
        const target = Math.min(Math.max(1, page), totalPages);

        if (target === this.currentPage() || this.isLoading()) {
            return;
        }

        this.loadUsers(target);
    }

    protected toggleNewUserMenu(): void {
        this.isNewUserMenuOpen.update((isOpen) => !isOpen);
    }

    protected closeNewUserMenu(): void {
        this.isNewUserMenuOpen.set(false);
    }

    /** "Nueva solicitud": asistente en blanco y borrador nuevo (borradorId null). */
    protected startNewRegistration(): void {
        this.closeNewUserMenu();
        this.draftToOpen.set(null);
        this.autoRestoreDraft.set(false);
        this.openRegistration();
    }

    /** "Ver borradores": lista los borradores del usuario en sesión. */
    protected openDraftsModal(): void {
        this.closeNewUserMenu();
        this.isDraftsModalOpen.set(true);
        this.loadDrafts();
    }

    protected closeDraftsModal(): void {
        this.isDraftsModalOpen.set(false);
    }

    protected loadDrafts(): void {
        this.isDraftsLoading.set(true);
        this.draftsError.set(null);

        this.usersFacade
            .getRegistrationDrafts(this.currentSessionUserId())
            .pipe(
                timeout(15000),
                finalize(() => this.isDraftsLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
                next: (drafts) => this.drafts.set(drafts),
                error: (error: unknown) => {
                    this.drafts.set([]);
                    this.draftsError.set(this.toFriendlyError(error));
                },
            });
    }

    /** Abre el asistente posicionado en el borrador elegido. */
    protected openDraft(draft: BorradorItem): void {
        this.closeDraftsModal();
        this.draftToOpen.set(draft);
        this.autoRestoreDraft.set(false);
        this.openRegistration();
    }

    protected draftTitle(draft: BorradorItem): string {
        const personales = draft.datos?.datosPersonales;
        const nombre = [
            personales?.nombres,
            personales?.primerApellido,
            personales?.segundoApellido,
        ]
            .map((part) => (part ?? '').trim())
            .filter(Boolean)
            .join(' ');

        if (nombre) {
            return nombre;
        }

        const correo = draft.datos?.medioContacto?.correo?.trim();

        return correo || `Borrador ${draft.borradorId ?? 'sin folio'}`;
    }

    protected draftSubtitle(draft: BorradorItem): string {
        const estructura = draft.catalogos?.adscripcionEstructura;

        // Se muestra la ruta de adscripción de lo general a lo particular para
        // distinguir borradores de la misma persona en distintas áreas.
        const partes = [
            estructura?.tipoInstitucion,
            estructura?.institucion ?? draft.catalogos?.adscripcion,
            estructura?.organo,
            estructura?.unidad,
            draft.catalogos?.tipoUsuario,
        ]
            .map((part) => (part ?? '').trim())
            .filter(Boolean);

        return partes.join(' · ') || 'Sin adscripción capturada';
    }

    protected draftTimestamp(draft: BorradorItem): string {
        const fecha = draft.fechaActualizacion ?? draft.fechaCreacion;

        if (!fecha) {
            return 'Sin fecha';
        }

        const parsed = new Date(fecha);

        if (Number.isNaN(parsed.getTime())) {
            return fecha;
        }

        return parsed.toLocaleString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    protected trackDraft(_index: number, draft: BorradorItem): string {
        return String(draft.borradorId ?? _index);
    }

    private currentSessionUserId(): number | null {
        return this.toPositiveNumber(this.authStorage.session()?.user.id) ?? null;
    }

    private openRegistration(): void {
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
        this.draftToOpen.set(null);
        this.autoRestoreDraft.set(false);
    }

    protected openBajaModal(user: UserRecord): void {
        this.accountOperations.openBajaModal(user, this.errorMessage, this.informationMessage);
    }

    protected closeBajaModal(): void {
        this.accountOperations.closeBajaModal();
    }

    protected updateBajaComment(value: string): void {
        this.accountOperations.updateBajaComment(value);
    }

    protected confirmDarDeBajaUsuario(): void {
        this.accountOperations.confirmDarDeBajaUsuario(
            this.errorMessage,
            () => this.loadUsers(this.currentPage()),
        );
    }

    protected openStatusModal(user: UserRecord): void {
        this.accountOperations.openStatusModal(user, this.errorMessage, this.informationMessage);
    }

    protected openUnlockModal(user: UserRecord): void {
        this.accountOperations.openUnlockModal(user, this.errorMessage, this.informationMessage);
    }

    protected closeStatusModal(): void {
        this.accountOperations.closeStatusModal();
    }

    protected updateStatusComment(value: string): void {
        this.accountOperations.updateStatusComment(value);
    }

    protected confirmToggleUserStatus(): void {
        this.accountOperations.confirmToggleUserStatus(
            this.errorMessage,
            () => this.loadUsers(this.currentPage()),
        );
    }

    protected handleUserSaved(): void {
        this.reloadUsers();
    }

    protected closeOperationSuccessModal(): void {
        this.accountOperations.closeOperationSuccessModal();
    }

    protected getToggleTitle(user: UserRecord): string {
        return this.accountOperations.getToggleTitle(user);
    }

    protected getToggleIcon(user: UserRecord): string {
        return this.accountOperations.getToggleIcon(user);
    }

    protected getToggleActionClass(user: UserRecord): string {
        return this.accountOperations.getToggleActionClass(user);
    }

    protected getStatusModalTitle(): string {
        return this.accountOperations.getStatusModalTitle();
    }

    protected getStatusModalSubtitle(): string {
        return this.accountOperations.getStatusModalSubtitle();
    }

    protected getStatusModalIcon(): string {
        return this.accountOperations.getStatusModalIcon();
    }

    protected getStatusModalBadge(): string {
        return this.accountOperations.getStatusModalBadge();
    }

    protected getStatusModalWarning(): string {
        return this.accountOperations.getStatusModalWarning();
    }

    protected getStatusCommentPlaceholder(): string {
        return this.accountOperations.getStatusCommentPlaceholder();
    }

    protected getStatusConfirmLabel(): string {
        return this.accountOperations.getStatusConfirmLabel();
    }

    protected isStatusReactivateOperation(): boolean {
        return this.accountOperations.isStatusReactivateOperation();
    }

    protected shouldShowStatusButton(user: UserRecord): boolean {
        return this.accountOperations.shouldShowStatusButton(user);
    }

    protected shouldShowUnlockButton(user: UserRecord): boolean {
        return this.accountOperations.shouldShowUnlockButton(user);
    }

    protected shouldShowDeleteButton(user: UserRecord): boolean {
        return this.accountOperations.shouldShowDeleteButton(user);
    }

    protected statusOperationRequiresComment(): boolean {
        return this.accountOperations.statusOperationRequiresComment();
    }

    protected isUserReadOnly(user: UserRecord): boolean {
        return this.accountOperations.isUserReadOnly(user);
    }

    protected isCurrentSessionUser(user: UserRecord): boolean {
        return this.accountOperations.isCurrentSessionUser(user);
    }

    protected isUserBaja(user: UserRecord): boolean {
        return this.accountOperations.isUserBaja(user);
    }

    protected isUserSuspended(user: UserRecord): boolean {
        return this.accountOperations.isUserSuspended(user);
    }

    protected isUserBlocked(user: UserRecord): boolean {
        return this.accountOperations.isUserBlocked(user);
    }

    private loadUsers(page = 1): void {
        const filters = this.appliedFilters();
        const currentUsername = this.authStorage.session()?.user.username?.trim() ?? '';
        const isAdmin = this.isAdminUser();
        const query: UsersQuery = {
            primerApellido: this.toOptionalText(filters.primerApellido),
            segundoApellido: this.toOptionalText(filters.segundoApellido),
            nombres: this.toOptionalText(filters.nombres),
            curp: this.toOptionalText(filters.curp),
            rfc: this.toOptionalText(filters.rfc),
            correo: this.toOptionalText(filters.correo),
            telefono: this.toOptionalText(filters.numeroTelefonico),
            tipoInstitucionId: this.toOptionalPositiveNumber(filters.tipoInstitucionId),
            entidadId: this.toOptionalPositiveNumber(filters.entidadId),
            municipioId: this.toOptionalPositiveNumber(filters.municipioId),
            institucionId: this.toOptionalPositiveNumber(filters.institucionId),
            organoId: this.toOptionalPositiveNumber(filters.organoAdministrativoDesconcentradoId),
            unidadId: this.toOptionalPositiveNumber(filters.unidadAdministrativaId),
            comisionTipoInstitucionId: this.toOptionalPositiveNumber(filters.comisionTipoInstitucionId),
            comisionEntidadId: this.toOptionalPositiveNumber(filters.comisionEntidadId),
            comisionMunicipioId: this.toOptionalPositiveNumber(filters.comisionMunicipioId),
            comisionInstitucionId: this.toOptionalPositiveNumber(filters.comisionInstitucionId),
            comisionOrganoId: this.toOptionalPositiveNumber(filters.comisionOrganoAdministrativoDesconcentradoId),
            comisionUnidadId: this.toOptionalPositiveNumber(filters.comisionUnidadAdministrativaId),
            // Fuera del perfil Administrador la consulta queda limitada a la cuenta en sesión.
            nombreUsuario: isAdmin
                ? this.toOptionalText(filters.nombreUsuario)
                : this.toOptionalText(currentUsername),
            estadoCuentaId: this.toOptionalPositiveNumber(filters.estadoCuentaId),
            // <input type="date"> ya entrega yyyy-MM-dd, que es el formato del endpoint.
            fechaInicio: this.toOptionalText(filters.fechaInicio),
            fechaFin: this.toOptionalText(filters.fechaFin),
            pagina: page,
            porPagina: 15,
        };

        this.currentPage.set(Math.max(1, page));
        this.isLoading.set(true);
        this.errorMessage.set(null);
        this.informationMessage.set(null);

        const hasAdvancedFilters = Object.entries(filters).some(([, value]) => Boolean(String(value ?? '').trim()));
        const request$ = !isAdmin || hasAdvancedFilters
            ? this.usersFacade.searchUsers(query)
            : this.usersFacade.getAllUsers(page, 15);

        request$
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (response) => {
                    this.users.set(response.usuarios);
                    this.pagination.set(response.paginacion);
                },
                error: (error: unknown) => {
                    this.users.set([]);
                    this.pagination.set(DEFAULT_PAGINATION);
                    this.currentPage.set(1);
                    this.errorMessage.set(this.toFriendlyError(error));
                },
            });
    }

    private toOptionalText(value: unknown): string | undefined {
        const normalized = String(value ?? '').trim();
        return normalized || undefined;
    }

    private toOptionalPositiveNumber(value: unknown): number | undefined {
        const normalizedValue = Number(value);
        return Number.isFinite(normalizedValue) && normalizedValue > 0 ? normalizedValue : undefined;
    }

    private isUserInactiveStatus(status: string): boolean {
        const value = this.normalizeForCompare(status);

        return (
            value.includes('inhabil') ||
            value.includes('inactivo')
        );
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

    private getAccountStatusKey(user: UserRecord): string {
        return this.accountOperations.getAccountStatusKey(user);
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