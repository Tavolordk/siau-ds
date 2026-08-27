import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SiauSelectOption } from '../../../../shared/ui';
import {
    BorradorEstructuraCatalogo,
    BorradorItem,
} from '../../domain/models/user-record.model';

export interface ResolvedDraftStructureHierarchy {
    readonly institutionType: string;
    readonly entity: string;
    readonly municipality: string;
    readonly institution: string;
    readonly decentralizedBody: string;
    readonly administrativeUnit: string;
    readonly institutionOption: SiauSelectOption | null;
    readonly decentralizedBodyOption: SiauSelectOption | null;
    readonly administrativeUnitOption: SiauSelectOption | null;
}

export interface DraftStructureHierarchies {
    readonly assignment: ResolvedDraftStructureHierarchy | null;
    readonly commission: ResolvedDraftStructureHierarchy | null;
}

/**
 * El GET de borradores ya devuelve la jerarquía resuelta por el backend en los
 * bloques `adscripcion` y `comision` (tipo de institución, entidad, institución,
 * órgano y unidad administrativa con sus ids y etiquetas), así que aquí sólo se
 * mapea nivel por nivel: no hace falta reconstruir nada ni pegarle a catálogos.
 *
 * Si un borrador viejo no trae el breadcrumb, se cae al comportamiento anterior:
 * la estructura persistida se muestra en el primer nivel y el usuario vuelve a
 * elegir la cascada si necesita cambiarla.
 */
@Injectable({ providedIn: 'root' })
export class DraftStructureResolver {
    resolverJerarquias(draft: BorradorItem): Observable<DraftStructureHierarchies> {
        return of({
            assignment: this.armar(
                draft.catalogos?.adscripcionEstructura ?? null,
                draft.datos?.adscripcion.estructuraId ?? null,
                draft.catalogos?.adscripcion ?? null,
            ),
            commission: this.armar(
                draft.catalogos?.comisionEstructura ?? null,
                draft.datos?.comision?.estructuraId ?? null,
                draft.catalogos?.comision ?? null,
            ),
        });
    }

    private armar(
        estructura: BorradorEstructuraCatalogo | null,
        estructuraId: number | null,
        nombre: string | null,
    ): ResolvedDraftStructureHierarchy | null {
        const desdeCatalogo = this.armarDesdeCatalogo(estructura);

        if (desdeCatalogo) {
            return desdeCatalogo;
        }

        return this.armarSoloHoja(estructuraId, nombre);
    }

    private armarDesdeCatalogo(
        estructura: BorradorEstructuraCatalogo | null,
    ): ResolvedDraftStructureHierarchy | null {
        if (!estructura) {
            return null;
        }

        const institutionOption = this.opcion(estructura.institucionId, estructura.institucion);
        const decentralizedBodyOption = this.opcion(estructura.organoId, estructura.organo);
        const administrativeUnitOption = this.opcion(estructura.unidadId, estructura.unidad);

        // Sin institución no hay cascada que sembrar; se deja que el fallback
        // pinte al menos la estructura persistida.
        if (!institutionOption) {
            return null;
        }

        return {
            institutionType: this.valor(estructura.tipoInstitucionId),
            entity: this.valor(estructura.estadoId),
            municipality: this.valor(estructura.municipioId),
            institution: institutionOption.value,
            decentralizedBody: decentralizedBodyOption?.value ?? '',
            administrativeUnit: administrativeUnitOption?.value ?? '',
            institutionOption,
            decentralizedBodyOption,
            administrativeUnitOption,
        };
    }

    /** Contrato viejo: sólo se conoce el último `estructuraId` y su nombre. */
    private armarSoloHoja(
        estructuraId: number | null,
        nombre: string | null,
    ): ResolvedDraftStructureHierarchy | null {
        if (!estructuraId) {
            return null;
        }

        const value = String(estructuraId);

        return {
            institutionType: '',
            entity: '',
            municipality: '',
            institution: value,
            decentralizedBody: '',
            administrativeUnit: '',
            institutionOption: { value, label: (nombre ?? '').trim() || value },
            decentralizedBodyOption: null,
            administrativeUnitOption: null,
        };
    }

    private opcion(id: number | null, label: string | null): SiauSelectOption | null {
        if (!id) {
            return null;
        }

        const value = String(id);

        return { value, label: (label ?? '').trim() || value };
    }

    private valor(id: number | null): string {
        return id ? String(id) : '';
    }
}