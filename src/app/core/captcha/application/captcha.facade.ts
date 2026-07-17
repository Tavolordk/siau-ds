import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { catchError, finalize, map, Observable, tap, throwError } from 'rxjs';
import {
    CaptchaChallenge,
    CaptchaGenerationOptions,
    CaptchaVerification,
} from '../domain/captcha.model';
import { CaptchaRepository } from '../domain/captcha.repository';

@Injectable({ providedIn: 'root' })
export class CaptchaFacade implements OnDestroy {
    private readonly repository = inject(CaptchaRepository);

    private readonly challengeState = signal<CaptchaChallenge | null>(null);
    private readonly loadingState = signal(false);
    private readonly verifyingState = signal(false);
    private readonly errorState = signal<string | null>(null);
    private readonly remainingSecondsState = signal(0);

    private expirationTimerId: ReturnType<typeof setInterval> | null = null;
    private active = false;

    readonly challenge = this.challengeState.asReadonly();
    readonly loading = this.loadingState.asReadonly();
    readonly verifying = this.verifyingState.asReadonly();
    readonly error = this.errorState.asReadonly();
    readonly remainingSeconds = this.remainingSecondsState.asReadonly();

    readonly imageDataUrl = computed(() => this.challenge()?.imageDataUrl ?? null);
    readonly expiresAt = computed(() => this.challenge()?.expiresAt ?? null);
    readonly isExpired = computed(() => Boolean(this.challenge()) && this.remainingSeconds() <= 0);
    readonly expirationLabel = computed(() => this.formatRemainingTime(this.remainingSeconds()));

    ngOnDestroy(): void {
        this.deactivate();
    }

    load(options?: CaptchaGenerationOptions): void {
        this.active = true;
        this.loadingState.set(true);
        this.errorState.set(null);

        this.repository
            .generate(options)
            .pipe(finalize(() => this.loadingState.set(false)))
            .subscribe({
                next: (challenge) => {
                    if (!this.active) {
                        return;
                    }

                    this.challengeState.set(challenge);
                    this.errorState.set(null);
                    this.startExpirationTimer(challenge);
                },
                error: (error: Error) => {
                    if (!this.active) {
                        return;
                    }

                    this.challengeState.set(null);
                    this.remainingSecondsState.set(0);
                    this.stopExpirationTimer();
                    this.errorState.set(error.message);
                },
            });
    }

    refresh(options?: CaptchaGenerationOptions): void {
        if (!this.active) {
            return;
        }

        this.load(options);
    }

    /**
     * Detiene por completo el captcha al abandonar la pantalla de inicio de sesión.
     * CaptchaFacade es singleton, por lo que Angular no ejecuta ngOnDestroy al cambiar
     * de ruta y debemos finalizar explícitamente su temporizador.
     */
    deactivate(): void {
        this.active = false;
        this.stopExpirationTimer();
        this.challengeState.set(null);
        this.remainingSecondsState.set(0);
        this.errorState.set(null);
    }

    verifyAnswer(answer: string): Observable<CaptchaVerification> {
        const challenge = this.challenge();
        const normalizedAnswer = answer.trim().toUpperCase();

        if (!challenge) {
            return throwError(() => new Error('Primero genera un captcha válido.'));
        }

        if (this.isExpired()) {
            this.refresh();
            return throwError(() => new Error('El captcha caducó. Generamos uno nuevo, inténtalo de nuevo.'));
        }

        if (!normalizedAnswer) {
            return throwError(() => new Error('Escribe el captcha para continuar.'));
        }

        this.verifyingState.set(true);
        this.errorState.set(null);

        return this.repository.verify({ id: challenge.id, answer: normalizedAnswer }).pipe(
            map((verification) => {
                if (!verification.ok) {
                    throw new Error('El captcha no coincide. Intenta nuevamente.');
                }

                if (!verification.token) {
                    throw new Error('El captcha fue validado, pero no se recibió token temporal.');
                }

                return verification;
            }),
            tap(() => this.errorState.set(null)),
            catchError((error: Error) => {
                this.errorState.set(error.message);
                return throwError(() => error);
            }),
            finalize(() => this.verifyingState.set(false)),
        );
    }

    clearError(): void {
        this.errorState.set(null);
    }

    private startExpirationTimer(challenge: CaptchaChallenge): void {
        this.stopExpirationTimer();
        this.updateRemainingSeconds(challenge.expiresAt);

        this.expirationTimerId = setInterval(() => {
            this.updateRemainingSeconds(challenge.expiresAt);

            if (this.remainingSecondsState() <= 0) {
                this.stopExpirationTimer();
                this.refreshExpiredCaptcha();
            }
        }, 1000);
    }

    private updateRemainingSeconds(expiresAt: Date): void {
        const remainingMilliseconds = expiresAt.getTime() - Date.now();
        const remainingSeconds = Math.max(0, Math.ceil(remainingMilliseconds / 1000));

        this.remainingSecondsState.set(remainingSeconds);
    }

    private refreshExpiredCaptcha(): void {
        if (!this.active || this.loadingState() || this.verifyingState()) {
            return;
        }

        this.refresh();
    }

    private stopExpirationTimer(): void {
        if (!this.expirationTimerId) {
            return;
        }

        clearInterval(this.expirationTimerId);
        this.expirationTimerId = null;
    }

    private formatRemainingTime(totalSeconds: number): string {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}