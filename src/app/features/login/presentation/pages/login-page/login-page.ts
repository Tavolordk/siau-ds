import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../../../../core/auth/application/auth.facade';
import { AnimatedAuthBackground } from '../../../../../shared/ui/animated-auth-background/animated-auth-background';

@Component({
    selector: 'siau-login-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, RouterLink, AnimatedAuthBackground],
    templateUrl: './login-page.html',
    styleUrl: './login-page.scss',
})
export class LoginPage {
    private readonly formBuilder = inject(FormBuilder);
    protected readonly auth = inject(AuthFacade);

    protected readonly form = this.formBuilder.nonNullable.group({
        username: ['', [Validators.required, Validators.minLength(3)]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        captcha: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    });

    protected submit(): void {
        this.form.markAllAsTouched();

        if (this.form.invalid || this.auth.loading()) {
            return;
        }

        this.auth.login(this.form.getRawValue());
    }

    protected normalizeCaptcha(): void {
        const value = this.form.controls.captcha.value.toUpperCase().replace(/\s+/g, '');
        this.form.controls.captcha.setValue(value, { emitEvent: false });
    }
}