import { InjectionToken } from '@angular/core';

export const ECCC_PERSONAL_API_BASE_URL = new InjectionToken<string>(
    'ECCC_PERSONAL_API_BASE_URL',
    {
        providedIn: 'root',
        factory: () => '/eccc-personal-api',
    },
);
