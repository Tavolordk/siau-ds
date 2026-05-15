import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Card elevation level.
 * - `flat`: no shadow, only border (subtle containers like info boxes)
 * - `raised`: subtle shadow (default, used for content cards)
 * - `floating`: stronger shadow (used for modals or dragged elements)
 */
export type CardElevation = 'flat' | 'raised' | 'floating';

/**
 * Card padding scale. Independent from size tokens because cards have their
 * own rhythm distinct from form controls.
 */
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

/**
 * SIAU Card — generic content container.
 *
 * Pure layout primitive: white surface, border, optional shadow. Receives
 * arbitrary content via <ng-content/>. The card itself has no opinion about
 * what goes inside.
 *
 * Why no header/footer slots? Because cards in SIAU vary too much: some have
 * titles, some have toolbars, some have nothing. Building slots constrains the
 * caller. Composition (just nest your own header) is more flexible.
 *
 * @example
 *   <siau-card>
 *     <h2>Gestión de Usuarios</h2>
 *     <p>Administra los accesos del personal</p>
 *   </siau-card>
 *
 *   <siau-card elevation="floating" padding="lg">
 *     ...wizard modal content...
 *   </siau-card>
 */
@Component({
    selector: 'siau-card',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [],
    template: `
    <div [class]="cssClasses()">
      <ng-content />
    </div>
  `,
    styleUrl: './card.scss',
})
export class SiauCard {
    readonly elevation = input<CardElevation>('raised');
    readonly padding = input<CardPadding>('md');

    /** Removes the rounded corners. Useful when the card is part of a tab strip. */
    readonly flat = input<boolean>(false);

    /** Adds a colored left border accent. Used for info/warning callouts. */
    readonly accent = input<'none' | 'info' | 'warning' | 'success' | 'danger'>('none');

    protected readonly cssClasses = computed(() => {
        const classes = [
            'siau-card',
            `siau-card--${this.elevation()}`,
            `siau-card--padding-${this.padding()}`,
        ];
        if (this.flat()) classes.push('siau-card--squared');
        if (this.accent() !== 'none') classes.push(`siau-card--accent-${this.accent()}`);
        return classes.join(' ');
    });
}