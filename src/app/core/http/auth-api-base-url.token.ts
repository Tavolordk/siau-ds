import { InjectionToken } from '@angular/core';

export const AUTH_API_BASE_URL = new InjectionToken<string>('AUTH_API_BASE_URL', {
    providedIn: 'root',
    factory: () => 'http://10.241.34.10:3240',
});