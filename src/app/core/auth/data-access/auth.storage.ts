import { Injectable, signal } from '@angular/core';
import { AuthSession, PendingAuthChallenge } from '../domain/auth-session.model';

const SESSION_KEY = 'siau.auth.session';
const CHALLENGE_KEY = 'siau.auth.challenge';
const REFRESH_LOCK_KEY = 'siau.auth.refresh-lock';

interface RefreshLockRecord {
    owner: string;
    nonce: string;
    expiresAt: number;
}

interface BrowserLockManager {
    request<T>(
        name: string,
        options: { mode: 'exclusive' },
        callback: () => T | PromiseLike<T>,
    ): Promise<T>;
}

interface NavigatorWithLocks {
    locks?: BrowserLockManager;
}

@Injectable({ providedIn: 'root' })
export class AuthStorage {
    private readonly tabId = this.createUniqueId('tab');
    private currentRefreshLockNonce: string | null = null;

    private readonly sessionState = signal<AuthSession | null>(this.readSessionFromStorage());
    private readonly challengeState = signal<PendingAuthChallenge | null>(this.readChallengeFromStorage());

    readonly session = this.sessionState.asReadonly();
    readonly challenge = this.challengeState.asReadonly();

    constructor() {
        // Cada pestaña adopta inmediatamente la sesión más nueva. Esto es indispensable
        // porque el backend rota el refresh token después de cada renovación.
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
     * Ejecuta una renovación de manera exclusiva entre todas las pestañas.
     * Chrome/Edge usan Web Locks, que sí es atómico. El registro de localStorage
     * queda como respaldo para navegadores que todavía no soporten Web Locks.
     */
    runWithRefreshLock<T>(ttlMs: number, operation: () => Promise<T>): Promise<T> {
        const lockManager =
            typeof navigator !== 'undefined'
                ? (navigator as unknown as NavigatorWithLocks).locks
                : undefined;

        if (lockManager) {
            return lockManager.request(
                REFRESH_LOCK_KEY,
                { mode: 'exclusive' },
                operation,
            );
        }

        return this.runWithLocalStorageLock(ttlMs, operation);
    }

    /**
     * Lee directamente localStorage y actualiza la signal de esta pestaña.
     * Debe llamarse después de obtener el candado y antes de enviar el refresh,
     * para no reutilizar un token que otra pestaña ya cambió.
     */
    readLatestSession(): AuthSession | null {
        const latestSession = this.readSessionFromStorage();
        this.sessionState.set(latestSession);
        return latestSession;
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

    private async runWithLocalStorageLock<T>(ttlMs: number, operation: () => Promise<T>): Promise<T> {
        const deadline = Date.now() + ttlMs * 3;

        while (Date.now() < deadline) {
            if (this.tryAcquireLocalStorageLock(ttlMs)) {
                try {
                    return await operation();
                } finally {
                    this.releaseLocalStorageLock();
                }
            }

            await this.delay(100 + Math.floor(Math.random() * 100));
        }

        throw new Error('No fue posible coordinar la renovación de sesión entre las pestañas abiertas.');
    }

    private tryAcquireLocalStorageLock(ttlMs: number): boolean {
        try {
            const now = Date.now();
            const existingLock = this.readRefreshLock();

            if (existingLock && existingLock.expiresAt > now && existingLock.owner !== this.tabId) {
                return false;
            }

            const nonce = this.createUniqueId('lock');
            const candidate: RefreshLockRecord = {
                owner: this.tabId,
                nonce,
                expiresAt: now + ttlMs,
            };

            localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify(candidate));

            const confirmedLock = this.readRefreshLock();
            const acquired = confirmedLock?.owner === this.tabId && confirmedLock.nonce === nonce;

            if (acquired) {
                this.currentRefreshLockNonce = nonce;
            }

            return acquired;
        } catch {
            // Si localStorage no está disponible, esta pestaña continúa. El candado
            // principal Web Locks ya cubre los navegadores usados por el sistema.
            return true;
        }
    }

    private releaseLocalStorageLock(): void {
        try {
            const currentLock = this.readRefreshLock();

            if (
                currentLock?.owner === this.tabId &&
                currentLock.nonce === this.currentRefreshLockNonce
            ) {
                localStorage.removeItem(REFRESH_LOCK_KEY);
            }
        } finally {
            this.currentRefreshLockNonce = null;
        }
    }

    private readRefreshLock(): RefreshLockRecord | null {
        return this.readJson<RefreshLockRecord>(REFRESH_LOCK_KEY);
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

    private createUniqueId(prefix: string): string {
        if (globalThis.crypto?.randomUUID) {
            return `${prefix}-${globalThis.crypto.randomUUID()}`;
        }

        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    private delay(milliseconds: number): Promise<void> {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }
}