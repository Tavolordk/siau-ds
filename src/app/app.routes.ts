import { CanMatchFn, Routes } from '@angular/router';
import { authGuard } from './core/auth/guards/auth.guard';
import { publicGuard } from './core/auth/guards/public.guard';
import { twoFactorGuard } from './core/auth/guards/two-factor.guard';
import { SiauShell } from './shared/layout/shell/shell';

const SIAU_SHELL_ENTRY_POINTS = new Set([
  'usuarios',
  'solicitudes',
  'administracion',
  'reportes',
  'bitacora',
  'modals',
]);

/**
 * Evita que la ruta vacía del shell capture cualquier URL desconocida.
 * Solo deja entrar al layout autenticado cuando la URL apunta a una
 * sección real de SIAU (o a la raíz, que redirige a /usuarios).
 */
const siauShellCanMatch: CanMatchFn = (_route, segments) => {
  if (segments.length === 0) {
    return true;
  }

  return SIAU_SHELL_ENTRY_POINTS.has(segments[0].path);
};

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/login/presentation/pages/login-page/login-page').then(
            (m) => m.LoginPage,
          ),
      },
    ],
  },
  {
    path: 'login/verificacion',
    canActivate: [twoFactorGuard],
    loadComponent: () =>
      import('./features/login/presentation/pages/two-factor-page/two-factor-page').then(
        (m) => m.TwoFactorPage,
      ),
  },
  {
    path: '',
    component: SiauShell,
    canMatch: [siauShellCanMatch],
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'usuarios',
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./features/users/presentation/pages/user-management-page/user-management-page').then(
            (m) => m.UserManagementPage,
          ),
      },
      {
        path: 'solicitudes',
        loadComponent: () =>
          import('./features/requests/presentation/pages/requests-page/requests-page').then(
            (m) => m.RequestsPage,
          ),
      },
      {
        path: 'administracion',
        loadComponent: () =>
          import('./features/administration/presentation/pages/administration-page/administration-page').then(
            (m) => m.AdministrationPage,
          ),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/reports/presentation/pages/reports-page/reports-page').then(
            (m) => m.ReportsPage,
          ),
      },
      {
        path: 'bitacora',
        loadComponent: () =>
          import('./features/audit-log/presentation/pages/audit-log-page/audit-log-page').then(
            (m) => m.AuditLogPage,
          ),
      },
      {
        path: 'modals',
        loadComponent: () =>
          import('./features/modals/presentation/pages/modals-page/modals-page').then(
            (m) => m.ModalsPage,
          ),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./features/not-found/presentation/pages/not-found-page/not-found-page').then(
            (m) => m.NotFoundPage,
          ),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/presentation/pages/not-found-page/not-found-page').then(
        (m) => m.NotFoundPage,
      ),
  },
];