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
    // Contrato POST /api/v1/registro/usuarios/busqueda-avanzada.
    readonly primerApellido?: string;
    readonly segundoApellido?: string;
    readonly nombres?: string;
    readonly curp?: string;
    readonly rfc?: string;
    readonly correo?: string;
    readonly telefono?: string;
    readonly tipoInstitucionId?: number;
    readonly entidadId?: number;
    readonly institucionId?: number;
    readonly organoId?: number;
    readonly unidadId?: number;
    readonly nombreUsuario?: string;
    readonly estadoCuentaId?: number;
    /** Fechas en formato ISO yyyy-MM-dd, como las publica el contrato Swagger. */
    readonly fechaInicio?: string;
    readonly fechaFin?: string;
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


export interface BorradorDatosPersonales {
    readonly cuip: string | null;
    readonly curp: string | null;
    readonly rfc: string | null;
    readonly nombres: string | null;
    readonly primerApellido: string | null;
    readonly segundoApellido: string | null;
    readonly sexoId: number | null;
    readonly fechaNacimiento: string | null;
    readonly estadoCivilId: number | null;
}

export interface BorradorAdscripcion {
    readonly estructuraId: number | null;
    readonly cargo: string | null;
    readonly funciones: string | null;
    readonly numeroEmpleado: string | null;
    readonly fechaInicio: string | null;
}

export interface BorradorMedioContacto {
    readonly correo: string | null;
    readonly celular: string | null;
}

export interface BorradorCuenta {
    readonly tipoUsuarioId: number | null;
    readonly sistemaId: number | null;
    readonly perfilId: number | null;
}

export interface BorradorDatos {
    readonly datosPersonales: BorradorDatosPersonales;
    readonly adscripcion: BorradorAdscripcion;
    readonly comision: BorradorAdscripcion | null;
    readonly medioContacto: BorradorMedioContacto;
    readonly cuenta: BorradorCuenta;
    readonly comentario: string | null;
}

export interface BorradorAuditoria {
    readonly usuarioEjecutorId: number;
    readonly correlationId: string;
}

/**
 * Contrato de POST /api/v1/registro/borradores.
 * `datos` se envía como objeto JSON con la misma estructura funcional
 * que utiliza el SP de borradores; no se serializa como string.
 */
export interface BorradorGuardarRequest {
    readonly borradorId: number | null;
    readonly datos: BorradorDatos;
    readonly auditoria: BorradorAuditoria;
}

/**
 * Jerarquía ya resuelta por el backend en el GET de borradores. Evita que el
 * front tenga que reconstruir institución -> OAD -> UA a partir de un solo
 * `estructuraId`.
 */
export interface BorradorEstructuraCatalogo {
    readonly estructuraId: number | null;
    readonly tipoInstitucionId: number | null;
    readonly tipoInstitucion: string | null;
    readonly estadoId: number | null;
    readonly estado: string | null;
    readonly municipioId: number | null;
    readonly municipio: string | null;
    readonly institucionId: number | null;
    readonly institucion: string | null;
    readonly organoId: number | null;
    readonly organo: string | null;
    readonly unidadId: number | null;
    readonly unidad: string | null;
}

export interface BorradorCatalogos {
    readonly sexo: string | null;
    readonly estadoCivil: string | null;
    readonly adscripcion: string | null;
    readonly comision: string | null;
    readonly tipoUsuario: string | null;
    readonly sistema: string | null;
    readonly perfil: string | null;
    readonly adscripcionEstructura: BorradorEstructuraCatalogo | null;
    readonly comisionEstructura: BorradorEstructuraCatalogo | null;
}

export interface BorradorItem {
    readonly borradorId: number | null;
    readonly usuarioCreadorId: number | null;
    readonly pasoActual: string | null;
    readonly datos: BorradorDatos | null;
    readonly catalogos: BorradorCatalogos | null;
    readonly estatus: string | null;
    readonly fechaCreacion: string | null;
    readonly fechaActualizacion: string | null;
}

export interface BorradorOperacionResponse {
    readonly mensaje: string | null;
    readonly datos: BorradorItem | null;
}

export interface PasswordTemporalData {
    readonly cuenta: string | null;
    readonly passwordTemporal: string | null;
    readonly fechaExpiracion: string | null;
}

export interface PasswordTemporalResponse {
    readonly mensaje: string | null;
    readonly datos: PasswordTemporalData | null;
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

export interface RegistroAdminCuenta {
    readonly tipoUsuarioId: number;
    readonly sistemaId: number;
    readonly perfilId: number;
    readonly estadoCuentaId?: number;
}

export interface RegistroEspecialCuenta {
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
    readonly cuenta: RegistroAdminCuenta;
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
    readonly cuenta: RegistroEspecialCuenta;
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