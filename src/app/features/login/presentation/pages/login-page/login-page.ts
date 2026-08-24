import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../../../../core/auth/application/auth.facade';
import { CaptchaFacade } from '../../../../../core/captcha/application/captcha.facade';
import { AnimatedAuthBackground } from '../../../../../shared/ui/animated-auth-background/animated-auth-background';
import {
    CONTACT_EMAIL_MAX_LENGTH,
    CONTACT_PHONE_LENGTH,
    getContactValueError,
    isPhoneContactValue,
    sanitizeContactEmailInput,
    sanitizeContactPhoneInput,
} from '../../../../../shared/validation/field-validators';

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

        // Se sanea mientras se escribe: el campo ya no acepta caracteres fuera
        // del catálogo VC02 (era el bug "el correo no tiene el formato adecuado").
        const normalizedValue = isPhoneContactValue(value)
            ? sanitizeContactPhoneInput(value)
            : sanitizeContactEmailInput(value);

        if (originalValue !== normalizedValue) {
            control.setValue(normalizedValue, { emitEvent: false });
        }

        // Si había un error de una petición anterior, no debe ocultar el error local del nuevo valor.
        this.auth.clearError();
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
        return isPhoneContactValue(this.form.controls.contact.value);
    }

    protected contactIconLabel(): string {
        return this.isPhoneContact() ? 'Número telefónico' : 'Correo electrónico';
    }

    protected contactInputMode(): string {
        return this.isPhoneContact() ? 'numeric' : 'email';
    }

    protected contactMaxLength(): number {
        return this.isPhoneContact() ? CONTACT_PHONE_LENGTH : CONTACT_EMAIL_MAX_LENGTH;
    }

    /**
     * VC02 - HU01. La regla vive en shared/validation para que el formulario,
     * el repositorio de auth y la búsqueda avanzada usen exactamente la misma.
     */
    private contactValidator(control: AbstractControl<string>): ValidationErrors | null {
        // No depende de `this`: Angular puede ejecutar el ValidatorFn sin contexto de la clase.
        const message = getContactValueError(control.value);

        return message ? { contact: message } : null;
    }

    protected contactErrorMessage(): string | null {
        const control = this.form.controls.contact;

        if (!control.touched || control.valid) {
            return null;
        }

        return (control.errors?.['contact'] as string | undefined) ?? null;
    }
}
