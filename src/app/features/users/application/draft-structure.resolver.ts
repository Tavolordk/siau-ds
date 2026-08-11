import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SiauSelectOption } from '../../../shared/ui';
import { BorradorItem } from '../domain/models/user-record.model';

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
 * El GET de borradores sólo devuelve el ÚLTIMO `estructuraId` seleccionado más
 * su nombre ya resuelto en `catalogos.adscripcion` / `catalogos.comision`.
 *
 * Los SP de catálogos exponen hijos por `padreId`, pero no permiten leer un
 * registro por id ni subir al padre, así que desde el front NO hay forma de
 * reconstruir institución -> OAD -> UA sin recorrer el árbol completo hacia
 * abajo. Con la API acotada a ciertas combinaciones de parámetros ese recorrido
 * no es viable.
 *
 * Solución temporal: se pinta la estructura persistida en el nivel de
 * institución, conservando el id exacto para que al guardar se reenvíe el mismo
 * `estructuraId`. Los niveles de órgano y unidad administrativa quedan vacíos.
 *
 * TODO(backend): que el GET de borradores devuelva el breadcrumb resuelto, por
 * ejemplo:
 *
 *   "catalogos": {
 *     "adscripcion": {
 *       "estructuraId": 2069,
 *       "nombre": "SECRETARIADO EJECUTIVO ...",
 *       "tipoInstitucionId": 1,
 *       "estadoId": null,
 *       "municipioId": null,
 *       "jerarquia": [
 *         { "estructuraId": 12,   "tipoEstructuraId": 1, "nivel": "INSTITUCION", "nombre": "..." },
 *         { "estructuraId": 2069, "tipoEstructuraId": 2, "nivel": "ORGANO",      "nombre": "..." }
 *       ]
 *     }
 *   }
 *
 * Con eso, `resolverJerarquias` sólo tendría que mapear cada nivel y este
 * archivo se reduce a un mapper sin heurística.
 */
@Injectable({ providedIn: 'root' })
export class DraftStructureResolver {
    resolverJerarquias(draft: BorradorItem): Observable<DraftStructureHierarchies> {
        return of({
            assignment: this.armar(
                draft.datos?.adscripcion.estructuraId ?? null,
                draft.catalogos?.adscripcion ?? null,
            ),
            commission: this.armar(
                draft.datos?.comision?.estructuraId ?? null,
                draft.catalogos?.comision ?? null,
            ),
        });
    }

    private armar(
        estructuraId: number | null,
        nombre: string | null,
    ): ResolvedDraftStructureHierarchy | null {
        if (!estructuraId) {
            return null;
        }

        const value = String(estructuraId);
        const label = (nombre ?? '').trim() || value;

        return {
            // Sin el breadcrumb del backend no se puede inferir el ámbito. Se
            // dejan vacíos para que el usuario elija el tipo de institución y
            // dispare la cascada normal si necesita cambiar la estructura.
            institutionType: '',
            entity: '',
            municipality: '',
            institution: value,
            decentralizedBody: '',
            administrativeUnit: '',
            institutionOption: { value, label },
            decentralizedBodyOption: null,
            administrativeUnitOption: null,
        };
    }
}