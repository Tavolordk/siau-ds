import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { API_BASE_URL } from '../../http/api-base-url.token';
import {
    CatalogoRecord,
    CatalogoResponse,
    EstadoMunicipioQuery,
    EstructuraOrganizacionalQuery,
    EstructuraOrgQuery,
    EstructuraPerfilQuery,
    EstructuraPerfilResponse,
    SistemaPerfilesQuery,
} from '../domain/catalogo.model';
import { CatalogosRepository } from '../domain/catalogos.repository';

const CATALOGOS_PATH = '/api/v1/catalogos';

type CatalogoQuery =
    | EstadoMunicipioQuery
    | EstructuraOrganizacionalQuery
    | EstructuraOrgQuery
    | EstructuraPerfilQuery
    | SistemaPerfilesQuery;

const LEGACY_QUERY_PARAM_NAMES: Readonly<Record<string, string>> = {
    nivel: 'Nivel',
    estadoId: 'EstadoId',
    municipioId: 'MunicipioId',
    soloActivos: 'SoloActivos',
    tipoEstructuraId: 'TipoEstructuraId',
    tipoInstitucionId: 'TipoInstitucionId',
    padreId: 'PadreId',
    busqueda: 'Busqueda',
    sistema: 'Sistema',
    estructuraId: 'EstructuraId',
};

const CURRENT_QUERY_PARAM_NAMES: Readonly<Record<string, string>> = {
    nivel: 'nivel',
    estadoId: 'estadoId',
    soloActivos: 'soloActivos',
    tipoEstructuraId: 'tipoEstructuraId',
    tipoInstitucionId: 'tipoInstitucionId',
    padreId: 'padreId',
    busqueda: 'busqueda',
    sistema: 'sistema',
    estructuraId: 'estructuraId',
};

@Injectable({ providedIn: 'root' })
export class CatalogosApiRepository implements CatalogosRepository {
    private readonly http = inject(HttpClient);
    private readonly apiBaseUrl = inject(API_BASE_URL).replace(/\/$/, '');

    obtenerEstadoCivil(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('estado_civil');
    }

    obtenerCuentaUsuario(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('cuenta_usuario');
    }

    obtenerEstadosMunicipios(
        query: EstadoMunicipioQuery = { soloActivos: 1 },
    ): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('estados_municipios', query);
    }

    obtenerTipoInstitucion(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('tipo_institucion');
    }

    obtenerEstructuraOrganizacional(
        query: EstructuraOrganizacionalQuery = { soloActivos: 1 },
    ): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo(
            'estructura_organizacional',
            query,
            CURRENT_QUERY_PARAM_NAMES,
        );
    }

    obtenerEstructuraOrg(
        query: EstructuraOrgQuery = { soloActivos: 1 },
    ): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo(
            'estructura_org',
            query,
            CURRENT_QUERY_PARAM_NAMES,
        );
    }

    obtenerSexo(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('sexo');
    }

    obtenerSistemas(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('sistemas');
    }

    obtenerSistemaPerfiles(
        query: SistemaPerfilesQuery = { soloActivos: 1 },
    ): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('sistema_perfiles', query);
    }

    obtenerEstructuraPerfil(
        query: EstructuraPerfilQuery,
    ): Observable<readonly CatalogoRecord[]> {
        const url = `${this.apiBaseUrl}${CATALOGOS_PATH}/estructura_perfil`;

        return this.http
            .get<EstructuraPerfilResponse>(url, {
                params: this.toHttpParams(query, CURRENT_QUERY_PARAM_NAMES),
            })
            .pipe(
                /*
                 * `estructura_perfil` devuelve dos colecciones: `sistemas` y
                 * `perfiles`. Para restaurar borradores necesitamos conservar
                 * la relación idSistema -> sistema (por ejemplo 9 -> SPM).
                 * Enriquecemos cada perfil con el nombre proveniente de
                 * `sistemas` en vez de depender de que el perfil lo repita.
                 */
                map((response) => {
                    const systemsById = new Map<string, CatalogoRecord>();

                    (response.sistemas ?? []).forEach((system) => {
                        const id = String(
                            system['idSistema'] ?? system['sistemaId'] ?? system['id'] ?? '',
                        ).trim();

                        if (id) {
                            systemsById.set(id, system);
                        }
                    });

                    return (response.perfiles ?? []).map((profile) => {
                        const systemId = String(
                            profile['idSistema'] ?? profile['sistemaId'] ?? '',
                        ).trim();
                        const system = systemsById.get(systemId);

                        return {
                            ...profile,
                            sistema: system?.['sistema'] ?? profile['sistema'] ?? null,
                            descripcionSistema:
                                profile['descripcionSistema'] ?? system?.['descripcion'] ?? null,
                            audienciaSistema:
                                profile['audienciaSistema'] ?? system?.['audiencia'] ?? null,
                        };
                    });
                }),
                catchError((error: HttpErrorResponse) =>
                    throwError(() => new Error(this.getErrorMessage(error))),
                ),
            );
    }

    obtenerTipoEstructura(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('tipo_estructura');
    }

    obtenerTiposDocumentos(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('tipos_documentos');
    }

    obtenerTipoUsuario(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('tipo_usuario');
    }

    private getCatalogo(
        endpoint: string,
        query?: CatalogoQuery,
        queryParamNames: Readonly<Record<string, string>> = LEGACY_QUERY_PARAM_NAMES,
    ): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogoByPath(
            `${CATALOGOS_PATH}/${endpoint}`,
            query,
            queryParamNames,
        );
    }

    private getCatalogoByPath(
        path: string,
        query?: CatalogoQuery,
        queryParamNames: Readonly<Record<string, string>> = LEGACY_QUERY_PARAM_NAMES,
    ): Observable<readonly CatalogoRecord[]> {
        const url = `${this.apiBaseUrl}${path}`;

        return this.http
            .get<CatalogoResponse>(url, {
                params: this.toHttpParams(query, queryParamNames),
            })
            .pipe(
                map((response) => response.datos ?? []),
                catchError((error: HttpErrorResponse) =>
                    throwError(() => new Error(this.getErrorMessage(error))),
                ),
            );
    }

    private toHttpParams(
        query?: CatalogoQuery,
        queryParamNames: Readonly<Record<string, string>> = LEGACY_QUERY_PARAM_NAMES,
    ): HttpParams {
        let params = new HttpParams();

        if (!query) {
            return params;
        }

        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params = params.set(queryParamNames[key] ?? key, String(value));
            }
        });

        return params;
    }

    private getErrorMessage(error: HttpErrorResponse): string {
        const apiError = error.error as { mensaje?: string; error?: string } | null;

        if (apiError?.mensaje) {
            return apiError.mensaje;
        }

        if (apiError?.error) {
            return apiError.error;
        }

        if (error.status === 0) {
            return 'No fue posible conectar con el servicio de catálogos.';
        }

        if (error.status === 401) {
            return 'No tienes permisos para consultar los catálogos.';
        }

        if (error.status === 403) {
            return 'No tienes permisos para consultar los catálogos.';
        }

        return 'No fue posible consultar los catálogos en este momento.';
    }
}
