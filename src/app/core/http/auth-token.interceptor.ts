import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthStorage } from '../auth/data-access/auth.storage';

export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
    const authStorage = inject(AuthStorage);
    const token = authStorage.session()?.accessToken;

    const headers: Record<string, string> = {
        'X-Trace-Id': createTraceId(),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return next(
        request.clone({
            setHeaders: headers,
        }),
    );
};

function createTraceId(): string {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `siau-web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}