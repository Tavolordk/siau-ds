import { Routes } from '@angular/router';
import { UserManagementPage } from './features/users/presentation/pages/user-management-page/user-management-page';

export const routes: Routes = [
    {
        path: '',
        pathMatch: 'full',
        redirectTo: 'usuarios',
    },
    {
        path: 'usuarios',
        component: UserManagementPage,
    },
    {
        path: '**',
        redirectTo: 'usuarios',
    },
];