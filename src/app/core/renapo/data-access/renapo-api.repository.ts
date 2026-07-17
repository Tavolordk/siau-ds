import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { RENAPO_API_BASE_URL } from '../../http/renapo-api-base-url.token';
import { RenapoCurpRequest, RenapoCurpResponse } from '../domain/renapo.model';
import { RenapoRepository } from '../domain/renapo.repository';

const CURP_PATH = '/api/v1/renapo/curp';

@Injectable({ providedIn: 'root' })
export class RenapoApiRepository implements RenapoRepository {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(RENAPO_API_BASE_URL).replace(/\/$/, '');

    consultarCurp(curp: string): Observable<RenapoCurpResponse> {
        const request: RenapoCurpRequest = {
            Curp: curp.trim().toUpperCase(),
        };

        return this.http
            .post<RenapoCurpResponse>(`${this.baseUrl}${CURP_PATH}`, request)
            .pipe(
                catchError((error: HttpErrorResponse) =>
                    throwError(() => new Error(this.getErrorMessage(error))),
                ),
            );
    }

    private getErrorMessage(error: HttpErrorResponse): string {
        const apiError = error.error as
            | {
                mensaje?: string;
                message?: string;
                error?: string;
            }
            | null;

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
            return 'No fue posible conectar con el servicio de RENAPO.';
        }

        return 'No fue posible consultar la CURP en RENAPO.';
    }
}