import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, timeout } from 'rxjs';
import { AuthStorage } from '../../../../../../core/auth/data-access/auth.storage';
import { UsersFacade } from '../../../../application/users.facade';
import { BorradorItem, UserRecord, UsersQuery } from '../../../../domain/models/user-record.model';
import { UserAccountOperationsController } from './user-account-operations.controller';
import { UserManagementFilterCatalogController } from './user-management-filter-catalog.controller';
import { UserManagementFilterState } from '../state/user-management-filter.state';
import { DEFAULT_PAGINATION } from '../models/user-management-page.models';
import { UserManagementPagePresenter } from '../presenters/user-management-page.presenter';
import { UserManagementPageState } from '../state/user-management-page.state';

/**
 * Casos de uso de la página de usuarios: listado, paginación, borradores y
 * apertura/cierre del detalle. Los contratos HTTP siguen encapsulados en UsersFacade.
 */
@Injectable()
export class UserManagementDataController {
    private readonly usersFacade = inject(UsersFacade);
    private readonly authStorage = inject(AuthStorage);
    private readonly accountOperations = inject(UserAccountOperationsController);
    private readonly filterCatalogs = inject(UserManagementFilterCatalogController);
    private readonly filterState = inject(UserManagementFilterState);
    private readonly state = inject(UserManagementPageState);
    private readonly presenter = inject(UserManagementPagePresenter);
    private readonly destroyRef = inject(DestroyRef);
    private detailRequestSequence = 0;

    initialize(): void {
        if (this.accountOperations.isAdminUser()) this.filterCatalogs.loadInitialCatalogs();
        else this.filterState.isFilterCatalogLoading.set(false);
        this.loadUsers();
    }

    reloadUsers(): void { this.loadUsers(this.state.currentPage()); }
    previousPage(): void {
        if (this.presenter.canGoPrevious()) this.loadUsers(this.state.currentPage() - 1);
    }
    nextPage(): void {
        if (this.presenter.canGoNext()) this.loadUsers(this.state.currentPage() + 1);
    }
    goToPage(page: number): void {
        const totalPages = Math.max(1, this.state.pagination().totalPaginas);
        const target = Math.min(Math.max(1, page), totalPages);
        if (target !== this.state.currentPage() && !this.state.isLoading()) this.loadUsers(target);
    }

    toggleNewUserMenu(): void { this.state.isNewUserMenuOpen.update((open) => !open); }
    closeNewUserMenu(): void { this.state.isNewUserMenuOpen.set(false); }

    startNewRegistration(): void {
        this.closeNewUserMenu();
        this.state.draftToOpen.set(null);
        this.state.autoRestoreDraft.set(false);
        this.openRegistration();
    }

    openDraftsModal(): void {
        this.closeNewUserMenu();
        this.state.isDraftsModalOpen.set(true);
        this.loadDrafts();
    }
    closeDraftsModal(): void { this.state.isDraftsModalOpen.set(false); }

    loadDrafts(): void {
        this.state.isDraftsLoading.set(true);
        this.state.draftsError.set(null);
        this.usersFacade.getRegistrationDrafts(this.currentSessionUserId())
            .pipe(
                timeout(15000),
                finalize(() => this.state.isDraftsLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
                next: (drafts) => this.state.drafts.set(drafts),
                error: (error: unknown) => {
                    this.state.drafts.set([]);
                    this.state.draftsError.set(this.toFriendlyError(error));
                },
            });
    }

    openDraft(draft: BorradorItem): void {
        this.closeDraftsModal();
        this.state.draftToOpen.set(draft);
        this.state.autoRestoreDraft.set(false);
        this.openRegistration();
    }

    openUserDetail(user: UserRecord): void {
        const userId = this.resolveTargetUserId(user);
        if (!userId) {
            this.state.errorMessage.set('No se puede consultar el detalle porque el usuario no tiene identificador interno.');
            return;
        }

        const requestId = ++this.detailRequestSequence;
        this.state.selectedUser.set(user);
        this.state.selectedUserDetail.set(null);
        this.state.userWizardMode.set('edit');
        this.state.errorMessage.set(null);
        this.state.informationMessage.set(null);
        this.state.isDetailLoading.set(true);
        this.state.isUserWizardOpen.set(true);

        this.usersFacade.getUserDetail(userId).pipe(timeout(15000)).subscribe({
            next: (detail) => {
                if (requestId !== this.detailRequestSequence) return;
                this.state.selectedUserDetail.set(detail);
                this.state.isDetailLoading.set(false);
            },
            error: (error: unknown) => {
                if (requestId !== this.detailRequestSequence) return;
                this.state.selectedUserDetail.set(null);
                this.state.isDetailLoading.set(false);
                this.state.errorMessage.set(this.toFriendlyError(error));
            },
        });
    }

    closeUserWizard(): void {
        this.detailRequestSequence++;
        this.state.isDetailLoading.set(false);
        this.state.isUserWizardOpen.set(false);
        this.state.userWizardMode.set('create');
        this.state.selectedUser.set(null);
        this.state.selectedUserDetail.set(null);
        this.state.draftToOpen.set(null);
        this.state.autoRestoreDraft.set(false);
    }

    loadUsers(page = 1): void {
        const filters = this.filterState.appliedFilters();
        const currentUsername = this.authStorage.session()?.user.username?.trim() ?? '';
        const isAdmin = this.accountOperations.isAdminUser();
        const query: UsersQuery = {
            primerApellido: this.optionalText(filters.primerApellido),
            segundoApellido: this.optionalText(filters.segundoApellido),
            nombres: this.optionalText(filters.nombres),
            curp: this.optionalText(filters.curp),
            rfc: this.optionalText(filters.rfc),
            correo: this.optionalText(filters.correo),
            telefono: this.optionalText(filters.numeroTelefonico),
            tipoInstitucionId: this.optionalPositiveNumber(filters.tipoInstitucionId),
            entidadId: this.optionalPositiveNumber(filters.entidadId),
            municipioId: this.optionalPositiveNumber(filters.municipioId),
            institucionId: this.optionalPositiveNumber(filters.institucionId),
            organoId: this.optionalPositiveNumber(filters.organoAdministrativoDesconcentradoId),
            unidadId: this.optionalPositiveNumber(filters.unidadAdministrativaId),
            comisionTipoInstitucionId: this.optionalPositiveNumber(filters.comisionTipoInstitucionId),
            comisionEntidadId: this.optionalPositiveNumber(filters.comisionEntidadId),
            comisionMunicipioId: this.optionalPositiveNumber(filters.comisionMunicipioId),
            comisionInstitucionId: this.optionalPositiveNumber(filters.comisionInstitucionId),
            comisionOrganoId: this.optionalPositiveNumber(filters.comisionOrganoAdministrativoDesconcentradoId),
            comisionUnidadId: this.optionalPositiveNumber(filters.comisionUnidadAdministrativaId),
            nombreUsuario: isAdmin ? this.optionalText(filters.nombreUsuario) : this.optionalText(currentUsername),
            estadoCuentaId: this.optionalPositiveNumber(filters.estadoCuentaId),
            fechaInicio: this.optionalText(filters.fechaInicio),
            fechaFin: this.optionalText(filters.fechaFin),
            pagina: page,
            porPagina: 15,
        };

        this.state.currentPage.set(Math.max(1, page));
        this.state.isLoading.set(true);
        this.state.errorMessage.set(null);
        this.state.informationMessage.set(null);
        const hasAdvancedFilters = Object.values(filters).some((value) => Boolean(String(value ?? '').trim()));
        const request$ = !isAdmin || hasAdvancedFilters
            ? this.usersFacade.searchUsers(query)
            : this.usersFacade.getAllUsers(page, 15);

        request$.pipe(finalize(() => this.state.isLoading.set(false))).subscribe({
            next: (response) => {
                this.state.users.set(response.usuarios);
                this.state.pagination.set(response.paginacion);
            },
            error: (error: unknown) => {
                this.state.users.set([]);
                this.state.pagination.set(DEFAULT_PAGINATION);
                this.state.currentPage.set(1);
                this.state.errorMessage.set(this.toFriendlyError(error));
            },
        });
    }

    private openRegistration(): void {
        this.detailRequestSequence++;
        this.state.userWizardMode.set('create');
        this.state.selectedUser.set(null);
        this.state.selectedUserDetail.set(null);
        this.state.isDetailLoading.set(false);
        this.state.errorMessage.set(null);
        this.state.informationMessage.set(null);
        this.state.isUserWizardOpen.set(true);
    }

    private currentSessionUserId(): number | null { return this.positiveNumber(this.authStorage.session()?.user.id); }
    private optionalText(value: unknown): string | undefined { return String(value ?? '').trim() || undefined; }
    private optionalPositiveNumber(value: unknown): number | undefined { return this.positiveNumber(value) ?? undefined; }
    private positiveNumber(value: unknown): number | null {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    private resolveTargetUserId(user: UserRecord | null): number | null {
        if (!user) return null;
        const record = user as unknown as Record<string, unknown>;
        return this.positiveNumber(user.userId ?? record['usuarioId'] ?? record['idUsuario'] ?? record['id_usuario'] ?? record['id'] ?? record['usuarioID']);
    }
    private toFriendlyError(error: unknown): string {
        if (error instanceof Error) {
            return error.name === 'TimeoutError' ? 'El servicio de detalle tardó demasiado en responder.' : error.message;
        }
        return 'Ocurrió un error inesperado al consultar usuarios.';
    }
}
