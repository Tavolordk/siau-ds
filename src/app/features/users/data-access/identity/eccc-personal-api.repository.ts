import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError, timeout } from 'rxjs';
import { ECCC_PERSONAL_API_BASE_URL } from '../../../../core/http/eccc-personal-api-base-url.token';

/**
 * IMPORTANTE:
 * El contrato del nuevo endpoint ya fue integrado, pero en la información
 * recibida no venía la ruta HTTP exacta. Sustituye únicamente este valor cuando
 * backend confirme la ruta definitiva.
 */
const INTEGRAL_LOOKUP_PATH = '/api/general/consulta';
const INTEGRAL_LOOKUP_TIMEOUT_MS = 15_000;

export interface EcccPersonalLookupRequest {
    readonly curp: string;
    readonly rfc: string;
    readonly cuip: string | null;
    readonly nombre: string;
    readonly primerApellido: string;
    readonly segundoApellido: string;
    readonly fechaNacimiento: string;
}

export interface PersonalData {
    readonly idPersona: number;
    readonly cuip: string;
    readonly curp: string;
    readonly rfc: string;
    readonly nombre: string;
    readonly primerApellido: string;
    readonly segundoApellido: string;
    readonly estatusPersonal: string;
    readonly criterioBusqueda: string;
}

export interface SauUserData {
    readonly idPersona: number;
    readonly idTipoPersona: number | null;
    readonly nombre: string;
    readonly paterno: string;
    readonly materno: string;
    readonly idEstadoCivil: number | null;
    readonly fechaNacimiento: string;
    readonly idPaisNacimiento: number | null;
    readonly idEntidadNacimiento: number | null;
    readonly idMunicipioNacimiento: number | null;
    readonly idNacionalidad: number | null;
    readonly sexo: string;
    readonly cuip: string;
    readonly curp: string;
    readonly rfc: string;
    readonly credencialElector: string | null;
    readonly cartillaSmn: string | null;
    readonly licencia: string | null;
    readonly pasaporte: string | null;
    readonly idEstatus: number | null;
    readonly usuario: string;
}

export interface SauLookupData {
    readonly resultado: string;
    readonly mensaje: string;
    readonly totalResultadosSp: number;
    readonly totalUsuariosValidos: number;
    readonly usuario: SauUserData | null;
}

export interface EcccExamData {
    readonly cuip: string;
    readonly rfc: string;
    readonly resultadoIntegral: string;
    readonly evaluacionDiferenciada: string;
    readonly resultadoConvalidado: string;
    readonly fechaEvaluacion: string;
    readonly fechaVencimiento: string;
    readonly estatusVigencia: string;
}

export interface EcccPersonalLookupResponse {
    readonly personalConsultado: boolean;
    readonly personalEncontrado: boolean;
    readonly personal: readonly PersonalData[];
    readonly sauConsultado: boolean;
    readonly sau: SauLookupData | null;
    readonly ecccConsultado: boolean;
    readonly eccc: EcccExamData | null;
    readonly mensaje: string;
}

@Injectable({ providedIn: 'root' })
export class EcccPersonalApiRepository {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(ECCC_PERSONAL_API_BASE_URL).replace(/\/$/, '');

    /**
     * Consulta Personal, SAU y ECCC mediante el nuevo endpoint integral.
     *
     * El Authorization Bearer NO se agrega aquí de forma manual. Todas las
     * llamadas realizadas con HttpClient pasan por authTokenInterceptor, que
     * toma accessToken de AuthStorage y agrega:
     * Authorization: Bearer <accessToken>
     */
    consultarIntegral(
        request: EcccPersonalLookupRequest,
    ): Observable<EcccPersonalLookupResponse> {
        const payload: EcccPersonalLookupRequest = {
            ...request,
            // CUIP es opcional para la consulta integral. Si no viene
            // capturado, backend requiere null explícito y no cadena vacía.
            cuip: request.cuip?.trim() ? request.cuip.trim().toUpperCase() : null,
        };

        return this.http
            .post<EcccPersonalLookupResponse>(
                `${this.baseUrl}${INTEGRAL_LOOKUP_PATH}`,
                payload,
            )
            .pipe(
                timeout(INTEGRAL_LOOKUP_TIMEOUT_MS),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible consultar la información de Personal, SAU y ECCC.',
                    ),
                ),
            );
    }

    private handleError(
        error: unknown,
        fallbackMessage: string,
    ): Observable<never> {
        if (error instanceof Error && error.name === 'TimeoutError') {
            return throwError(
                () =>
                    new Error(
                        'La consulta de Personal, SAU y ECCC excedió el tiempo de espera. Intenta nuevamente.',
                    ),
            );
        }

        if (error instanceof HttpErrorResponse) {
            const apiError = error.error as
                | {
                    mensaje?: string | null;
                    message?: string | null;
                    error?: string | null;
                }
                | string
                | null;

            const apiMessage =
                typeof apiError === 'string'
                    ? apiError.trim()
                    : String(apiError?.mensaje ?? '').trim() ||
                    String(apiError?.message ?? '').trim() ||
                    String(apiError?.error ?? '').trim();

            const statusMessage = this.getHttpStatusMessage(error.status, fallbackMessage);
            const message = apiMessage || statusMessage;

            return throwError(() => new Error(message));
        }

        if (error instanceof Error) {
            return throwError(() => error);
        }

        return throwError(() => new Error(fallbackMessage));
    }

    private getHttpStatusMessage(status: number, fallbackMessage: string): string {
        switch (status) {
            case 0:
                return 'No fue posible conectar con el servicio de Personal, SAU y ECCC. Verifica tu conexión o intenta nuevamente.';
            case 400:
                return 'La solicitud de consulta contiene datos inválidos.';
            case 401:
                return 'La sesión expiró o el token de acceso ya no es válido. Inicia sesión nuevamente.';
            case 403:
                return 'No tienes permisos para consultar Personal, SAU y ECCC.';
            case 404:
                return 'El servicio de consulta integral no está disponible en la ruta configurada.';
            case 408:
                return 'El servidor agotó el tiempo de espera al procesar la consulta. Intenta nuevamente.';
            case 429:
                return 'Se realizaron demasiadas consultas. Espera un momento e intenta nuevamente.';
            case 500:
                return 'El servicio de consulta integral presentó un error interno.';
            case 502:
                return 'El servicio de consulta integral recibió una respuesta inválida de un servicio dependiente.';
            case 503:
                return 'El servicio de consulta integral no está disponible temporalmente.';
            case 504:
                return 'El servicio de consulta integral agotó el tiempo de espera al comunicarse con otro servicio.';
            default:
                return fallbackMessage;
        }
    }
}
