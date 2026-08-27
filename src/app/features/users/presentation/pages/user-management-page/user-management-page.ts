import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SiauModal } from '../../../../../shared/ui';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { BorradorItem, UserRecord } from '../../../domain/models/user-record.model';
import { UserRegistrationWizard } from '../../components/user-registration-wizard/user-registration-wizard';
import { UserAccountOperationsController } from './controllers/user-account-operations.controller';
import { UserManagementDataController } from './controllers/user-management-data.controller';
import { UserManagementFilterController } from './controllers/user-management-filter.controller';
import { UserManagementFilterPresenter } from './presenters/user-management-filter.presenter';
import { UserManagementFilterState } from './state/user-management-filter.state';
import { USER_MANAGEMENT_PROVIDERS } from './providers/user-management.providers';
import { UserManagementPagePresenter } from './presenters/user-management-page.presenter';
import { UserManagementPageState } from './state/user-management-page.state';
import {
    BadgeTone,
    UserFilterDefinition,
    UserFilterGroupKey,
    UserFilterKey,
    UserFilterTabKey,
} from './models/user-management-page.models';

@Component({
    selector: 'app-user-management-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, SiauLucideIcon, SiauModal, UserRegistrationWizard],
    providers: [...USER_MANAGEMENT_PROVIDERS],
    templateUrl: './user-management-page.html',
    styleUrl: './user-management-page.scss',
})
export class UserManagementPage {
    private readonly accountOperations = inject(UserAccountOperationsController);
    private readonly filterState = inject(UserManagementFilterState);
    private readonly filterPresenter = inject(UserManagementFilterPresenter);
    private readonly filterController = inject(UserManagementFilterController);
    private readonly state = inject(UserManagementPageState);
    private readonly presenter = inject(UserManagementPagePresenter);
    private readonly data = inject(UserManagementDataController);

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

    protected readonly users = this.state.users;
    protected readonly pagination = this.state.pagination;
    protected readonly currentPage = this.state.currentPage;
    protected readonly isLoading = this.state.isLoading;
    protected readonly errorMessage = this.state.errorMessage;
    protected readonly informationMessage = this.state.informationMessage;
    protected readonly isUserWizardOpen = this.state.isUserWizardOpen;
    protected readonly userWizardMode = this.state.userWizardMode;
    protected readonly isNewUserMenuOpen = this.state.isNewUserMenuOpen;
    protected readonly isDraftsModalOpen = this.state.isDraftsModalOpen;
    protected readonly drafts = this.state.drafts;
    protected readonly isDraftsLoading = this.state.isDraftsLoading;
    protected readonly draftsError = this.state.draftsError;
    protected readonly draftToOpen = this.state.draftToOpen;
    protected readonly autoRestoreDraft = this.state.autoRestoreDraft;
    protected readonly selectedUser = this.state.selectedUser;
    protected readonly selectedUserDetail = this.state.selectedUserDetail;
    protected readonly isDetailLoading = this.state.isDetailLoading;

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

    protected readonly filteredUsers = this.presenter.filteredUsers;
    protected readonly shownUsersCount = this.presenter.shownUsersCount;
    protected readonly canGoPrevious = this.presenter.canGoPrevious;
    protected readonly canGoNext = this.presenter.canGoNext;
    protected readonly pageItems = this.presenter.pageItems;
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

    constructor() { this.data.initialize(); }

    @HostListener('document:keydown.escape')
    protected handleEscapeKey(): void {
        if (this.isNewUserMenuOpen()) this.closeNewUserMenu();
        if (this.isFilterPanelOpen()) this.closeFilterPanel();
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
    protected applyFilters(): void { this.filterController.apply((page) => this.data.loadUsers(page)); }
    protected clearAllFilters(): void { this.filterController.clearAll((page) => this.data.loadUsers(page)); }
    protected removeAppliedFilter(key: UserFilterKey): void { this.filterController.removeApplied(key, (page) => this.data.loadUsers(page)); }

    protected reloadUsers(): void { this.data.reloadUsers(); }
    protected previousPage(): void { this.data.previousPage(); }
    protected nextPage(): void { this.data.nextPage(); }
    protected goToPage(page: number): void { this.data.goToPage(page); }
    protected toggleNewUserMenu(): void { this.data.toggleNewUserMenu(); }
    protected closeNewUserMenu(): void { this.data.closeNewUserMenu(); }
    protected startNewRegistration(): void { this.data.startNewRegistration(); }
    protected openDraftsModal(): void { this.data.openDraftsModal(); }
    protected closeDraftsModal(): void { this.data.closeDraftsModal(); }
    protected loadDrafts(): void { this.data.loadDrafts(); }
    protected openDraft(draft: BorradorItem): void { this.data.openDraft(draft); }
    protected draftTitle(draft: BorradorItem): string { return this.presenter.draftTitle(draft); }
    protected draftSubtitle(draft: BorradorItem): string { return this.presenter.draftSubtitle(draft); }
    protected draftTimestamp(draft: BorradorItem): string { return this.presenter.draftTimestamp(draft); }
    protected trackDraft(index: number, draft: BorradorItem): string { return this.presenter.trackDraft(index, draft); }
    protected openUserDetail(user: UserRecord): void { this.data.openUserDetail(user); }
    protected closeUserWizard(): void { this.data.closeUserWizard(); }

    protected openBajaModal(user: UserRecord): void { this.accountOperations.openBajaModal(user, this.errorMessage, this.informationMessage); }
    protected closeBajaModal(): void { this.accountOperations.closeBajaModal(); }
    protected updateBajaComment(value: string): void { this.accountOperations.updateBajaComment(value); }
    protected confirmDarDeBajaUsuario(): void { this.accountOperations.confirmDarDeBajaUsuario(this.errorMessage, () => this.data.loadUsers(this.currentPage())); }
    protected openStatusModal(user: UserRecord): void { this.accountOperations.openStatusModal(user, this.errorMessage, this.informationMessage); }
    protected openUnlockModal(user: UserRecord): void { this.accountOperations.openUnlockModal(user, this.errorMessage, this.informationMessage); }
    protected closeStatusModal(): void { this.accountOperations.closeStatusModal(); }
    protected updateStatusComment(value: string): void { this.accountOperations.updateStatusComment(value); }
    protected confirmToggleUserStatus(): void { this.accountOperations.confirmToggleUserStatus(this.errorMessage, () => this.data.loadUsers(this.currentPage())); }
    protected handleUserSaved(): void { this.reloadUsers(); }
    protected closeOperationSuccessModal(): void { this.accountOperations.closeOperationSuccessModal(); }
    protected getToggleTitle(user: UserRecord): string { return this.accountOperations.getToggleTitle(user); }
    protected getToggleIcon(user: UserRecord): string { return this.accountOperations.getToggleIcon(user); }
    protected getToggleActionClass(user: UserRecord): string { return this.accountOperations.getToggleActionClass(user); }
    protected getStatusModalTitle(): string { return this.accountOperations.getStatusModalTitle(); }
    protected getStatusModalSubtitle(): string { return this.accountOperations.getStatusModalSubtitle(); }
    protected getStatusModalIcon(): string { return this.accountOperations.getStatusModalIcon(); }
    protected getStatusModalBadge(): string { return this.accountOperations.getStatusModalBadge(); }
    protected getStatusModalWarning(): string { return this.accountOperations.getStatusModalWarning(); }
    protected getStatusCommentPlaceholder(): string { return this.accountOperations.getStatusCommentPlaceholder(); }
    protected getStatusConfirmLabel(): string { return this.accountOperations.getStatusConfirmLabel(); }
    protected isStatusReactivateOperation(): boolean { return this.accountOperations.isStatusReactivateOperation(); }
    protected shouldShowStatusButton(user: UserRecord): boolean { return this.accountOperations.shouldShowStatusButton(user); }
    protected shouldShowUnlockButton(user: UserRecord): boolean { return this.accountOperations.shouldShowUnlockButton(user); }
    protected shouldShowDeleteButton(user: UserRecord): boolean { return this.accountOperations.shouldShowDeleteButton(user); }
    protected statusOperationRequiresComment(): boolean { return this.accountOperations.statusOperationRequiresComment(); }
    protected isUserReadOnly(user: UserRecord): boolean { return this.accountOperations.isUserReadOnly(user); }
    protected isCurrentSessionUser(user: UserRecord): boolean { return this.accountOperations.isCurrentSessionUser(user); }
    protected isUserBaja(user: UserRecord): boolean { return this.accountOperations.isUserBaja(user); }
    protected isUserSuspended(user: UserRecord): boolean { return this.accountOperations.isUserSuspended(user); }
    protected isUserBlocked(user: UserRecord): boolean { return this.accountOperations.isUserBlocked(user); }
    protected getRoleTone(role: UserRecord['role']): BadgeTone { return this.presenter.getRoleTone(role); }
    protected getStatusTone(user: UserRecord): BadgeTone { return this.presenter.getStatusTone(user); }
    protected getRegistryTone(status: UserRecord['rnpsp']): BadgeTone { return this.presenter.getRegistryTone(status); }
    protected getTrustTone(status: UserRecord['trust']): BadgeTone { return this.presenter.getTrustTone(status); }
}
