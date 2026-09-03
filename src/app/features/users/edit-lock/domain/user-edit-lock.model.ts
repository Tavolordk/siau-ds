export interface UserEditLock {
    readonly usuarioId: number;
    readonly bloqueadoPorUsuarioId: number | null;
    readonly bloqueadoPorNombre: string | null;
    readonly fechaBloqueoUtc: string | null;
    readonly ultimaActividadUtc: string | null;
    readonly expiraEnUtc: string | null;
    readonly clienteId: string | null;
    readonly tokenBloqueo: string | null;
    readonly codigo: string | null;
    readonly mensaje: string | null;
    readonly estatus: boolean | null;
}

export interface AcquireUserEditLockCommand {
    readonly clienteId: string;
}

export interface RenewUserEditLockCommand {
    readonly clienteId: string;
    readonly tokenBloqueo: string;
}

export interface ReleaseUserEditLockCommand {
    readonly clienteId: string;
    readonly tokenBloqueo: string;
}

export type UserEditLockStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'acquiring'
    | 'owned'
    | 'blocked'
    | 'lost'
    | 'error';

export class UserEditLockConflictError extends Error {
    constructor(readonly lock: UserEditLock, message?: string) {
        super(message || lock.mensaje || 'El usuario ya está siendo editado por otra sesión.');
        this.name = 'UserEditLockConflictError';
    }
}
