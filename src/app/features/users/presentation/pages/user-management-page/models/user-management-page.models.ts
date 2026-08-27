import { CatalogoOption } from '../../../../../../core/catalogos';
import { UserPagination } from '../../../../domain/models/user-record.model';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'dark' | 'light';
export type UserWizardMode = 'create' | 'edit';
export type AccountOperationKind = 'baja' | 'suspension' | 'reactivacion' | 'desbloqueo';
export type UserFilterKey =
    | 'primerApellido'
    | 'segundoApellido'
    | 'nombres'
    | 'curp'
    | 'rfc'
    | 'correo'
    | 'numeroTelefonico'
    | 'tipoInstitucionId'
    | 'entidadId'
    | 'municipioId'
    | 'institucionId'
    | 'organoAdministrativoDesconcentradoId'
    | 'unidadAdministrativaId'
    | 'comisionTipoInstitucionId'
    | 'comisionEntidadId'
    | 'comisionMunicipioId'
    | 'comisionInstitucionId'
    | 'comisionOrganoAdministrativoDesconcentradoId'
    | 'comisionUnidadAdministrativaId'
    | 'nombreUsuario'
    | 'estadoCuentaId'
    | 'fechaInicio'
    | 'fechaFin';
export type UserFilterGroupKey = 'general' | 'adscription' | 'commission' | 'account';
export type UserFilterTabKey = 'all' | UserFilterGroupKey;
export type UserFilterKind = 'text' | 'catalog' | 'date';

export interface UserFilterValues {
    readonly primerApellido: string;
    readonly segundoApellido: string;
    readonly nombres: string;
    readonly curp: string;
    readonly rfc: string;
    readonly correo: string;
    readonly numeroTelefonico: string;
    readonly tipoInstitucionId: string;
    readonly entidadId: string;
    readonly municipioId: string;
    readonly institucionId: string;
    readonly organoAdministrativoDesconcentradoId: string;
    readonly unidadAdministrativaId: string;
    readonly comisionTipoInstitucionId: string;
    readonly comisionEntidadId: string;
    readonly comisionMunicipioId: string;
    readonly comisionInstitucionId: string;
    readonly comisionOrganoAdministrativoDesconcentradoId: string;
    readonly comisionUnidadAdministrativaId: string;
    readonly nombreUsuario: string;
    readonly estadoCuentaId: string;
    readonly fechaInicio: string;
    readonly fechaFin: string;
}

export interface UserFilterDefinition {
    readonly key: UserFilterKey;
    readonly label: string;
    readonly placeholder: string;
    readonly group: UserFilterGroupKey;
    readonly kind: UserFilterKind;
    readonly options: readonly CatalogoOption[];
    readonly maxLength?: number;
    readonly inputMode?: 'text' | 'email' | 'numeric';
}

export interface UserFilterTab {
    readonly id: UserFilterTabKey;
    readonly label: string;
}

export interface UserFilterChip {
    readonly key: UserFilterKey;
    readonly label: string;
    readonly value: string;
}

export interface AccountOperationSuccessState {
    readonly operation: AccountOperationKind;
    readonly title: string;
    readonly heading: string;
    readonly message: string;
    readonly icon: string;
    readonly badge: string;
    readonly newStatus: string;
    readonly fullName: string;
    readonly username: string;
    readonly email: string;
    readonly userId: number;
}

/** Elemento del paginador: un número de página o un separador "…". */
export interface PaginationItem {
    readonly key: string;
    readonly page: number;
    readonly isGap: boolean;
}

/** Páginas visibles a cada lado de la actual antes de cortar con "…". */
export const PAGINATION_SIBLINGS = 1;

export const DEFAULT_PAGINATION: UserPagination = {
    totalRegistros: 0,
    totalPaginas: 1,
    paginaActual: 1,
    porPagina: 15,
};

export const EMPTY_USER_FILTERS: UserFilterValues = {
    primerApellido: '',
    segundoApellido: '',
    nombres: '',
    curp: '',
    rfc: '',
    correo: '',
    numeroTelefonico: '',
    tipoInstitucionId: '',
    entidadId: '',
    municipioId: '',
    institucionId: '',
    organoAdministrativoDesconcentradoId: '',
    unidadAdministrativaId: '',
    comisionTipoInstitucionId: '',
    comisionEntidadId: '',
    comisionMunicipioId: '',
    comisionInstitucionId: '',
    comisionOrganoAdministrativoDesconcentradoId: '',
    comisionUnidadAdministrativaId: '',
    nombreUsuario: '',
    estadoCuentaId: '',
    fechaInicio: '',
    fechaFin: '',
};

export const NAME_FILTER_KEYS: readonly UserFilterKey[] = [
    'primerApellido',
    'segundoApellido',
    'nombres',
];
export const DATE_FILTER_KEYS: readonly UserFilterKey[] = ['fechaInicio', 'fechaFin'];
export const TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO = 2;
export const TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA = 4;

