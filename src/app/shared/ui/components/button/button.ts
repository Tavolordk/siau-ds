import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';

import type { UiSize } from '../../types/ui-size.type';
import type { UiVariant } from '../../types/ui-variant.type';

/**
 * SIAU Button — institutional action trigger.
 */
@Component({
    selector: 'siau-button',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule, MatRippleModule],
    templateUrl: './button.html',
    styleUrl: './button.scss',
    host: {
        class: 'siau-button-host',
    },
})
export class SiauButton {
    readonly label = input<string | null>(null);
    readonly icon = input<string | null>(null);
    readonly trailingIcon = input<string | null>(null);

    readonly variant = input<UiVariant>('primary');
    readonly size = input<UiSize>('md');
    readonly type = input<'button' | 'submit' | 'reset'>('button');

    readonly disabled = input<boolean>(false);
    readonly loading = input<boolean>(false);
    readonly fullWidth = input<boolean>(false);
    readonly ariaLabel = input<string | null>(null);

    readonly clicked = output<MouseEvent>();

    protected readonly resolvedAriaLabel = computed<string | null>(
        () => this.ariaLabel() ?? this.label(),
    );

    protected readonly isDisabled = computed<boolean>(
        () => this.disabled() || this.loading(),
    );

    protected readonly cssClasses = computed<string>(() => {
        const classes = [
            'siau-button',
            `siau-button--${this.variant()}`,
            `siau-button--${this.size()}`,
        ];
        if (this.fullWidth()) classes.push('siau-button--full');
        if (this.loading()) classes.push('siau-button--loading');
        if (!this.label()) classes.push('siau-button--icon-only');
        return classes.join(' ');
    });

    protected onClick(event: MouseEvent): void {
        if (this.isDisabled()) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        this.clicked.emit(event);
    }
}