import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../application/auth.facade';

export const twoFactorGuard: CanActivateFn = () => {
    const auth = inject(AuthFacade);
    const router = inject(Router);

    if (auth.isAuthenticated()) {
        return router.createUrlTree(['/usuarios']);
    }

    return auth.challenge() ? true : router.createUrlTree(['/login']);
};