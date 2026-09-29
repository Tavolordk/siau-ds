import {
    DestroyRef,
    inject,
    Injectable,
    WritableSignal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    catchError,
    finalize,
    map,
    Observable,
    of,
    switchMap,
} from 'rxjs';
import { SiauSelectOption } from '../../../../../../shared/ui';
import { UsersFacade } from '../../../../application/facades/users.facade';
import {
    RegistroValidacionResponse,
    UserDetailRecord,
    UserRecord,
} from '../../../../domain/models/user-record.model';
import {
    AssignedSystemProfile,
    RenapoLookupStatus,
    SaveSuccessModalState,
    StructureEmailSnapshot,
    UserRegistrationForm,
    WizardStepId,
} from '../models/user-registration-wizard.models';
import {
    StructureEmailCatalogs,
    UserRegistrationNotificationService,
} from './user-registration-notification.service';
import { UserRegistrationRequestFactory } from './user-registration-request.factory';

export interface UserRegistrationSubmissionContext {
    readonly form: WritableSignal<UserRegistrationForm>;
    readonly formErrors: WritableSignal<Record<string, string>>;
    readonly isSubmitting: WritableSignal<boolean>;
    readonly saveSuccess: WritableSignal<SaveSuccessModalState | null>;
    readonly assignedProfiles: () => readonly AssignedSystemProfile[];
    readonly userTypeOptions: () => readonly SiauSelectOption[];
    readonly renapoLookupStatus: () => RenapoLookupStatus;
    readonly detailCurpValidated: () => boolean;
    readonly user: () => UserRecord | null;
    readonly userDetail: () => UserDetailRecord | null;
    readonly readonlyMode: () => boolean;
    readonly isFormDisabled: () => boolean;
    readonly isEditMode: () => boolean;
    readonly validateAllSteps: () => boolean;
    readonly resolveCurrentUserId: () => number | null;
    readonly resolveAssignedSystemId: (profile: AssignedSystemProfile) => number;
    readonly stepOrder: () => readonly WizardStepId[];
    readonly markCompleted: (stepId: WizardStepId) => void;
    readonly initialStructureSnapshot: () => StructureEmailSnapshot | null;
    readonly initialProfiles: () => readonly AssignedSystemProfile[];
    readonly structureEmailCatalogs: () => StructureEmailCatalogs;
    readonly resolveSystemLabel: (system: string) => string;
    readonly resolveRoleLabel: (
        system: string,
        role: string,
        systemLabel?: string,
        roleDescription?: string,
    ) => string;
    readonly deleteDraftAfterSuccess: () => Observable<void>;
    readonly clearSubmitError: () => void;
}

/** Orquesta el caso de uso de alta/actualización, sin mezclarlo con la vista. */
@Injectable({ providedIn: 'root' })
export class UserRegistrationSubmissionCoordinator {
    private readonly usersFacade = inject(UsersFacade);
    private readonly requestFactory = inject(UserRegistrationRequestFactory);
    private readonly notificationService = inject(UserRegistrationNotificationService);
    private readonly destroyRef = inject(DestroyRef);

    submit(ctx: UserRegistrationSubmissionContext): void {
        if (ctx.readonlyMode() || ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        ctx.clearSubmitError();

        if (ctx.isEditMode()) {
            this.submitUpdate(ctx);
            return;
        }

        this.submitCreate(ctx);
    }

    private submitUpdate(ctx: UserRegistrationSubmissionContext): void {
        if (!ctx.validateAllSteps()) {
            return;
        }

        let updateRequest;
        try {
            updateRequest = this.requestFactory.buildUpdate({
                targetUserId: ctx.user()?.userId ?? ctx.userDetail()?.userId ?? null,
                form: ctx.form(),
                assignedProfiles: ctx.assignedProfiles(),
                detailCurpValidated: ctx.detailCurpValidated(),
                renapoLookupStatus: ctx.renapoLookupStatus(),
                executorUserId: ctx.resolveCurrentUserId(),
                resolveSystemId: (profile) => ctx.resolveAssignedSystemId(profile),
            });
        } catch (error) {
            this.setSubmitError(ctx, error, 'Revisa la información capturada.');
            return;
        }

        ctx.isSubmitting.set(true);
        this.usersFacade.updateAdminUser(updateRequest)
            .pipe(
                switchMap((response) =>
                    this.notificationService.sendStructureUpdateNotificationEmail({
                        response,
                        form: ctx.form(),
                        initialSnapshot: ctx.initialStructureSnapshot(),
                        currentProfiles: ctx.assignedProfiles(),
                        initialProfiles: ctx.initialProfiles(),
                        catalogs: ctx.structureEmailCatalogs(),
                        resolveSystemLabel: ctx.resolveSystemLabel,
                        resolveRoleLabel: ctx.resolveRoleLabel,
                    }).pipe(
                        map((emailDelivery) => ({ response, emailDelivery })),
                        catchError((error: unknown) => {
                            console.warn(
                                'El usuario se actualizó, pero no fue posible enviar el correo con las nuevas credenciales.',
                                error,
                            );
                            return of({
                                response,
                                emailDelivery: this.notificationService.toFailedEmailDelivery(
                                    error,
                                    'El usuario se actualizó, pero no fue posible enviar el correo con las nuevas credenciales.',
                                ),
                            });
                        }),
                    ),
                ),
                takeUntilDestroyed(this.destroyRef),
                finalize(() => ctx.isSubmitting.set(false)),
            )
            .subscribe({
                next: ({ response, emailDelivery }) => {
                    ctx.stepOrder().forEach((stepId) => ctx.markCompleted(stepId));
                    ctx.saveSuccess.set(
                        this.notificationService.buildUpdateSuccessModalState(
                            response,
                            ctx.form(),
                            ctx.user(),
                            ctx.userDetail(),
                            emailDelivery,
                        ),
                    );
                },
                error: (error: unknown) => {
                    this.setSubmitError(ctx, error, 'No fue posible actualizar el usuario.');
                    console.error('Error actualizando usuario.', error);
                },
            });
    }

    private submitCreate(ctx: UserRegistrationSubmissionContext): void {
        if (!ctx.validateAllSteps()) {
            return;
        }

        let saveRequest$;
        try {
            const request = this.requestFactory.buildCreate({
                form: ctx.form(),
                assignedProfiles: ctx.assignedProfiles(),
                userTypeOptions: ctx.userTypeOptions(),
                renapoLookupStatus: ctx.renapoLookupStatus(),
                executorUserId: ctx.resolveCurrentUserId(),
                resolveSystemId: (profile) => ctx.resolveAssignedSystemId(profile),
            });
            const form = ctx.form();
            const validationRequest$ = this.usersFacade.validateRegistrationAvailability({
                curp: form.curp.trim().toUpperCase() || null,
                rfc: form.rfc.trim().toUpperCase() || null,
                correo: form.email.trim().toLowerCase() || null,
                celular: form.phone.replace(/\D/g, '') || null,
            }).pipe(
                map((validation) => ({ kind: 'validated' as const, validation })),
                catchError((error: unknown) => {
                    if (error instanceof HttpErrorResponse && error.status === 409) {
                        const body = error.error as { mensaje?: string; message?: string } | null;
                        const message = body?.mensaje?.trim() || body?.message?.trim()
                            || 'Uno de los datos ya se encuentra registrado o tiene una solicitud en curso.';
                        ctx.formErrors.update((current) => ({ ...current, submit: message }));
                        return of({ kind: 'blocked' as const });
                    }

                    // La validación de duplicados no debe impedir el registro si el servicio está caído.
                    console.warn('No fue posible validar duplicados; se continuará con el registro.', error);
                    ctx.formErrors.update((current) => ({
                        ...current,
                        submit: 'No fue posible validar si existen o no la CURP, RFC, correo o teléfono. Se continuará con el registro.',
                    }));
                    return of({ kind: 'bypass' as const });
                }),
            );

            saveRequest$ = validationRequest$.pipe(
                switchMap((result) => {
                    if (result.kind === 'blocked') return of(null);
                    if (result.kind === 'bypass') return this.usersFacade.createAdminUser(request);

                    const validationErrors = this.toAvailabilityErrors(result.validation);
                    if (Object.keys(validationErrors).length > 0) {
                        ctx.formErrors.update((current) => ({
                            ...current,
                            ...validationErrors,
                            submit: 'Corrige los datos marcados antes de registrar al usuario.',
                        }));
                        return of(null);
                    }

                    return this.usersFacade.createAdminUser(request);
                }),
            );
        } catch (error) {
            this.setSubmitError(ctx, error, 'Revisa la información capturada.');
            console.error(error);
            return;
        }

        ctx.isSubmitting.set(true);
        saveRequest$
            .pipe(
                switchMap((response) => {
                    if (!response) return of(null);

                    return this.notificationService.requestTemporaryPassword(response).pipe(
                        switchMap((temporaryPassword) =>
                            this.notificationService.sendAccessCredentialsEmail(
                                response,
                                temporaryPassword,
                                ctx.form(),
                            ),
                        ),
                        map((emailDelivery) => ({ response, emailDelivery })),
                        catchError((error: unknown) =>
                            of({
                                response,
                                emailDelivery: this.notificationService.toFailedEmailDelivery(error),
                            }),
                        ),
                    );
                }),
                switchMap((result) => {
                    if (!result) return of(null);

                    return ctx.deleteDraftAfterSuccess().pipe(
                        map(() => result),
                    );
                }),
                takeUntilDestroyed(this.destroyRef),
                finalize(() => ctx.isSubmitting.set(false)),
            )
            .subscribe({
                next: (result) => {
                    if (!result) return;
                    const { response, emailDelivery } = result;
                    ctx.stepOrder().forEach((stepId) => ctx.markCompleted(stepId));
                    ctx.saveSuccess.set(
                        this.notificationService.buildSaveSuccessModalState(
                            response,
                            ctx.form(),
                            emailDelivery,
                        ),
                    );
                },
                error: (error: unknown) => {
                    this.setSubmitError(ctx, error, 'No fue posible registrar el usuario.');
                    console.error('Error registrando usuario.', error);
                },
            });
    }

    private toAvailabilityErrors(
        response: RegistroValidacionResponse,
    ): Record<string, string> {
        const errors: Record<string, string> = {};

        if (response.curpFormatoValido === 0 || response.curpDisponible === 0) {
            errors['curp'] = response.curpMensaje?.trim()
                || (response.curpFormatoValido === 0
                    ? 'La CURP no tiene un formato válido.'
                    : 'La CURP ya se encuentra registrada.');
        }

        if (response.rfcFormatoValido === 0 || response.rfcDisponible === 0) {
            errors['rfc'] = response.rfcMensaje?.trim()
                || (response.rfcFormatoValido === 0
                    ? 'El RFC no tiene un formato válido.'
                    : 'El RFC ya se encuentra registrado o tiene una solicitud en curso.');
        }

        if (response.correoFormatoValido === 0 || response.correoDisponible === 0) {
            errors['email'] = response.correoMensaje?.trim()
                || (response.correoFormatoValido === 0
                    ? 'El correo electrónico no tiene un formato válido.'
                    : 'El correo electrónico ya se encuentra registrado.');
        }

        if (response.celularFormatoValido === 0 || response.celularDisponible === 0) {
            errors['phone'] = response.celularMensaje?.trim()
                || (response.celularFormatoValido === 0
                    ? 'El teléfono celular no tiene un formato válido.'
                    : 'El teléfono celular ya se encuentra registrado.');
        }

        return errors;
    }

    private setSubmitError(
        ctx: UserRegistrationSubmissionContext,
        error: unknown,
        fallback: string,
    ): void {
        const message = error instanceof Error ? error.message : fallback;
        ctx.formErrors.update((current) => ({ ...current, submit: message }));
    }
}
