import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { EMPTY, catchError, throwError } from 'rxjs';
import { AuthFacade } from '../auth/application/auth.facade';
import { AuthStorage } from '../auth/data-access/auth.storage';

export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
    const authStorage = inject(AuthStorage);
    const authFacade = inject(AuthFacade);
    const token = authStorage.session()?.accessToken;
    const sessionManagementRequest = isSessionManagementRequest(request.url);

    const headers: Record<string, string> = {
        'X-Trace-Id': createTraceId(),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;

        if (!sessionManagementRequest) {
            authFacade.notifyAuthenticatedHttpActivity();
        }
    }

    return next(
        request.clone({
            setHeaders: headers,
        }),
    ).pipe(
        catchError((error: unknown) => {
            if (token && isSessionRejectedError(error) && !sessionManagementRequest) {
                authFacade.notifyAuthenticatedRequestRejected();
                return EMPTY;
            }

            return throwError(() => error);
        }),
    );
};

function isSessionRejectedError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
}

function isSessionManagementRequest(url: string): boolean {
    return (
        url.includes('/api/v1/tokens') ||
        url.includes('/api/v1/sesiones') ||
        url.includes('/tokens/contacto')
    );
}

function createTraceId(): string {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `siau-web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
