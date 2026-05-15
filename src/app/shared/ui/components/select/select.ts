import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { UiSize } from '../../types/ui-size.type';

/**
 * Single option for SiauSelect.
 *
 * - `value` is the raw value emitted.
 * - `label` is what the user sees.
 * - `disabled` lets you grey out an option without removing it.
 */
export interface SiauSelectOption {
    readonly value: string;
    readonly label: string;
    readonly disabled?: boolean;
}

/**
 * SIAU Select — single-value dropdown.
 *
 * Uses a native <select> under the hood. That gives mobile-native keyboard
 * support, screen-reader compatibility and zero overlay-positioning bugs
 * for free. The styling matches the SIAU institutional inputs.
 *
 * NOTE: this version uses simple value/valueChange binding (no Reactive Forms
 * integration). When the DS is complete we'll add ControlValueAccessor as a
 * second iteration.
 */
@Component({
    selector: 'siau-select',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    templateUrl: './select.html',
    styleUrl: './select.scss',
})
export class SiauSelect {
    readonly label = input<string | null>(null);
    readonly hint = input<string | null>(null);
    readonly errorMessage = input<string | null>(null);
    readonly placeholder = input<string>('Selecciona una opción');
    readonly options = input.required<readonly SiauSelectOption[]>();
    readonly size = input<UiSize>('md');
    readonly required = input<boolean>(false);
    readonly disabled = input<boolean>(false);
    readonly value = input<string | null>(null);

    readonly valueChange = output<string | null>();

    protected readonly internalValue = signal<string | null>(null);
    protected readonly focused = signal<boolean>(false);

    protected readonly hasError = computed(() => !!this.errorMessage()?.trim());

    protected readonly isEmpty = computed(() => {
        const v = this.internalValue() ?? this.value();
        return v === null || v === undefined || v === '';
    });

    protected readonly currentValue = computed(() => this.internalValue() ?? this.value() ?? '');

    protected readonly wrapperClasses = computed(() => {
        const classes = ['siau-select', `siau-select--${this.size()}`];
        if (this.focused()) classes.push('siau-select--focused');
        if (this.hasError()) classes.push('siau-select--error');
        if (this.disabled()) classes.push('siau-select--disabled');
        if (this.isEmpty()) classes.push('siau-select--empty');
        return classes.join(' ');
    });

    protected onChangeNative(event: Event): void {
        const target = event.target as HTMLSelectElement;
        const next = target.value === '' ? null : target.value;
        this.internalValue.set(next);
        this.valueChange.emit(next);
    }

    protected onFocus(): void {
        this.focused.set(true);
    }

    protected onBlur(): void {
        this.focused.set(false);
    }
}