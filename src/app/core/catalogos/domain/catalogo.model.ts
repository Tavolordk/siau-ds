export type CatalogoPrimitive = string | number | boolean | null;

export type CatalogoRecord = Record<string, CatalogoPrimitive>;

export interface CatalogoResponse<T extends CatalogoRecord = CatalogoRecord> {
    readonly mensaje: string;
    readonly datos: readonly T[];
}

export interface CatalogoOption {
    readonly value: string;
    readonly label: string;
}

export type EstadoMunicipioNivel = 'estado' | 'municipio';

export interface EstadoMunicipioQuery {
    readonly nivel?: EstadoMunicipioNivel;
    readonly estadoId?: number;
    readonly soloActivos?: 0 | 1;
}

export interface EstructuraOrganizacionalQuery {
    readonly tipoEstructuraId?: number;
    readonly tipoInstitucionId?: number;
    readonly padreId?: number;
    readonly estadoId?: number;
    readonly soloActivos?: 0 | 1;
}