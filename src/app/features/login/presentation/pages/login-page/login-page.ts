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
        username: ['', [Validators.required, Validators.pattern(/^[A-Z0-9]{14}$/)]],
        contact: ['', [this.contactValidator]],
        captcha: ['', [Validators.required, Validators.pattern(/^[A-Z0-9]{7}$/)]],
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
            username: value.username.trim().toUpperCase(),
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
            : value.replace(/\s+/g, '').slice(0, 254);

        if (originalValue !== normalizedValue) {
            control.setValue(normalizedValue, { emitEvent: false });
        }

        control.updateValueAndValidity({ emitEvent: false });
    }

    protected normalizeCaptcha(): void {
        const value = this.form.controls.captcha.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 7);

        this.form.controls.captcha.setValue(value, { emitEvent: false });
    }

    protected normalizeUsername(): void {
        const control = this.form.controls.username;
        const normalized = control.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 14);

        if (control.value !== normalized) {
            control.setValue(normalized, { emitEvent: false });
        }

        control.updateValueAndValidity({ emitEvent: false });
    }

    protected isPhoneContact(): boolean {
        const value = this.form.controls.contact.value.trim();

        return /^\d/.test(value);
    }

    protected contactIconLabel(): string {
        return this.isPhoneContact() ? 'Número telefónico' : 'Correo electrónico';
    }

    protected contactInputMode(): string {
        return this.isPhoneContact() ? 'numeric' : 'email';
    }

    protected contactMaxLength(): number {
        return this.isPhoneContact() ? 10 : 254;
    }

    private contactValidator(control: AbstractControl<string>): ValidationErrors | null {
        const value = String(control.value ?? '').trim();

        if (!value) {
            return { required: true };
        }

        if (/^\d+$/.test(value)) {
            return /^\d{10}$/.test(value) ? null : { phoneLength: true };
        }

        return this.isValidEmail(value) ? null : { email: true };
    }

    private isValidEmail(value: string): boolean {
        return value.length <= 254 && /^[A-Za-z][A-Za-z0-9._%+-]*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(value);
    }
}
