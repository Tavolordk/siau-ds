export type SessionRevocationReason = 'BAJA_CUENTA' | 'SUSPENSION_CUENTA';

export interface SessionRevocationRequest {
    motivo: SessionRevocationReason;
}

export interface SessionRevocationResponse {
    mensaje: string;
    datos: {
        usuarioId: number;
        motivo: string;
    };
}

export interface SessionRevokedEvent {
    usuarioId: number;
    motivo: string;
    mensaje: string;
    fechaUtc: string;
}
