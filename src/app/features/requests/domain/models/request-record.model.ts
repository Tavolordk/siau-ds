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

/**
 * Mismos datos funcionales que se capturan en el modal de alta de Usuario.
 * Solicitudes reutiliza estos campos y agrega únicamente expediente documental,
 * motivo de la solicitud y resolución/revisión.
 */
export interface RequestUserData {
  cuip: string;
  curp: string;
  rfc: string;
  firstName: string;
  lastName: string;
  secondLastName: string;
  gender: string;
  civilStatus: string;
  birthDate: string;

  institutionType: string;
  entity: string;
  municipality: string;
  institution: string;
  decentralizedBody: string;
  administrativeUnit: string;
  position: string;
  functions: string;
  admissionDate: string;
  employeeNumber: string;

  commissionEnabled: boolean;
  commissionInstitutionType: string;
  commissionEntity: string;
  commissionMunicipality: string;
  commissionInstitution: string;
  commissionDecentralizedBody: string;
  commissionAdministrativeUnit: string;
  commissionAdmissionDate: string;

  email: string;
  phone: string;
  profiles: string[];
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
  readonly userData?: RequestUserData;
}
