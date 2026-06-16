import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { AUTH_API_BASE_URL } from '../../http/auth-api-base-url.token';
import { ADMIN_PROFILE_KEYWORD, AUTH_SYSTEM } from '../domain/auth.constants';
import { AuthSession, PendingAuthChallenge, SessionValidation } from '../domain/auth-session.model';
import { LoginContactMethod, LoginRequest } from '../domain/login-request.model';

interface ApiErrorDto {
    code?: string | null;
    message?: string | null;
    detail?: string | null;
}

interface ApiResponseDto<T> {
    success: boolean;
    data: T | null;
    errors?: ApiErrorDto[] | null;
    traceId?: string | null;
}

interface LoginContactResponseDto {
    cuenta: string | null;
    medioContacto: string | null;
    contactoEnmascarado: string | null;
    sistema: string | null;
    audience: string | null;
    profileVersion: number;
    perfiles: string[] | null;
    idCodigo: string | null;
}

interface TokenResponseDto {
    accessToken: string | null;
    refreshToken: string | null;
    tokenType: string | null;
    expiresIn: number;
    expiresAtUtc: string;
    sid: string | null;
    jti: string | null;
    sistema: string | null;
    audience: string | null;
    profileVersion: number;
    perfiles: string[] | null;
}

interface SessionValidationResponseDto {
    active: boolean;
    sid: string | null;
    jti: string | null;
    usuarioId: number;
    sistema: string | null;
    audience: string | null;
    profileVersion: number;
    expiresAtUtc: string | null;
    perfiles: string[] | null;
}

type JwtClaims = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class AuthApi {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(AUTH_API_BASE_URL).replace(/\/$/, '');

    login(request: LoginRequest): Observable<PendingAuthChallenge> {
        const username = request.username.trim();
        const contact = this.normalizeContact(request.contact, request.contactMethod);

        if (!username || !contact) {
            return throwError(() => new Error('Completa usuario y medio de contacto.'));
        }

        return this.http
            .post<ApiResponseDto<LoginContactResponseDto>>(`${this.baseUrl}/api/v1/tokens/contacto`, {
                cuenta: username,
                medioContacto: contact,
                sistema: AUTH_SYSTEM,
            })
            .pipe(
                map((response) => this.unwrapResponse(response, 'No se pudo solicitar el código de acceso.')),
                map((response) => this.toPendingChallenge(response, username, contact, request.contactMethod)),
                catchError((error: unknown) => this.handleError(error, 'No se pudo solicitar el código de acceso.')),
            );
    }

    verifyCode(code: string, challenge: PendingAuthChallenge | null): Observable<AuthSession> {
        const normalizedCode = code.replace(/\D/g, '').slice(0, 6);

        if (!challenge) {
            return throwError(() => new Error('No hay una verificación pendiente. Inicia sesión otra vez.'));
        }

        if (normalizedCode.length !== 6) {
            return throwError(() => new Error('Ingresa el código de 6 dígitos.'));
        }

        return this.http
            .post<ApiResponseDto<TokenResponseDto>>(`${this.baseUrl}/api/v1/tokens/contacto/verificar`, {
                cuenta: challenge.username,
                medioContacto: challenge.contact,
                sistema: AUTH_SYSTEM,
                codigo: normalizedCode,
            })
            .pipe(
                map((response) => this.unwrapResponse(response, 'No se pudo verificar el código.')),
                map((tokenResponse) => this.toSession(tokenResponse, challenge.username)),
                catchError((error: unknown) => this.handleError(error, 'El código de verificación es incorrecto.')),
            );
    }

    validateSession(session: AuthSession): Observable<SessionValidation> {
        const params = new HttpParams().set('jti', session.jti).set('sistema', AUTH_SYSTEM);

        return this.http
            .get<ApiResponseDto<SessionValidationResponseDto>>(
                `${this.baseUrl}/api/v1/sesiones/${encodeURIComponent(session.sid)}`,
                { params },
            )
            .pipe(
                map((response) => this.unwrapResponse(response, 'No se pudo validar la sesión.')),
                map((response) => ({
                    active: response.active,
                    sid: response.sid,
                    jti: response.jti,
                    usuarioId: response.usuarioId,
                    sistema: response.sistema,
                    audience: response.audience,
                    profileVersion: response.profileVersion,
                    expiresAtUtc: response.expiresAtUtc,
                    perfiles: response.perfiles ?? [],
                })),
                catchError((error: unknown) => this.handleError(error, 'No se pudo validar la sesión.')),
            );
    }

    refreshSession(session: AuthSession): Observable<AuthSession> {
        return this.http
            .patch<ApiResponseDto<TokenResponseDto>>(`${this.baseUrl}/api/v1/tokens`, {
                refreshToken: session.refreshToken,
                sistema: AUTH_SYSTEM,
            })
            .pipe(
                map((response) => this.unwrapResponse(response, 'No se pudo refrescar la sesión.')),
                map((tokenResponse) => this.toSession(tokenResponse, session.user.username)),
                catchError((error: unknown) => this.handleError(error, 'No se pudo refrescar la sesión.')),
            );
    }

    logout(session: AuthSession | null, motivo = 'USER_LOGOUT'): Observable<void> {
        if (!session?.sid) {
            return of(void 0);
        }

        return this.http
            .delete<void>(`${this.baseUrl}/api/v1/sesiones/${encodeURIComponent(session.sid)}`, {
                body: {
                    sid: session.sid,
                    refreshToken: session.refreshToken,
                    motivo,
                },
            })
            .pipe(catchError((error: unknown) => this.handleError(error, 'No se pudo cerrar la sesión.')));
    }

    private unwrapResponse<T>(response: ApiResponseDto<T>, fallbackMessage: string): T {
        if (response.success && response.data) {
            return response.data;
        }

        const apiMessage =
            response.errors?.find((error) => error.detail || error.message)?.detail ??
            response.errors?.find((error) => error.message)?.message ??
            fallbackMessage;

        throw new Error(apiMessage);
    }

    private toPendingChallenge(
        response: LoginContactResponseDto,
        username: string,
        contact: string,
        requestedMethod: LoginContactMethod,
    ): PendingAuthChallenge {
        return {
            username: response.cuenta?.trim() || username,
            contact,
            contactMethod: requestedMethod,
            contactMethodLabel: this.createContactMethodLabel(response.medioContacto, requestedMethod),
            maskedContact: response.contactoEnmascarado,
            sistema: response.sistema ?? AUTH_SYSTEM,
            audience: response.audience,
            profileVersion: response.profileVersion,
            perfiles: response.perfiles ?? [],
            codeId: response.idCodigo,
            issuedAt: new Date().toISOString(),
        };
    }

    private toSession(response: TokenResponseDto, username: string): AuthSession {
        if (!response.accessToken || !response.refreshToken || !response.sid || !response.jti) {
            throw new Error('La respuesta de autenticación no contiene tokens o datos de sesión completos.');
        }

        const perfiles = response.perfiles ?? [];
        const claims = this.decodeJwtPayload(response.accessToken);
        const userId = this.readClaim(claims, ['usuarioId', 'userId', 'nameid', 'sub']) || response.sid;
        const displayName = this.readClaim(claims, ['name', 'nombre', 'unique_name']) || username;
        const role = this.hasAdminProfile(perfiles) ? 'Administrador' : 'Usuario';

        return {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            tokenType: response.tokenType ?? 'Bearer',
            expiresIn: response.expiresIn,
            expiresAtUtc: response.expiresAtUtc,
            sid: response.sid,
            jti: response.jti,
            sistema: response.sistema ?? AUTH_SYSTEM,
            audience: response.audience,
            profileVersion: response.profileVersion,
            perfiles,
            issuedAt: new Date().toISOString(),
            user: {
                id: userId,
                name: displayName,
                username,
                role,
                initials: this.createInitials(displayName || username),
                requiresTwoFactor: false,
                profiles: perfiles,
            },
        };
    }

    private normalizeContact(contact: string, method: LoginContactMethod): string {
        const value = String(contact ?? '').trim();

        if (method === 'telegram') {
            return value.replace(/\D/g, '');
        }

        return value;
    }

    private createContactMethodLabel(value: string | null, fallback: LoginContactMethod): string {
        const normalizedValue = value?.trim().toLowerCase();

        if (normalizedValue === 'telegram' || fallback === 'telegram') {
            return 'Telegram';
        }

        return 'correo electrónico';
    }

    private hasAdminProfile(perfiles: string[]): boolean {
        return perfiles.some((perfil) => perfil.toUpperCase().includes(ADMIN_PROFILE_KEYWORD));
    }

    private decodeJwtPayload(token: string): JwtClaims {
        try {
            const payload = token.split('.')[1];

            if (!payload) {
                return {};
            }

            const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

            return JSON.parse(atob(padded)) as JwtClaims;
        } catch {
            return {};
        }
    }

    private readClaim(claims: JwtClaims, keys: string[]): string | null {
        for (const key of keys) {
            const value = claims[key];

            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }

            if (typeof value === 'number') {
                return String(value);
            }
        }

        return null;
    }

    private createInitials(value: string): string {
        const parts = value.trim().split(/[.\s_-]+/).filter(Boolean);

        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }

        return value.trim().slice(0, 2).toUpperCase() || 'US';
    }

    private handleError(error: unknown, fallbackMessage: string): Observable<never> {
        if (error instanceof HttpErrorResponse) {
            const apiResponse = error.error as ApiResponseDto<unknown> | null;
            const apiMessage =
                apiResponse?.errors?.find((item) => item.detail || item.message)?.detail ??
                apiResponse?.errors?.find((item) => item.message)?.message ??
                fallbackMessage;

            return throwError(() => new Error(apiMessage));
        }

        if (error instanceof Error) {
            return throwError(() => error);
        }

        return throwError(() => new Error(fallbackMessage));
    }
}