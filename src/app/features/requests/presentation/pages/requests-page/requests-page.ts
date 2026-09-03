import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, take } from 'rxjs';
import {
  RequestDocument,
  RequestOwnership,
  RequestRecord,
  RequestStatus,
  RequestType,
} from '../../../domain/models/request-record.model';
import {
  RequestReviewAction,
  RequestReviewCommand,
} from '../../../domain/models/request-review.model';
import { RequestReviewNotificationService } from '../../../application/services/request-review-notification.service';
import { RequestMockStore } from '../../../application/stores/request-mock.store';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { RequestModal } from '../../components/request-modal/request-modal';
import type { RequestModalInitialView } from '../../components/request-modal/request-modal';

type StatusTone = 'pending' | 'review' | 'correction' | 'approved' | 'rejected';
type RequestTypeTone = 'primary' | 'info' | 'blue' | 'warning' | 'muted';
type RequestStatusFilter = RequestStatus | 'Todos';
type RequestListScope = RequestOwnership;

@Component({
  selector: 'app-requests-page',
  standalone: true,
  imports: [FormsModule, SiauLucideIcon, RequestModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './requests-page.html',
  styleUrl: './requests-page.scss',
})
export class RequestsPage {
  private readonly notificationService = inject(RequestReviewNotificationService);
  private readonly mockStore = inject(RequestMockStore);

  protected readonly searchTerm = signal('');
  protected readonly activeList = signal<RequestListScope>('mine');
  protected readonly selectedStatus = signal<RequestStatusFilter>('Todos');
  protected readonly statusFilterOpen = signal(false);
  protected readonly selectedRequest = signal<RequestRecord | null>(null);
  protected readonly reviewBusy = signal(false);
  protected readonly reviewResult = signal<string | null>(null);
  protected readonly reviewResultTone = signal<'success' | 'error' | null>(null);
  protected readonly requestModalOpen = signal(false);
  protected readonly requestModalView = signal<RequestModalInitialView>('form');

  protected readonly statusOptions: readonly RequestStatusFilter[] = [
    'Todos',
    'Pendiente',
    'En revisión',
    'Corrección solicitada',
    'Aprobada',
    'Rechazada',
  ];

  protected readonly requests = this.mockStore.requests;

  protected readonly scopedRequests = computed(() =>
    this.requests().filter((request) => request.ownership === this.activeList()),
  );

  protected readonly mineRequestsCount = computed(() =>
    this.requests().filter((request) => request.ownership === 'mine').length,
  );
  protected readonly otherRequestsCount = computed(() =>
    this.requests().filter((request) => request.ownership === 'others').length,
  );

  protected readonly filteredRequests = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const status = this.selectedStatus();

    return this.scopedRequests().filter((request) => {
      const matchesStatus = status === 'Todos' || request.status === status;
      const searchable = `${request.folio} ${request.applicant} ${request.applicantUsername} ${request.institution} ${request.type}`.toLowerCase();
      return matchesStatus && (!term || searchable.includes(term));
    });
  });

  protected readonly pendingRequests = computed(() => this.countByStatus('Pendiente'));
  protected readonly reviewRequests = computed(
    () => this.countByStatus('En revisión') + this.countByStatus('Corrección solicitada'),
  );
  protected readonly approvedRequests = computed(() => this.countByStatus('Aprobada'));
  protected readonly rejectedRequests = computed(() => this.countByStatus('Rechazada'));


  protected selectList(scope: RequestListScope): void {
    if (this.activeList() === scope) return;
    this.activeList.set(scope);
    this.searchTerm.set('');
    this.selectedStatus.set('Todos');
    this.statusFilterOpen.set(false);
  }

  protected openNewRequest(): void {
    this.selectedRequest.set(null);
    this.requestModalView.set('form');
    this.requestModalOpen.set(true);
  }

  protected openRequestDrafts(): void {
    this.selectedRequest.set(null);
    this.requestModalView.set('drafts');
    this.requestModalOpen.set(true);
  }

  protected closeRequestModal(): void {
    if (this.reviewBusy()) return;
    this.requestModalOpen.set(false);
    this.selectedRequest.set(null);
    this.reviewResult.set(null);
    this.reviewResultTone.set(null);
  }

  protected handleRequestCreated(_request: RequestRecord): void {
    this.searchTerm.set('');
    this.selectedStatus.set('Todos');
  }

  protected updateSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  protected toggleStatusFilter(): void {
    this.statusFilterOpen.update((open) => !open);
  }

  protected setSelectedStatus(status: RequestStatusFilter): void {
    this.selectedStatus.set(status);
    this.statusFilterOpen.set(false);
  }

  protected openRequestDetail(request: RequestRecord): void {
    this.selectedRequest.set(request);
    this.requestModalView.set('detail');
    this.reviewResult.set(null);
    this.reviewResultTone.set(null);
    this.requestModalOpen.set(true);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.requestModalOpen()) {
      this.closeRequestModal();
    }
  }

  protected getStatusTone(status: RequestStatus): StatusTone {
    if (status === 'Pendiente') return 'pending';
    if (status === 'En revisión') return 'review';
    if (status === 'Corrección solicitada') return 'correction';
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

  protected updateDocuments(documents: readonly RequestDocument[]): void {
    const current = this.selectedRequest();
    if (!current) {
      return;
    }

    this.mockStore.updateDocuments(current.folio, documents);
    this.selectedRequest.update((request) => request ? { ...request, documents } : null);
  }

  protected reviewRequest(command: RequestReviewCommand): void {
    this.reviewBusy.set(true);
    this.reviewResult.set(null);
    this.reviewResultTone.set(null);

    this.notificationService
      .notify(command)
      .pipe(take(1), finalize(() => this.reviewBusy.set(false)))
      .subscribe({
        next: (result) => {
          const status = this.statusFromAction(command.action);
          this.mockStore.updateStatus(command.request.folio, status);
          this.selectedRequest.update((request) => request?.folio === command.request.folio ? { ...request, status } : request);
          this.reviewResultTone.set('success');
          this.reviewResult.set(
            result.correoId
              ? `Acción registrada. Correo enviado correctamente (folio de correo: ${result.correoId}).`
              : 'Acción registrada y correo enviado correctamente al solicitante.',
          );
        },
        error: (error: unknown) => {
          const message = error instanceof Error ? error.message : 'No fue posible enviar la notificación.';
          this.reviewResultTone.set('error');
          this.reviewResult.set(`No se aplicó la resolución: ${message}`);
        },
      });
  }

  private statusFromAction(action: RequestReviewAction): RequestStatus {
    if (action === 'approve') return 'Aprobada';
    if (action === 'reject') return 'Rechazada';
    return 'Corrección solicitada';
  }

  private countByStatus(status: RequestStatus): number {
    return this.scopedRequests().filter((request) => request.status === status).length;
  }
}
