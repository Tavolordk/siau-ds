import { Provider } from '@angular/core';
import { UserAccountOperationsController } from '../controllers/user-account-operations.controller';
import { UserManagementDataController } from '../controllers/user-management-data.controller';
import { UserManagementFilterCatalogController } from '../controllers/user-management-filter-catalog.controller';
import { UserManagementFilterController } from '../controllers/user-management-filter.controller';
import { UserManagementFilterPresenter } from '../presenters/user-management-filter.presenter';
import { UserManagementFilterState } from '../state/user-management-filter.state';
import { UserManagementPagePresenter } from '../presenters/user-management-page.presenter';
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
