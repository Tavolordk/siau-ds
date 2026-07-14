import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../../../../core/auth/application/auth.facade';
import { CaptchaFacade } from '../../../../../core/captcha/application/captcha.facade';
import { AnimatedAuthBackground } from '../../../../../shared/ui/animated-auth-background/animated-auth-background';

@Component({
    selector: 'siau-login-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, RouterLink, AnimatedAuthBackground],
    templateUrl: './login-page.html',
    styleUrl: './login-page.scss',
})
export class LoginPage implements OnDestroy {
    private readonly formBuilder = inject(FormBuilder);

    protected readonly auth = inject(AuthFacade);
    protected readonly captcha = inject(CaptchaFacade);

    protected readonly form = this.formBuilder.nonNullable.group({
        username: ['', [Validators.required, Validators.minLength(3)]],
        contact: ['', [this.contactValidator]],
        captcha: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    });

    constructor() {
        let previousChallengeId: string | null = null;

        effect(() => {
            const currentChallengeId = this.captcha.challenge()?.id ?? null;

            if (previousChallengeId && currentChallengeId && previousChallengeId !== currentChallengeId) {
                this.form.controls.captcha.setValue('', { emitEvent: false });
            }

            previousChallengeId = currentChallengeId;
        });

        this.captcha.load();
    }

    ngOnDestroy(): void {
        this.captcha.deactivate();
    }

    protected submit(): void {
        this.form.markAllAsTouched();

        if (this.form.invalid || this.auth.loading() || this.captcha.loading() || this.captcha.verifying()) {
            return;
        }

        const value = this.form.getRawValue();

        this.auth.login({
            username: value.username.trim(),
            contact: String(value.contact).trim(),
            captcha: value.captcha,
        });
    }

    protected refreshCaptcha(): void {
        if (this.auth.loading() || this.captcha.loading() || this.captcha.verifying()) {
            return;
        }

        this.auth.clearError();
        this.form.controls.captcha.setValue('', { emitEvent: false });
        this.captcha.refresh();
    }

    protected normalizeContact(): void {
        const control = this.form.controls.contact;
        const originalValue = control.value;
        const value = originalValue.trim();

        if (!value) {
            if (originalValue !== value) {
                control.setValue(value, { emitEvent: false });
            }

            return;
        }

        const firstCharacter = value.charAt(0);
        const startsAsPhone = /^\d$/.test(firstCharacter);

        const normalizedValue = startsAsPhone
            ? value.replace(/\D/g, '').slice(0, 10)
            : value.replace(/\s+/g, '').slice(0, 120);

        if (originalValue !== normalizedValue) {
            control.setValue(normalizedValue, { emitEvent: false });
        }

        control.updateValueAndValidity({ emitEvent: false });
    }

    protected normalizeCaptcha(): void {
        const value = this.form.controls.captcha.value
            .toUpperCase()
            .replace(/\s+/g, '')
            .slice(0, 6);

        this.form.controls.captcha.setValue(value, { emitEvent: false });
    }

    protected isPhoneContact(): boolean {
        const value = this.form.controls.contact.value.trim();

        return /^\d/.test(value);
    }

    protected contactIconLabel(): string {
        return this.isPhoneContact() ? 'Número de Telegram' : 'Correo electrónico';
    }

    protected contactInputMode(): string {
        return this.isPhoneContact() ? 'numeric' : 'email';
    }

    protected contactMaxLength(): number {
        return this.isPhoneContact() ? 10 : 120;
    }

    private contactValidator(control: AbstractControl<string>): ValidationErrors | null {
        const value = String(control.value ?? '').trim();

        if (!value) {
            return { required: true };
        }

        if (/^\d+$/.test(value)) {
            return /^\d{10}$/.test(value) ? null : { phoneLength: true };
        }

        return Validators.email(control) ? { email: true } : null;
    }
}