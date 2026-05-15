export type UserRole = 'Administrador' | 'Enlace Institucional' | 'Usuario' | 'Supervisor Estatal';
export type UserStatus = 'Activo' | 'Inhabilitado' | 'Suspendido';
export type RegistryStatus = 'Registrado' | 'No registrado';
export type TrustStatus = 'Vigente' | 'Expirado';

export interface UserRecord {
    readonly username: string;
    readonly fullName: string;
    readonly email: string;
    readonly role: UserRole;
    readonly status: UserStatus;
    readonly rnpsp: RegistryStatus;
    readonly trust: TrustStatus;
}