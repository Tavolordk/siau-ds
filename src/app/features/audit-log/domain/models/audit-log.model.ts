export type AuditEventType = 'Acceso' | 'Registro' | 'Actualización' | 'Eliminación' | 'Seguridad';
export type AuditSeverity = 'Informativo' | 'Advertencia' | 'Crítico';

export interface AuditLogRecord {
    readonly id: string;
    readonly user: string;
    readonly event: string;
    readonly type: AuditEventType;
    readonly module: string;
    readonly date: string;
    readonly ipAddress: string;
    readonly severity: AuditSeverity;
}