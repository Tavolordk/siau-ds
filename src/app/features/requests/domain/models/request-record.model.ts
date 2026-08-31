export type RequestType =
  | 'Alta de usuario'
  | 'Modificación de datos'
  | 'Cambio de rol'
  | 'Desbloqueo de cuenta'
  | 'Restablecimiento de contraseña';

export type RequestStatus =
  | 'Pendiente'
  | 'En revisión'
  | 'Corrección solicitada'
  | 'Aprobada'
  | 'Rechazada';

export type RequestPriority = 'Alta' | 'Media' | 'Baja';

export type RequestDocumentMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface RequestDocument {
  readonly id: string;
  readonly name: string;
  readonly mimeType: RequestDocumentMimeType;
  readonly sizeBytes: number;
  readonly uploadedAt: string;
  readonly objectUrl?: string | null;
}

export interface RequestRecord {
  readonly folio: string;
  readonly type: RequestType;
  readonly applicant: string;
  readonly applicantUsername: string;
  readonly applicantInitials: string;
  readonly applicantAvatarColor: string;
  readonly applicantEmail?: string | null;
  readonly curp?: string | null;
  readonly institution: string;
  readonly department?: string | null;
  readonly description?: string | null;
  readonly createdAt: string;
  readonly priority: RequestPriority;
  readonly status: RequestStatus;
  readonly profiles?: readonly string[];
  readonly documents?: readonly RequestDocument[];
}
