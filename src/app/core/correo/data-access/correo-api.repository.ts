import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { CORREO_API_BASE_URL } from '../../http/correo-api-base-url.token';
import {
    CorreoDeliveryResult,
    CorreoRequest,
    CorreoResponseApiResponse,
} from '../domain/correo.model';

const CORREOS_PATH = '/correo/api/v1/correos';

interface CorreoErrorResponse {
    readonly message?: string | null;
    readonly errors?: Readonly<Record<string, readonly string[]>> | null;
}

@Injectable({ providedIn: 'root' })
export class CorreoApiRepository {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(CORREO_API_BASE_URL).replace(/\/$/, '');

    send(request: CorreoRequest): Observable<CorreoDeliveryResult> {
        const recipients = request.to
            .map((recipient) => this.toText(recipient))
            .filter(Boolean);

        if (recipients.length === 0) {
            return throwError(() => new Error('Captura al menos un destinatario para el correo de acceso.'));
        }

        return this.http
            .post<CorreoResponseApiResponse>(
                `${this.baseUrl}${CORREOS_PATH}`,
                {
                    ...request,
                    to: recipients,
                },
            )
            .pipe(
                map((response) => this.toDeliveryResult(response)),
                catchError((error: unknown) =>
                    this.handleError(error, 'No fue posible solicitar el envío del correo de acceso.'),
                ),
            );
    }

    private toDeliveryResult(response: CorreoResponseApiResponse | null | undefined): CorreoDeliveryResult {
        if (!response?.success) {
            throw new Error(
                this.toText(response?.message) ||
                'El servicio de correo no aceptó el envío de las credenciales.',
            );
        }

        const data = response.data;
        const status = this.toText(data?.estado) || null;

        return {
            accepted: true,
            message:
                this.toText(response.message) ||
                (status
                    ? `El servicio institucional registró el correo con estado ${status}.`
                    : 'El servicio institucional aceptó el correo de acceso.'),
            status,
            correoId: this.toText(data?.correoId) || null,
            recipientCount: Number(data?.totalDestinatarios) || 0,
            acceptedAtUtc: this.toText(data?.fechaAceptacionUtc) || null,
            traceId: this.toText(response.traceId) || null,
        };
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
        const response = error.error as CorreoErrorResponse | null;
        const fieldError = Object.values(response?.errors ?? {})
            .flat()
            .map((message) => this.toText(message))
            .find(Boolean);

        return this.toText(response?.message) || fieldError || fallbackMessage;
    }

    private toText(value: unknown): string {
        return value === null || value === undefined ? '' : String(value).trim();
    }
}