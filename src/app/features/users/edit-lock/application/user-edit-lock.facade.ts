import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, interval, Subscription } from 'rxjs';
import { UserEditLockClientIdService } from '../data-access/user-edit-lock-client-id.service';
import {
    UserEditLock,
    UserEditLockConflictError,
    UserEditLockStatus,
} from '../domain/user-edit-lock.model';
import { UserEditLockRepository } from '../domain/user-edit-lock.repository';

const HEARTBEAT_INTERVAL_MS = 30_000;

@Injectable()
export class UserEditLockFacade {
    private readonly repository = inject(UserEditLockRepository);
    private readonly clientId = inject(UserEditLockClientIdService).value;
    private readonly destroyRef = inject(DestroyRef);
    private heartbeatSubscription: Subscription | null = null;
    private operationVersion = 0;

    readonly status = signal<UserEditLockStatus>('idle');
    readonly current = signal<UserEditLock | null>(null);
    readonly message = signal('');
    readonly targetUserId = signal<number | null>(null);

    readonly owned = computed(() => this.status() === 'owned' && Boolean(this.current()?.tokenBloqueo));
    readonly busy = computed(() => this.status() === 'checking' || this.status() === 'acquiring');
    readonly blocked = computed(() => this.status() === 'blocked');
    readonly ownerName = computed(() => this.current()?.bloqueadoPorNombre?.trim() || 'otro administrador');

    constructor() {
        this.destroyRef.onDestroy(() => this.releaseCurrent());
    }

    async inspect(usuarioId: number): Promise<void> {
        if (!this.isValidUserId(usuarioId) || this.owned()) return;
        const operationVersion = ++this.operationVersion;
        this.targetUserId.set(usuarioId);
        this.status.set('checking');
        this.message.set('Consultando disponibilidad de edición...');

        try {
            const locks = await firstValueFrom(this.repository.list());
            if (operationVersion !== this.operationVersion) return;
            const active = locks.find((lock) => lock.usuarioId === usuarioId) ?? null;
            this.current.set(active);
            this.status.set(active ? 'blocked' : 'available');
            this.message.set(active
                ? `Este usuario está siendo editado por ${active.bloqueadoPorNombre?.trim() || 'otro administrador'}.`
                : 'El usuario está disponible para edición.');
        } catch (error: unknown) {
            if (operationVersion !== this.operationVersion) return;
            this.current.set(null);
            this.status.set('error');
            this.message.set(this.errorMessage(error, 'No fue posible consultar la disponibilidad de edición.'));
        }
    }

    async acquire(usuarioId: number): Promise<boolean> {
        if (!this.isValidUserId(usuarioId)) {
            this.status.set('error');
            this.message.set('No fue posible identificar al usuario que se desea editar.');
            return false;
        }
        if (this.owned() && this.targetUserId() === usuarioId) return true;

        this.stopHeartbeat();
        const operationVersion = ++this.operationVersion;
        this.targetUserId.set(usuarioId);
        this.status.set('acquiring');
        this.message.set('Solicitando exclusividad para editar...');

        try {
            const lock = await firstValueFrom(this.repository.acquire(usuarioId, { clienteId: this.clientId }));
            if (operationVersion !== this.operationVersion) {
                if (lock.tokenBloqueo) {
                    this.repository.release(usuarioId, { clienteId: this.clientId, tokenBloqueo: lock.tokenBloqueo })
                        .subscribe({ error: () => void 0 });
                }
                return false;
            }
            if (lock.estatus === false || this.isConflictCode(lock.codigo)) {
                this.current.set(lock);
                this.status.set('blocked');
                this.message.set(lock.mensaje || `Este usuario está siendo editado por ${lock.bloqueadoPorNombre || 'otro administrador'}.`);
                return false;
            }
            if (!lock.tokenBloqueo) {
                this.current.set(lock);
                this.status.set('error');
                this.message.set('El servicio autorizó la edición, pero no devolvió tokenBloqueo. No se habilitaron cambios para evitar una edición sin candado.');
                return false;
            }

            const ownedLock: UserEditLock = { ...lock, usuarioId, clienteId: lock.clienteId || this.clientId };
            this.current.set(ownedLock);
            this.status.set('owned');
            this.message.set('Edición exclusiva habilitada. El bloqueo se renovará automáticamente.');
            this.startHeartbeat();
            return true;
        } catch (error: unknown) {
            if (operationVersion !== this.operationVersion) return false;
            if (error instanceof UserEditLockConflictError) {
                this.current.set(error.lock);
                this.status.set('blocked');
                this.message.set(error.message);
                return false;
            }

            this.current.set(null);
            this.status.set('error');
            this.message.set(this.errorMessage(error, 'No fue posible adquirir el bloqueo de edición.'));
            return false;
        }
    }

    releaseCurrent(): void {
        const lock = this.current();
        const usuarioId = this.targetUserId();
        this.stopHeartbeat();

        if (this.status() === 'owned' && usuarioId && lock?.tokenBloqueo) {
            this.repository.release(usuarioId, {
                clienteId: this.clientId,
                tokenBloqueo: lock.tokenBloqueo,
            }).subscribe({ error: () => void 0 });
        }

        this.resetLocal();
    }

    resetLocal(): void {
        this.operationVersion += 1;
        this.stopHeartbeat();
        this.status.set('idle');
        this.current.set(null);
        this.message.set('');
        this.targetUserId.set(null);
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatSubscription = interval(HEARTBEAT_INTERVAL_MS).subscribe(() => {
            void this.renewCurrent();
        });
    }

    private async renewCurrent(): Promise<void> {
        const usuarioId = this.targetUserId();
        const lock = this.current();
        if (this.status() !== 'owned' || !usuarioId || !lock?.tokenBloqueo) return;

        try {
            const renewed = await firstValueFrom(this.repository.renew(usuarioId, {
                clienteId: this.clientId,
                tokenBloqueo: lock.tokenBloqueo,
            }));
            if (this.status() !== 'owned' || this.targetUserId() !== usuarioId || this.current()?.tokenBloqueo !== lock.tokenBloqueo) return;
            if (renewed.estatus === false || this.isConflictCode(renewed.codigo)) {
                this.loseLock(renewed.mensaje || 'El servicio rechazó la renovación del bloqueo.');
                return;
            }
            this.current.set({
                ...lock,
                ...renewed,
                usuarioId,
                clienteId: renewed.clienteId || lock.clienteId || this.clientId,
                tokenBloqueo: renewed.tokenBloqueo || lock.tokenBloqueo,
            });
        } catch (error: unknown) {
            if (this.status() !== 'owned' || this.targetUserId() !== usuarioId || this.current()?.tokenBloqueo !== lock.tokenBloqueo) return;
            this.loseLock(this.errorMessage(error, 'No fue posible renovar el bloqueo de edición.'));
        }
    }

    private loseLock(message: string): void {
        this.stopHeartbeat();
        this.status.set('lost');
        this.message.set(`${message} Los campos se bloquearon para evitar sobrescribir cambios de otra sesión.`);
        this.current.update((lock) => lock ? { ...lock, tokenBloqueo: null } : null);
    }

    private stopHeartbeat(): void {
        this.heartbeatSubscription?.unsubscribe();
        this.heartbeatSubscription = null;
    }

    private isConflictCode(code: string | null): boolean {
        const normalized = code?.trim().toUpperCase() ?? '';
        return normalized.includes('EN_EDICION') || normalized.includes('BLOQUEADO') || normalized.includes('LOCKED');
    }

    private errorMessage(error: unknown, fallback: string): string {
        return error instanceof Error && error.message.trim() ? error.message : fallback;
    }

    private isValidUserId(value: number): boolean {
        return Number.isFinite(value) && value > 0;
    }
}
