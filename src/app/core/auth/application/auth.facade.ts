import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthApi } from '../data-access/auth.api';
import { AuthStorage } from '../data-access/auth.storage';
import { AuthSession, PendingAuthChallenge } from '../domain/auth-session.model';
import { LoginRequest } from '../domain/login-request.model';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
    private readonly api = inject(AuthApi);
    private readonly storage = inject(AuthStorage);
    private readonly router = inject(Router);

    private readonly loadingState = signal(false);
    private readonly errorState = signal<string | null>(null);

    readonly loading = this.loadingState.asReadonly();
    readonly error = this.errorState.asReadonly();
    readonly session = this.storage.session;
    readonly challenge = this.storage.challenge;
    readonly isAuthenticated = computed(() => Boolean(this.session()));
    readonly userInitials = computed(() => this.session()?.user.initials ?? null);

    login(request: LoginRequest): void {
        this.loadingState.set(true);
        this.errorState.set(null);

        this.api
            .login(request)
            .pipe(finalize(() => this.loadingState.set(false)))
            .subscribe({
                next: (result) => this.handleLoginResult(result),
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
                    this.storage.saveSession(session);
                    void this.router.navigateByUrl('/usuarios');
                },
                error: (error: Error) => this.errorState.set(error.message),
            });
    }

    logout(): void {
        this.storage.clearAll();
        void this.router.navigateByUrl('/login');
    }

    clearError(): void {
        this.errorState.set(null);
    }

    private handleLoginResult(result: AuthSession | PendingAuthChallenge): void {
        if (this.isAuthSession(result)) {
            this.storage.saveSession(result);
            void this.router.navigateByUrl('/usuarios');
            return;
        }

        this.storage.saveChallenge(result);
        void this.router.navigateByUrl('/login/verificacion');
    }

    private isAuthSession(result: AuthSession | PendingAuthChallenge): result is AuthSession {
        return 'accessToken' in result;
    }
}