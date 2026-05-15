import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { UiTone } from '../../types/ui-status.type';

/**
 * SIAU Badge — pill-shaped status/role indicator.
 *
 * Pure presentation. The mapping from a domain enum (e.g. UserStatus.ACTIVE)
 * to a UiTone ('success') lives in a feature mapper, not here. This keeps
 * the badge reusable in any module of SIAU.
 *
 * @example
 *   <siau-badge [label]="'Activo'" [tone]="'success'" />
 *   <siau-badge [label]="'Administrador'" [tone]="'info'" [icon]="'shield'" />
 */
@Component({
    selector: 'siau-badge',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    template: `
    <span [class]="cssClasses()">
      @if (icon(); as iconName) {
        <mat-icon class="siau-badge__icon" aria-hidden="true">{{ iconName }}</mat-icon>
      }
      <span class="siau-badge__label">{{ label() }}</span>
    </span>
  `,
    styleUrl: './badge.scss',
})
export class SiauBadge {
    readonly label = input.required<string>();
    readonly tone = input<UiTone>('neutral');
    readonly icon = input<string | null>(null);
    readonly appearance = input<'solid' | 'outline'>('solid');

    protected readonly cssClasses = computed(() => {
        return ['siau-badge', `siau-badge--${this.tone()}`, `siau-badge--${this.appearance()}`].join(' ');
    });
}