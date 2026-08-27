import { Provider } from '@angular/core';
import { UserAccountOperationsController } from '../accounts/user-account-operations.controller';
import { UserManagementDataController } from '../data/user-management-data.controller';
import { UserManagementFilterCatalogController } from '../filters/user-management-filter-catalog.controller';
import { UserManagementFilterController } from '../filters/user-management-filter.controller';
import { UserManagementFilterPresenter } from '../filters/user-management-filter.presenter';
import { UserManagementFilterState } from '../filters/user-management-filter.state';
import { UserManagementPagePresenter } from '../view/user-management-page.presenter';
import { UserManagementPageState } from '../state/user-management-page.state';

export const USER_MANAGEMENT_PROVIDERS: readonly Provider[] = [
    UserAccountOperationsController,
    UserManagementFilterState,
    UserManagementFilterPresenter,
    UserManagementFilterCatalogController,
    UserManagementFilterController,
    UserManagementPageState,
    UserManagementPagePresenter,
    UserManagementDataController,
];
