import { CatalogoOption, CatalogoRecord } from '../domain/catalogo.model';

const VALUE_KEYS = [
    'id',
    'Id',
    'ID',
    'estructuraOrgId',
    'estructuraOrganizacionalId',
    'estructuraId',
    'institucionId',
    'organizacionId',
    'dependenciaId',
    'unidadId',
    'organoId',
    'idEstructuraOrg',
    'idEstructuraOrganizacional',
    'idEstructura',
    'idInstitucion',
    'idOrganizacion',
    'idDependencia',
    'idUnidad',
    'idOrgano',
    'tipoInstitucionId',
    'tipoEstructuraId',
    'sistemaId',
    'tipoUsuarioId',
    'estadoCivilId',
    'sexoId',
    'estadoId',
    'municipioId',
    'clave',
    'Clave',
    'codigo',
    'Codigo',
    'valor',
    'Valor',
];

const LABEL_KEYS = [
    'descripcion',
    'Descripcion',
    'DESCRIPCION',
    'nombre',
    'Nombre',
    'NOMBRE',
    'nombreEstructura',
    'estructura',
    'estructuraOrg',
    'estructuraOrganizacional',
    'institucion',
    'dependencia',
    'unidad',
    'unidadAdministrativa',
    'organo',
    'organoDesconcentrado',
    'label',
    'Label',
    'estado',
    'municipio',
    'sistema',
    'tipoUsuario',
    'tipoInstitucion',
    'tipoEstructura',
    'clave',
    'Clave',
];

export function mapCatalogoToOptions(
    items: readonly CatalogoRecord[],
): readonly CatalogoOption[] {
    return items
        .map((item) => mapCatalogoToOption(item))
        .filter((item): item is CatalogoOption => item !== null);
}

function mapCatalogoToOption(item: CatalogoRecord): CatalogoOption | null {
    const value = findFirstValue(item, VALUE_KEYS);
    const label = findFirstValue(item, LABEL_KEYS);

    if (value === null || label === null) {
        return null;
    }

    return {
        value: String(value),
        label: String(label),
    };
}

function findFirstValue(
    item: CatalogoRecord,
    preferredKeys: readonly string[],
): string | number | boolean | null {
    for (const key of preferredKeys) {
        const value = item[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    const fallback = Object.values(item).find(
        (value) => value !== undefined && value !== null && value !== '',
    );

    return fallback ?? null;
}