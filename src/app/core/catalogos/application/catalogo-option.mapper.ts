import { CatalogoOption, CatalogoRecord } from '../domain/catalogo.model';

const VALUE_KEYS = [
    'id',
    'Id',
    'ID',
    'clave',
    'Clave',
    'codigo',
    'Codigo',
    'valor',
    'Valor',
    'estadoId',
    'municipioId',
    'tipoInstitucionId',
    'tipoEstructuraId',
    'sistemaId',
    'tipoUsuarioId',
];

const LABEL_KEYS = [
    'descripcion',
    'Descripcion',
    'DESCRIPCION',
    'nombre',
    'Nombre',
    'NOMBRE',
    'label',
    'Label',
    'estado',
    'municipio',
    'sistema',
    'tipoUsuario',
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