import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UsersFacade } from '../../../../../application/facades/users.facade';
import { SiauInput } from '../../../../../../../shared/ui/index';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationTemplateContext } from '../../view/user-registration-template.context';

@Component({
    selector: 'app-user-registration-contact-step',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauInput, SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './contact-step.html',
})
export class ContactStep extends UserRegistrationTemplateContext {
    private readonly usersFacade = inject(UsersFacade);
    private readonly destroyRef = inject(DestroyRef);

    protected validateEmailAvailability(rawValue: string): void {
        if (this.isEditMode() || this.isFormDisabled()) return;

        const correo = rawValue.trim().toLowerCase();
        if (!correo) {
            this.state.emailAvailabilityStatus.set('unvalidated');
            this.clearAvailabilityError('email');
            return;
        }

        this.clearAvailabilityError('email');
        this.state.emailAvailabilityStatus.set('pending');
        this.usersFacade.validateRegistrationAvailability({ correo })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    // Evita pintar una respuesta vieja si el usuario cambió el valor mientras esperaba.
                    if (this.form().email.trim().toLowerCase() !== correo) return;

                    const message = response.correoMensaje?.trim();
                    if (response.correoFormatoValido === 0 || response.correoDisponible === 0) {
                        this.state.emailAvailabilityStatus.set('invalid');
                        this.setAvailabilityError(
                            'email',
                            message || (response.correoFormatoValido === 0
                                ? 'El correo electrónico no tiene un formato válido.'
                                : 'El correo electrónico ya se encuentra registrado.'),
                        );
                        return;
                    }

                    this.state.emailAvailabilityStatus.set('valid');
                    this.clearAvailabilityError('email');
                },
                error: (error: unknown) => {
                    if (this.form().email.trim().toLowerCase() !== correo) return;
                    if (error instanceof HttpErrorResponse && error.status === 409) {
                        this.state.emailAvailabilityStatus.set('invalid');
                        this.setAvailabilityError(
                            'email',
                            this.getApiMessage(error) || 'El correo electrónico ya se encuentra registrado o tiene una solicitud en curso.',
                        );
                        return;
                    }

                    // Si el servicio de validación no está disponible, no bloqueamos el alta.
                    this.state.emailAvailabilityStatus.set('valid');
                    this.setAvailabilityError(
                        'email',
                        'No fue posible validar si existe o no el correo electrónico.',
                    );
                },
            });
    }

    protected validatePhoneAvailability(rawValue: string): void {
        if (this.isEditMode() || this.isFormDisabled()) return;

        const celular = rawValue.replace(/\D/g, '');
        if (!celular) {
            this.state.phoneAvailabilityStatus.set('unvalidated');
            this.clearAvailabilityError('phone');
            return;
        }

        this.clearAvailabilityError('phone');
        this.state.phoneAvailabilityStatus.set('pending');
        this.usersFacade.validateRegistrationAvailability({ celular })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    if (this.form().phone.replace(/\D/g, '') !== celular) return;

                    const message = response.celularMensaje?.trim();
                    if (response.celularFormatoValido === 0 || response.celularDisponible === 0) {
                        this.state.phoneAvailabilityStatus.set('invalid');
                        this.setAvailabilityError(
                            'phone',
                            message || (response.celularFormatoValido === 0
                                ? 'El teléfono celular no tiene un formato válido.'
                                : 'El teléfono celular ya se encuentra registrado.'),
                        );
                        return;
                    }

                    this.state.phoneAvailabilityStatus.set('valid');
                    this.clearAvailabilityError('phone');
                },
                error: (error: unknown) => {
                    if (this.form().phone.replace(/\D/g, '') !== celular) return;
                    if (error instanceof HttpErrorResponse && error.status === 409) {
                        this.state.phoneAvailabilityStatus.set('invalid');
                        this.setAvailabilityError(
                            'phone',
                            this.getApiMessage(error) || 'El teléfono celular ya se encuentra registrado o tiene una solicitud en curso.',
                        );
                        return;
                    }

                    // Si el servicio de validación no está disponible, no bloqueamos el alta.
                    this.state.phoneAvailabilityStatus.set('valid');
                    this.setAvailabilityError(
                        'phone',
                        'No fue posible validar si existe o no el teléfono celular.',
                    );
                },
            });
    }

    private getApiMessage(error: HttpErrorResponse): string {
        const body = error.error as { mensaje?: string; message?: string } | null;
        return body?.mensaje?.trim() || body?.message?.trim() || '';
    }

    private setAvailabilityError(field: 'email' | 'phone', message: string): void {
        this.formErrors.update((current) => ({ ...current, [field]: message }));
    }

    private clearAvailabilityError(field: 'email' | 'phone'): void {
        this.formErrors.update((current) => {
            if (!(field in current)) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
    }
}
