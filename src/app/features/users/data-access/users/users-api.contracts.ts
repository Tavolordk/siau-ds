export interface ApiErrorDto {
    readonly code?: string | null;
    readonly message?: string | null;
    readonly detail?: string | null;
}

export interface ApiResponseDto<T> {
    readonly success: boolean;
    readonly data: T | null;
    readonly errors?: readonly ApiErrorDto[] | null;
    readonly traceId?: string | null;
}

export interface AdvancedUserListItemDto {
    readonly usuarioId?: number | null;
    readonly primerApellido?: string | null;
    readonly segundoApellido?: string | null;
    readonly nombres?: string | null;
    readonly curp?: string | null;
    readonly rfc?: string | null;
    readonly correoElectronico?: string | null;
    readonly numeroTelefonico?: string | null;
    readonly tipoInstitucionId?: number | null;
    readonly tipoInstitucion?: string | null;
    readonly entidadId?: number | null;
    readonly entidad?: string | null;
    readonly municipioAlcaldiaId?: number | null;
    readonly municipioAlcaldia?: string | null;
    readonly institucionId?: number | null;
    readonly institucion?: string | null;
    readonly organoAdministrativoDesconcentradoId?: number | null;
    readonly organoAdministrativoDesconcentrado?: string | null;
    readonly unidadAdministrativaId?: number | null;
    readonly unidadAdministrativa?: string | null;
    readonly comision?: string | null;
    readonly comisionInstitucion?: string | null;
    readonly comisionOrganoAdministrativoDesconcentrado?: string | null;
    readonly comisionUnidadAdministrativa?: string | null;
    readonly nombreUsuario?: string | null;
    readonly estatusId?: number | null;
    readonly estatus?: string | null;
    readonly fechaUltimoMovimiento?: string | null;
    readonly fechaAlta?: string | null;
    readonly fechaActualizacion?: string | null;
}

export interface AdvancedUsersResponseDto {
    readonly mensaje?: string | null;
    readonly totalRegistros?: number | null;
    readonly totalPaginas?: number | null;
    readonly paginaActual?: number | null;
    readonly porPagina?: number | null;
    readonly datos?: readonly AdvancedUserListItemDto[] | null;
}

export interface UserDetailResponseDto {
    readonly datos?: Record<string, unknown> | null;
}

export type UnknownRecord = Record<string, unknown>;
