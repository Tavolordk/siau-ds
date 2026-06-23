import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, of, switchMap } from 'rxjs';
import { CaptchaFacade } from '../../captcha/application/captcha.facade';
import { AuthApi } from '../data-access/auth.api';
import { AuthStorage } from '../data-access/auth.storage';
import {
    DEFAULT_AUTHENTICATED_ROUTE,
    SESSION_INACTIVITY_LIMIT_MS,
    SESSION_MONITOR_INTERVAL_MS,
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
        if (!this.isAuthenticated() || this.sessionPromptVisible()) {
            return;
        }

        this.lastActivityAt = Date.now();
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

        this.lastActivityAt = Date.now();
        this.lastRefreshAt = this.resolveSessionIssuedAt(this.session());
        this.registerActivityListeners();

        if (this.sessionMonitorId) {
            return;
        }

        this.sessionMonitorId = setInterval(() => {
            this.monitorAuthenticatedSession();
        }, SESSION_MONITOR_INTERVAL_MS);
    }

    stopSessionMonitor(): void {
        if (this.sessionMonitorId) {
            clearInterval(this.sessionMonitorId);
            this.sessionMonitorId = null;
        }

        this.unregisterActivityListeners();
        this.sessionRefreshInFlight = false;
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
                    this.restartSessionMonitor();
                },
                error: (error: Error) => {
                    this.sessionPromptErrorState.set(error.message);
                    this.forceLocalLogout('Tu sesión no pudo renovarse. Inicia sesión nuevamente.');
                },
            });
    }

    closeSessionFromPrompt(): void {
        this.logout('USER_DECLINED_SESSION_RENEWAL');
    }

    clearError(): void {
        this.errorState.set(null);
    }

    private monitorAuthenticatedSession(): void {
        if (!this.isAuthenticated()) {
            this.stopSessionMonitor();
            return;
        }

        if (this.sessionPromptVisible()) {
            return;
        }

        const now = Date.now();
        const inactiveForMs = now - this.lastActivityAt;

        if (inactiveForMs >= SESSION_INACTIVITY_LIMIT_MS) {
            this.sessionPromptErrorState.set(null);
            this.sessionPromptVisibleState.set(true);
            return;
        }

        const refreshAgeMs = now - this.lastRefreshAt;

        if (refreshAgeMs >= SESSION_TOKEN_REFRESH_INTERVAL_MS) {
            this.refreshActiveSessionSilently();
        }
    }

    private refreshActiveSessionSilently(): void {
        const currentSession = this.session();

        if (!currentSession || this.sessionRefreshInFlight || this.sessionPromptVisible()) {
            return;
        }

        this.sessionRefreshInFlight = true;

        this.api
            .refreshSession(currentSession)
            .pipe(finalize(() => (this.sessionRefreshInFlight = false)))
            .subscribe({
                next: (session) => {
                    this.storage.updateSession(session);
                    this.lastRefreshAt = Date.now();
                },
                error: () => {
                    this.forceLocalLogout('Tu sesión expiró. Inicia sesión nuevamente.');
                },
            });
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

    private registerActivityListeners(): void {
        if (this.activityListenersRegistered) {
            return;
        }

        this.activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, this.handleUserActivity, this.activityListenerOptions);
        });

        this.activityListenersRegistered = true;
    }

    private unregisterActivityListeners(): void {
        if (!this.activityListenersRegistered) {
            return;
        }

        this.activityEvents.forEach((eventName) => {
            window.removeEventListener(eventName, this.handleUserActivity, this.activityListenerOptions);
        });

        this.activityListenersRegistered = false;
    }

    private resolveSessionIssuedAt(session: AuthSession | null): number {
        const issuedAt = Date.parse(session?.issuedAt ?? '');

        return Number.isFinite(issuedAt) ? issuedAt : Date.now();
    }

    private isAuthSession(result: AuthSession | PendingAuthChallenge): result is AuthSession {
        return 'accessToken' in result;
    }
}