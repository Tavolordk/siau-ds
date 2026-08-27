import { computed, inject, Injectable } from '@angular/core';
import { BorradorItem, UserRecord } from '../../../../domain/models/user-record.model';
import { UserAccountOperationsController } from '../accounts/user-account-operations.controller';
import { BadgeTone, PAGINATION_SIBLINGS, PaginationItem } from '../models/user-management-page.models';
import { UserManagementPageState } from '../state/user-management-page.state';

/** Cálculos y formato de presentación de la página; no realiza IO. */
@Injectable()
export class UserManagementPagePresenter {
    private readonly state = inject(UserManagementPageState);
    private readonly accountOperations = inject(UserAccountOperationsController);

    readonly filteredUsers = computed(() => this.state.users());
    readonly shownUsersCount = computed(() => {
        const pagination = this.state.pagination();
        const previous = Math.max(0, this.state.currentPage() - 1) * Math.max(0, pagination.porPagina);
        return Math.min(Math.max(0, pagination.totalRegistros), previous + this.filteredUsers().length);
    });
    readonly canGoPrevious = computed(() => this.state.currentPage() > 1);
    readonly canGoNext = computed(() => this.state.currentPage() < this.state.pagination().totalPaginas);
    readonly pageItems = computed<readonly PaginationItem[]>(() => this.buildPageItems());

    draftTitle(draft: BorradorItem): string {
        const personal = draft.datos?.datosPersonales;
        const name = [personal?.nombres, personal?.primerApellido, personal?.segundoApellido]
            .map((part) => (part ?? '').trim()).filter(Boolean).join(' ');
        return name || draft.datos?.medioContacto?.correo?.trim() || `Borrador ${draft.borradorId ?? 'sin folio'}`;
    }

    draftSubtitle(draft: BorradorItem): string {
        const structure = draft.catalogos?.adscripcionEstructura;
        const parts = [
            structure?.tipoInstitucion,
            structure?.institucion ?? draft.catalogos?.adscripcion,
            structure?.organo,
            structure?.unidad,
            draft.catalogos?.tipoUsuario,
        ].map((part) => (part ?? '').trim()).filter(Boolean);
        return parts.join(' · ') || 'Sin adscripción capturada';
    }

    draftTimestamp(draft: BorradorItem): string {
        const date = draft.fechaActualizacion ?? draft.fechaCreacion;
        if (!date) return 'Sin fecha';
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return date;
        return parsed.toLocaleString('es-MX', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    }

    trackDraft(index: number, draft: BorradorItem): string { return String(draft.borradorId ?? index); }

    getRoleTone(role: UserRecord['role']): BadgeTone {
        const value = this.normalize(role);
        if (value.includes('admin')) return 'neutral';
        if (value.includes('enlace')) return 'info';
        if (value.includes('supervisor')) return 'dark';
        return 'light';
    }

    getStatusTone(user: UserRecord): BadgeTone {
        switch (this.accountOperations.getAccountStatusKey(user)) {
            case 'ACTIVO': return 'success';
            case 'SUSPENDIDO': return 'warning';
            case 'BAJA':
            case 'BLOQUEADO': return 'danger';
            default: return 'info';
        }
    }

    getRegistryTone(status: UserRecord['rnpsp']): BadgeTone {
        const value = this.normalize(status);
        return value.includes('registrado') && !value.includes('no') ? 'success' : 'danger';
    }

    getTrustTone(status: UserRecord['trust']): BadgeTone {
        const value = this.normalize(status);
        if (value.includes('vigente') || value.includes('aprobado')) return 'success';
        if (value.includes('expir') || value.includes('vencid')) return 'warning';
        return 'info';
    }

    private buildPageItems(): readonly PaginationItem[] {
        const totalPages = Math.max(1, this.state.pagination().totalPaginas);
        const current = Math.min(Math.max(1, this.state.currentPage()), totalPages);
        const maxSlots = PAGINATION_SIBLINGS * 2 + 5;
        if (totalPages <= maxSlots) return this.toItems(this.range(1, totalPages));

        const left = Math.max(current - PAGINATION_SIBLINGS, 1);
        const right = Math.min(current + PAGINATION_SIBLINGS, totalPages);
        const leftGap = left > 2;
        const rightGap = right < totalPages - 1;
        const edgeCount = PAGINATION_SIBLINGS * 2 + 3;

        if (!leftGap && rightGap) return this.toItems([...this.range(1, edgeCount), 0, totalPages]);
        if (leftGap && !rightGap) return this.toItems([1, 0, ...this.range(totalPages - edgeCount + 1, totalPages)]);
        return this.toItems([1, 0, ...this.range(left, right), 0, totalPages]);
    }

    private range(start: number, end: number): readonly number[] {
        return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
    }
    private toItems(pages: readonly number[]): readonly PaginationItem[] {
        return pages.map((page, index) => ({ key: page > 0 ? `page-${page}` : `gap-${index}`, page, isGap: page <= 0 }));
    }
    private normalize(value: string): string {
        return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    }
}
