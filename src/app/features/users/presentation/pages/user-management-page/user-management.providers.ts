import { Provider } from '@angular/core';
import { UserAccountOperationsController } from './user-account-operations.controller';
import { UserManagementDataController } from './user-management-data.controller';
import { UserManagementFilterCatalogController } from './user-management-filter-catalog.controller';
import { UserManagementFilterController } from './user-management-filter.controller';
import { UserManagementFilterPresenter } from './user-management-filter.presenter';
import { UserManagementFilterState } from './user-management-filter.state';
import { UserManagementPagePresenter } from './user-management-page.presenter';
import { UserManagementPageState } from './user-management-page.state';

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
