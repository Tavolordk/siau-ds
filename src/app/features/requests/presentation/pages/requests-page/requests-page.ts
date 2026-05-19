import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  RequestPriority,
  RequestRecord,
  RequestStatus,
} from '../../../domain/models/request-record.model';
import { RequestDetailModal } from '../../components/request-detail-modal/request-detail-modal';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [FormsModule, MatIconModule, RequestDetailModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './requests-page.html',
  styleUrl: './requests-page.scss',
})
export class RequestsPage {
  protected readonly searchTerm = signal<string>('');
  protected readonly selectedRequest = signal<RequestRecord | null>(null);

  protected readonly requests = signal<readonly RequestRecord[]>([
    {
      folio: 'SOL-2026-0001',
      type: 'Alta de usuario',
      applicant: 'Ana Martínez López',
      institution: 'Secretaría de Seguridad Pública',
      createdAt: '15/05/2026',
      priority: 'Alta',
      status: 'Pendiente',
    },
    {
      folio: 'SOL-2026-0002',
      type: 'Modificación',
      applicant: 'Carlos Ruiz Hernández',
      institution: 'Guardia Nacional',
      createdAt: '15/05/2026',
      priority: 'Media',
      status: 'En revisión',
    },
    {
      folio: 'SOL-2026-0003',
      type: 'Baja de usuario',
      applicant: 'Elena Gómez Vargas',
      institution: 'Fiscalía General',
      createdAt: '14/05/2026',
      priority: 'Baja',
      status: 'Aprobada',
    },
    {
      folio: 'SOL-2026-0004',
      type: 'Reactivación',
      applicant: 'Miguel Ángel Torres',
      institution: 'Secretariado Ejecutivo',
      createdAt: '14/05/2026',
      priority: 'Alta',
      status: 'Rechazada',
    },
    {
      folio: 'SOL-2026-0005',
      type: 'Alta de usuario',
      applicant: 'Laura Pérez Soto',
      institution: 'Policía Estatal',
      createdAt: '13/05/2026',
      priority: 'Media',
      status: 'Pendiente',
    },
  ]);

  protected readonly filteredRequests = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();

    if (!term) {
      return this.requests();
    }

    return this.requests().filter((request) => {
      const value = `${request.folio} ${request.type} ${request.applicant} ${request.institution}`.toLowerCase();
      return value.includes(term);
    });
  });

  protected readonly pendingRequests = computed(() => {
    return this.requests().filter((request) => request.status === 'Pendiente').length;
  });

  protected readonly reviewRequests = computed(() => {
    return this.requests().filter((request) => request.status === 'En revisión').length;
  });

  protected readonly approvedRequests = computed(() => {
    return this.requests().filter((request) => request.status === 'Aprobada').length;
  });

  protected readonly rejectedRequests = computed(() => {
    return this.requests().filter((request) => request.status === 'Rechazada').length;
  });

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  protected openRequestDetail(request: RequestRecord): void {
    this.selectedRequest.set(request);
  }

  protected closeRequestDetail(): void {
    this.selectedRequest.set(null);
  }

  protected approveRequest(request: RequestRecord): void {
    this.updateRequestStatus(request.folio, 'Aprobada');
  }

  protected rejectRequest(request: RequestRecord): void {
    this.updateRequestStatus(request.folio, 'Rechazada');
  }

  protected getPriorityTone(priority: RequestPriority): BadgeTone {
    if (priority === 'Alta') {
      return 'danger';
    }

    if (priority === 'Media') {
      return 'warning';
    }

    return 'neutral';
  }

  protected getStatusTone(status: RequestStatus): BadgeTone {
    if (status === 'Aprobada') {
      return 'success';
    }

    if (status === 'Pendiente') {
      return 'warning';
    }

    if (status === 'En revisión') {
      return 'info';
    }

    return 'danger';
  }

  private updateRequestStatus(folio: string, status: RequestStatus): void {
    this.requests.update((requests) => {
      return requests.map((request) => {
        if (request.folio !== folio) {
          return request;
        }

        const updatedRequest: RequestRecord = {
          ...request,
          status,
        };

        this.selectedRequest.set(updatedRequest);
        return updatedRequest;
      });
    });
  }
}