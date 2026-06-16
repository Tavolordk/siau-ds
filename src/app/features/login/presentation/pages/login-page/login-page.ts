import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../../../../core/auth/application/auth.facade';
import { LoginContactMethod } from '../../../../../core/auth/domain/login-request.model';
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
export class LoginPage implements OnInit {
    private readonly formBuilder = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);

    protected readonly auth = inject(AuthFacade);
    protected readonly captcha = inject(CaptchaFacade);

    protected readonly form = this.formBuilder.nonNullable.group({
        username: ['', [Validators.required, Validators.minLength(3)]],
        contactMethod: ['telegram' as LoginContactMethod, [Validators.required]],
        contact: ['', [Validators.required, Validators.pattern(/^\d{10,15}$/)]],
        captcha: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(12)]],
    });

    private readonly captchaResetEffect = effect(() => {
        const challengeId = this.captcha.challenge()?.id;

        if (challengeId) {
            this.form.controls.captcha.setValue('', { emitEvent: false });
        }
    });

    ngOnInit(): void {
        this.captcha.load();

        this.form.controls.contactMethod.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((method) => {
                this.form.controls.contact.setValue('', { emitEvent: false });
                this.setContactValidators(method);
                this.auth.clearError();
            });
    }

    protected submit(): void {
        this.form.markAllAsTouched();

        if (this.form.invalid || this.auth.loading() || this.captcha.loading() || this.captcha.verifying()) {
            return;
        }

        const value = this.form.getRawValue();

        this.auth.login({
            username: value.username.trim(),
            contactMethod: value.contactMethod,
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

    protected selectContactMethod(method: LoginContactMethod): void {
        if (this.auth.loading()) {
            return;
        }

        this.form.controls.contactMethod.setValue(method);
    }

    protected isSelectedContactMethod(method: LoginContactMethod): boolean {
        return this.form.controls.contactMethod.value === method;
    }

    protected isTelegramContact(): boolean {
        return this.form.controls.contactMethod.value === 'telegram';
    }

    protected contactPlaceholder(): string {
        return this.isTelegramContact() ? 'Número de Telegram' : 'Correo electrónico';
    }

    protected contactAutocomplete(): string {
        return this.isTelegramContact() ? 'tel' : 'email';
    }

    protected normalizeContact(): void {
        const control = this.form.controls.contact;
        const value = control.value;
        const normalized = this.isTelegramContact() ? value.replace(/\D/g, '').slice(0, 15) : value.trim();

        if (value !== normalized) {
            control.setValue(normalized, { emitEvent: false });
        }
    }

    protected normalizeCaptcha(): void {
        const value = this.form.controls.captcha.value.toUpperCase().replace(/\s+/g, '');
        this.form.controls.captcha.setValue(value, { emitEvent: false });
    }

    private setContactValidators(method: LoginContactMethod): void {
        const control = this.form.controls.contact;
        const validators =
            method === 'telegram'
                ? [Validators.required, Validators.pattern(/^\d{10,15}$/)]
                : [Validators.required, Validators.email];

        control.setValidators(validators);
        control.updateValueAndValidity({ emitEvent: false });
    }
}