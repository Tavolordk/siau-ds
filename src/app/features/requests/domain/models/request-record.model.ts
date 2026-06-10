export type RequestType =
    | 'Alta de usuario'
    | 'Modificación de datos'
    | 'Cambio de rol'
    | 'Desbloqueo de cuenta'
    | 'Restablecimiento de contraseña';

export type RequestStatus = 'Pendiente' | 'En revisión' | 'Aprobada' | 'Rechazada';
export type RequestPriority = 'Alta' | 'Media' | 'Baja';

export interface RequestRecord {
    readonly folio: string;
    readonly type: RequestType;
    readonly applicant: string;
    readonly applicantUsername: string;
    readonly applicantInitials: string;
    readonly applicantAvatarColor: string;
    readonly institution: string;
    readonly createdAt: string;
    readonly priority: RequestPriority;
    readonly status: RequestStatus;
}