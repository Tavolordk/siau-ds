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

export interface RegistroDatosPersonales {
    readonly cuip: string | null;
    readonly curp: string;
    readonly rfc: string;
    readonly nombres: string;
    readonly primerApellido: string;
    readonly segundoApellido: string | null;
    readonly sexoId: number;
    readonly fechaNacimiento: string;
    readonly estadoCivilId: number;
}

export interface RegistroAsignacion {
    readonly estructuraId: number;
    readonly cargo: string | null;
    readonly funciones: string | null;
    readonly numeroEmpleado: string | null;
    readonly fechaInicio: string | null;
}

export interface RegistroMedioContacto {
    readonly correo: string;
    readonly celular: string;
}

export interface RegistroCuenta {
    readonly password?: string | null;
    readonly passwordHash?: string | null;
    readonly tipoUsuarioId: number;
    readonly sistemaId: number;
    readonly perfilId: number;
}

export interface RegistroAuditoria {
    readonly usuarioEjecutorId: number | null;
    readonly correlationId: string;
}

export interface RegistroAdminRequest {
    readonly datosPersonales: RegistroDatosPersonales;
    readonly adscripcion: RegistroAsignacion;
    readonly comision: RegistroAsignacion | null;
    readonly medioContacto: RegistroMedioContacto;
    readonly cuenta: RegistroCuenta;
    readonly comentario?: string | null;
    readonly auditoria: RegistroAuditoria;
}

export interface RegistroAdminData {
    readonly usuarioId: number | null;
    readonly personaId: number | null;
    readonly cuenta: string | null;
    readonly cuentaGenerada: string | null;
    readonly nombreCompleto: string | null;
    readonly tipoUsuario: string | null;
    readonly tipoInstitucion: string | null;
    readonly sistema: string | null;
}

export interface RegistroAdminResponse {
    readonly mensaje: string | null;
    readonly datos: RegistroAdminData | null;
}
export interface SolicitudAuditoria {
    readonly usuarioEjecutorId: number | null;
    readonly correlationId: string;
}

export interface SolicitudOperacionRequest {
    readonly usuarioId: number;
    readonly comentario: string;
    readonly auditoria?: SolicitudAuditoria;
}

export interface SolicitudOperacionData {
    readonly operacion: string | null;
    readonly usuarioId: number | null;
    readonly filasAfectadas: number;
    readonly totalRegistros: number;
}

export interface SolicitudOperacionResponse {
    readonly mensaje: string | null;
    readonly datos: SolicitudOperacionData | null;
}