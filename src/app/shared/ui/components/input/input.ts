import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { UiSize } from '../../types/ui-size.type';

type InputType = 'text' | 'email' | 'password' | 'tel' | 'number' | 'date' | 'search';

@Component({
    selector: 'siau-input',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    templateUrl: './input.html',
    styleUrl: './input.scss',
})
export class SiauInput {
    readonly label = input<string | null>(null);
    readonly hint = input<string | null>(null);
    readonly errorMessage = input<string | null>(null);
    readonly placeholder = input<string>('');
    readonly type = input<InputType>('text');
    readonly size = input<UiSize>('md');
    readonly required = input<boolean>(false);
    readonly disabled = input<boolean>(false);
    readonly isReadonly = input<boolean>(false);
    readonly prefixIcon = input<string | null>(null);
    readonly suffixIcon = input<string | null>(null);
    readonly revealable = input<boolean>(true);
    readonly maxLength = input<number | null>(null);
    readonly autocomplete = input<string>('off');
    readonly value = input<string>('');

    readonly valueChange = output<string>();

    protected readonly internalValue = signal<string>('');
    protected readonly focused = signal<boolean>(false);
    protected readonly passwordVisible = signal<boolean>(false);

    protected readonly hasError = computed(() => !!this.errorMessage()?.trim());

    protected readonly resolvedType = computed(() => {
        if (this.type() !== 'password') return this.type();
        return this.passwordVisible() ? 'text' : 'password';
    });

    protected readonly showRevealToggle = computed(() => this.type() === 'password' && this.revealable());

    protected readonly wrapperClasses = computed(() => {
        const classes = ['siau-input', `siau-input--${this.size()}`];
        if (this.focused()) classes.push('siau-input--focused');
        if (this.hasError()) classes.push('siau-input--error');
        if (this.disabled()) classes.push('siau-input--disabled');
        return classes.join(' ');
    });

    protected onInput(event: Event): void {
        const next = (event.target as HTMLInputElement).value;
        this.internalValue.set(next);
        this.valueChange.emit(next);
    }

    protected onFocus(): void {
        this.focused.set(true);
    }

    protected onBlur(): void {
        this.focused.set(false);
    }

    protected togglePasswordVisibility(): void {
        this.passwordVisible.update((v) => !v);
    }
}