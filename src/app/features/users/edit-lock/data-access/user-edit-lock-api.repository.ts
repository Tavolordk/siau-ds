import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { BLOQUEOS_API_BASE_URL } from '../../../../core/http/bloqueos-api-base-url.token';
import {
    AcquireUserEditLockCommand,
    ReleaseUserEditLockCommand,
    RenewUserEditLockCommand,
    UserEditLock,
    UserEditLockConflictError,
} from '../domain/user-edit-lock.model';
import { UserEditLockRepository } from '../domain/user-edit-lock.repository';

const USER_LOCKS_PATH = '/api/v1/usuarios/bloqueos';
const USER_LOCK_PATH = (usuarioId: number) => `/api/v1/usuarios/${encodeURIComponent(String(usuarioId))}/bloqueo`;
const USER_LOCK_HEARTBEAT_PATH = (usuarioId: number) => `${USER_LOCK_PATH(usuarioId)}/heartbeat`;

@Injectable()
export class UserEditLockApiRepository extends UserEditLockRepository {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(BLOQUEOS_API_BASE_URL).replace(/\/$/, '');

    list(): Observable<readonly UserEditLock[]> {
        return this.http.get<unknown>(`${this.baseUrl}${USER_LOCKS_PATH}`).pipe(
            map((response) => this.normalizeList(response)),
            catchError((error: unknown) => this.handleError(error, 'No fue posible consultar los bloqueos de edición.')),
        );
    }

    acquire(usuarioId: number, command: AcquireUserEditLockCommand): Observable<UserEditLock> {
        return this.http.post<unknown>(`${this.baseUrl}${USER_LOCK_PATH(usuarioId)}`, command).pipe(
            map((response) => this.normalizeLock(response, usuarioId, command.clienteId)),
            catchError((error: unknown) => this.handleLockError(error, usuarioId)),
        );
    }

    renew(usuarioId: number, command: RenewUserEditLockCommand): Observable<UserEditLock> {
        return this.http.put<unknown>(`${this.baseUrl}${USER_LOCK_HEARTBEAT_PATH(usuarioId)}`, command).pipe(
            map((response) => this.normalizeLock(response, usuarioId, command.clienteId, command.tokenBloqueo)),
            catchError((error: unknown) => this.handleLockError(error, usuarioId)),
        );
    }

    release(usuarioId: number, command: ReleaseUserEditLockCommand): Observable<void> {
        return this.http.delete<unknown>(`${this.baseUrl}${USER_LOCK_PATH(usuarioId)}`, { body: command }).pipe(
            map(() => void 0),
            catchError((error: unknown) => this.handleError(error, 'No fue posible liberar el bloqueo de edición.')),
        );
    }

    private normalizeList(raw: unknown): readonly UserEditLock[] {
        if (Array.isArray(raw)) return raw.map((item) => this.normalizeLock(item));
        if (!this.isRecord(raw)) return [];

        const nested = raw['data'] ?? raw['datos'] ?? raw['bloqueos'] ?? raw['items'];
        return Array.isArray(nested) ? nested.map((item) => this.normalizeLock(item)) : [];
    }

    private normalizeLock(
        raw: unknown,
        usuarioIdFallback = 0,
        clienteIdFallback: string | null = null,
        tokenFallback: string | null = null,
    ): UserEditLock {
        const source = this.unwrapObject(raw);
        const pick = (...names: string[]): unknown => {
            for (const name of names) {
                if (source[name] !== undefined) return source[name];
            }
            return undefined;
        };
        const status = pick('estatus', 'Estatus', 'status', 'Status');

        return {
            usuarioId: this.asNumber(pick('usuarioId', 'UsuarioId')) ?? usuarioIdFallback,
            bloqueadoPorUsuarioId: this.asNumber(pick('bloqueadoPorUsuarioId', 'BloqueadoPorUsuarioId')),
            bloqueadoPorNombre: this.asString(pick('bloqueadoPorNombre', 'BloqueadoPorNombre')),
            fechaBloqueoUtc: this.asString(pick('fechaBloqueoUtc', 'FechaBloqueoUtc', 'fechaBloqueo', 'FechaBloqueo')),
            ultimaActividadUtc: this.asString(pick('ultimaActividadUtc', 'UltimaActividadUtc', 'ultimaActividad', 'UltimaActividad')),
            expiraEnUtc: this.asString(pick('expiraEnUtc', 'ExpiraEnUtc', 'expiraEn', 'ExpiraEn')),
            clienteId: this.asString(pick('clienteId', 'ClienteId')) ?? clienteIdFallback,
            tokenBloqueo: this.asString(pick('tokenBloqueo', 'TokenBloqueo')) ?? tokenFallback,
            codigo: this.asString(pick('codigo', 'Codigo')),
            mensaje: this.asString(pick('mensaje', 'Mensaje', 'message', 'Message')),
            estatus: status === undefined || status === null
                ? null
                : status === true || status === 1 || status === '1' || status === 'true',
        };
    }

    private handleLockError(error: unknown, usuarioId: number): Observable<never> {
        if (error instanceof HttpErrorResponse && (error.status === 409 || error.status === 423)) {
            const lock = this.normalizeLock(error.error, usuarioId);
            return throwError(() => new UserEditLockConflictError(lock, lock.mensaje || 'El usuario ya está siendo editado por otra sesión.'));
        }

        if (error instanceof HttpErrorResponse && this.looksLikeLock(error.error)) {
            const lock = this.normalizeLock(error.error, usuarioId);
            return throwError(() => new UserEditLockConflictError(lock));
        }

        return this.handleError(error, 'No fue posible obtener el bloqueo para editar este usuario.');
    }

    private handleError(error: unknown, fallbackMessage: string): Observable<never> {
        if (error instanceof Error && !(error instanceof HttpErrorResponse)) {
            return throwError(() => error);
        }
        if (!(error instanceof HttpErrorResponse)) {
            return throwError(() => new Error(fallbackMessage));
        }

        const body = this.unwrapObject(error.error);
        const detail = this.asString(body['detail'])
            ?? this.asString(body['mensaje'])
            ?? this.asString(body['message'])
            ?? this.asString(body['error']);

        if (detail) return throwError(() => new Error(detail));
        if (error.status === 0) return throwError(() => new Error('No fue posible conectar con el servicio de bloqueos.'));
        if (error.status === 401) return throwError(() => new Error('Tu sesión no está autorizada para bloquear la edición.'));
        if (error.status === 403) return throwError(() => new Error('No tienes permisos para editar este usuario.'));
        if (error.status === 404) return throwError(() => new Error('No se encontró el usuario que intentas editar.'));
        if (error.status === 409 || error.status === 423) return throwError(() => new Error('El usuario ya está siendo editado por otra sesión.'));
        return throwError(() => new Error(fallbackMessage));
    }

    private looksLikeLock(value: unknown): boolean {
        const source = this.unwrapObject(value);
        return source['usuarioId'] !== undefined
            || source['UsuarioId'] !== undefined
            || source['bloqueadoPorUsuarioId'] !== undefined
            || source['BloqueadoPorUsuarioId'] !== undefined
            || source['codigo'] !== undefined
            || source['Codigo'] !== undefined;
    }

    private unwrapObject(raw: unknown): Record<string, unknown> {
        if (!this.isRecord(raw)) return {};
        const nested = raw['data'] ?? raw['datos'];
        return this.isRecord(nested) ? nested : raw;
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    private asString(value: unknown): string | null {
        if (value === undefined || value === null || value === '') return null;
        return String(value);
    }

    private asNumber(value: unknown): number | null {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
}
