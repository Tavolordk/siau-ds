import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { CAPTCHA_API_BASE_URL } from '../../http/captcha-api-base-url.token';
import {
    CaptchaChallenge,
    CaptchaGenerationOptions,
    CaptchaVerification,
    CaptchaVerifyCommand,
} from '../domain/captcha.model';
import { CaptchaRepository } from '../domain/captcha.repository';

const DEFAULT_CAPTCHA_OPTIONS: Required<CaptchaGenerationOptions> = {
    colorFondoHex: '#D3DEEA',
    ttlSegundos: 120,
    longitud: 6,
};

interface CaptchaResponseDto {
    id: string | null;
    imageBase64: string | null;
    ttlSeconds: number;
}

interface CaptchaVerifyResponseDto {
    ok: boolean;
    token: string | null;
}

interface ProblemDetailsDto {
    title?: string | null;
    detail?: string | null;
    status?: number | null;
}

@Injectable()
export class CaptchaApiRepository extends CaptchaRepository {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(CAPTCHA_API_BASE_URL).replace(/\/$/, '');

    override generate(options: CaptchaGenerationOptions = DEFAULT_CAPTCHA_OPTIONS): Observable<CaptchaChallenge> {
        const params = this.createParams({ ...DEFAULT_CAPTCHA_OPTIONS, ...options });

        return this.http.get<CaptchaResponseDto>(`${this.baseUrl}/api/captcha`, { params }).pipe(
            map((response) => this.toChallenge(response)),
            catchError((error: unknown) => this.handleError(error, 'No se pudo generar el captcha.')),
        );
    }

    override verify(command: CaptchaVerifyCommand): Observable<CaptchaVerification> {
        return this.http
            .post<CaptchaVerifyResponseDto>(`${this.baseUrl}/api/captcha/verify`, {
                id: command.id,
                answer: command.answer,
            })
            .pipe(
                map((response) => ({
                    ok: response.ok,
                    token: response.token ?? null,
                })),
                catchError((error: unknown) => this.handleError(error, 'No se pudo validar el captcha.')),
            );
    }

    private createParams(options: Required<CaptchaGenerationOptions>): HttpParams {
        return new HttpParams()
            .set('colorFondoHex', options.colorFondoHex)
            .set('ttlSegundos', options.ttlSegundos)
            .set('longitud', options.longitud);
    }

    private toChallenge(response: CaptchaResponseDto): CaptchaChallenge {
        if (!response.id || !response.imageBase64) {
            throw new Error('La respuesta del servicio de captcha no contiene id o imagen.');
        }

        return {
            id: response.id,
            imageBase64: response.imageBase64,
            imageDataUrl: this.toDataUrl(response.imageBase64),
            ttlSeconds: response.ttlSeconds,
            expiresAt: new Date(Date.now() + response.ttlSeconds * 1000),
        };
    }

    private toDataUrl(imageBase64: string): string {
        if (imageBase64.startsWith('data:image/')) {
            return imageBase64;
        }

        return `data:image/png;base64,${imageBase64}`;
    }

    private handleError(error: unknown, fallbackMessage: string): Observable<never> {
        if (error instanceof HttpErrorResponse) {
            const problem = error.error as ProblemDetailsDto | null;
            const message = problem?.detail || problem?.title || fallbackMessage;

            return throwError(() => new Error(message));
        }

        if (error instanceof Error) {
            return throwError(() => error);
        }

        return throwError(() => new Error(fallbackMessage));
    }
}