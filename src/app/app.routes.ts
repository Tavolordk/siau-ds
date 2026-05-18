import { Routes } from '@angular/router';
import { UserManagementPage } from './features/users/presentation/pages/user-management-page/user-management-page';
import { RequestsPage } from './features/requests/presentation/pages/requests-page/requests-page';
import { AdministrationPage } from './features/administration/presentation/pages/administration-page/administration-page';
import { ReportsPage } from './features/reports/presentation/pages/reports-page/reports-page';
import { AuditLogPage } from './features/audit-log/presentation/pages/audit-log-page/audit-log-page';
import { ModalsPage } from './features/modals/presentation/pages/modals-page/modals-page';

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
    path: 'solicitudes',
    component: RequestsPage,
  },
  {
    path: 'administracion',
    component: AdministrationPage,
  },
  {
    path: 'reportes',
    component: ReportsPage,
  },
  {
    path: 'bitacora',
    component: AuditLogPage,
  },
  {
    path: 'modals',
    component: ModalsPage,
  },
  {
    path: '**',
    redirectTo: 'usuarios',
  },
];