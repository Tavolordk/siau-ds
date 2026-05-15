import { ChangeDetectionStrategy, Component, computed, HostListener, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Modal size scale. Defined by max-width — height is content-driven.
 * - `sm`: confirmation dialogs (~400px)
 * - `md`: small forms (~560px)
 * - `lg`: standard modals (~720px)
 * - `xl`: wizard-style with sidebar + content (~960px)
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * SIAU Modal — institutional dialog container.
 *
 * Renders an overlay backdrop + a centered surface, with optional header
 * (icon + title + subtitle + close button) and a content slot.
 *
 * The modal is "controlled": the parent owns the visibility state via
 * the `open` input. The modal only emits `close` events; the parent decides
 * whether to actually close.
 *
 * Accessibility:
 *  - Backdrop click emits close (configurable via `dismissOnBackdrop`)
 *  - ESC key emits close (configurable via `dismissOnEscape`)
 *  - role="dialog" with aria-modal, aria-labelledby
 *  - Body scroll is locked while the modal is open
 *
 * @example
 *   <siau-modal
 *     [open]="isWizardOpen()"
 *     title="Registrar Nuevo Usuario"
 *     subtitle="Complete todas las secciones requeridas"
 *     icon="person_add"
 *     size="xl"
 *     (close)="closeWizard()"
 *   >
 *     <!-- contenido del wizard -->
 *   </siau-modal>
 */
@Component({
    selector: 'siau-modal',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    templateUrl: './modal.html',
    styleUrl: './modal.scss',
})
export class SiauModal {
    readonly open = input<boolean>(false);
    readonly title = input<string | null>(null);
    readonly subtitle = input<string | null>(null);
    readonly icon = input<string | null>(null);

    /** Optional badge in the header (e.g. "2/7 secciones"). */
    readonly headerBadge = input<string | null>(null);

    readonly size = input<ModalSize>('lg');

    /** When false, clicking the backdrop does NOT close the modal. */
    readonly dismissOnBackdrop = input<boolean>(true);

    /** When false, pressing ESC does NOT close the modal. */
    readonly dismissOnEscape = input<boolean>(true);

    /** Hides the close (X) button in the header. Useful for forced-action dialogs. */
    readonly hideCloseButton = input<boolean>(false);

    readonly close = output<void>();

    protected readonly surfaceClasses = computed(() => {
        return ['siau-modal__surface', `siau-modal__surface--${this.size()}`].join(' ');
    });

    /** Lock body scroll when modal is open. */
    protected readonly bodyScrollLocked = computed(() => {
        if (typeof document === 'undefined') return false;
        document.body.style.overflow = this.open() ? 'hidden' : '';
        return this.open();
    });

    @HostListener('document:keydown.escape')
    protected onEscape(): void {
        if (!this.open() || !this.dismissOnEscape()) return;
        this.close.emit();
    }

    protected onBackdropClick(): void {
        if (!this.dismissOnBackdrop()) return;
        this.close.emit();
    }

    protected onCloseClick(): void {
        this.close.emit();
    }

    /** Prevents backdrop click from firing when clicking inside the modal surface. */
    protected onSurfaceClick(event: MouseEvent): void {
        event.stopPropagation();
    }
}