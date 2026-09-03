import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RequestMockStore } from '../../../application/stores/request-mock.store';
import { RequestRecord, RequestStatus } from '../../../domain/models/request-record.model';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { SiauModal } from '../../../../../shared/ui/components/modal/modal';

type StatusTone = 'pending' | 'review' | 'correction' | 'approved' | 'rejected';

interface RequestStatusHistoryItem {
  readonly label: string;
  readonly date: string;
  readonly current: boolean;
}

@Component({
  selector: 'app-request-status-modal',
  standalone: true,
  imports: [FormsModule, SiauModal, SiauLucideIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-status-modal.html',
  styleUrl: './request-status-modal.scss',
})
export class RequestStatusModal {
  private readonly requestStore = inject(RequestMockStore);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly folio = signal('');
  protected readonly result = signal<RequestRecord | null>(null);
  protected readonly searched = signal(false);

  protected readonly history = computed<readonly RequestStatusHistoryItem[]>(() => {
    const request = this.result();
    if (!request) return [];

    const items: RequestStatusHistoryItem[] = [
      { label: 'Solicitud enviada', date: request.createdAt, current: request.status === 'Pendiente' },
    ];

    if (request.status === 'Pendiente') return items;

    items.push({
      label: request.status === 'Corrección solicitada' ? 'Corrección solicitada' : 'En revisión',
      date: request.createdAt,
      current: request.status === 'En revisión' || request.status === 'Corrección solicitada',
    });

    if (request.status === 'Aprobada' || request.status === 'Rechazada') {
      items.push({ label: request.status, date: request.createdAt, current: true });
    }

    return items;
  });

  protected search(): void {
    this.searched.set(true);
    const request = this.requestStore.findByFolio(this.folio());
    this.result.set(request?.type === 'Alta de usuario' ? request : null);
  }

  protected normalizeFolio(value: string): void {
    this.folio.set(value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32));
    this.searched.set(false);
    this.result.set(null);
  }

  protected closeModal(): void {
    this.folio.set('');
    this.result.set(null);
    this.searched.set(false);
    this.closed.emit();
  }

  protected statusTone(status: RequestStatus): StatusTone {
    if (status === 'Pendiente') return 'pending';
    if (status === 'En revisión') return 'review';
    if (status === 'Corrección solicitada') return 'correction';
    if (status === 'Aprobada') return 'approved';
    return 'rejected';
  }

  protected statusMessage(status: RequestStatus): string {
    if (status === 'Pendiente') return 'Tu solicitud fue recibida y está pendiente de revisión.';
    if (status === 'En revisión') return 'Tu solicitud se encuentra en revisión por el área de administración.';
    if (status === 'Corrección solicitada') return 'Se requieren ajustes antes de continuar con la solicitud.';
    if (status === 'Aprobada') return 'Tu solicitud fue aprobada. Ya puedes continuar con el proceso de acceso.';
    return 'La solicitud fue rechazada. Consulta el detalle informado por el área responsable.';
  }
}
