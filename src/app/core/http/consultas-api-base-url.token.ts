import { InjectionToken } from '@angular/core';

export const CONSULTAS_API_BASE_URL = new InjectionToken<string>('CONSULTAS_API_BASE_URL', {
    providedIn: 'root',
    factory: () => '/consultas-api',
});