import { CanMatchFn, Routes } from '@angular/router';
import { authGuard } from './core/auth/guards/auth.guard';
import { publicGuard } from './core/auth/guards/public.guard';
import { twoFactorGuard } from './core/auth/guards/two-factor.guard';
import { SiauShell } from './shared/layout/shell/shell';

const SHELL_ENTRY_POINTS = new Set(['usuarios', 'solicitudes']);

/**
 * Evita que la ruta vacía del shell capture cualquier URL desconocida.
 * Usuarios y Solicitudes forman parte del layout autenticado.
 */
const shellCanMatch: CanMatchFn = (_route, segments) => {
  if (segments.length === 0) {
    return true;
  }

  return SHELL_ENTRY_POINTS.has(segments[0].path);
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

  /**
   * RUTA TEMPORAL DE DEMOSTRACIÓN.
   * Permite abrir Solicitudes sin autenticación mientras el backend no está disponible,
   * conservando exactamente el SiauShell existente.
   *
   * URLs:
   *   /solicitudes
   *   /solicitudes  (Nueva solicitud se abre en modal)
   *
   * Cuando el backend vuelva a estar disponible, elimina este bloque. Las mismas rutas
   * ya existen abajo dentro del shell protegido con authGuard.
   */
  {
    path: 'solicitudes',
    component: SiauShell,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/requests/presentation/pages/requests-page/requests-page').then(
            (m) => m.RequestsPage,
          ),
      },
      {
        path: 'nueva',
        pathMatch: 'full',
        redirectTo: '/solicitudes',
      },
    ],
  },

  /** Shell normal protegido. */
  {
    path: '',
    component: SiauShell,
    canMatch: [shellCanMatch],
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
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/requests/presentation/pages/requests-page/requests-page').then(
                (m) => m.RequestsPage,
              ),
          },
          {
            path: 'nueva',
            pathMatch: 'full',
            redirectTo: '/solicitudes',
          },
        ],
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
