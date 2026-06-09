import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../../../../core/auth/application/auth.facade';

@Component({
    selector: 'siau-two-factor-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink],
    templateUrl: './two-factor-page.html',
    styleUrl: './two-factor-page.scss',
})
export class TwoFactorPage {
    protected readonly auth = inject(AuthFacade);
    protected readonly digits = signal<string[]>(Array.from({ length: 6 }, () => ''));
    protected readonly digitInputs = viewChildren<ElementRef<HTMLInputElement>>('digitInput');

    protected onInput(event: Event, index: number): void {
        const input = event.target as HTMLInputElement;
        const value = input.value.replace(/\D/g, '').slice(-1);

        input.value = value;
        this.updateDigit(index, value);

        if (value && index < 5) {
            this.focusInput(index + 1);
        }

        this.trySubmitWhenComplete();
    }

    protected onKeydown(event: KeyboardEvent, index: number): void {
        const input = event.target as HTMLInputElement;

        if (event.key === 'Backspace' && !input.value && index > 0) {
            this.focusInput(index - 1);
        }
    }

    protected onPaste(event: ClipboardEvent): void {
        event.preventDefault();

        const pastedCode = event.clipboardData?.getData('text').replace(/\D/g, '').slice(0, 6) ?? '';
        const nextDigits = Array.from({ length: 6 }, (_, index) => pastedCode[index] ?? '');

        this.digits.set(nextDigits);
        this.digitInputs().forEach((input, index) => {
            input.nativeElement.value = nextDigits[index] ?? '';
        });

        this.focusInput(Math.min(pastedCode.length, 5));
        this.trySubmitWhenComplete();
    }

    protected submit(): void {
        const code = this.digits().join('');

        if (code.length !== 6 || this.auth.loading()) {
            return;
        }

        this.auth.verifyCode(code);
    }

    private updateDigit(index: number, value: string): void {
        this.digits.update((current) => current.map((digit, i) => (i === index ? value : digit)));
    }

    private focusInput(index: number): void {
        queueMicrotask(() => this.digitInputs()[index]?.nativeElement.focus());
    }

    private trySubmitWhenComplete(): void {
        if (this.digits().every(Boolean)) {
            this.submit();
        }
    }
}