import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SiauButton } from '../../../../../shared/ui/components/button/button';
import { SiauModal } from '../../../../../shared/ui/components/modal/modal';
import { RequestPriority, RequestRecord, RequestStatus } from '../../../domain/models/request-record.model';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
    selector: 'app-request-detail-modal',
    standalone: true,
    imports: [MatIconModule, SiauModal, SiauButton],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './request-detail-modal.html',
    styleUrl: './request-detail-modal.scss',
})
export class RequestDetailModal {
    readonly request = input<RequestRecord | null>(null);

    readonly closed = output<void>();
    readonly approved = output<RequestRecord>();
    readonly rejected = output<RequestRecord>();

    protected readonly isOpen = computed(() => this.request() !== null);

    protected closeModal(): void {
        this.closed.emit();
    }

    protected approve(): void {
        const request = this.request();

        if (request) {
            this.approved.emit(request);
        }
    }

    protected reject(): void {
        const request = this.request();

        if (request) {
            this.rejected.emit(request);
        }
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
}