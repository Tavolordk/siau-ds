import { Injectable, signal } from '@angular/core';
import { AuthSession, PendingAuthChallenge } from '../domain/auth-session.model';

const SESSION_KEY = 'siau.auth.session';
const CHALLENGE_KEY = 'siau.auth.challenge';

@Injectable({ providedIn: 'root' })
export class AuthStorage {
    private readonly sessionState = signal<AuthSession | null>(this.readSessionFromStorage());
    private readonly challengeState = signal<PendingAuthChallenge | null>(this.readChallengeFromStorage());

    readonly session = this.sessionState.asReadonly();
    readonly challenge = this.challengeState.asReadonly();

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