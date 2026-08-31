import { Injectable, signal } from '@angular/core';
import {
  RequestDocument,
  RequestRecord,
  RequestStatus,
  RequestType,
  RequestUserData,
} from '../../domain/models/request-record.model';

export interface CreateMockRequestInput {
  readonly type: RequestType;
  readonly applicant: string;
  readonly username: string;
  readonly email: string;
  readonly curp: string;
  readonly institution: string;
  readonly department: string;
  readonly priority: 'Alta' | 'Media' | 'Baja';
  readonly profiles: readonly string[];
  readonly documents: readonly RequestDocument[];
  readonly description: string;
  readonly userData?: RequestUserData;
}

@Injectable({ providedIn: 'root' })
export class RequestMockStore {
  readonly requests = signal<readonly RequestRecord[]>([
    this.request('SOL-2026-001', 'Alta de usuario', 'María Fernanda López García', 'maria.lopez', 'ML', '#426094', 'SSPC', '06/05/2026 09:14', 'Alta', 'Pendiente', 4),
    this.request('SOL-2026-002', 'Modificación de datos', 'Juan Pablo Ramírez Torres', 'juan.ramirez', 'JR', '#94426c', 'SSPC', '06/05/2026 08:32', 'Media', 'En revisión', 3),
    this.request('SOL-2026-003', 'Cambio de rol', 'Ana Sofía Hernández Ruiz', 'ana.hernandez', 'AH', '#94427a', 'SSPC', '05/05/2026 16:45', 'Media', 'Aprobada', 5),
    this.request('SOL-2026-004', 'Desbloqueo de cuenta', 'Luis Gerardo Méndez Ortiz', 'luis.mendez', 'LM', '#946f42', 'SSPC', '05/05/2026 14:20', 'Alta', 'Pendiente', 2),
    this.request('SOL-2026-005', 'Alta de usuario', 'Claudia Ivonne Pérez Salazar', 'claudia.perez', 'CP', '#799442', 'SSPC', '05/05/2026 11:55', 'Alta', 'Rechazada', 3),
    this.request('SOL-2026-006', 'Restablecimiento de contraseña', 'Diego Alejandro Vargas López', 'diego.vargas', 'DV', '#944248', 'SSPC', '04/05/2026 17:30', 'Baja', 'Aprobada', 4),
    this.request('SOL-2026-007', 'Alta de usuario', 'Valeria Jiménez Castillo', 'valeria.jimenez', 'VJ', '#429471', 'SSPC', '04/05/2026 13:22', 'Media', 'Pendiente', 2),
    this.request('SOL-2026-008', 'Cambio de rol', 'Roberto Luna Castillo', 'roberto.luna', 'RL', '#5f5794', 'SSPC', '03/05/2026 12:18', 'Media', 'Corrección solicitada', 2),
  ]);

  create(input: CreateMockRequestInput): RequestRecord {
    const folio = this.nextFolio();
    const initials = this.initials(input.applicant);
    const createdAt = new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()).replace(',', '');

    const record: RequestRecord = {
      folio,
      type: input.type,
      applicant: input.applicant.trim(),
      applicantUsername: input.username.trim(),
      applicantInitials: initials,
      applicantAvatarColor: '#426094',
      applicantEmail: input.email.trim(),
      curp: input.curp.trim().toUpperCase(),
      institution: input.institution.trim(),
      department: input.department.trim(),
      description: input.description.trim(),
      createdAt,
      priority: input.priority,
      status: 'Pendiente',
      profiles: input.profiles,
      documents: input.documents,
      userData: input.userData,
    };

    this.requests.update((current) => [record, ...current]);
    return record;
  }

  updateDocuments(folio: string, documents: readonly RequestDocument[]): void {
    this.requests.update((current) =>
      current.map((request) => request.folio === folio ? { ...request, documents } : request),
    );
  }

  updateStatus(folio: string, status: RequestStatus): void {
    this.requests.update((current) =>
      current.map((request) => request.folio === folio ? { ...request, status } : request),
    );
  }

  private nextFolio(): string {
    const max = this.requests().reduce((currentMax, request) => {
      const parsed = Number(request.folio.split('-').at(-1) ?? 0);
      return Number.isFinite(parsed) ? Math.max(currentMax, parsed) : currentMax;
    }, 0);

    return `SOL-2026-${String(max + 1).padStart(3, '0')}`;
  }

  private initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'NS';
  }

  private request(
    folio: string,
    type: RequestType,
    applicant: string,
    username: string,
    initials: string,
    color: string,
    institution: string,
    createdAt: string,
    priority: 'Alta' | 'Media' | 'Baja',
    status: RequestStatus,
    documentCount: number,
  ): RequestRecord {
    const sampleNames = [
      ['Identificación oficial.pdf', 'application/pdf', 1_250_000],
      ['Comprobante domicilio.jpg', 'image/jpeg', 980_000],
      ['Curriculum vitae.pdf', 'application/pdf', 2_400_000],
      ['Título profesional.png', 'image/png', 1_600_000],
      ['Oficio de adscripción.pdf', 'application/pdf', 740_000],
    ] as const;

    const documents: readonly RequestDocument[] = sampleNames.slice(0, documentCount).map((item, index) => ({
      id: `${folio}-doc-${index + 1}`,
      name: item[0],
      mimeType: item[1],
      sizeBytes: item[2],
      uploadedAt: createdAt,
      objectUrl: null,
    }));

    const nameParts = applicant.trim().split(/\s+/);
    const secondLastName = nameParts.at(-1) ?? '';
    const lastName = nameParts.length > 1 ? (nameParts.at(-2) ?? '') : '';
    const firstName = nameParts.slice(0, Math.max(1, nameParts.length - 2)).join(' ');
    const curp = `${initials}OG900101MDFPRR07`;
    const profiles = type === 'Alta de usuario' ? ['SIAU · Consulta', 'SIAU · Captura'] : ['SIAU · Consulta'];
    const department = 'Dirección de Administración · Departamento de Recursos Humanos';
    const email = `${username}@siau.local`;
    const userData: RequestUserData = {
      cuip: `CUIP${folio.replace(/\D/g, '').slice(-10)}`,
      curp,
      rfc: `${curp.slice(0, 10)}A01`,
      firstName,
      lastName,
      secondLastName,
      gender: 'Femenino',
      civilStatus: 'Soltero(a)',
      birthDate: '1990-01-01',
      institutionType: 'Federal',
      entity: 'Ciudad de México',
      municipality: 'Cuauhtémoc',
      institution,
      decentralizedBody: 'Órgano Administrativo Desconcentrado',
      administrativeUnit: department,
      position: 'Analista',
      functions: 'Funciones operativas y administrativas relacionadas con el perfil solicitado.',
      admissionDate: '2024-01-15',
      employeeNumber: `EMP-${folio.slice(-3)}`,
      commissionEnabled: false,
      commissionInstitutionType: '',
      commissionEntity: '',
      commissionMunicipality: '',
      commissionInstitution: '',
      commissionDecentralizedBody: '',
      commissionAdministrativeUnit: '',
      commissionAdmissionDate: '',
      email,
      phone: '5512345678',
      profiles: [...profiles],
    };

    return {
      folio,
      type,
      applicant,
      applicantUsername: username,
      applicantInitials: initials,
      applicantAvatarColor: color,
      applicantEmail: email,
      curp,
      institution,
      department,
      description: `Solicitud ${type.toLowerCase()} para ${applicant}. Información de demostración del expediente.`,
      createdAt,
      priority,
      status,
      profiles,
      documents,
      userData,
    };
  }
}
