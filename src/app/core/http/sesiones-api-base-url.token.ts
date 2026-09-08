import { InjectionToken } from '@angular/core';

export const SESIONES_API_BASE_URL = new InjectionToken<string>('SESIONES_API_BASE_URL', {
    providedIn: 'root',
    factory: () => '/sesiones-api',
});
