import { InjectionToken } from '@angular/core';

export const CORREO_API_BASE_URL = new InjectionToken<string>('CORREO_API_BASE_URL', {
    providedIn: 'root',
    factory: () => '/correo-api',
});