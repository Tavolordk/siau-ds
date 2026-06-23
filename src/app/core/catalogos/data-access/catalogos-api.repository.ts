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
    SistemaPerfilesQuery,
} from '../domain/catalogo.model';
import { CatalogosRepository } from '../domain/catalogos.repository';

const CATALOGOS_PATH = '/api/v1/catalogos';

type CatalogoQuery =
    | EstadoMunicipioQuery
    | EstructuraOrganizacionalQuery
    | EstructuraOrgQuery
    | SistemaPerfilesQuery;

const QUERY_PARAM_NAMES: Record<string, string> = {
    nivel: 'Nivel',
    estadoId: 'EstadoId',
    soloActivos: 'SoloActivos',
    tipoEstructuraId: 'TipoEstructuraId',
    tipoInstitucionId: 'TipoInstitucionId',
    padreId: 'PadreId',
    busqueda: 'Busqueda',
    sistema: 'Sistema',
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
        return this.getCatalogo('estructura_organizacional', query);
    }

    obtenerEstructuraOrg(
        query: EstructuraOrgQuery = { soloActivos: 1 },
    ): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('estructura_org', query);
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

    obtenerTipoEstructura(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('tipo_estructura');
    }

    obtenerTiposDocumentos(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('tipos_documentos');
    }

    obtenerTipoUsuario(): Observable<readonly CatalogoRecord[]> {
        return this.getCatalogo('tipo_usuario');
    }

    private getCatalogo(endpoint: string, query?: CatalogoQuery): Observable<readonly CatalogoRecord[]> {
        const url = `${this.apiBaseUrl}${CATALOGOS_PATH}/${endpoint}`;

        return this.http
            .get<CatalogoResponse>(url, {
                params: this.toHttpParams(query),
            })
            .pipe(
                map((response) => response.datos ?? []),
                catchError((error: HttpErrorResponse) =>
                    throwError(() => new Error(this.getErrorMessage(error))),
                ),
            );
    }

    private toHttpParams(query?: CatalogoQuery): HttpParams {
        let params = new HttpParams();

        if (!query) {
            return params;
        }

        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params = params.set(QUERY_PARAM_NAMES[key] ?? key, String(value));
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
            return 'Tu sesión no es válida o expiró. Inicia sesión nuevamente.';
        }

        if (error.status === 403) {
            return 'No tienes permisos para consultar los catálogos.';
        }

        return 'No fue posible consultar los catálogos en este momento.';
    }
}