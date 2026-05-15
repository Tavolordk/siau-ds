import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import type { UiSize } from '../../types/ui-size.type';

/**
 * Tone for icon-buttons. Maps to the action's intent rather than visual variant:
 * - `default`: neutral actions (edit, configure)
 * - `danger`: destructive actions (delete)
 * - `warning`: caution actions (block, suspend)
 */
export type IconButtonTone = 'default' | 'danger' | 'warning';

/**
 * SIAU Icon Button — compact action trigger with only an icon.
 *
 * Used heavily in table rows for row-level actions (edit, block, delete).
 * Always requires an `ariaLabel` because there is no visible text.
 *
 * @example
 *   <siau-icon-button icon="edit" ariaLabel="Editar usuario" (clicked)="onEdit()" />
 *   <siau-icon-button icon="delete" tone="danger" ariaLabel="Eliminar" />
 */
@Component({
    selector: 'siau-icon-button',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule, MatRippleModule],
    template: `
    <button
      matRipple
      [matRippleDisabled]="disabled()"
      type="button"
      [class]="cssClasses()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel()"
      [attr.title]="tooltip() ?? ariaLabel()"
      (click)="onClick($event)"
    >
      <mat-icon class="siau-icon-button__icon" aria-hidden="true">{{ icon() }}</mat-icon>
    </button>
  `,
    styleUrl: './icon-button.scss',
})
export class SiauIconButton {
    readonly icon = input.required<string>();
    readonly ariaLabel = input.required<string>();
    readonly tooltip = input<string | null>(null);
    readonly tone = input<IconButtonTone>('default');
    readonly size = input<UiSize>('md');
    readonly disabled = input<boolean>(false);

    readonly clicked = output<MouseEvent>();

    protected readonly cssClasses = computed(() => {
        return ['siau-icon-button', `siau-icon-button--${this.tone()}`, `siau-icon-button--${this.size()}`].join(' ');
    });

    protected onClick(event: MouseEvent): void {
        if (this.disabled()) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        this.clicked.emit(event);
    }
}