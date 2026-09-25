import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UsersFacade } from '../../../../../application/facades/users.facade';
import { SiauInput, SiauSelect } from '../../../../../../../shared/ui/index';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationFormRules } from '../../validation/user-registration-form.rules';
import { UserRegistrationTemplateContext } from '../../view/user-registration-template.context';

@Component({
    selector: 'app-user-registration-personal-data-step',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauInput, SiauSelect, SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './personal-data-step.html',
})
export class PersonalDataStep extends UserRegistrationTemplateContext {
    private readonly usersFacade = inject(UsersFacade);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly destroyRef = inject(DestroyRef);

    protected validateRfcAvailability(rawValue: string): void {
        if (this.isEditMode() || this.isFormDisabled()) return;

        const rfc = this.formRules.normalizeRfc(rawValue);
        if (!rfc) {
            this.state.rfcAvailabilityStatus.set('unvalidated');
            this.clearRfcAvailabilityError();
            return;
        }

        if (!this.formRules.isValidRfc(rfc)) {
            this.state.rfcAvailabilityStatus.set('invalid');
            this.setRfcAvailabilityError('El RFC no tiene un formato válido.');
            return;
        }

        this.clearRfcAvailabilityError();
        this.state.rfcAvailabilityStatus.set('pending');
        this.usersFacade.validateRegistrationAvailability({ rfc })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    if (this.formRules.normalizeRfc(this.form().rfc) !== rfc) return;

                    const message = response.rfcMensaje?.trim();
                    if (response.rfcFormatoValido === 0 || response.rfcDisponible === 0) {
                        this.state.rfcAvailabilityStatus.set('invalid');
                        this.setRfcAvailabilityError(
                            message || (response.rfcFormatoValido === 0
                                ? 'El RFC no tiene un formato válido.'
                                : 'El RFC ya se encuentra registrado o tiene una solicitud en curso.'),
                        );
                        return;
                    }

                    this.state.rfcAvailabilityStatus.set('valid');
                    this.clearRfcAvailabilityError();
                },
                error: (error: unknown) => {
                    if (this.formRules.normalizeRfc(this.form().rfc) !== rfc) return;
                    if (error instanceof HttpErrorResponse && error.status === 409) {
                        this.state.rfcAvailabilityStatus.set('invalid');
                        const body = error.error as { mensaje?: string; message?: string } | null;
                        this.setRfcAvailabilityError(
                            body?.mensaje?.trim() || body?.message?.trim()
                            || 'El RFC ya se encuentra registrado o tiene una solicitud en curso.',
                        );
                        return;
                    }

                    // Si el servicio de validación no está disponible, no bloqueamos el alta.
                    this.state.rfcAvailabilityStatus.set('valid');
                    this.setRfcAvailabilityError(
                        'No fue posible validar si existe o no el RFC.',
                    );
                },
            });
    }

    private setRfcAvailabilityError(message: string): void {
        this.formErrors.update((current) => ({ ...current, rfc: message }));
    }

    private clearRfcAvailabilityError(): void {
        this.formErrors.update((current) => {
            if (!('rfc' in current)) return current;
            const next = { ...current };
            delete next['rfc'];
            return next;
        });
    }
}
