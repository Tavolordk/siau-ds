import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { ECCC_PERSONAL_API_BASE_URL } from '../../../core/http/eccc-personal-api-base-url.token';

const ECCC_EXAM_PATH = '/api/sqlserver/examen/consultar';
const PERSONAL_PATH = '/api/oracle/personal/consultar';

export interface EcccPersonalLookupRequest {
    readonly cuip: string;
    readonly nombre: string;
    readonly primerApellido: string;
    readonly segundoApellido: string;
    readonly rfc: string;
}

export interface EcccExamData {
    readonly cuip: string;
    readonly nombre: string;
    readonly primerApellido: string;
    readonly segundoApellido: string;
    readonly rfc: string;
    readonly estatusExamen: string;
    readonly fechaExamen: string;
    readonly fechaVencimiento: string;
    readonly vigencia: string;
    readonly estatusActual: string;
}

export interface PersonalData {
    readonly cuip: string;
    readonly nombre: string;
    readonly primerApellido: string;
    readonly segundoApellido: string;
    readonly rfc: string;
    readonly estatusPersonal: string;
}

interface EcccPersonalApiResponse<T> {
    readonly status: boolean;
    readonly mensaje?: string | null;
    readonly datos?: T | null;
    readonly errores?: unknown;
}

@Injectable({ providedIn: 'root' })
export class EcccPersonalApiRepository {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(ECCC_PERSONAL_API_BASE_URL).replace(/\/$/, '');

    consultarEccc(request: EcccPersonalLookupRequest): Observable<EcccExamData> {
        return this.http
            .post<EcccPersonalApiResponse<EcccExamData>>(
                `${this.baseUrl}${ECCC_EXAM_PATH}`,
                request,
            )
            .pipe(
                map((response) =>
                    this.unwrapResponse(
                        response,
                        'No fue posible consultar la información de ECCC.',
                    ),
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible consultar la información de ECCC.',
                    ),
                ),
            );
    }

    consultarPersonal(request: EcccPersonalLookupRequest): Observable<PersonalData> {
        return this.http
            .post<EcccPersonalApiResponse<PersonalData>>(
                `${this.baseUrl}${PERSONAL_PATH}`,
                request,
            )
            .pipe(
                map((response) =>
                    this.unwrapResponse(
                        response,
                        'No fue posible consultar el estatus del personal.',
                    ),
                ),
                catchError((error: unknown) =>
                    this.handleError(
                        error,
                        'No fue posible consultar el estatus del personal.',
                    ),
                ),
            );
    }

    private unwrapResponse<T>(
        response: EcccPersonalApiResponse<T>,
        fallbackMessage: string,
    ): T {
        if (response.status && response.datos) {
            return response.datos;
        }

        throw new Error(String(response.mensaje ?? '').trim() || fallbackMessage);
    }

    private handleError(
        error: unknown,
        fallbackMessage: string,
    ): Observable<never> {
        if (error instanceof Error && !(error instanceof HttpErrorResponse)) {
            return throwError(() => error);
        }

        if (error instanceof HttpErrorResponse) {
            const apiError = error.error as
                | {
                    mensaje?: string | null;
                    message?: string | null;
                    error?: string | null;
                }
                | null;

            const message =
                String(apiError?.mensaje ?? '').trim() ||
                String(apiError?.message ?? '').trim() ||
                String(apiError?.error ?? '').trim() ||
                (error.status === 0
                    ? 'No fue posible conectar con el servicio de ECCC y Personal.'
                    : fallbackMessage);

            return throwError(() => new Error(message));
        }

        return throwError(() => new Error(fallbackMessage));
    }
}
