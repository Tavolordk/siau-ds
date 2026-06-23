export type UserRole = string;
export type UserStatus = string;
export type RegistryStatus = string;
export type TrustStatus = string;

export interface UserRecord {
    readonly userId: number;
    readonly username: string;
    readonly fullName: string;
    readonly email: string;
    readonly role: UserRole;
    readonly roleKey: string;
    readonly status: UserStatus;
    readonly statusKey: string;
    readonly rnpsp: RegistryStatus;
    readonly trust: TrustStatus;
    readonly createdAt: string | null;
    readonly updatedAt: string | null;
}

export interface UserPagination {
    readonly totalRegistros: number;
    readonly totalPaginas: number;
    readonly paginaActual: number;
    readonly porPagina: number;
}

export interface UsersQuery {
    readonly busqueda?: string;
    readonly tipoUsuarioId?: number;
    readonly estadoCuentaId?: number;
    readonly sistemaId?: number;
    readonly pagina?: number;
    readonly porPagina?: number;
}

export interface UsersPageResult {
    readonly usuarios: readonly UserRecord[];
    readonly paginacion: UserPagination;
}

export interface UserDetailRecord {
    readonly userId: number;
    readonly datos: Record<string, unknown>;
}