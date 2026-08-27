import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../../../../core/auth/application/auth.facade';
import { AnimatedAuthBackground } from '../../../../../shared/ui/components/animated-auth-background/animated-auth-background';

@Component({
    selector: 'siau-two-factor-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, AnimatedAuthBackground],
    templateUrl: './two-factor-page.html',
    styleUrl: './two-factor-page.scss',
})
export class TwoFactorPage {
    protected readonly auth = inject(AuthFacade);
    protected readonly challenge = this.auth.challenge;
    protected readonly digits = signal<string[]>(Array.from({ length: 6 }, () => ''));
    protected readonly digitInputs = viewChildren<ElementRef<HTMLInputElement>>('digitInput');
    protected readonly pasteBlocked = signal(false);

    protected readonly channelLabel = computed(() => this.challenge()?.contactMethodLabel ?? 'tu medio de contacto');
    protected readonly maskedContact = computed(() => this.challenge()?.maskedContact ?? this.challenge()?.contact ?? '');
    protected readonly isPhoneContact = computed(() => this.challenge()?.contactMethod === 'telefono');

    constructor() {
        let previousChallengeKey = '';

        effect(() => {
            const challenge = this.challenge();
            const challengeKey = challenge
                ? `${challenge.codeId ?? ''}|${challenge.issuedAt}`
                : '';

            if (previousChallengeKey && challengeKey && previousChallengeKey !== challengeKey) {
                this.digits.set(Array.from({ length: 6 }, () => ''));
                this.pasteBlocked.set(false);
                this.focusInput(0);
            }

            previousChallengeKey = challengeKey;
        });
    }

    protected onInput(event: Event, index: number): void {
        const input = event.target as HTMLInputElement;
        const value = input.value.replace(/\D/g, '').slice(-1);

        input.value = value;
        this.pasteBlocked.set(false);
        this.auth.clearError();
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
        this.pasteBlocked.set(true);
    }

    protected submit(): void {
        const code = this.digits().join('');

        if (code.length !== 6 || this.auth.loading()) {
            return;
        }

        this.auth.verifyCode(code);
    }

    protected requestNewCode(): void {
        this.auth.resendCode();
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
