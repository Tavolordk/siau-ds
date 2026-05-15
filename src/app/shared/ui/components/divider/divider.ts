import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Divider orientation.
 * - `horizontal`: full-width horizontal rule (default)
 * - `vertical`: vertical line, must be placed in a flex container with height
 */
export type DividerOrientation = 'horizontal' | 'vertical';

/**
 * Divider visual weight.
 * - `subtle`: faint gray line (sections within a card)
 * - `default`: standard separator
 * - `strong`: more prominent (major section breaks)
 */
export type DividerWeight = 'subtle' | 'default' | 'strong';

/**
 * SIAU Divider — visual separator between content sections.
 *
 * Renders as a semantic <hr> for horizontal dividers (accessible by default),
 * and as a styled <span role="separator"> for vertical dividers (since <hr>
 * is always horizontal in HTML).
 *
 * For dividers with a label in the middle (e.g. "—— O ——"), use the `label`
 * input. This is less common but appears in the SIAU wizard between sections.
 *
 * @example
 *   <siau-divider />
 *   <siau-divider weight="strong" />
 *   <siau-divider orientation="vertical" />
 *   <siau-divider label="AGREGAR SISTEMA" />
 */
@Component({
    selector: 'siau-divider',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (label()) {
      <div [class]="wrapperClasses()" role="separator" [attr.aria-label]="label()">
        <span class="siau-divider__line"></span>
        <span class="siau-divider__label">{{ label() }}</span>
        <span class="siau-divider__line"></span>
      </div>
    } @else if (orientation() === 'vertical') {
      <span [class]="wrapperClasses()" role="separator" aria-orientation="vertical"></span>
    } @else {
      <hr [class]="wrapperClasses()" />
    }
  `,
    styleUrl: './divider.scss',
})
export class SiauDivider {
    readonly orientation = input<DividerOrientation>('horizontal');
    readonly weight = input<DividerWeight>('default');

    /** Optional label rendered in the middle of a horizontal divider. */
    readonly label = input<string | null>(null);

    /** Vertical margin (horizontal) or horizontal margin (vertical). Auto-scales padding. */
    readonly spacing = input<'sm' | 'md' | 'lg'>('md');

    protected readonly wrapperClasses = computed(() => {
        const classes = [
            'siau-divider',
            `siau-divider--${this.orientation()}`,
            `siau-divider--${this.weight()}`,
            `siau-divider--spacing-${this.spacing()}`,
        ];
        if (this.label()) classes.push('siau-divider--labeled');
        return classes.join(' ');
    });
}