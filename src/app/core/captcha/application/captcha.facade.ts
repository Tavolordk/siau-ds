import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, map, Observable, tap, throwError } from 'rxjs';
import {
    CaptchaChallenge,
    CaptchaGenerationOptions,
    CaptchaVerification,
} from '../domain/captcha.model';
import { CaptchaRepository } from '../domain/captcha.repository';

@Injectable({ providedIn: 'root' })
export class CaptchaFacade {
    private readonly repository = inject(CaptchaRepository);

    private readonly challengeState = signal<CaptchaChallenge | null>(null);
    private readonly loadingState = signal(false);
    private readonly verifyingState = signal(false);
    private readonly errorState = signal<string | null>(null);

    readonly challenge = this.challengeState.asReadonly();
    readonly loading = this.loadingState.asReadonly();
    readonly verifying = this.verifyingState.asReadonly();
    readonly error = this.errorState.asReadonly();

    readonly imageDataUrl = computed(() => this.challenge()?.imageDataUrl ?? null);
    readonly expiresAt = computed(() => this.challenge()?.expiresAt ?? null);

    load(options?: CaptchaGenerationOptions): void {
        this.loadingState.set(true);
        this.errorState.set(null);

        this.repository
            .generate(options)
            .pipe(finalize(() => this.loadingState.set(false)))
            .subscribe({
                next: (challenge) => this.challengeState.set(challenge),
                error: (error: Error) => {
                    this.challengeState.set(null);
                    this.errorState.set(error.message);
                },
            });
    }

    refresh(options?: CaptchaGenerationOptions): void {
        this.load(options);
    }

    verifyAnswer(answer: string): Observable<CaptchaVerification> {
        const challenge = this.challenge();
        const normalizedAnswer = answer.trim().toUpperCase();

        if (!challenge) {
            return throwError(() => new Error('Primero genera un captcha válido.'));
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
}