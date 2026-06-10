import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RequestRecord, RequestStatus, RequestType } from '../../../domain/models/request-record.model';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import {
  RequestDetailModal,
  RequestModalMode,
} from '../../components/request-detail-modal/request-detail-modal';

type StatusTone = 'pending' | 'review' | 'approved' | 'rejected';
type RequestTypeTone = 'primary' | 'info' | 'blue' | 'warning' | 'muted';
type RequestStatusFilter = RequestStatus | 'Todos';

@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [FormsModule, SiauLucideIcon, RequestDetailModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './requests-page.html',
  styleUrl: './requests-page.scss',
})
export class RequestsPage {
  protected readonly searchTerm = signal<string>('');
  protected readonly selectedStatus = signal<RequestStatusFilter>('Todos');
  protected readonly statusFilterOpen = signal<boolean>(false);

  protected readonly selectedRequest = signal<RequestRecord | null>(null);
  protected readonly selectedRequestMode = signal<RequestModalMode>('detail');

  protected readonly statusOptions: readonly RequestStatusFilter[] = [
    'Todos',
    'Pendiente',
    'En revisión',
    'Aprobada',
    'Rechazada',
  ];

  protected readonly requests = signal<readonly RequestRecord[]>([
    {
      folio: 'SOL-2026-001',
      type: 'Alta de usuario',
      applicant: 'Javier Santos Cruz',
      applicantUsername: 'javier.santos',
      applicantInitials: 'JS',
      applicantAvatarColor: '#426094',
      institution: 'SSPC',
      createdAt: '06/05/2026 09:14',
      priority: 'Alta',
      status: 'Pendiente',
    },
    {
      folio: 'SOL-2026-002',
      type: 'Modificación de datos',
      applicant: 'María Fuentes Ríos',
      applicantUsername: 'maria.fuentes',
      applicantInitials: 'MF',
      applicantAvatarColor: '#94426c',
      institution: 'SSPC',
      createdAt: '06/05/2026 08:32',
      priority: 'Media',
      status: 'En revisión',
    },
    {
      folio: 'SOL-2026-003',
      type: 'Cambio de rol',
      applicant: 'Carlos Ruiz Hernández',
      applicantUsername: 'carlos.ruiz',
      applicantInitials: 'CR',
      applicantAvatarColor: '#94427a',
      institution: 'SSPC',
      createdAt: '05/05/2026 16:45',
      priority: 'Media',
      status: 'Aprobada',
    },
    {
      folio: 'SOL-2026-004',
      type: 'Desbloqueo de cuenta',
      applicant: 'Elena Gómez Vargas',
      applicantUsername: 'elena.gomez',
      applicantInitials: 'EG',
      applicantAvatarColor: '#946f42',
      institution: 'SSPC',
      createdAt: '05/05/2026 14:20',
      priority: 'Alta',
      status: 'Rechazada',
    },
    {
      folio: 'SOL-2026-005',
      type: 'Alta de usuario',
      applicant: 'Pedro Morales Salas',
      applicantUsername: 'pedro.morales',
      applicantInitials: 'PM',
      applicantAvatarColor: '#799442',
      institution: 'SSPC',
      createdAt: '05/05/2026 11:55',
      priority: 'Alta',
      status: 'Pendiente',
    },
    {
      folio: 'SOL-2026-006',
      type: 'Restablecimiento de contraseña',
      applicant: 'Diana Reyes Álvarez',
      applicantUsername: 'diana.reyes',
      applicantInitials: 'DR',
      applicantAvatarColor: '#944248',
      institution: 'SSPC',
      createdAt: '04/05/2026 17:30',
      priority: 'Baja',
      status: 'Aprobada',
    },
    {
      folio: 'SOL-2026-007',
      type: 'Alta de usuario',
      applicant: 'Roberto Luna Castillo',
      applicantUsername: 'roberto.luna',
      applicantInitials: 'RL',
      applicantAvatarColor: '#429471',
      institution: 'SSPC',
      createdAt: '04/05/2026 13:22',
      priority: 'Media',
      status: 'En revisión',
    },
    {
      folio: 'SOL-2026-008',
      type: 'Cambio de rol',
      applicant: 'Sofía Hernández Díaz',
      applicantUsername: 'sofia.hernandez',
      applicantInitials: 'SH',
      applicantAvatarColor: '#5f5794',
      institution: 'SSPC',
      createdAt: '03/05/2026 12:18',
      priority: 'Media',
      status: 'Pendiente',
    },
    {
      folio: 'SOL-2026-009',
      type: 'Modificación de datos',
      applicant: 'Andrés Castillo Vera',
      applicantUsername: 'andres.castillo',
      applicantInitials: 'AC',
      applicantAvatarColor: '#3e5c76',
      institution: 'SSPC',
      createdAt: '03/05/2026 10:04',
      priority: 'Baja',
      status: 'Aprobada',
    },
    {
      folio: 'SOL-2026-010',
      type: 'Desbloqueo de cuenta',
      applicant: 'Fernanda Núñez Mora',
      applicantUsername: 'fernanda.nunez',
      applicantInitials: 'FN',
      applicantAvatarColor: '#8b6f42',
      institution: 'SSPC',
      createdAt: '02/05/2026 15:40',
      priority: 'Alta',
      status: 'Rechazada',
    },
    {
      folio: 'SOL-2026-011',
      type: 'Alta de usuario',
      applicant: 'Héctor Vargas Peña',
      applicantUsername: 'hector.vargas',
      applicantInitials: 'HV',
      applicantAvatarColor: '#426094',
      institution: 'SSPC',
      createdAt: '02/05/2026 09:27',
      priority: 'Alta',
      status: 'Pendiente',
    },
    {
      folio: 'SOL-2026-012',
      type: 'Cambio de rol',
      applicant: 'Lucía Flores Méndez',
      applicantUsername: 'lucia.flores',
      applicantInitials: 'LF',
      applicantAvatarColor: '#94426c',
      institution: 'SSPC',
      createdAt: '01/05/2026 18:05',
      priority: 'Media',
      status: 'Aprobada',
    },
  ]);

  protected readonly filteredRequests = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const status = this.selectedStatus();

    return this.requests().filter((request) => {
      const matchesStatus = status === 'Todos' || request.status === status;
      const matchesTerm =
        !term ||
        `${request.folio} ${request.applicant} ${request.applicantUsername} ${request.type}`
          .toLowerCase()
          .includes(term);

      return matchesStatus && matchesTerm;
    });
  });

  protected readonly pendingRequests = computed(() => this.countByStatus('Pendiente'));
  protected readonly reviewRequests = computed(() => this.countByStatus('En revisión'));
  protected readonly approvedRequests = computed(() => this.countByStatus('Aprobada'));
  protected readonly rejectedRequests = computed(() => this.countByStatus('Rechazada'));

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  protected toggleStatusFilter(): void {
    this.statusFilterOpen.update((open) => !open);
  }

  protected closeStatusFilter(): void {
    this.statusFilterOpen.set(false);
  }

  protected setSelectedStatus(status: RequestStatusFilter): void {
    this.selectedStatus.set(status);
    this.statusFilterOpen.set(false);
  }

  protected openRequestDetail(request: RequestRecord): void {
    this.selectedRequestMode.set('detail');
    this.selectedRequest.set(request);
  }

  protected openApproveModal(request: RequestRecord): void {
    this.selectedRequestMode.set('approve');
    this.selectedRequest.set(request);
  }

  protected openRejectModal(request: RequestRecord): void {
    this.selectedRequestMode.set('reject');
    this.selectedRequest.set(request);
  }

  protected closeRequestDetail(): void {
    this.selectedRequest.set(null);
    this.selectedRequestMode.set('detail');
  }

  protected approveRequest(request: RequestRecord): void {
    this.updateRequestStatus(request.folio, 'Aprobada');
    this.closeRequestDetail();
  }

  protected rejectRequest(request: RequestRecord): void {
    this.updateRequestStatus(request.folio, 'Rechazada');
    this.closeRequestDetail();
  }

  protected canResolveRequest(request: RequestRecord): boolean {
    return request.status === 'Pendiente' || request.status === 'En revisión';
  }

  protected getStatusTone(status: RequestStatus): StatusTone {
    if (status === 'Pendiente') return 'pending';
    if (status === 'En revisión') return 'review';
    if (status === 'Aprobada') return 'approved';
    return 'rejected';
  }

  protected getTypeTone(type: RequestType): RequestTypeTone {
    if (type === 'Alta de usuario') return 'primary';
    if (type === 'Modificación de datos') return 'info';
    if (type === 'Cambio de rol') return 'blue';
    if (type === 'Desbloqueo de cuenta') return 'warning';
    return 'muted';
  }

  private countByStatus(status: RequestStatus): number {
    return this.requests().filter((request) => request.status === status).length;
  }

  private updateRequestStatus(folio: string, status: RequestStatus): void {
    this.requests.update((requests) =>
      requests.map((request) => {
        if (request.folio !== folio) return request;

        return {
          ...request,
          status,
        };
      }),
    );
  }
}