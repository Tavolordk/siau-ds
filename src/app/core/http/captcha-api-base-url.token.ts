import { InjectionToken } from '@angular/core';

export const CAPTCHA_API_BASE_URL = new InjectionToken<string>('CAPTCHA_API_BASE_URL', {
    providedIn: 'root',
    factory: () => '/captcha-api',
});