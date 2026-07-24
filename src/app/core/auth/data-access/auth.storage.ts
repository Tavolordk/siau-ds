import { Injectable, signal } from '@angular/core';
import { SESSION_INACTIVITY_LIMIT_MS } from '../domain/auth.constants';
import { AuthSession, PendingAuthChallenge } from '../domain/auth-session.model';

const SESSION_KEY = 'siau.auth.session';
const CHALLENGE_KEY = 'siau.auth.challenge';
const REFRESH_LOCK_KEY = 'siau.auth.refresh-lock';
const ACTIVE_TAB_KEY = 'siau.auth.active-tab';
const LAST_ACTIVITY_KEY = 'siau.auth.last-activity-at';

interface ActiveTabRecord {
    tabId: string;
    claimedAt: number;
    nonce: string;
}

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
    private readonly externalSessionClosureState = signal(0);
    private readonly externalTabTakeoverState = signal(0);

    readonly session = this.sessionState.asReadonly();
    readonly challenge = this.challengeState.asReadonly();
    readonly externalSessionClosure = this.externalSessionClosureState.asReadonly();
    readonly externalTabTakeover = this.externalTabTakeoverState.asReadonly();

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (event: StorageEvent) => {
                if (event.key === ACTIVE_TAB_KEY || event.key === null) {
                    this.handleActiveTabChange();
                }

                if (event.key === SESSION_KEY || event.key === null) {
                    const previousSession = this.sessionState();
                    const nextSession = this.readSessionFromStorage();

                    if (!nextSession) {
                        this.sessionState.set(null);

                        if (previousSession) {
                            this.externalSessionClosureState.update((version) => version + 1);
                        }
                    } else if (this.isCurrentTabOwner()) {
                        // Solo la pestaña propietaria puede adoptar tokens renovados.
                        // Una pestaña expulsada nunca debe recuperar la sesión por un
                        // cambio posterior de localStorage.
                        this.sessionState.set(nextSession);
                    }
                }

                if (event.key === CHALLENGE_KEY || event.key === null) {
                    if (this.isCurrentTabOwner() || !this.readSessionFromStorage()) {
                        this.challengeState.set(this.readChallengeFromStorage());
                    }
                }
            });

            // Si la nueva pestaña encuentra una sesión existente, toma su propiedad.
            // El cambio en ACTIVE_TAB_KEY expulsa inmediatamente a la pestaña anterior.
            if (this.sessionState()) {
                this.claimTabOwnership();
            }
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
        if (!this.isCurrentTabOwner()) {
            this.sessionState.set(null);
            return null;
        }

        const latestSession = this.readSessionFromStorage();
        this.sessionState.set(latestSession);
        return latestSession;
    }

    /**
     * La actividad se persiste para que cerrar y volver a abrir SIAU no reinicie
     * el tiempo de inactividad. Solo la pestaña propietaria puede actualizarla.
     */
    saveLastActivityAt(timestamp = Date.now()): void {
        if (!this.isCurrentTabOwner()) {
            return;
        }

        localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
    }

    readLastActivityAt(): number | null {
        try {
            const rawValue = localStorage.getItem(LAST_ACTIVITY_KEY);
            const parsedValue = Number(rawValue);

            if (!rawValue || !Number.isFinite(parsedValue) || parsedValue <= 0) {
                if (rawValue) {
                    localStorage.removeItem(LAST_ACTIVITY_KEY);
                }

                return null;
            }

            // Un reloj local adelantado no debe prolongar artificialmente la sesión.
            return Math.min(Math.trunc(parsedValue), Date.now());
        } catch {
            return null;
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
        this.claimTabOwnership();
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        this.sessionState.set(session);
        this.saveLastActivityAt();
        this.clearChallenge();
    }

    updateSession(session: AuthSession): void {
        if (!this.isCurrentTabOwner()) {
            this.sessionState.set(null);
            return;
        }

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        this.sessionState.set(session);
    }

    clearSession(): void {
        if (this.isCurrentTabOwner()) {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(LAST_ACTIVITY_KEY);
            this.releaseTabOwnership();
        }

        this.sessionState.set(null);
    }

    clearAll(): void {
        this.clearSession();
        this.clearChallenge();
    }

    clearLocalAuthState(): void {
        this.sessionState.set(null);
        this.challengeState.set(null);
    }

    private handleActiveTabChange(): void {
        const activeTab = this.readActiveTab();

        if (!activeTab || activeTab.tabId === this.tabId || !this.sessionState()) {
            return;
        }

        this.clearLocalAuthState();
        this.externalTabTakeoverState.update((version) => version + 1);
    }

    private claimTabOwnership(): void {
        const record: ActiveTabRecord = {
            tabId: this.tabId,
            claimedAt: Date.now(),
            nonce: this.createUniqueId('owner'),
        };

        localStorage.setItem(ACTIVE_TAB_KEY, JSON.stringify(record));
    }

    private releaseTabOwnership(): void {
        const activeTab = this.readActiveTab();

        if (activeTab?.tabId === this.tabId) {
            localStorage.removeItem(ACTIVE_TAB_KEY);
        }
    }

    private isCurrentTabOwner(): boolean {
        return this.readActiveTab()?.tabId === this.tabId;
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

    private readActiveTab(): ActiveTabRecord | null {
        return this.readJson<ActiveTabRecord>(ACTIVE_TAB_KEY);
    }

    private readSessionFromStorage(): AuthSession | null {
        const session = this.readJson<AuthSession>(SESSION_KEY);

        if (!session || !this.hasStoredSessionReachedInactivityLimit()) {
            return session;
        }

        // Al abrir SIAU después del límite no se debe renderizar ni intentar
        // refrescar una sesión que ya venció por inactividad.
        this.clearExpiredSessionFromStorage();
        return null;
    }

    private hasStoredSessionReachedInactivityLimit(): boolean {
        const lastActivityAt = this.readLastActivityAt();

        return lastActivityAt !== null && Date.now() - lastActivityAt >= SESSION_INACTIVITY_LIMIT_MS;
    }

    private clearExpiredSessionFromStorage(): void {
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(LAST_ACTIVITY_KEY);
            localStorage.removeItem(ACTIVE_TAB_KEY);
        } catch {
            // Si el navegador bloquea localStorage, la signal local seguirá
            // devolviendo una sesión nula y la guarda enviará al login.
        }
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