import { InjectionToken } from '@angular/core';

export const BLOQUEOS_API_BASE_URL = new InjectionToken<string>('BLOQUEOS_API_BASE_URL', {
    providedIn: 'root',
    factory: () => '/bloqueos-api',
});
