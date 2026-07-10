import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, EMPTY, finalize, Observable, of, switchMap, throwError } from 'rxjs';
import { CaptchaFacade } from '../../captcha/application/captcha.facade';
import { AuthApi } from '../data-access/auth.api';
import { AuthStorage } from '../data-access/auth.storage';
import {
    DEFAULT_AUTHENTICATED_ROUTE,
    SESSION_INACTIVITY_LIMIT_MS,
    SESSION_MONITOR_INTERVAL_MS,
    SESSION_REFRESH_BEFORE_EXPIRY_MS,
    SESSION_REFRESH_GIVE_UP_BEFORE_EXPIRY_MS,
    SESSION_REFRESH_LOCK_TTL_MS,
    SESSION_REFRESH_MAX_SILENT_FAILURES,
    SESSION_TOKEN_REFRESH_INTERVAL_MS,
} from '../domain/auth.constants';
import { AuthSession, PendingAuthChallenge } from '../domain/auth-session.model';
import { LoginRequest } from '../domain/login-request.model';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
    private readonly api = inject(AuthApi);
    private readonly captcha = inject(CaptchaFacade);
    private readonly storage = inject(AuthStorage);
    private readonly router = inject(Router);

    private readonly loadingState = signal(false);
    private readonly errorState = signal<string | null>(null);
    private readonly sessionPromptVisibleState = signal(false);
    private readonly sessionPromptLoadingState = signal(false);
    private readonly sessionPromptErrorState = signal<string | null>(null);

    private sessionMonitorId: ReturnType<typeof setInterval> | null = null;
    private sessionRefreshInFlight = false;
    private silentRefreshFailures = 0;
    private activityListenersRegistered = false;
    private lastActivityAt = Date.now();
    private lastRefreshAt = Date.now();

    private readonly activityEvents: readonly (keyof WindowEventMap)[] = [
        'click',
        'keydown',
        'mousemove',
        'mousedown',
        'scroll',
        'touchstart',
        'wheel',
    ];

    private readonly activityListenerOptions: AddEventListenerOptions = {
        passive: true,
        capture: true,
    };

    private readonly handleUserActivity = (): void => {
        this.registerVisibleActivity();
    };

    private readonly handleVisibilityChange = (): void => {
        if (!this.isAuthenticated() || this.isDocumentHidden() || this.sessionPromptVisible()) {
            return;
        }

        // Al volver a la pestaña: si ya se cumplió el límite de inactividad, mostrar el modal;
        // si no, contar el regreso como actividad y renovar el token si hace falta.
        if (Date.now() - this.lastActivityAt >= SESSION_INACTIVITY_LIMIT_MS) {
            this.showSessionPrompt('inactividad-al-volver-a-pestana');
            return;
        }

        this.registerVisibleActivity();
    };

    private readonly handleWindowFocus = (): void => {
        this.registerVisibleActivity();
    };

    readonly loading = this.loadingState.asReadonly();
    readonly error = this.errorState.asReadonly();
    readonly sessionPromptVisible = this.sessionPromptVisibleState.asReadonly();
    readonly sessionPromptLoading = this.sessionPromptLoadingState.asReadonly();
    readonly sessionPromptError = this.sessionPromptErrorState.asReadonly();

    readonly session = this.storage.session;
    readonly challenge = this.storage.challenge;
    readonly isAuthenticated = computed(() => Boolean(this.session()?.accessToken && this.session()?.sid));
    readonly userInitials = computed(() => this.session()?.user.initials ?? null);
    readonly userName = computed(() => this.session()?.user.name ?? 'Usuario');
    readonly userRole = computed(() => this.session()?.user.role ?? 'Usuario');

    login(request: LoginRequest): void {
        this.loadingState.set(true);
        this.errorState.set(null);
        this.sessionPromptErrorState.set(null);
        this.captcha.clearError();

        this.captcha
            .verifyAnswer(request.captcha)
            .pipe(
                switchMap((verification) =>
                    this.api.login({
                        ...request,
                        captchaToken: verification.token ?? undefined,
                    }),
                ),
                finalize(() => this.loadingState.set(false)),
            )
            .subscribe({
                next: (result) => this.handleLoginResult(result),
                error: (error: Error) => {
                    this.errorState.set(error.message);
                    this.captcha.refresh();
                },
            });
    }

    verifyCode(code: string): void {
        this.loadingState.set(true);
        this.errorState.set(null);

        this.api
            .verifyCode(code, this.challenge())
            .pipe(finalize(() => this.loadingState.set(false)))
            .subscribe({
                next: (session) => {
                    this.storage.saveSession(session);
                    this.restartSessionMonitor();
                    void this.router.navigateByUrl(DEFAULT_AUTHENTICATED_ROUTE);
                },
                error: (error: Error) => this.errorState.set(error.message),
            });
    }

    logout(motivo = 'USER_LOGOUT'): void {
        const currentSession = this.session();

        this.stopSessionMonitor();
        this.sessionPromptVisibleState.set(false);
        this.sessionPromptLoadingState.set(false);

        this.api
            .logout(currentSession, motivo)
            .pipe(
                catchError(() => of(void 0)),
                finalize(() => {
                    this.storage.clearAll();
                    void this.router.navigateByUrl('/login');
                }),
            )
            .subscribe();
    }

    startSessionMonitor(): void {
        if (!this.isAuthenticated()) {
            return;
        }

        const now = Date.now();
        this.lastActivityAt = now;
        this.lastRefreshAt = this.resolveSessionIssuedAt(this.session());
        this.registerActivityListeners();

        if (this.sessionMonitorId) {
            return;
        }

        this.sessionMonitorId = setInterval(() => {
            this.monitorAuthenticatedSession();
        }, SESSION_MONITOR_INTERVAL_MS);

        this.monitorAuthenticatedSession();
    }

    stopSessionMonitor(): void {
        if (this.sessionMonitorId) {
            clearInterval(this.sessionMonitorId);
            this.sessionMonitorId = null;
        }

        this.unregisterActivityListeners();
        this.sessionRefreshInFlight = false;
        this.silentRefreshFailures = 0;
    }

    keepSession(): void {
        const currentSession = this.session();

        if (!currentSession) {
            this.forceLocalLogout('No hay una sesión activa. Inicia sesión nuevamente.');
            return;
        }

        this.sessionPromptLoadingState.set(true);
        this.sessionPromptErrorState.set(null);

        this.api
            .refreshSession(currentSession)
            .pipe(finalize(() => this.sessionPromptLoadingState.set(false)))
            .subscribe({
                next: (session) => {
                    this.storage.updateSession(session);
                    this.sessionPromptVisibleState.set(false);
                    this.sessionPromptErrorState.set(null);
                    this.lastActivityAt = Date.now();
                    this.lastRefreshAt = Date.now();
                    this.silentRefreshFailures = 0;
                    this.restartSessionMonitor();
                },
                error: (error: Error) => {
                    this.sessionPromptErrorState.set(
                        error.message || 'Tu sesión no pudo renovarse. Intenta mantenerla nuevamente o cierra sesión.',
                    );
                },
            });
    }

    closeSessionFromPrompt(): void {
        this.logout('USER_DECLINED_SESSION_RENEWAL');
    }

    clearError(): void {
        this.errorState.set(null);
    }

    notifyAuthenticatedHttpActivity(): void {
        this.registerVisibleActivity();
    }

    /**
     * El backend responde 401 tanto por token vencido como por falta de permisos,
     * asi que un 401 por si solo NO basta para mostrar el modal de sesion.
     * Estrategia: 1) si el token sigue vigente localmente, es un 401 de permisos y
     * se propaga el error a la pantalla; 2) si el token parece vencido o no se puede
     * determinar, se confirma contra el backend con validateSession; solo si la
     * sesion ya no esta activa se muestra el modal.
     */
    resolveUnauthorizedRequest(originalError: unknown): Observable<never> {
        const currentSession = this.session();

        if (!currentSession || !this.isAuthenticated()) {
            return throwError(() => originalError);
        }

        const now = Date.now();
        const expiresAtMs = this.resolveSessionExpiryMs(currentSession);
        const tokenStillValid = expiresAtMs !== null && expiresAtMs - now > 30 * 1000;

        if (tokenStillValid) {
            // Token vigente: el 401 es por permisos, no por sesion caducada.
            return throwError(() => originalError);
        }

        // Token vencido o expiracion indeterminada: confirmar con el backend.
        return this.api.validateSession(currentSession).pipe(
            switchMap((validation) => {
                if (validation.active) {
                    // La sesion sigue activa: era un 401 de permisos.
                    return throwError(() => originalError);
                }

                this.sessionRefreshInFlight = false;
                this.showSessionPrompt('sesion-caducada-confirmada-por-backend');
                return EMPTY;
            }),
            catchError((validationError: unknown) => {
                if (validationError === originalError) {
                    return throwError(() => originalError);
                }

                // No se pudo validar la sesion: asumir caducidad y ofrecer renovarla.
                this.sessionRefreshInFlight = false;
                this.showSessionPrompt('401-sin-poder-validar-sesion');
                return EMPTY;
            }),
        );
    }

    private monitorAuthenticatedSession(): void {
        const currentSession = this.session();

        if (!currentSession || !this.isAuthenticated()) {
            this.stopSessionMonitor();
            return;
        }

        if (this.sessionPromptVisible()) {
            return;
        }

        const now = Date.now();
        const inactiveForMs = now - this.lastActivityAt;

        // El modal solo aparece cuando realmente se cumple el limite de inactividad.
        // lastActivityAt solo se actualiza con actividad visible, asi que el tiempo
        // con la pestana oculta cuenta como inactividad de forma natural.
        if (inactiveForMs >= SESSION_INACTIVITY_LIMIT_MS) {
            this.showSessionPrompt(`inactividad-${Math.round(inactiveForMs / 1000)}s`);
            return;
        }

        // Mientras no se cumpla el limite, el usuario sigue "activo": renovar en silencio,
        // incluso si la pestana esta oculta (el token no debe caducar por un cambio breve de pestana).
        if (this.shouldRefreshSession(currentSession, now)) {
            this.refreshActiveSessionSilently();
        }
    }

    private refreshActiveSessionSilently(): void {
        const currentSession = this.session();

        if (!currentSession || this.sessionRefreshInFlight || this.sessionPromptVisible()) {
            return;
        }

        // Los refresh tokens rotan: si otra pestaña ya está renovando, esperar.
        // La sesión nueva llegará por el evento 'storage' y este intento se vuelve innecesario.
        if (!this.storage.tryAcquireRefreshLock(SESSION_REFRESH_LOCK_TTL_MS)) {
            return;
        }

        this.sessionRefreshInFlight = true;

        this.api
            .refreshSession(currentSession)
            .pipe(
                finalize(() => {
                    this.sessionRefreshInFlight = false;
                    this.storage.releaseRefreshLock();
                }),
            )
            .subscribe({
                next: (session) => {
                    this.storage.updateSession(session);
                    this.lastRefreshAt = Date.now();
                    this.silentRefreshFailures = 0;
                    // No reiniciar lastActivityAt aqui: el refresh automatico no es actividad
                    // del usuario; de lo contrario el limite de inactividad nunca se cumpliria.
                },
                error: (error: Error) => {
                    this.handleSilentRefreshFailure(error);
                },
            });
    }

    /**
     * Un fallo transitorio del refresh (blip de red, 5xx momentaneo) NO debe interrumpir
     * a un usuario activo con el modal: el monitor reintenta en el siguiente tick (30s).
     * Solo se muestra el modal si acumulamos varios fallos consecutivos o si el token
     * ya esta practicamente vencido y no queda margen para reintentar.
     */
    private handleSilentRefreshFailure(error: Error): void {
        this.silentRefreshFailures += 1;

        const currentSession = this.session();
        const expiresAtMs = currentSession ? this.resolveSessionExpiryMs(currentSession) : null;
        const tokenAboutToDie =
            expiresAtMs !== null && expiresAtMs - Date.now() <= SESSION_REFRESH_GIVE_UP_BEFORE_EXPIRY_MS;

        if (this.silentRefreshFailures >= SESSION_REFRESH_MAX_SILENT_FAILURES || tokenAboutToDie) {
            this.silentRefreshFailures = 0;
            this.showSessionPrompt(`fallo-refresh-silencioso: ${error.message}`);
            return;
        }

        console.warn(
            `[AuthFacade] Refresh silencioso falló (intento ${this.silentRefreshFailures}/${SESSION_REFRESH_MAX_SILENT_FAILURES}), se reintentará. Detalle: ${error.message}`,
        );
    }

    private registerVisibleActivity(): void {
        if (!this.isAuthenticated() || this.sessionPromptVisible() || this.isDocumentHidden()) {
            return;
        }

        const now = Date.now();
        this.lastActivityAt = now;

        const currentSession = this.session();

        if (currentSession && this.shouldRefreshSession(currentSession, now)) {
            this.refreshActiveSessionSilently();
        }
    }

    private shouldRefreshSession(session: AuthSession, now = Date.now()): boolean {
        // issuedAt se reescribe en cada renovación (también las hechas por OTRA pestaña,
        // que llegan por el evento 'storage'). Tomar el valor más reciente evita que esta
        // pestaña intente renovar con un refresh token que otra pestaña ya consumió.
        const issuedAtMs = this.resolveSessionIssuedAt(session);

        if (issuedAtMs > this.lastRefreshAt) {
            this.lastRefreshAt = issuedAtMs;
        }

        const refreshAgeMs = now - this.lastRefreshAt;

        // Guarda anti-bucle: si acabamos de renovar hace menos de un minuto,
        // no volver a renovar aunque expiresAtUtc parezca vencido (dato poco confiable).
        if (refreshAgeMs < 60 * 1000) {
            return false;
        }

        if (refreshAgeMs >= SESSION_TOKEN_REFRESH_INTERVAL_MS) {
            return true;
        }

        const expiresAtMs = this.resolveSessionExpiryMs(session);

        return expiresAtMs !== null && expiresAtMs - now <= SESSION_REFRESH_BEFORE_EXPIRY_MS;
    }

    private resolveSessionExpiryMs(session: AuthSession): number | null {
        const parsed = this.parseUtcTimestamp(session.expiresAtUtc);

        if (parsed !== null) {
            return parsed;
        }

        // Fallback: calcular la expiración con issuedAt + expiresIn.
        const issuedAt = Date.parse(session.issuedAt);

        if (Number.isFinite(issuedAt) && Number.isFinite(session.expiresIn) && session.expiresIn > 0) {
            return issuedAt + session.expiresIn * 1000;
        }

        return null;
    }

    private parseUtcTimestamp(value: string | null | undefined): number | null {
        const raw = value?.trim();

        if (!raw) {
            return null;
        }

        // Si el backend manda la fecha UTC sin zona horaria ("2026-07-08T18:30:00"),
        // Date.parse la interpreta como hora LOCAL (CDMX = UTC-6), haciendo que el token
        // parezca vencido 6 horas antes. Normalizamos asumiendo UTC cuando no hay zona.
        const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
        const normalized = hasTimezone ? raw : `${raw.replace(' ', 'T')}Z`;
        const parsed = Date.parse(normalized);

        return Number.isFinite(parsed) ? parsed : null;
    }

    private handleLoginResult(result: AuthSession | PendingAuthChallenge): void {
        if (this.isAuthSession(result)) {
            this.storage.saveSession(result);
            this.restartSessionMonitor();
            void this.router.navigateByUrl(DEFAULT_AUTHENTICATED_ROUTE);
            return;
        }

        this.stopSessionMonitor();
        this.storage.saveChallenge(result);
        void this.router.navigateByUrl('/login/verificacion');
    }

    private restartSessionMonitor(): void {
        this.stopSessionMonitor();
        this.startSessionMonitor();
    }

    private forceLocalLogout(message: string): void {
        this.stopSessionMonitor();
        this.sessionPromptVisibleState.set(false);
        this.sessionPromptLoadingState.set(false);
        this.sessionPromptErrorState.set(null);
        this.storage.clearAll();
        this.errorState.set(message);
        void this.router.navigateByUrl('/login');
    }

    private showSessionPrompt(reason = 'unspecified'): void {
        console.warn(`[AuthFacade] Mostrando modal de sesión. Motivo: ${reason}`);
        this.sessionPromptErrorState.set(null);
        this.sessionPromptVisibleState.set(true);
    }

    private registerActivityListeners(): void {
        if (this.activityListenersRegistered) {
            return;
        }

        this.activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, this.handleUserActivity, this.activityListenerOptions);
        });

        window.addEventListener('focus', this.handleWindowFocus, this.activityListenerOptions);
        document.addEventListener('visibilitychange', this.handleVisibilityChange, this.activityListenerOptions);

        this.activityListenersRegistered = true;
    }

    private unregisterActivityListeners(): void {
        if (!this.activityListenersRegistered) {
            return;
        }

        this.activityEvents.forEach((eventName) => {
            window.removeEventListener(eventName, this.handleUserActivity, this.activityListenerOptions);
        });

        window.removeEventListener('focus', this.handleWindowFocus, this.activityListenerOptions);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange, this.activityListenerOptions);

        this.activityListenersRegistered = false;
    }

    private isDocumentHidden(): boolean {
        return typeof document !== 'undefined' && document.visibilityState === 'hidden';
    }

    private resolveSessionIssuedAt(session: AuthSession | null): number {
        const issuedAt = Date.parse(session?.issuedAt ?? '');

        return Number.isFinite(issuedAt) ? issuedAt : Date.now();
    }

    private isAuthSession(result: AuthSession | PendingAuthChallenge): result is AuthSession {
        return 'accessToken' in result;
    }
}