export type UserRole = string;
export type UserStatus = string;
export type RegistryStatus = string;
export type TrustStatus = string;

export interface UserRecord {
    readonly userId: number;
    readonly username: string;
    readonly fullName: string;
    readonly email: string;
    readonly institution: string;
    readonly entity: string;
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
    /** Búsqueda rápida conservada por compatibilidad con el endpoint actual. */
    readonly busqueda?: string;

    // MVC10 - Información general del usuario.
    readonly primerApellido?: string;
    readonly segundoApellido?: string;
    readonly nombres?: string;
    readonly curp?: string;
    readonly rfc?: string;
    readonly correo?: string;
    readonly numeroTelefonico?: string;

    // MVC10 / RN20 - Información de adscripción.
    readonly tipoInstitucionId?: number;
    readonly entidadId?: number;
    readonly municipioId?: number;
    readonly institucionId?: number;
    readonly organoAdministrativoDesconcentradoId?: number;
    readonly unidadAdministrativaId?: number;

    // MVC10 - Información de la cuenta.
    readonly nombreUsuario?: string;
    readonly estadoCuentaId?: number;
    /** Fechas enviadas al servicio en formato dd/MM/yyyy. */
    readonly fechaInicio?: string;
    readonly fechaFin?: string;

    // Parámetros heredados que el endpoint vigente todavía puede admitir.
    readonly tipoUsuarioId?: number;
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
    readonly rfc: string | null;
    readonly nombres: string;
    readonly primerApellido: string;
    readonly segundoApellido: string | null;
    readonly sexoId: number;
    readonly fechaNacimiento: string;
    readonly estadoCivilId: number | null;
}

export interface RegistroAsignacion {
    readonly estructuraId: number;
    readonly cargo: string | null;
    readonly funciones: string | null;
    readonly numeroEmpleado: string | null;
    readonly fechaInicio: string | null;
}

export interface RegistroMedioContacto {
    readonly correo: string | null;
    readonly celular: string | null;
}

export interface RegistroCuenta {
    readonly password?: string | null;
    readonly passwordHash?: string | null;
    readonly tipoUsuarioId: number;
    readonly sistemaId: number;
    readonly perfilId: number;
    readonly estadoCuentaId?: number;
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

export interface RegistroEspecialDatosPersonales {
    readonly nombres: string;
    readonly primerApellido: string;
    readonly sexoId: number;
    readonly cuip?: string | null;
    readonly curp?: string | null;
    readonly rfc?: string | null;
    readonly segundoApellido?: string | null;
    readonly fechaNacimiento?: string | null;
    readonly estadoCivilId?: number | null;
}

export interface RegistroEspecialAsignacion {
    readonly estructuraId: number;
}

export interface RegistroEspecialRequest {
    readonly datosPersonales: RegistroEspecialDatosPersonales;
    readonly adscripcion: RegistroEspecialAsignacion;
    readonly comision: RegistroEspecialAsignacion | null;
    readonly medioContacto: RegistroMedioContacto;
    readonly cuenta: RegistroCuenta;
    readonly comentario?: string | null;
    readonly auditoria: RegistroAuditoria;
}

export interface RegistroEspecialData {
    readonly usuarioId: number | null;
    readonly personaId: number | null;
    readonly cuenta: string | null;
    readonly cuentaGenerada: string | null;
    readonly nombreCompleto: string | null;
    readonly correo: string | null;
    readonly tipoUsuario: string | null;
    readonly tipoInstitucion: string | null;
    readonly sistema: string | null;
    readonly curpProvisional: string | null;
    readonly rfcProvisional: string | null;
    readonly perfilIncompleto: boolean;
}

export interface RegistroEspecialResponse {
    readonly mensaje: string | null;
    readonly datos: RegistroEspecialData | null;
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

export interface ActualizarAdminPerfil {
    readonly idSistema: number;
    readonly idPerfil: number;
}

export interface ActualizarAdminRequest {
    readonly usuarioId: number;
    readonly curp: string;
    readonly rfc: string | null;
    readonly nombres: string;
    readonly primerApellido: string;
    readonly segundoApellido: string | null;
    readonly sexoId: number;
    readonly fechaNacimiento: string;
    readonly estadoCivilId: number | null;
    readonly cuip: string | null;
    readonly adscripcion: RegistroAsignacion;
    readonly comision: RegistroAsignacion | null;
    readonly contacto: RegistroMedioContacto;
    readonly perfiles: readonly ActualizarAdminPerfil[];
    readonly nuevaCuenta: null;
    readonly auditoria: RegistroAuditoria;
}

export type ActualizarAdminResponse = RegistroAdminResponse;
