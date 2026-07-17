import { InjectionToken } from '@angular/core';

export const RENAPO_API_BASE_URL = new InjectionToken<string>('RENAPO_API_BASE_URL', {
    providedIn: 'root',
    factory: () => '/renapo-api',
});