import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../application/auth.facade';
import { DEFAULT_AUTHENTICATED_ROUTE } from '../domain/auth.constants';

export const publicGuard: CanActivateFn = () => {
    const auth = inject(AuthFacade);
    const router = inject(Router);

    return auth.isAuthenticated() ? router.createUrlTree([DEFAULT_AUTHENTICATED_ROUTE]) : true;
};