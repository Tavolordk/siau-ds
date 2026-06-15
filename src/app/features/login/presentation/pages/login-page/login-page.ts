import { ChangeDetectionStrategy, Component, effect, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
export class LoginPage implements OnInit {
    private readonly formBuilder = inject(FormBuilder);

    protected readonly auth = inject(AuthFacade);
    protected readonly captcha = inject(CaptchaFacade);

    protected readonly form = this.formBuilder.nonNullable.group({
        username: ['', [Validators.required, Validators.minLength(3)]],
        password: ['', [Validators.required, Validators.minLength(6)]],
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
    }

    protected submit(): void {
        this.form.markAllAsTouched();

        if (this.form.invalid || this.auth.loading() || this.captcha.loading() || this.captcha.verifying()) {
            return;
        }

        this.auth.login(this.form.getRawValue());
    }

    protected refreshCaptcha(): void {
        if (this.auth.loading() || this.captcha.loading() || this.captcha.verifying()) {
            return;
        }

        this.auth.clearError();
        this.form.controls.captcha.setValue('', { emitEvent: false });
        this.captcha.refresh();
    }

    protected normalizeCaptcha(): void {
        const value = this.form.controls.captcha.value.toUpperCase().replace(/\s+/g, '');
        this.form.controls.captcha.setValue(value, { emitEvent: false });
    }
}