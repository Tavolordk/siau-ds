import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../application/auth.facade';

export const publicGuard: CanActivateFn = () => {
    const auth = inject(AuthFacade);
    const router = inject(Router);

    return auth.isAuthenticated() ? router.createUrlTree(['/usuarios']) : true;
};