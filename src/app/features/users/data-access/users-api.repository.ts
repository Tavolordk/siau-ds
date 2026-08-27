import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { CONSULTAS_API_BASE_URL } from '../../../core/http/consultas-api-base-url.token';
import {
    ActualizarAdminRequest,
    ActualizarAdminResponse,
    BorradorGuardarRequest,
    BorradorItem,
    BorradorOperacionResponse,
    PasswordTemporalResponse,
    BorradorCatalogos,
    BorradorDatos,
    BorradorEstructuraCatalogo,
    BorradorPerfil,
    RegistroAdminRequest,
    RegistroAdminResponse,
    SolicitudOperacionRequest,
    SolicitudOperacionResponse,
    UserDetailRecord,
    UserPagination,
    UserRecord,
    UsersPageResult,
    UsersQuery,
} from '../domain/models/user-record.model';

const REGISTRO_ROOT_PATH = '/api/v1/registro';
const USERS_SEARCH_PATH = `${REGISTRO_ROOT_PATH}/usuarios/busqueda-avanzada`;
const USERS_MANAGEMENT_PATH = `${REGISTRO_ROOT_PATH}/usuarios/gestion`;
const USERS_DETAIL_PATH = '/api/v1/consultas/usuarios';
const REGISTRO_ADMIN_PATH = `${REGISTRO_ROOT_PATH}/registro_admin`;
const BORRADORES_PATH = `${REGISTRO_ROOT_PATH}/borradores`;
const PASSWORD_TEMPORAL_PATH = `${REGISTRO_ROOT_PATH}/usuarios`;
const ACTUALIZAR_ADMIN_PATH = '/api/v1/solicitudes/actualizar_admin';
const SOLICITUD_BAJA_PATH = '/api/v1/solicitudes/baja';
const SOLICITUD_SUSPENDER_PATH = '/api/v1/solicitudes/suspender';
const SOLICITUD_REACTIVAR_PATH = '/api/v1/solicitudes/reactivar';
const SOLICITUD_DESBLOQUEO_PATH = '/api/v1/solicitudes/desbloqueo';

import { UsersApiResponseMapper } from './users-api-response.mapper';
import { AdvancedUsersResponseDto, ApiErrorDto, ApiResponseDto, UserDetailResponseDto } from './users-api.contracts';

@Injectable({ providedIn: 'root' })
export class UsersApiRepository {
    private readonly http = inject(HttpClient);
    private readonly responseMapper = inject(UsersApiResponseMapper);
    private readonly baseUrl = inject(CONSULTAS_API_BASE_URL).replace(/\/$/, '');

    /**
     * Lista inicial de la sección Usuarios.
     * GET /api/v1/registro/usuarios/gestion
     * Para el listado general sólo se envían Pagina y PorPagina.
     */
    getAllUsers(page = 1, pageSize = 15): Observable<UsersPageResult> {
        return this.http
            .get<unknown>(`${this.baseUrl}${USERS_MANAGEMENT_PATH}`, {
                params: {
                    Pagina: String(page),
                    PorPagina: String(pageSize),
                },
            })
            .pipe(
                map((response) => this.responseMapper.toGenericUsersPageResult(response, page, pageSize)),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible obtener la lista de usuarios.'),
                ),
            );
    }

    searchUsers(query: UsersQuery): Observable<UsersPageResult> {
        return this.http
            .post<AdvancedUsersResponseDto>(
                `${this.baseUrl}${USERS_SEARCH_PATH}`,
                query,
            )
            .pipe(
                map((response) => this.responseMapper.toUsersPageResult(response, query)),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible realizar la búsqueda avanzada de usuarios.',
                    ),
                ),
            );
    }

    /** Compatibilidad con llamadas existentes: si no hay filtros usa el GET general. */
    getUsers(query: UsersQuery): Observable<UsersPageResult> {
        const hasSearchCriteria = Object.entries(query).some(([key, value]) =>
            key !== 'pagina'
            && key !== 'porPagina'
            && value !== null
            && value !== undefined
            && String(value).trim() !== '',
        );

        return hasSearchCriteria
            ? this.searchUsers(query)
            : this.getAllUsers(query.pagina ?? 1, query.porPagina ?? 15);
    }

    saveRegistrationDraft(request: BorradorGuardarRequest): Observable<BorradorOperacionResponse> {
        return this.http
            .post<unknown>(`${this.baseUrl}${BORRADORES_PATH}`, request)
            .pipe(
                map((response) => this.responseMapper.toDraftOperationResponse(response, request)),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible guardar el avance del registro.'),
                ),
            );
    }

    getRegistrationDraft(usuarioEjecutorId?: number | null): Observable<BorradorItem | null> {
        return this.getRegistrationDrafts(usuarioEjecutorId).pipe(
            map((drafts) => drafts[0] ?? null),
        );
    }

    /**
     * GET /api/registro/borradores acepta `borradorId` y `usuarioEjecutorId`
     * como query params (contrato siau.registro.api 1.0.5). Sin `borradorId`
     * devuelve todos los borradores del ejecutor.
     */
    getRegistrationDrafts(
        usuarioEjecutorId?: number | null,
        borradorId?: number | null,
    ): Observable<readonly BorradorItem[]> {
        const params: Record<string, string> = {};
        const ejecutorId = this.toPositiveNumber(usuarioEjecutorId);
        const draftId = this.toPositiveNumber(borradorId);

        if (ejecutorId) {
            params['usuarioEjecutorId'] = String(ejecutorId);
        }

        if (draftId) {
            params['borradorId'] = String(draftId);
        }

        return this.http
            .get<unknown>(`${this.baseUrl}${BORRADORES_PATH}`, { params })
            .pipe(
                map((response) => this.responseMapper.toDraftItems(response)),
                catchError((error: unknown) => {
                    if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 204)) {
                        return of([] as readonly BorradorItem[]);
                    }

                    return this.handleError(error, 'No fue posible recuperar los borradores del registro.');
                }),
            );
    }

    deleteRegistrationDraft(
        borradorId: number,
        usuarioEjecutorId?: number | null,
    ): Observable<void> {
        const ejecutorId = this.toPositiveNumber(usuarioEjecutorId);
        const params: Record<string, string> = ejecutorId
            ? { usuarioEjecutorId: String(ejecutorId) }
            : {};

        return this.http
            .delete<unknown>(
                `${this.baseUrl}${BORRADORES_PATH}/${encodeURIComponent(String(borradorId))}`,
                { params },
            )
            .pipe(
                map(() => void 0),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible eliminar el borrador del registro.'),
                ),
            );
    }

    getTemporaryPassword(account: string): Observable<PasswordTemporalResponse> {
        const normalizedAccount = String(account ?? '').trim();

        return this.http
            .get<unknown>(
                `${this.baseUrl}${PASSWORD_TEMPORAL_PATH}/${encodeURIComponent(normalizedAccount)}/password-temporal`,
            )
            .pipe(
                map((response) => this.responseMapper.toPasswordTemporalResponse(response, normalizedAccount)),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible obtener la contraseña temporal.'),
                ),
            );
    }

    createAdminUser(
        request: RegistroAdminRequest,
    ): Observable<RegistroAdminResponse> {
        return this.http
            .post<RegistroAdminResponse>(
                `${this.baseUrl}${REGISTRO_ADMIN_PATH}`,
                request,
            )
            .pipe(
                map((response) => response ?? { mensaje: null, datos: null }),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible registrar el usuario.'),
                ),
            );
    }

    updateAdminUser(
        request: ActualizarAdminRequest,
    ): Observable<ActualizarAdminResponse> {
        return this.http
            .patch<ActualizarAdminResponse>(
                `${this.baseUrl}${ACTUALIZAR_ADMIN_PATH}`,
                request,
            )
            .pipe(
                map((response) => response ?? { mensaje: null, datos: null }),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible actualizar el usuario.'),
                ),
            );
    }

    darDeBajaUsuario(
        request: SolicitudOperacionRequest,
    ): Observable<SolicitudOperacionResponse> {
        return this.http
            .patch<SolicitudOperacionResponse>(
                `${this.baseUrl}${SOLICITUD_BAJA_PATH}`,
                request,
            )
            .pipe(
                map((response) => response ?? { mensaje: null, datos: null }),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible dar de baja al usuario.'),
                ),
            );
    }

    suspenderUsuario(
        request: SolicitudOperacionRequest,
    ): Observable<SolicitudOperacionResponse> {
        return this.http
            .patch<SolicitudOperacionResponse>(
                `${this.baseUrl}${SOLICITUD_SUSPENDER_PATH}`,
                request,
            )
            .pipe(
                map((response) => response ?? { mensaje: null, datos: null }),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible suspender al usuario.'),
                ),
            );
    }

    reactivarUsuario(
        request: SolicitudOperacionRequest,
    ): Observable<SolicitudOperacionResponse> {
        return this.http
            .patch<SolicitudOperacionResponse>(
                `${this.baseUrl}${SOLICITUD_REACTIVAR_PATH}`,
                request,
            )
            .pipe(
                map((response) => response ?? { mensaje: null, datos: null }),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible reactivar al usuario.'),
                ),
            );
    }

    desbloquearUsuario(
        request: SolicitudOperacionRequest,
    ): Observable<SolicitudOperacionResponse> {
        return this.http
            .patch<SolicitudOperacionResponse>(
                `${this.baseUrl}${SOLICITUD_DESBLOQUEO_PATH}`,
                request,
            )
            .pipe(
                map((response) => response ?? { mensaje: null, datos: null }),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible desbloquear al usuario.'),
                ),
            );
    }

    getUserDetail(userId: number): Observable<UserDetailRecord> {
        return this.http
            .get<ApiResponseDto<UserDetailResponseDto>>(
                `${this.baseUrl}${USERS_DETAIL_PATH}/${encodeURIComponent(String(userId))}`,
            )
            .pipe(
                map((response) =>
                    this.responseMapper.unwrapResponse(
                        response,
                        'No fue posible consultar el detalle del usuario.',
                    ),
                ),
                map((response) => this.responseMapper.toUserDetailRecord(userId, response.datos ?? {})),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible consultar el detalle del usuario.'),
                ),
            );
    }

    private handleError(error: unknown, fallbackMessage: string): Observable<never> {
        if (error instanceof Error && !(error instanceof HttpErrorResponse)) {
            return throwError(() => error);
        }

        if (error instanceof HttpErrorResponse) {
            return throwError(() => new Error(this.getHttpErrorMessage(error, fallbackMessage)));
        }

        return throwError(() => new Error(fallbackMessage));
    }

    private getHttpErrorMessage(error: HttpErrorResponse, fallbackMessage: string): string {
        const apiError = error.error as
            | {
                mensaje?: string;
                message?: string;
                error?: string;
                errors?: readonly ApiErrorDto[];
            }
            | null;
        const responseError = apiError?.errors?.find((item) => item.detail || item.message);

        if (responseError?.detail) return responseError.detail;
        if (responseError?.message) return responseError.message;
        if (apiError?.mensaje) return apiError.mensaje;
        if (apiError?.message) return apiError.message;
        if (apiError?.error) return apiError.error;
        if (error.status === 0) return 'No fue posible conectar con el servicio de usuarios.';
        if (error.status === 401) return 'Tu sesión no está autorizada para realizar esta operación.';
        if (error.status === 403) return 'No tienes permisos para realizar esta operación.';
        if (error.status === 404) return 'No se encontró la información solicitada.';
        if (error.status === 503) return 'El servicio de usuarios no está disponible temporalmente.';
        return fallbackMessage;
    }

    private toPositiveNumber(value: unknown): number | null {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

}