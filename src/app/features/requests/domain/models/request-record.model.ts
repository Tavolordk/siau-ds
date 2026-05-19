export type RequestType = 'Alta de usuario' | 'Modificación' | 'Baja de usuario' | 'Reactivación';
export type RequestStatus = 'Pendiente' | 'En revisión' | 'Aprobada' | 'Rechazada';
export type RequestPriority = 'Alta' | 'Media' | 'Baja';

export interface RequestRecord {
    readonly folio: string;
    readonly type: RequestType;
    readonly applicant: string;
    readonly institution: string;
    readonly createdAt: string;
    readonly priority: RequestPriority;
    readonly status: RequestStatus;
}