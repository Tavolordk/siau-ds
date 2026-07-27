import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { CONSULTAS_API_BASE_URL } from '../../../core/http/consultas-api-base-url.token';
import {
    ActualizarAdminRequest,
    ActualizarAdminResponse,
    RegistroAdminRequest,
    RegistroAdminResponse,
    RegistroEspecialRequest,
    RegistroEspecialResponse,
    SolicitudOperacionRequest,
    SolicitudOperacionResponse,
    UserDetailRecord,
    UserPagination,
    UserRecord,
    UsersPageResult,
    UsersQuery,
} from '../domain/models/user-record.model';

const USERS_PATH = '/api/v1/consultas/usuarios';
const REGISTRO_ADMIN_PATH = '/api/v1/registro/registro_admin';
const REGISTRO_ESPECIAL_PATH = '/api/v1/registro/registro_especial';
const ACTUALIZAR_ADMIN_PATH = '/api/v1/solicitudes/actualizar_admin';
const SOLICITUD_BAJA_PATH = '/api/v1/solicitudes/baja';
const SOLICITUD_SUSPENDER_PATH = '/api/v1/solicitudes/suspender';
const SOLICITUD_REACTIVAR_PATH = '/api/v1/solicitudes/reactivar';
const SOLICITUD_DESBLOQUEO_PATH = '/api/v1/solicitudes/desbloqueo';

interface ApiErrorDto {
    readonly code?: string | null;
    readonly message?: string | null;
    readonly detail?: string | null;
}

interface ApiResponseDto<T> {
    readonly success: boolean;
    readonly data: T | null;
    readonly errors?: readonly ApiErrorDto[] | null;
    readonly traceId?: string | null;
}

interface UserListItemDto {
    readonly usuarioId?: number | null;
    readonly nombreUsuario?: string | null;
    readonly nombreCompleto?: string | null;
    readonly correo?: string | null;
    readonly tipoUsuarioId?: number | null;
    readonly rol?: string | null;
    readonly rolClave?: string | null;
    readonly estadoCuentaId?: number | null;
    readonly estatus?: string | null;
    readonly estatusClave?: string | null;
    readonly rnpsp?: string | null;
    readonly cConfianza?: string | null;
    readonly fechaAlta?: string | null;
    readonly fechaActualizacion?: string | null;
}

interface PaginationDto {
    readonly totalRegistros?: number | null;
    readonly totalPaginas?: number | null;
    readonly paginaActual?: number | null;
    readonly porPagina?: number | null;
}

interface UsersResponseDto {
    readonly usuarios?: readonly UserListItemDto[] | null;
    readonly paginacion?: PaginationDto | null;
}

interface UserDetailResponseDto {
    readonly datos?: Record<string, unknown> | null;
}

@Injectable({ providedIn: 'root' })
export class UsersApiRepository {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(CONSULTAS_API_BASE_URL).replace(/\/$/, '');

    getUsers(query: UsersQuery): Observable<UsersPageResult> {
        return this.http
            .get<ApiResponseDto<UsersResponseDto>>(`${this.baseUrl}${USERS_PATH}`, {
                params: this.toHttpParams(query),
            })
            .pipe(
                map((response) =>
                    this.unwrapResponse(
                        response,
                        'No fue posible consultar usuarios.',
                    ),
                ),
                map((response) => this.toUsersPageResult(response, query)),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible consultar usuarios.',
                    ),
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
                map((response) =>
                    response ?? { mensaje: null, datos: null },
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible registrar el usuario.',
                    ),
                ),
            );
    }

    createSpecialUser(
        request: RegistroEspecialRequest,
    ): Observable<RegistroEspecialResponse> {
        return this.http
            .post<RegistroEspecialResponse>(
                `${this.baseUrl}${REGISTRO_ESPECIAL_PATH}`,
                request,
            )
            .pipe(
                map((response) =>
                    response ?? { mensaje: null, datos: null },
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible registrar el usuario express.',
                    ),
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
                map((response) =>
                    response ?? { mensaje: null, datos: null },
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible actualizar el usuario.',
                    ),
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
                map((response) =>
                    response ?? { mensaje: null, datos: null },
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible dar de baja al usuario.',
                    ),
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
                map((response) =>
                    response ?? { mensaje: null, datos: null },
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible suspender al usuario.',
                    ),
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
                map((response) =>
                    response ?? { mensaje: null, datos: null },
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible reactivar al usuario.',
                    ),
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
                map((response) =>
                    response ?? { mensaje: null, datos: null },
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible desbloquear al usuario.',
                    ),
                ),
            );
    }

    getUserDetail(userId: number): Observable<UserDetailRecord> {
        return this.http
            .get<ApiResponseDto<UserDetailResponseDto>>(
                `${this.baseUrl}${USERS_PATH}/${encodeURIComponent(
                    String(userId),
                )}`,
            )
            .pipe(
                map((response) =>
                    this.unwrapResponse(
                        response,
                        'No fue posible consultar el detalle del usuario.',
                    ),
                ),
                map((response) => ({
                    userId,
                    datos: response.datos ?? {},
                })),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible consultar el detalle del usuario.',
                    ),
                ),
            );
    }

    private toUsersPageResult(
        response: UsersResponseDto,
        query: UsersQuery,
    ): UsersPageResult {
        const usuarios = (response.usuarios ?? []).map((user) =>
            this.toUserRecord(user),
        );

        const paginacion = this.toPagination(
            response.paginacion,
            query,
            usuarios.length,
        );

        return {
            usuarios,
            paginacion,
        };
    }

    private toUserRecord(user: UserListItemDto): UserRecord {
        const userId = this.toNumber(user.usuarioId, 0);

        const username =
            this.normalizeText(user.nombreUsuario) || `usuario-${userId}`;

        const fullName =
            this.normalizeText(user.nombreCompleto) || 'Sin nombre';

        const email =
            this.normalizeText(user.correo) || 'Sin correo';

        const role =
            this.normalizeText(user.rol) ||
            this.normalizeText(user.rolClave) ||
            'Sin rol';

        const roleKey = this.normalizeText(user.rolClave);

        const status =
            this.normalizeText(user.estatus) ||
            this.normalizeText(user.estatusClave) ||
            'Sin estatus';

        const statusKey = this.normalizeText(user.estatusClave);

        const rnpsp =
            this.normalizeText(user.rnpsp) || 'No registrado';

        const trust =
            this.normalizeText(user.cConfianza) || 'No capturado';

        return {
            userId,
            username,
            fullName,
            email,
            role,
            roleKey,
            status,
            statusKey,
            rnpsp,
            trust,
            createdAt: user.fechaAlta ?? null,
            updatedAt: user.fechaActualizacion ?? null,
        };
    }

    private toPagination(
        pagination: PaginationDto | null | undefined,
        query: UsersQuery,
        currentCount: number,
    ): UserPagination {
        const currentPage = this.toNumber(
            pagination?.paginaActual,
            query.pagina ?? 1,
        );

        const pageSize = this.toNumber(
            pagination?.porPagina,
            query.porPagina ?? currentCount,
        );

        const totalRecords = this.toNumber(
            pagination?.totalRegistros,
            currentCount,
        );

        const totalPages = this.toNumber(
            pagination?.totalPaginas,
            pageSize > 0
                ? Math.max(1, Math.ceil(totalRecords / pageSize))
                : 1,
        );

        return {
            totalRegistros: totalRecords,
            totalPaginas: totalPages,
            paginaActual: currentPage,
            porPagina: pageSize,
        };
    }

    private toHttpParams(query: UsersQuery): HttpParams {
        let params = new HttpParams();

        Object.entries(query).forEach(([key, value]) => {
            if (
                value !== undefined &&
                value !== null &&
                value !== ''
            ) {
                params = params.set(key, String(value));
            }
        });

        return params;
    }

    private unwrapResponse<T>(
        response: ApiResponseDto<T>,
        fallbackMessage: string,
    ): T {
        if (response.success && response.data) {
            return response.data;
        }

        const apiMessage =
            response.errors?.find(
                (error) => error.detail || error.message,
            )?.detail ??
            response.errors?.find(
                (error) => error.message,
            )?.message ??
            fallbackMessage;

        throw new Error(apiMessage);
    }

    private handleError(
        error: unknown,
        fallbackMessage: string,
    ): Observable<never> {
        if (
            error instanceof Error &&
            !(error instanceof HttpErrorResponse)
        ) {
            return throwError(() => error);
        }

        if (error instanceof HttpErrorResponse) {
            return throwError(
                () =>
                    new Error(
                        this.getHttpErrorMessage(
                            error,
                            fallbackMessage,
                        ),
                    ),
            );
        }

        return throwError(() => new Error(fallbackMessage));
    }

    private getHttpErrorMessage(
        error: HttpErrorResponse,
        fallbackMessage: string,
    ): string {
        const apiError = error.error as
            | {
                mensaje?: string;
                message?: string;
                error?: string;
                errors?: readonly ApiErrorDto[];
            }
            | null;

        const responseError = apiError?.errors?.find(
            (item) => item.detail || item.message,
        );

        if (responseError?.detail) {
            return responseError.detail;
        }

        if (responseError?.message) {
            return responseError.message;
        }

        if (apiError?.mensaje) {
            return apiError.mensaje;
        }

        if (apiError?.message) {
            return apiError.message;
        }

        if (apiError?.error) {
            return apiError.error;
        }

        if (error.status === 0) {
            return 'No fue posible conectar con el servicio de consultas de usuarios.';
        }

        if (error.status === 401) {
            return 'No tienes permisos para consultar los catálogos.';
        }

        if (error.status === 403) {
            return 'No tienes permisos para consultar usuarios.';
        }

        if (error.status === 404) {
            return 'No se encontró información del usuario solicitado.';
        }

        return fallbackMessage;
    }

    private normalizeText(
        value: string | null | undefined,
    ): string {
        return String(value ?? '').trim();
    }

    private toNumber(
        value: number | null | undefined,
        fallback: number,
    ): number {
        return typeof value === 'number' && Number.isFinite(value)
            ? value
            : fallback;
    }
}