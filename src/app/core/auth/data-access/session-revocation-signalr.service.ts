import { inject, Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { SESIONES_API_BASE_URL } from '../../http/sesiones-api-base-url.token';
import { SessionRevokedEvent } from '../domain/session-revocation.model';
import { AuthStorage } from './auth.storage';

const SESSIONS_HUB_PATH = '/hubs/sesiones';
const SESSION_REVOKED_EVENT = 'SesionRevocada';
const INITIAL_CONNECTION_RETRY_MS = 5000;

@Injectable({ providedIn: 'root' })
export class SessionRevocationSignalRService {
    private readonly authStorage = inject(AuthStorage);
    private readonly baseUrl = inject(SESIONES_API_BASE_URL).replace(/\/$/, '');

    private connection: signalR.HubConnection | null = null;
    private connectionPromise: Promise<void> | null = null;
    private retryTimerId: ReturnType<typeof setTimeout> | null = null;

    readonly sessionRevoked$ = new Subject<SessionRevokedEvent>();

    async connect(): Promise<void> {
        const accessToken = this.authStorage.session()?.accessToken?.trim();

        if (!accessToken) {
            await this.disconnect();
            return;
        }

        this.clearRetryTimer();

        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        if (
            this.connection?.state === signalR.HubConnectionState.Connected ||
            this.connection?.state === signalR.HubConnectionState.Reconnecting
        ) {
            return;
        }

        if (this.connection) {
            await this.disconnect();
        }

        const connection = this.createConnection();
        this.connection = connection;

        let startPromise: Promise<void>;
        startPromise = connection
            .start()
            .catch((error: unknown) => {
                if (this.connection === connection) {
                    this.connection = null;
                }

                this.scheduleInitialConnectionRetry();
                throw error;
            })
            .finally(() => {
                if (this.connectionPromise === startPromise) {
                    this.connectionPromise = null;
                }
            });

        this.connectionPromise = startPromise;
        return startPromise;
    }

    async disconnect(): Promise<void> {
        this.clearRetryTimer();

        const connection = this.connection;

        this.connection = null;
        this.connectionPromise = null;

        if (!connection) {
            return;
        }

        connection.off(SESSION_REVOKED_EVENT);

        if (connection.state === signalR.HubConnectionState.Disconnected) {
            return;
        }

        try {
            await connection.stop();
        } catch (error: unknown) {
            console.warn('[SessionSignalR] No fue posible cerrar limpiamente la conexión.', error);
        }
    }

    private createConnection(): signalR.HubConnection {
        const connection = new signalR.HubConnectionBuilder()
            .withUrl(`${this.baseUrl}${SESSIONS_HUB_PATH}`, {
                accessTokenFactory: () => this.authStorage.session()?.accessToken ?? '',
            })
            .withAutomaticReconnect([0, 2000, 5000, 10000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        connection.on(SESSION_REVOKED_EVENT, (rawEvent: unknown) => {
            this.sessionRevoked$.next(this.normalizeEvent(rawEvent));
        });

        connection.onreconnected(() => {
            this.clearRetryTimer();
            console.info('[SessionSignalR] Reconectado a /hubs/sesiones.');
        });

        connection.onclose((error) => {
            if (this.authStorage.session()?.accessToken) {
                if (error) {
                    console.warn('[SessionSignalR] La conexión con /hubs/sesiones se cerró.', error);
                }

                this.scheduleInitialConnectionRetry();
            }
        });

        return connection;
    }


    private scheduleInitialConnectionRetry(): void {
        if (this.retryTimerId || !this.authStorage.session()?.accessToken) {
            return;
        }

        this.retryTimerId = setTimeout(() => {
            this.retryTimerId = null;

            if (!this.authStorage.session()?.accessToken) {
                return;
            }

            void this.connect().catch((error: unknown) => {
                console.warn('[SessionSignalR] Reintento de conexión al hub fallido.', error);
            });
        }, INITIAL_CONNECTION_RETRY_MS);
    }

    private clearRetryTimer(): void {
        if (!this.retryTimerId) {
            return;
        }

        clearTimeout(this.retryTimerId);
        this.retryTimerId = null;
    }

    private normalizeEvent(rawEvent: unknown): SessionRevokedEvent {
        const source = this.toRecord(rawEvent);

        return {
            usuarioId: this.toPositiveNumber(source['usuarioId'] ?? source['UsuarioId']) ?? 0,
            motivo: this.toStringValue(source['motivo'] ?? source['Motivo']),
            mensaje: this.toStringValue(source['mensaje'] ?? source['Mensaje']),
            fechaUtc: this.toStringValue(source['fechaUtc'] ?? source['FechaUtc']),
        };
    }

    private toRecord(value: unknown): Record<string, unknown> {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    }

    private toPositiveNumber(value: unknown): number | null {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    private toStringValue(value: unknown): string {
        return value === undefined || value === null ? '' : String(value).trim();
    }
}
