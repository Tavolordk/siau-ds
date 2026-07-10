import { Injectable, signal } from '@angular/core';
import { AuthSession, PendingAuthChallenge } from '../domain/auth-session.model';

const SESSION_KEY = 'siau.auth.session';
const CHALLENGE_KEY = 'siau.auth.challenge';
const REFRESH_LOCK_KEY = 'siau.auth.refresh-lock';

@Injectable({ providedIn: 'root' })
export class AuthStorage {
    private readonly sessionState = signal<AuthSession | null>(this.readSessionFromStorage());
    private readonly challengeState = signal<PendingAuthChallenge | null>(this.readChallengeFromStorage());

    readonly session = this.sessionState.asReadonly();
    readonly challenge = this.challengeState.asReadonly();

    constructor() {
        // Sincronizar la sesión entre pestañas: los refresh tokens rotan, así que cuando
        // otra pestaña renueva o cierra la sesión, esta pestaña debe adoptar ese estado
        // en lugar de seguir usando tokens ya consumidos (causa de 401 y del modal).
        // El evento 'storage' solo se dispara en las pestañas que NO hicieron el cambio.
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (event: StorageEvent) => {
                if (event.key === SESSION_KEY || event.key === null) {
                    this.sessionState.set(this.readSessionFromStorage());
                }

                if (event.key === CHALLENGE_KEY || event.key === null) {
                    this.challengeState.set(this.readChallengeFromStorage());
                }
            });
        }
    }

    /**
     * Candado simple entre pestañas para que solo una renueve el token a la vez.
     * Devuelve true si esta pestaña obtuvo el candado.
     */
    tryAcquireRefreshLock(ttlMs: number): boolean {
        try {
            const raw = localStorage.getItem(REFRESH_LOCK_KEY);
            const lockedAt = raw ? Number(raw) : Number.NaN;

            if (Number.isFinite(lockedAt) && Date.now() - lockedAt < ttlMs) {
                return false;
            }

            localStorage.setItem(REFRESH_LOCK_KEY, String(Date.now()));
            return true;
        } catch {
            return true;
        }
    }

    releaseRefreshLock(): void {
        try {
            localStorage.removeItem(REFRESH_LOCK_KEY);
        } catch {
            // noop
        }
    }

    saveChallenge(challenge: PendingAuthChallenge): void {
        localStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
        this.challengeState.set(challenge);
    }

    clearChallenge(): void {
        localStorage.removeItem(CHALLENGE_KEY);
        this.challengeState.set(null);
    }

    saveSession(session: AuthSession): void {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        this.sessionState.set(session);
        this.clearChallenge();
    }

    updateSession(session: AuthSession): void {
        this.saveSession(session);
    }

    clearSession(): void {
        localStorage.removeItem(SESSION_KEY);
        this.sessionState.set(null);
    }

    clearAll(): void {
        this.clearSession();
        this.clearChallenge();
    }

    private readSessionFromStorage(): AuthSession | null {
        return this.readJson<AuthSession>(SESSION_KEY);
    }

    private readChallengeFromStorage(): PendingAuthChallenge | null {
        return this.readJson<PendingAuthChallenge>(CHALLENGE_KEY);
    }

    private readJson<T>(key: string): T | null {
        try {
            const value = localStorage.getItem(key);
            return value ? (JSON.parse(value) as T) : null;
        } catch {
            localStorage.removeItem(key);
            return null;
        }
    }
}