import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SESIONES_API_BASE_URL } from '../../http/sesiones-api-base-url.token';
import {
    SessionRevocationReason,
    SessionRevocationResponse,
} from '../domain/session-revocation.model';

@Injectable({ providedIn: 'root' })
export class SessionRevocationApi {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(SESIONES_API_BASE_URL).replace(/\/$/, '');

    revoke(
        usuarioId: number,
        motivo: SessionRevocationReason,
    ): Observable<SessionRevocationResponse> {
        return this.http.post<SessionRevocationResponse>(
            `${this.baseUrl}/api/v1/sesiones/${encodeURIComponent(String(usuarioId))}/revocar`,
            { motivo },
        );
    }
}
