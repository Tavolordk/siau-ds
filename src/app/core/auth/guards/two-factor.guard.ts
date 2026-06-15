import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../application/auth.facade';
import { DEFAULT_AUTHENTICATED_ROUTE } from '../domain/auth.constants';

export const twoFactorGuard: CanActivateFn = () => {
    const auth = inject(AuthFacade);
    const router = inject(Router);

    if (auth.isAuthenticated()) {
        return router.createUrlTree([DEFAULT_AUTHENTICATED_ROUTE]);
    }

    return auth.challenge() ? true : router.createUrlTree(['/login']);
};