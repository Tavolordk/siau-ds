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

interface AdvancedUserListItemDto {
    readonly usuarioId?: number | null;
    readonly primerApellido?: string | null;
    readonly segundoApellido?: string | null;
    readonly nombres?: string | null;
    readonly curp?: string | null;
    readonly rfc?: string | null;
    readonly correoElectronico?: string | null;
    readonly numeroTelefonico?: string | null;
    readonly tipoInstitucionId?: number | null;
    readonly tipoInstitucion?: string | null;
    readonly entidadId?: number | null;
    readonly entidad?: string | null;
    readonly municipioAlcaldiaId?: number | null;
    readonly municipioAlcaldia?: string | null;
    readonly institucionId?: number | null;
    readonly institucion?: string | null;
    readonly organoAdministrativoDesconcentradoId?: number | null;
    readonly organoAdministrativoDesconcentrado?: string | null;
    readonly unidadAdministrativaId?: number | null;
    readonly unidadAdministrativa?: string | null;
    readonly nombreUsuario?: string | null;
    readonly estatusId?: number | null;
    readonly estatus?: string | null;
    readonly fechaUltimoMovimiento?: string | null;
    readonly fechaAlta?: string | null;
    readonly fechaActualizacion?: string | null;
}

interface AdvancedUsersResponseDto {
    readonly mensaje?: string | null;
    readonly totalRegistros?: number | null;
    readonly totalPaginas?: number | null;
    readonly paginaActual?: number | null;
    readonly porPagina?: number | null;
    readonly datos?: readonly AdvancedUserListItemDto[] | null;
}

interface UserDetailResponseDto {
    readonly datos?: Record<string, unknown> | null;
}

type UnknownRecord = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class UsersApiRepository {
    private readonly http = inject(HttpClient);
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
                map((response) => this.toGenericUsersPageResult(response, page, pageSize)),
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
                map((response) => this.toUsersPageResult(response, query)),
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
                map((response) => this.toDraftOperationResponse(response, request)),
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
                map((response) => this.toDraftItems(response)),
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
                map((response) => this.toPasswordTemporalResponse(response, normalizedAccount)),
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
                    this.handleError(error, 'No fue posible consultar el detalle del usuario.'),
                ),
            );
    }

    private toUsersPageResult(
        response: AdvancedUsersResponseDto,
        query: UsersQuery,
    ): UsersPageResult {
        const usuarios = (response.datos ?? []).map((user) => this.toUserRecord(user));

        return {
            usuarios,
            paginacion: this.toPagination(response, query, usuarios.length),
        };
    }

    private toGenericUsersPageResult(response: unknown, page: number, pageSize: number): UsersPageResult {
        const root = this.asRecord(response);
        const nested = this.asRecord(root?.['datos'] ?? root?.['data']);
        const candidates = [
            response,
            root?.['datos'],
            root?.['data'],
            root?.['usuarios'],
            root?.['items'],
            root?.['registros'],
            nested?.['usuarios'],
            nested?.['items'],
            nested?.['datos'],
            nested?.['registros'],
        ];
        const rawItems = candidates.find((candidate) => Array.isArray(candidate)) as readonly unknown[] | undefined;
        const allUsers = (rawItems ?? []).map((item) => this.toUserRecordFromUnknown(item));

        // Los metadatos pueden venir al ras de la respuesta o dentro de un objeto
        // `paginacion` anidado (contrato de /consultas/usuarios). Si sólo se mira
        // el nivel superior, `totalPaginas` se calcula con el tamaño de la página
        // actual y la lista queda congelada en la primera.
        const metadata = this.findPaginationMetadata(root, nested);
        const totalRecords = this.readNumber(metadata, ['totalRegistros', 'total', 'totalRecords'], allUsers.length);
        const responsePage = this.readNumber(metadata, ['paginaActual', 'pagina', 'page'], 0);

        // La página solicitada es la fuente de verdad: algunos endpoints
        // devuelven siempre `paginaActual: 1` y eso dejaba el pie de tabla
        // congelado en "Página 1 de N" aunque el listado sí avanzara.
        const currentPage = Math.max(1, page || responsePage || 1);

        if (responsePage > 0 && responsePage !== currentPage) {
            console.warn(
                'El backend devolvió una página distinta a la solicitada.',
                { solicitada: currentPage, devuelta: responsePage },
            );
        }

        const responsePageSize = this.readNumber(metadata, ['porPagina', 'tamanoPagina', 'pageSize'], pageSize);
        const declaredPages = this.readNumber(metadata, ['totalPaginas', 'pages', 'totalPages'], 0);

        // Si el GET regresa toda la colección sin metadatos, la paginación se hace en memoria.
        const hasPaginationMetadata = Boolean(
            metadata
            && (metadata['totalPaginas'] !== undefined
                || metadata['paginaActual'] !== undefined
                || metadata['porPagina'] !== undefined
                || metadata['totalRegistros'] !== undefined),
        );
        const users = hasPaginationMetadata
            ? allUsers
            : allUsers.slice(Math.max(0, page - 1) * pageSize, Math.max(0, page - 1) * pageSize + pageSize);
        const computedTotalPages = Math.max(1, Math.ceil(totalRecords / Math.max(1, responsePageSize)));

        return {
            usuarios: users,
            paginacion: {
                totalRegistros: totalRecords,
                totalPaginas: Math.max(1, declaredPages || computedTotalPages),
                paginaActual: Math.max(1, currentPage),
                porPagina: Math.max(1, responsePageSize),
            },
        };
    }

    /**
     * Busca el bloque de paginación en las formas conocidas del backend:
     * `{ paginacion: {...} }`, `{ data: { paginacion: {...} } }`, `{ meta: {...} }`
     * o los campos sueltos en la raíz.
     */
    private findPaginationMetadata(
        root: UnknownRecord | null,
        nested: UnknownRecord | null,
    ): UnknownRecord | null {
        const paginationKeys = [
            'totalRegistros',
            'total',
            'totalRecords',
            'totalPaginas',
            'pages',
            'totalPages',
            'paginaActual',
            'pagina',
            'page',
            'porPagina',
            'tamanoPagina',
            'pageSize',
        ];

        const candidates: ReadonlyArray<UnknownRecord | null> = [
            this.asRecord(nested?.['paginacion']),
            this.asRecord(root?.['paginacion']),
            this.asRecord(nested?.['pagination']),
            this.asRecord(root?.['pagination']),
            this.asRecord(nested?.['meta']),
            this.asRecord(root?.['meta']),
            nested,
            root,
        ];

        return (
            candidates.find(
                (candidate) =>
                    candidate
                    && paginationKeys.some((key) => candidate[key] !== undefined),
            ) ?? nested ?? root
        );
    }

    /**
     * Mapeo único de un usuario del listado. El GET de /registro/usuarios/gestion
     * entrega `nombreCompleto`, `rol`, `rolClave`, `estatusClave`, `rnpsp` y
     * `cConfianza`; la búsqueda avanzada manda los apellidos por separado. Se
     * leen ambos contratos y el nombre se arma sólo cuando no viene resuelto.
     */
    private toUserRecordFromUnknown(value: unknown): UserRecord {
        const record = this.asRecord(value) ?? {};
        const userId = this.readNumber(record, ['usuarioId', 'idUsuario', 'id'], 0);
        const composedName = [
            this.readText(record, ['nombres', 'nombre', 'name']),
            this.readText(record, ['primerApellido', 'apellidoPaterno', 'primer_apellido']),
            this.readText(record, ['segundoApellido', 'apellidoMaterno', 'segundo_apellido']),
        ]
            .map((part) => this.normalizeText(part))
            .filter(Boolean)
            .join(' ');
        const fullName = this.readText(record, [
            'nombreCompleto',
            'nombre_completo',
            'nombreCompletoUsuario',
            'fullName',
        ]);
        const status = this.readText(record, ['estatus', 'estadoCuenta', 'estado', 'status']);
        const statusKey = this.readText(record, [
            'estatusClave',
            'estadoCuentaClave',
            'claveEstatus',
            'statusKey',
        ]);

        return {
            userId,
            username: this.readText(record, ['nombreUsuario', 'usuario', 'cuenta', 'username'])
                || `usuario-${userId}`,
            fullName: fullName || composedName || 'Sin nombre',
            email: this.readText(record, ['correoElectronico', 'correo', 'email']) || 'Sin correo',
            institution: this.readText(record, ['institucion', 'nombreInstitucion']) || 'Sin institución',
            entity: this.readText(record, ['entidad', 'nombreEntidad']) || 'Sin entidad',
            role: this.readText(record, ['rol', 'tipoUsuario', 'perfil', 'role']) || 'Sin rol',
            roleKey: this.readText(record, ['rolClave', 'claveRol', 'tipoUsuarioClave', 'roleKey']),
            status: status || 'Sin estatus',
            statusKey: statusKey || status,
            rnpsp: this.readText(record, ['rnpsp', 'registroNacional']) || 'No registrado',
            trust: this.readText(record, ['cConfianza', 'controlConfianza', 'confianza'])
                || 'No capturado',
            createdAt: this.readText(record, ['fechaAlta', 'fechaRegistro', 'createdAt']) || null,
            updatedAt: this.readText(record, ['fechaActualizacion', 'updatedAt']) || null,
        };
    }

    private toUserRecord(user: AdvancedUserListItemDto): UserRecord {
        return this.toUserRecordFromUnknown(user);
    }

    private toPagination(
        response: AdvancedUsersResponseDto,
        query: UsersQuery,
        currentCount: number,
    ): UserPagination {
        // Igual que en el GET general: manda la página pedida, no la que eche
        // de vuelta el backend.
        const currentPage = query.pagina ?? this.toNumber(response.paginaActual, 1);
        const pageSize = this.toNumber(response.porPagina, query.porPagina ?? Math.max(1, currentCount));
        const totalRecords = this.toNumber(response.totalRegistros, currentCount);
        const totalPages = this.toNumber(
            response.totalPaginas,
            pageSize > 0 ? Math.max(1, Math.ceil(totalRecords / pageSize)) : 1,
        );

        return {
            totalRegistros: totalRecords,
            totalPaginas: Math.max(1, totalPages),
            paginaActual: Math.max(1, currentPage),
            porPagina: Math.max(1, pageSize),
        };
    }

    private toDraftOperationResponse(
        response: unknown,
        request: BorradorGuardarRequest,
    ): BorradorOperacionResponse {
        const root = this.asRecord(response);
        const item = this.toDraftItem(response) ?? {
            borradorId: this.toPositiveNumber(request.borradorId) ?? null,
            usuarioCreadorId: this.toPositiveNumber(request.auditoria.usuarioEjecutorId) ?? null,
            pasoActual: null,
            datos: request.datos,
            catalogos: null,
            estatus: null,
            fechaCreacion: null,
            fechaActualizacion: null,
        };

        return {
            mensaje: this.readText(root, ['mensaje', 'message']) || 'Borrador guardado.',
            datos: item,
        };
    }

    private toDraftItems(response: unknown): readonly BorradorItem[] {
        if (response === null || response === undefined) {
            return [];
        }

        if (Array.isArray(response)) {
            return response
                .map((item) => this.toDraftItem(item))
                .filter((item): item is BorradorItem => item !== null);
        }

        const root = this.asRecord(response);
        if (!root) {
            return [];
        }

        const candidate = root['datos']
            ?? root['data']
            ?? root['borradores']
            ?? root['items']
            ?? root['results'];

        if (Array.isArray(candidate)) {
            return candidate
                .map((item) => this.toDraftItem(item))
                .filter((item): item is BorradorItem => item !== null);
        }

        const single = this.toDraftItem(response);
        if (single) {
            return [single];
        }

        // Soporta envolturas como { data: { items: [...] } } o
        // { datos: { borradores: [...] } } sin perder registros.
        return candidate && candidate !== response
            ? this.toDraftItems(candidate)
            : [];
    }

    private toDraftItem(response: unknown): BorradorItem | null {
        if (response === null || response === undefined) {
            return null;
        }

        if (Array.isArray(response)) {
            return response.length ? this.toDraftItem(response[0]) : null;
        }

        const root = this.asRecord(response);
        if (!root) {
            return null;
        }

        const rootLooksLikeDraftItem =
            this.readNumber(root, ['borradorId', 'idBorrador', 'id'], 0) > 0
            || this.looksLikeDraftData(root['datos'])
            || typeof root['datos'] === 'string';

        const data = rootLooksLikeDraftItem
            ? root
            : (root['datos'] ?? root['data'] ?? root['borrador'] ?? root);

        if (Array.isArray(data)) {
            return data.length ? this.toDraftItem(data[0]) : null;
        }

        const record = this.asRecord(data);
        if (!record) {
            return null;
        }

        /*
         * El GET nuevo entrega el payload capturado en `datosJson` y, en la
         * raíz, los mismos bloques pero ya resueltos contra catálogos
         * (`adscripcion.organo`, `datosPersonales.sexo`, etc.). Hay que leer
         * `datosJson` primero: si se cae al `record` de la raíz se mapearían
         * las etiquetas del catálogo como si fueran el formulario y se pierden
         * `fechaNacimiento`, `numeroEmpleado` y `fechaInicio`.
         */
        const draftData = this.toDraftData(
            record['datosJson']
            ?? record['datos']
            ?? record['contenido']
            ?? record['payload']
            ?? record['formulario']
            ?? record['data']
            ?? record,
        );
        const id = this.readNumber(record, ['borradorId', 'idBorrador', 'id'], 0);
        const pasoActual = this.readText(record, ['pasoActual', 'paso', 'step']);

        if (!draftData && !id && !pasoActual) {
            return null;
        }

        const catalogos = this.toDraftCatalogos(record);

        return {
            borradorId: id > 0 ? id : null,
            usuarioCreadorId: this.readNullableNumber(record, [
                'usuarioCreadorId',
                'idUsuarioCreador',
                'usuarioEjecutorId',
                'creadoPorId',
            ]),
            pasoActual: pasoActual || null,
            datos: draftData,
            catalogos,
            estatus: this.readNullableText(record, ['estatus', 'estado', 'status']),
            fechaCreacion: this.readText(record, ['fechaCreacion', 'creadoEn', 'createdAt']) || null,
            fechaActualizacion: this.readText(record, ['fechaActualizacion', 'actualizadoEn', 'updatedAt']) || null,
        };
    }

    /**
     * Arma los catálogos del borrador. Soporta el contrato viejo (un objeto
     * `catalogos` plano) y el nuevo, donde las etiquetas resueltas viajan en
     * los bloques de la raíz: `adscripcion`, `comision`, `datosPersonales` y
     * `cuenta`.
     */
    private toDraftCatalogos(record: UnknownRecord): BorradorCatalogos | null {
        const legacy = this.asRecord(record['catalogos']);
        const personal = this.asRecord(record['datosPersonales']);
        const account = this.asRecord(record['cuenta']);
        const assignment = this.toDraftEstructuraCatalogo(record['adscripcion']);
        const commission = this.toDraftEstructuraCatalogo(record['comision']);

        const catalogos: BorradorCatalogos = {
            sexo: this.readNullableText(legacy ?? {}, ['sexo'])
                ?? this.readNullableText(personal ?? {}, ['sexo']),
            estadoCivil: this.readNullableText(legacy ?? {}, ['estadoCivil'])
                ?? this.readNullableText(personal ?? {}, ['estadoCivil']),
            adscripcion: this.readNullableText(legacy ?? {}, ['adscripcion'])
                ?? this.toEstructuraLabel(assignment),
            comision: this.readNullableText(legacy ?? {}, ['comision'])
                ?? this.toEstructuraLabel(commission),
            tipoUsuario: this.readNullableText(legacy ?? {}, ['tipoUsuario'])
                ?? this.readNullableText(account ?? {}, ['tipoUsuario']),
            sistema: this.readNullableText(legacy ?? {}, ['sistema'])
                ?? this.readNullableText(account ?? {}, ['sistema']),
            // El GET de borradores actual expone la descripción del perfil
            // (por ejemplo, "ADMINISTRADOR"). Se prioriza esa descripción
            // para enlazarla después contra `sistema_perfiles` y mostrar la
            // `clavePerfil` correspondiente sin reemplazar el perfilId.
            perfil: this.readNullableText(account ?? {}, [
                'descripcionPerfil',
                'perfilDescripcion',
            ])
                ?? this.readNullableText(legacy ?? {}, ['perfil'])
                ?? this.readNullableText(account ?? {}, [
                    'perfil',
                    'perfilClave',
                    'clavePerfil',
                ]),
            adscripcionEstructura: assignment,
            comisionEstructura: commission,
        };

        const hasContent = Object.values(catalogos).some((value) => value !== null);

        return hasContent ? catalogos : null;
    }

    private toDraftEstructuraCatalogo(value: unknown): BorradorEstructuraCatalogo | null {
        const record = this.asRecord(value);

        if (!record) {
            return null;
        }

        const estructura: BorradorEstructuraCatalogo = {
            estructuraId: this.readNullableNumber(record, ['estructuraId', 'idEstructura']),
            tipoInstitucionId: this.readNullableNumber(record, ['tipoInstitucionId']),
            tipoInstitucion: this.readNullableText(record, ['tipoInstitucion']),
            estadoId: this.readNullableNumber(record, ['estadoId', 'entidadId']),
            estado: this.readNullableText(record, ['estado', 'entidad']),
            municipioId: this.readNullableNumber(record, ['municipioId', 'municipioAlcaldiaId']),
            municipio: this.readNullableText(record, ['municipio', 'municipioAlcaldia']),
            institucionId: this.readNullableNumber(record, ['institucionId']),
            institucion: this.readNullableText(record, ['institucion']),
            organoId: this.readNullableNumber(record, ['organoId', 'organoDesconcentradoId']),
            organo: this.readNullableText(record, ['organo', 'organoDesconcentrado']),
            unidadId: this.readNullableNumber(record, ['unidadId', 'unidadAdministrativaId']),
            unidad: this.readNullableText(record, ['unidad', 'unidadAdministrativa']),
        };

        return Object.values(estructura).some((field) => field !== null) ? estructura : null;
    }

    /** Etiqueta del nivel más profundo capturado. */
    private toEstructuraLabel(estructura: BorradorEstructuraCatalogo | null): string | null {
        if (!estructura) {
            return null;
        }

        return estructura.unidad ?? estructura.organo ?? estructura.institucion;
    }

    private looksLikeDraftData(value: unknown): boolean {
        const record = this.asRecord(value);
        return Boolean(
            record
            && (
                record['datosPersonales']
                || record['adscripcion']
                || record['medioContacto']
                || record['cuenta']
            ),
        );
    }

    private toDraftData(value: unknown): BorradorDatos | null {
        let parsed = value;

        // Tolerancia para borradores viejos que pudieran haberse persistido
        // serializados; el contrato nuevo se envía y se espera como objeto.
        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed) as unknown;
            } catch {
                return null;
            }
        }

        const record = this.asRecord(parsed);
        if (!record) {
            return null;
        }

        const source = this.looksLikeDraftData(record)
            ? record
            : this.asRecord(record['datos']);

        if (!source || !this.looksLikeDraftData(source)) {
            return null;
        }

        const personal = this.asRecord(source['datosPersonales']) ?? {};
        const assignment = this.asRecord(source['adscripcion']) ?? {};
        const commission = source['comision'] === null
            ? null
            : this.asRecord(source['comision']);
        const contact = this.asRecord(source['medioContacto']) ?? {};
        const account = this.asRecord(source['cuenta']) ?? {};
        const perfiles = this.toDraftProfiles(source['perfiles']);
        const legacySistemaId = this.readNullableNumber(account, ['sistemaId', 'idSistema']);
        const legacyPerfilId = this.readNullableNumber(account, ['perfilId', 'idPerfil']);
        const normalizedProfiles = perfiles.length > 0
            ? perfiles
            : legacySistemaId && legacyPerfilId
                ? [{ idSistema: legacySistemaId, idPerfil: legacyPerfilId }]
                : [];

        return {
            datosPersonales: {
                cuip: this.readNullableText(personal, ['cuip']),
                curp: this.readNullableText(personal, ['curp']),
                rfc: this.readNullableText(personal, ['rfc']),
                nombres: this.readNullableText(personal, ['nombres']),
                primerApellido: this.readNullableText(personal, ['primerApellido']),
                segundoApellido: this.readNullableText(personal, ['segundoApellido']),
                sexoId: this.readNullableNumber(personal, ['sexoId']),
                fechaNacimiento: this.readNullableText(personal, ['fechaNacimiento']),
                estadoCivilId: this.readNullableNumber(personal, ['estadoCivilId']),
            },
            adscripcion: {
                estructuraId: this.readNullableNumber(assignment, ['estructuraId']),
                cargo: this.readNullableText(assignment, ['cargo']),
                funciones: this.readNullableText(assignment, ['funciones']),
                numeroEmpleado: this.readNullableText(assignment, ['numeroEmpleado']),
                fechaInicio: this.readNullableText(assignment, ['fechaInicio']),
            },
            comision: commission
                ? {
                    estructuraId: this.readNullableNumber(commission, ['estructuraId']),
                    cargo: this.readNullableText(commission, ['cargo']),
                    funciones: this.readNullableText(commission, ['funciones']),
                    numeroEmpleado: this.readNullableText(commission, ['numeroEmpleado']),
                    fechaInicio: this.readNullableText(commission, ['fechaInicio']),
                }
                : null,
            medioContacto: {
                correo: this.readNullableText(contact, ['correo']),
                celular: this.readNullableText(contact, ['celular']),
            },
            cuenta: {
                tipoUsuarioId: this.readNullableNumber(account, ['tipoUsuarioId']),
                sistemaId: legacySistemaId,
                perfilId: legacyPerfilId,
            },
            perfiles: normalizedProfiles,
            comentario: this.readNullableText(source, ['comentario']),
        };
    }

    /**
     * Lee el arreglo de perfiles persistido dentro de `datosJson`.
     * Tolera tanto `{ idSistema, idPerfil }` (contrato registro_admin) como
     * `{ sistemaId, perfilId }` para no romper borradores intermedios.
     */
    private toDraftProfiles(value: unknown): readonly BorradorPerfil[] {
        if (!Array.isArray(value)) {
            return [];
        }

        const seen = new Set<string>();
        const result: BorradorPerfil[] = [];

        for (const item of value) {
            const record = this.asRecord(item);
            if (!record) {
                continue;
            }

            const idSistema = this.readNullableNumber(record, ['idSistema', 'sistemaId']);
            const idPerfil = this.readNullableNumber(record, ['idPerfil', 'perfilId']);

            if (!idSistema || !idPerfil) {
                continue;
            }

            const key = `${idSistema}:${idPerfil}`;
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            result.push({ idSistema, idPerfil });
        }

        return result;
    }

    private readNullableText(record: Record<string, unknown>, keys: readonly string[]): string | null {
        const value = this.readText(record, keys);
        return value || null;
    }

    private readNullableNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
        for (const key of keys) {
            const value = Number(record[key]);
            if (Number.isFinite(value) && value > 0) {
                return value;
            }
        }
        return null;
    }

    private toPasswordTemporalResponse(response: unknown, account: string): PasswordTemporalResponse {
        const root = this.asRecord(response);
        const data = this.asRecord(root?.['datos'] ?? root?.['data'] ?? root) ?? {};
        const password = this.readText(data, [
            'passwordTemporal',
            'contrasenaTemporal',
            'contraseñaTemporal',
            'password',
            'claveTemporal',
        ]);

        return {
            mensaje: this.readText(root, ['mensaje', 'message']) || null,
            datos: {
                cuenta: this.readText(data, ['cuenta', 'usuario', 'nombreUsuario']) || account,
                passwordTemporal: password || null,
                fechaExpiracion: this.readText(data, ['fechaExpiracion', 'expiraEn', 'expirationDate']) || null,
            },
        };
    }

    private unwrapResponse<T>(response: ApiResponseDto<T>, fallbackMessage: string): T {
        if (response.success && response.data) {
            return response.data;
        }

        const apiMessage =
            response.errors?.find((error) => error.detail || error.message)?.detail
            ?? response.errors?.find((error) => error.message)?.message
            ?? fallbackMessage;

        throw new Error(apiMessage);
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

    private asRecord(value: unknown): UnknownRecord | null {
        return value !== null && typeof value === 'object' && !Array.isArray(value)
            ? value as UnknownRecord
            : null;
    }

    private readText(record: UnknownRecord | null, keys: readonly string[]): string {
        if (!record) return '';

        for (const key of keys) {
            const value = record[key];
            if (typeof value === 'string' || typeof value === 'number') {
                const text = String(value).trim();

                // El backend serializa algunos nulos como la cadena "null"
                // ("correo": "null", "segundoApellido": "null"). Se descartan
                // para que no lleguen a la pantalla como texto.
                if (text && !this.isNullLiteral(text)) {
                    return text;
                }
            }
        }

        return '';
    }

    private isNullLiteral(value: string): boolean {
        const normalized = value.toLowerCase();

        return normalized === 'null' || normalized === 'undefined';
    }

    private readNumber(record: UnknownRecord | null, keys: readonly string[], fallback: number): number {
        if (!record) return fallback;

        for (const key of keys) {
            const value = Number(record[key]);
            if (Number.isFinite(value)) return value;
        }

        return fallback;
    }

    private normalizeText(value: string | null | undefined): string {
        return String(value ?? '').trim();
    }

    private toNumber(value: number | null | undefined, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }

    private toPositiveNumber(value: unknown): number | null {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }
}