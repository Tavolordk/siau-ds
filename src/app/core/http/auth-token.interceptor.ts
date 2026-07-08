import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
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
                // El facade decide si el 401 fue por sesion caducada (muestra modal)
                // o por falta de permisos (propaga el error a la pantalla).
                return authFacade.resolveUnauthorizedRequest(error);
            }

            return throwError(() => error);
        }),
    );
};

function isSessionRejectedError(error: unknown): boolean {
    // Solo 401 indica sesión/token inválido. Un 403 significa falta de permisos
    // sobre el recurso con una sesión válida, y no debe disparar el modal de sesión.
    return error instanceof HttpErrorResponse && error.status === 401;
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