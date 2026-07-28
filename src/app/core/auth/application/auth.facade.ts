import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
    catchError,
    defer,
    EMPTY,
    finalize,
    firstValueFrom,
    from,
    Observable,
    of,
    shareReplay,
    switchMap,
    tap,
    throwError,
} from 'rxjs';
import { CaptchaFacade } from '../../captcha/application/captcha.facade';
import { AuthApi, AuthHttpError } from '../data-access/auth.api';
import { AuthStorage } from '../data-access/auth.storage';
import {
    DEFAULT_AUTHENTICATED_ROUTE,
    SESSION_ACTIVITY_STORAGE_THROTTLE_MS,
    SESSION_INACTIVITY_COUNTDOWN_MS,
    SESSION_INACTIVITY_LIMIT_MS,
    SESSION_INACTIVITY_PROMPT_MS,
    SESSION_MIN_REFRESH_INTERVAL_MS,
    SESSION_MONITOR_INTERVAL_MS,
    SESSION_REFRESH_AFTER_IDLE_MS,
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
    private readonly sessionPromptRemainingSecondsState = signal(0);
    private challengeCaptchaToken: string | null = null;

    private sessionMonitorId: ReturnType<typeof setInterval> | null = null;
    private sessionPromptCountdownId: ReturnType<typeof setInterval> | null = null;
    private sessionPromptDeadlineAt: number | null = null;
    private sessionRefreshInFlight = false;
    private sessionRefreshRequest$: Observable<AuthSession> | null = null;
    private silentRefreshFailures = 0;
    private activityListenersRegistered = false;
    private lastActivityAt = Date.now();
    private lastPersistedActivityAt = 0;
    private lastRefreshAt = Date.now();
    private observedExternalSessionClosure = 0;
    private observedExternalTabTakeover = 0;

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
        if (!this.isAuthenticated() || this.isDocumentHidden()) {
            return;
        }

        if (this.sessionPromptVisible()) {
            this.updateSessionPromptCountdown();
            return;
        }

        if (this.hasReachedInactivityPrompt(Date.now() - this.lastActivityAt)) {
            this.showSessionPrompt('inactividad-al-volver-a-pestana');
            return;
        }

        this.registerVisibleActivity();
    };

    private readonly handleWindowFocus = (): void => {
        if (this.sessionPromptVisible()) {
            this.updateSessionPromptCountdown();
            return;
        }

        this.registerVisibleActivity();
    };

    readonly loading = this.loadingState.asReadonly();
    readonly error = this.errorState.asReadonly();
    readonly sessionPromptVisible = this.sessionPromptVisibleState.asReadonly();
    readonly sessionPromptLoading = this.sessionPromptLoadingState.asReadonly();
    readonly sessionPromptError = this.sessionPromptErrorState.asReadonly();
    readonly sessionPromptRemainingSeconds = this.sessionPromptRemainingSecondsState.asReadonly();
    readonly sessionPromptCountdownLabel = computed(() => {
        const totalSeconds = this.sessionPromptRemainingSeconds();
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    });

    readonly session = this.storage.session;
    readonly challenge = this.storage.challenge;
    readonly isAuthenticated = computed(() => Boolean(this.session()?.accessToken && this.session()?.sid));
    readonly userInitials = computed(() => this.session()?.user.initials ?? null);
    readonly userName = computed(() => this.session()?.user.name ?? 'Usuario');
    readonly userRole = computed(() => this.session()?.user.role ?? 'Usuario');

    constructor() {
        effect(() => {
            const closureVersion = this.storage.externalSessionClosure();

            if (closureVersion <= this.observedExternalSessionClosure) {
                return;
            }

            this.observedExternalSessionClosure = closureVersion;
            this.forceLocalLogout('La sesión se cerró en otra pestaña.');
        });

        effect(() => {
            const takeoverVersion = this.storage.externalTabTakeover();

            if (takeoverVersion <= this.observedExternalTabTakeover) {
                return;
            }

            this.observedExternalTabTakeover = takeoverVersion;
            this.forceTabTakeoverLogout();
        });
    }

    login(request: LoginRequest): void {
        this.loadingState.set(true);
        this.errorState.set(null);
        this.sessionPromptErrorState.set(null);
        this.captcha.clearError();

        this.captcha
            .verifyAnswer(request.captcha)
            .pipe(
                tap((verification) => {
                    this.challengeCaptchaToken = verification.token;
                }),
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
                    this.challengeCaptchaToken = null;
                    this.errorState.set(error.message);
                    this.captcha.refresh();
                },
            });
    }

    /**
     * HU02/RN07-RN08: solicita una nueva emisión al mismo proceso de
     * autenticación. El backend conserva la autoridad para invalidar el OTP
     * anterior, contar intentos y aplicar el bloqueo configurado.
     */
    resendCode(): void {
        const challenge = this.challenge();
        const captchaToken = this.challengeCaptchaToken;

        if (!challenge || !captchaToken) {
            this.errorState.set(
                'Por seguridad, vuelve al inicio de sesión para validar un nuevo CAPTCHA antes de solicitar otro código.',
            );
            return;
        }

        if (this.loading()) {
            return;
        }

        this.loadingState.set(true);
        this.errorState.set(null);

        this.api
            .login({
                username: challenge.username,
                contact: challenge.contact,
                captcha: '',
                captchaToken,
            })
            .pipe(finalize(() => this.loadingState.set(false)))
            .subscribe({
                next: (nextChallenge) => {
                    this.storage.saveChallenge(nextChallenge);
                    this.errorState.set(null);
                },
                error: (error: Error) => this.errorState.set(error.message),
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
                    this.challengeCaptchaToken = null;
                    this.storage.saveSession(session);
                    this.restartSessionMonitor();
                    void this.router.navigateByUrl(DEFAULT_AUTHENTICATED_ROUTE);
                },
                error: (error: Error) => this.errorState.set(error.message),
            });
    }

    logout(motivo = 'USER_LOGOUT'): void {
        const currentSession = this.session();

        this.challengeCaptchaToken = null;

        this.stopSessionMonitor();
        this.clearSessionPrompt();

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
        const persistedLastActivityAt = this.storage.readLastActivityAt();

        // No reiniciar la inactividad al cargar otra vez SIAU. Para sesiones
        // heredadas sin marca de actividad, se inicia una sola vez desde ahora.
        this.lastActivityAt = persistedLastActivityAt ?? now;
        this.lastPersistedActivityAt = this.lastActivityAt;

        if (persistedLastActivityAt === null) {
            this.persistLastActivity(now, true);
        }

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
        this.cancelSessionPromptCountdown();
        if (!this.sessionRefreshRequest$) {
            this.sessionRefreshInFlight = false;
        }
        this.silentRefreshFailures = 0;
    }

    dismissSessionPrompt(): void {
        const currentSession = this.session();

        if (!currentSession) {
            this.forceLocalLogout('No hay una sesión activa. Inicia sesión nuevamente.');
            return;
        }

        if (!this.sessionPromptVisible() || this.sessionPromptLoading()) {
            return;
        }

        this.pauseSessionPromptCountdown();
        this.sessionPromptLoadingState.set(true);
        this.sessionPromptErrorState.set(null);

        this.refreshSessionSafely()
            .pipe(finalize(() => this.sessionPromptLoadingState.set(false)))
            .subscribe({
                next: () => {
                    this.clearSessionPrompt();
                    this.persistLastActivity(Date.now(), true);
                    this.lastRefreshAt = Date.now();
                    this.silentRefreshFailures = 0;
                    this.restartSessionMonitor();
                },
                error: (error: Error) => {
                    if (!this.isAuthenticated()) {
                        return;
                    }

                    this.sessionPromptErrorState.set(
                        error.message || 'No fue posible renovar la sesión. Intenta cerrar el aviso de nuevo.',
                    );
                    this.resumeSessionPromptCountdown();
                },
            });
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
            this.updateSessionPromptCountdown();
            return;
        }

        const now = Date.now();
        const inactiveForMs = now - this.lastActivityAt;

        // Mostrar el modal antes del límite para que el usuario pueda renovar mientras
        // el token todavía está vigente. El tiempo con la pestaña oculta también cuenta.
        if (this.hasReachedInactivityPrompt(inactiveForMs)) {
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
        if (!this.session() || this.sessionRefreshInFlight || this.sessionPromptVisible()) {
            return;
        }

        this.refreshSessionSafely().subscribe({
            next: () => {
                // No reiniciar lastActivityAt aqui: el refresh automatico no es actividad
                // del usuario; de lo contrario el limite de inactividad nunca se cumpliria.
            },
            error: (error: Error) => {
                this.handleSilentRefreshFailure(error);
            },
        });
    }

    /**
     * Punto único de renovación. Todas las rutas (automática, actividad y modal)
     * comparten exactamente la misma petición dentro de esta pestaña.
     *
     * El candado de AuthStorage serializa también las pestañas. Una vez obtenido,
     * se vuelve a leer localStorage: si otra pestaña ya renovó, se adopta esa sesión
     * y NO se reutiliza el refresh token anterior.
     */
    private refreshSessionSafely(): Observable<AuthSession> {
        if (this.sessionRefreshRequest$) {
            return this.sessionRefreshRequest$;
        }

        const sessionAtRequestTime = this.storage.readLatestSession();

        if (!sessionAtRequestTime) {
            return throwError(() => new Error('No hay una sesión activa para renovar.'));
        }

        const originalSessionFingerprint = this.createRefreshFingerprint(sessionAtRequestTime);
        this.sessionRefreshInFlight = true;

        const request$ = defer(() =>
            from(
                this.storage.runWithRefreshLock(SESSION_REFRESH_LOCK_TTL_MS, async () => {
                    const latestSession = this.storage.readLatestSession();

                    if (!latestSession) {
                        throw new Error('La sesión fue cerrada antes de poder renovarla.');
                    }

                    // Mientras esta pestaña esperaba el candado, otra pudo renovar.
                    // En ese caso su sesión ya contiene el refresh token vigente.
                    if (this.createRefreshFingerprint(latestSession) !== originalSessionFingerprint) {
                        return latestSession;
                    }

                    return firstValueFrom(this.api.refreshSession(latestSession));
                }),
            ),
        ).pipe(
            tap((session) => {
                const currentSession = this.storage.readLatestSession();

                // No restaurar una sesión que el usuario ya cerró mientras el PATCH
                // estaba en curso.
                if (!currentSession || currentSession.sid !== sessionAtRequestTime.sid) {
                    throw new Error('La sesión ya no está activa.');
                }

                if (this.createRefreshFingerprint(currentSession) !== this.createRefreshFingerprint(session)) {
                    this.storage.updateSession(session);
                }

                this.lastRefreshAt = this.resolveSessionIssuedAt(session);
                this.silentRefreshFailures = 0;
            }),
            catchError((error: unknown) => {
                if (this.isRefreshTokenRejected(error)) {
                    // No mostrar un modal inútil: si el backend rechazó el refresh
                    // token, ya no existe una forma segura de renovar esta sesión.
                    this.forceLocalLogout(
                        'Tu sesión venció y no se pudo renovar. Inicia sesión nuevamente.',
                    );
                }

                return throwError(() => error);
            }),
            finalize(() => {
                this.sessionRefreshInFlight = false;
                this.sessionRefreshRequest$ = null;
            }),
            shareReplay({ bufferSize: 1, refCount: false }),
        );

        this.sessionRefreshRequest$ = request$;
        return request$;
    }

    private createRefreshFingerprint(session: AuthSession): string {
        return `${session.sid}|${session.refreshToken}|${session.issuedAt}`;
    }

    /**
     * Un fallo transitorio del refresh (blip de red, 5xx momentaneo) NO debe interrumpir
     * a un usuario activo con el modal: el monitor reintenta en el siguiente tick (30s).
     * Solo se muestra el modal si acumulamos varios fallos consecutivos o si el token
     * ya esta practicamente vencido y no queda margen para reintentar.
     */
    private handleSilentRefreshFailure(error: Error): void {
        if (!this.isAuthenticated()) {
            return;
        }

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
        const inactiveForMs = now - this.lastActivityAt;

        if (this.hasReachedInactivityPrompt(inactiveForMs)) {
            this.showSessionPrompt('inactividad-detectada-al-regresar');
            return;
        }

        this.persistLastActivity(now);

        const currentSession = this.session();
        const refreshAgeMs = now - this.lastRefreshAt;
        const returnedAfterIdle =
            inactiveForMs >= SESSION_REFRESH_AFTER_IDLE_MS &&
            refreshAgeMs >= SESSION_MIN_REFRESH_INTERVAL_MS;

        if (currentSession && (returnedAfterIdle || this.shouldRefreshSession(currentSession, now))) {
            this.refreshActiveSessionSilently();
        }
    }

    private hasReachedInactivityPrompt(inactiveForMs: number): boolean {
        return inactiveForMs >= Math.min(
            SESSION_INACTIVITY_PROMPT_MS,
            SESSION_INACTIVITY_LIMIT_MS,
        );
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
        if (refreshAgeMs < SESSION_MIN_REFRESH_INTERVAL_MS) {
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
            this.challengeCaptchaToken = null;
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
        this.challengeCaptchaToken = null;
        this.stopSessionMonitor();
        this.clearSessionPrompt();
        this.storage.clearAll();
        this.errorState.set(message);
        void this.router.navigateByUrl('/login');
    }

    private forceTabTakeoverLogout(): void {
        this.challengeCaptchaToken = null;
        this.stopSessionMonitor();
        this.clearSessionPrompt();
        this.storage.clearLocalAuthState();
        this.errorState.set('Esta pestaña se cerró porque la sesión se abrió en otra pestaña.');
        void this.router.navigateByUrl('/login');
    }

    private showSessionPrompt(reason = 'unspecified'): void {
        if (!this.isAuthenticated()) {
            return;
        }

        if (this.sessionPromptVisible()) {
            this.updateSessionPromptCountdown();
            return;
        }

        const now = Date.now();
        const isInactivityPrompt = reason.startsWith('inactividad');
        const deadlineAt = isInactivityPrompt
            ? this.lastActivityAt + SESSION_INACTIVITY_LIMIT_MS
            : now + SESSION_INACTIVITY_COUNTDOWN_MS;

        if (deadlineAt <= now) {
            this.expireInactiveSession();
            return;
        }

        console.warn(`[AuthFacade] Mostrando modal de sesión. Motivo: ${reason}`);
        this.sessionPromptErrorState.set(null);
        this.sessionPromptLoadingState.set(false);
        this.sessionPromptVisibleState.set(true);
        this.startSessionPromptCountdown(deadlineAt);
    }

    private startSessionPromptCountdown(deadlineAt: number): void {
        this.pauseSessionPromptCountdown();
        this.sessionPromptDeadlineAt = deadlineAt;
        this.updateSessionPromptCountdown();

        if (!this.sessionPromptVisible() || !this.isAuthenticated()) {
            return;
        }

        this.sessionPromptCountdownId = setInterval(() => {
            this.updateSessionPromptCountdown();
        }, 1000);
    }

    private pauseSessionPromptCountdown(): void {
        if (this.sessionPromptCountdownId) {
            clearInterval(this.sessionPromptCountdownId);
            this.sessionPromptCountdownId = null;
        }
    }

    private resumeSessionPromptCountdown(): void {
        if (!this.sessionPromptVisible()) {
            return;
        }

        this.startSessionPromptCountdown(
            this.sessionPromptDeadlineAt ?? Date.now() + SESSION_INACTIVITY_COUNTDOWN_MS,
        );
    }

    private cancelSessionPromptCountdown(): void {
        this.pauseSessionPromptCountdown();
        this.sessionPromptDeadlineAt = null;
        this.sessionPromptRemainingSecondsState.set(0);
    }

    private updateSessionPromptCountdown(): void {
        const deadlineAt = this.sessionPromptDeadlineAt;

        if (!this.sessionPromptVisible() || deadlineAt === null) {
            return;
        }

        const remainingMs = deadlineAt - Date.now();

        if (remainingMs <= 0) {
            this.expireInactiveSession();
            return;
        }

        this.sessionPromptRemainingSecondsState.set(Math.ceil(remainingMs / 1000));
    }

    private clearSessionPrompt(): void {
        this.cancelSessionPromptCountdown();
        this.sessionPromptVisibleState.set(false);
        this.sessionPromptLoadingState.set(false);
        this.sessionPromptErrorState.set(null);
    }

    private isRefreshTokenRejected(error: unknown): boolean {
        if (!(error instanceof AuthHttpError)) {
            return false;
        }

        // Solo se usa desde la petición PATCH de refresh. Estos 4xx indican que
        // el backend ya no acepta el refresh token (vencido, inválido o revocado).
        // En SIAU, el 409 es específicamente el refresh token vencido.
        return [400, 401, 403, 409, 422].includes(error.status);
    }

    private persistLastActivity(now: number, force = false): void {
        this.lastActivityAt = now;

        if (force || now - this.lastPersistedActivityAt >= SESSION_ACTIVITY_STORAGE_THROTTLE_MS) {
            this.storage.saveLastActivityAt(now);
            this.lastPersistedActivityAt = now;
        }
    }

    private expireInactiveSession(): void {
        const currentSession = this.session();

        // La suscripción debe iniciar antes de limpiar el almacenamiento local:
        // el interceptor toma de ahí el Bearer para autorizar DELETE /sesiones.
        // El cierre visual sigue siendo inmediato justo después de despachar la petición.
        if (currentSession) {
            this.api
                .logout(currentSession, 'INACTIVITY_TIMEOUT')
                .pipe(catchError(() => of(void 0)))
                .subscribe();
        }

        this.forceLocalLogout('La sesión se cerró por inactividad. Inicia sesión nuevamente.');
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
