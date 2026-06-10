import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RequestRecord } from '../../../domain/models/request-record.model';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';

export type RequestModalMode = 'detail' | 'approve' | 'reject';

@Component({
    selector: 'app-request-detail-modal',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauLucideIcon],
    templateUrl: './request-detail-modal.html',
    styleUrl: './request-detail-modal.scss',
})
export class RequestDetailModal {
    readonly request = input<RequestRecord | null>(null);
    readonly mode = input<RequestModalMode>('detail');

    readonly closed = output<void>();
    readonly approved = output<RequestRecord>();
    readonly rejected = output<RequestRecord>();

    protected readonly open = computed(() => this.request() !== null);

    protected readonly tone = computed<'info' | 'success' | 'warning'>(() => {
        if (this.mode() === 'approve') return 'success';
        if (this.mode() === 'reject') return 'warning';
        return 'info';
    });

    protected readonly iconName = computed(() => {
        if (this.mode() === 'approve') return 'circle-check';
        if (this.mode() === 'reject') return 'triangle-alert';
        return 'info';
    });

    protected readonly eyebrow = computed(() => {
        if (this.mode() === 'approve') return 'Operación exitosa';
        if (this.mode() === 'reject') return 'Advertencia';
        return 'Información';
    });

    protected readonly title = computed(() => {
        const current = this.request();

        if (!current) return '';

        if (this.mode() === 'approve') return 'Aprobar solicitud';
        if (this.mode() === 'reject') return 'Rechazar solicitud';

        return `Detalle — ${current.folio}`;
    });

    protected readonly message = computed(() => {
        const current = this.request();

        if (!current) return '';

        if (this.mode() === 'approve') {
            return `¿Está seguro de aprobar la solicitud ${current.folio} de ${current.applicant}? Esta acción notificará al usuario.`;
        }

        if (this.mode() === 'reject') {
            return `¿Está seguro de rechazar la solicitud ${current.folio}? Esta acción notificará al usuario con el motivo de rechazo.`;
        }

        return '';
    });

    protected close(): void {
        this.closed.emit();
    }

    protected confirm(): void {
        const current = this.request();

        if (!current) {
            return;
        }

        if (this.mode() === 'approve') {
            this.approved.emit(current);
            return;
        }

        if (this.mode() === 'reject') {
            this.rejected.emit(current);
        }
    }
}