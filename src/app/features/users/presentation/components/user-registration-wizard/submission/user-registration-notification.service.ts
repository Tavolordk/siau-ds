import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError, map } from 'rxjs';
import { CorreoDeliveryResult, CorreoFacade } from '../../../../../../core/correo';
import { SiauSelectOption } from '../../../../../../shared/ui';
import { UsersFacade } from '../../../../application/facades/users.facade';
import { buildUserCredentialsEmailRequest } from '../../../../application/notifications/user-credentials-email.template';
import {
    buildUserStructureUpdateEmailRequest,
    UserStructureEmailChange,
    UserStructureEmailProfile,
} from '../../../../application/notifications/user-structure-update-email.template';
import {
    ActualizarAdminResponse,
    RegistroAdminResponse,
    UserDetailRecord,
    UserRecord,
} from '../../../../domain/models/user-record.model';
import {
    AssignedSystemProfile,
    CLEAR_SELECTION_VALUE,
    NO_APLICA_VALUE,
    ProfileOrigin,
    SaveSuccessModalState,
    StructureEmailSnapshot,
    UserRegistrationForm,
} from '../models/user-registration-wizard.models';
import { UserRegistrationFormRules } from '../validation/user-registration-form.rules';

export interface StructureEmailCatalogs {
    readonly institutionTypes: readonly SiauSelectOption[];
    readonly states: readonly SiauSelectOption[];
    readonly municipalities: readonly SiauSelectOption[];
    readonly institutions: readonly SiauSelectOption[];
    readonly decentralizedBodies: readonly SiauSelectOption[];
    readonly administrativeUnits: readonly SiauSelectOption[];
    readonly commissionMunicipalities: readonly SiauSelectOption[];
    readonly commissionInstitutions: readonly SiauSelectOption[];
    readonly commissionDecentralizedBodies: readonly SiauSelectOption[];
    readonly commissionAdministrativeUnits: readonly SiauSelectOption[];
}

export interface StructureUpdateNotificationInput {
    readonly response: ActualizarAdminResponse;
    readonly form: UserRegistrationForm;
    readonly initialSnapshot: StructureEmailSnapshot | null;
    readonly currentProfiles: readonly AssignedSystemProfile[];
    readonly initialProfiles: readonly AssignedSystemProfile[];
    readonly catalogs: StructureEmailCatalogs;
    readonly resolveSystemLabel: (system: string) => string;
    readonly resolveRoleLabel: (
        system: string,
        role: string,
        systemLabel?: string,
        roleDescription?: string,
    ) => string;
}

/**
 * Centraliza correos y presentación del resultado de alta/actualización.
 * El componente sólo aporta estado de pantalla y catálogos; este servicio no toca señales de UI.
 */
@Injectable({ providedIn: 'root' })
export class UserRegistrationNotificationService {
    private readonly correoFacade = inject(CorreoFacade);
    private readonly usersFacade = inject(UsersFacade);
    private readonly formRules = inject(UserRegistrationFormRules);

    buildUpdateSuccessModalState(
        response: ActualizarAdminResponse,
        form: UserRegistrationForm,
        user: UserRecord | null,
        userDetail: UserDetailRecord | null,
        emailDelivery: CorreoDeliveryResult | null = null,
    ): SaveSuccessModalState {
        const fullName = [form.firstName, form.lastName, form.secondLastName]
            .map((value) => this.formRules.toText(value))
            .filter(Boolean)
            .join(' ');

        return {
            isUpdate: true,
            message: this.formRules.toText(response.mensaje) || 'El usuario se actualizó correctamente.',
            userNumber: this.formRules.toText(response.datos?.usuarioId ?? user?.userId ?? userDetail?.userId),
            account: this.formRules.toText(response.datos?.cuentaGenerada) || this.formRules.toText(user?.username),
            fullName,
            system: '',
            hasAccessEmail: emailDelivery !== null,
            accessEmail: this.formRules.normalizeEmail(form.email),
            accessPhone: this.formRules.formatPhoneForDisplay(form.phone),
            emailAccepted: emailDelivery?.accepted ?? false,
            emailStatus: this.formRules.toText(emailDelivery?.status),
            emailMessage: this.formRules.toText(emailDelivery?.message),
            emailReference: this.formRules.toText(emailDelivery?.correoId),
        };
    }

    buildSaveSuccessModalState(
        response: RegistroAdminResponse,
        form: UserRegistrationForm,
        emailDelivery: CorreoDeliveryResult | null = null,
    ): SaveSuccessModalState {
        const data = response.datos;

        return {
            isUpdate: false,
            message: this.formRules.toText(response.mensaje) || 'El usuario se guardó correctamente.',
            userNumber: this.formRules.toText(data?.usuarioId),
            account: this.formRules.toText(data?.cuentaGenerada) || this.formRules.toText(data?.cuenta),
            fullName: this.formRules.toText(data?.nombreCompleto),
            system: this.formRules.toText(data?.sistema),
            hasAccessEmail: emailDelivery !== null,
            accessEmail: this.formRules.normalizeEmail(form.email),
            accessPhone: this.formRules.formatPhoneForDisplay(form.phone),
            emailAccepted: emailDelivery?.accepted ?? false,
            emailStatus: this.formRules.toText(emailDelivery?.status),
            emailMessage: this.formRules.toText(emailDelivery?.message),
            emailReference: this.formRules.toText(emailDelivery?.correoId),
        };
    }

    sendStructureUpdateNotificationEmail(
        input: StructureUpdateNotificationInput,
    ): Observable<CorreoDeliveryResult | null> {
        const current = this.toStructureEmailSnapshot(input.form, input.catalogs);
        const changes: UserStructureEmailChange[] = [];
        const changedOrigins: ProfileOrigin[] = [];

        if (input.initialSnapshot && input.initialSnapshot.adscriptionSignature !== current.adscriptionSignature) {
            changes.push({
                type: 'adscripcion',
                previousValue: input.initialSnapshot.adscriptionDescription,
                newValue: current.adscriptionDescription,
            });
            changedOrigins.push('adscripcion');
        }

        if (input.initialSnapshot && input.initialSnapshot.commissionSignature !== current.commissionSignature) {
            changes.push({
                type: 'comision',
                previousValue: input.initialSnapshot.commissionDescription,
                newValue: current.commissionDescription,
            });
            changedOrigins.push('comision');
        }

        const recipient = this.formRules.normalizeEmail(input.form.email);
        const account = this.formRules.toText(input.response.datos?.cuentaGenerada);
        const temporaryPassword = this.formRules.toText(input.response.datos?.passwordTemporal);

        if (!account && !temporaryPassword) {
            return of(null);
        }

        if (!account || !temporaryPassword) {
            return throwError(() => new Error(
                'El usuario se actualizó, pero la respuesta de actualizar_admin devolvió incompletas las nuevas credenciales.',
            ));
        }

        if (!this.formRules.isValidEmail(recipient)) {
            return throwError(() => new Error(
                'El usuario se actualizó, pero no tiene un correo válido para enviarle las nuevas credenciales.',
            ));
        }

        const changedOriginSet = new Set<ProfileOrigin>(changedOrigins);
        const initialProfileKeys = new Set(
            input.initialProfiles.map((profile) => this.buildAssignedProfileKey(profile)),
        );
        const addedProfiles: UserStructureEmailProfile[] = input.currentProfiles
            .filter((profile) => changedOriginSet.has(profile.origin))
            .filter((profile) => !initialProfileKeys.has(this.buildAssignedProfileKey(profile)))
            .map((profile) => ({
                origin: profile.origin,
                system: this.formRules.toText(profile.systemLabel)
                    || input.resolveSystemLabel(profile.system)
                    || profile.system,
                profile: this.formRules.toText(profile.roleLabel)
                    || input.resolveRoleLabel(profile.system, profile.role, profile.systemLabel, profile.roleDescription)
                    || profile.role,
            }));

        const fullName = [input.form.firstName, input.form.lastName, input.form.secondLastName]
            .map((value) => this.formRules.toText(value))
            .filter(Boolean)
            .join(' ');

        return this.correoFacade.send(
            buildUserStructureUpdateEmailRequest({
                recipient,
                fullName,
                account,
                temporaryPassword,
                changes,
                addedProfiles,
            }),
        );
    }

    toStructureEmailSnapshot(
        form: UserRegistrationForm,
        catalogs: StructureEmailCatalogs,
    ): StructureEmailSnapshot {
        return {
            adscriptionSignature: this.buildStructureEmailSignature(form, 'adscripcion'),
            adscriptionDescription: this.buildStructureEmailDescription(form, 'adscripcion', catalogs),
            commissionSignature: this.buildStructureEmailSignature(form, 'comision'),
            commissionDescription: this.buildStructureEmailDescription(form, 'comision', catalogs),
        };
    }

    sendAccessCredentialsEmail(
        response: RegistroAdminResponse,
        temporaryPassword: string,
        form: UserRegistrationForm,
    ): Observable<CorreoDeliveryResult> {
        const data = response.datos;
        const account = this.formRules.toText(data?.cuentaGenerada) || this.formRules.toText(data?.cuenta);
        const recipient = this.formRules.normalizeEmail(form.email);

        if (!account) {
            return of(this.failedDelivery('El usuario fue creado, pero la respuesta no incluyó la cuenta para enviar el correo de acceso.'));
        }

        if (!this.formRules.isValidEmail(recipient)) {
            return of(this.failedDelivery('El usuario fue creado, pero no se encontró un correo electrónico válido para enviar sus datos de acceso.'));
        }

        const fullName = this.formRules.toText(data?.nombreCompleto) || [
            form.firstName,
            form.lastName,
            form.secondLastName,
        ]
            .map((value) => this.formRules.toText(value))
            .filter(Boolean)
            .join(' ');

        return this.correoFacade.send(
            buildUserCredentialsEmailRequest({
                recipient,
                fullName,
                account,
                email: recipient,
                phone: form.phone,
                system: this.formRules.toText(data?.sistema) || 'SIAU',
                temporaryPassword,
            }),
        );
    }

    requestTemporaryPassword(response: RegistroAdminResponse): Observable<string> {
        const account = this.formRules.toText(response.datos?.cuentaGenerada)
            || this.formRules.toText(response.datos?.cuenta);

        if (!account) {
            return of('').pipe(
                map(() => {
                    throw new Error(
                        'El usuario fue creado, pero la respuesta no incluyó la cuenta necesaria para obtener la contraseña temporal.',
                    );
                }),
            );
        }

        return this.usersFacade.getTemporaryPassword(account).pipe(
            map((passwordResponse) => {
                const temporaryPassword = this.formRules.toText(passwordResponse.datos?.passwordTemporal);

                if (!temporaryPassword) {
                    throw new Error(
                        passwordResponse.mensaje?.trim()
                        || 'El usuario fue creado, pero el servicio no devolvió la contraseña temporal.',
                    );
                }

                return temporaryPassword;
            }),
        );
    }

    toFailedEmailDelivery(
        error: unknown,
        fallbackMessage = 'El usuario fue creado, pero no fue posible solicitar el envío del correo de acceso.',
    ): CorreoDeliveryResult {
        return this.failedDelivery(error instanceof Error ? error.message : fallbackMessage);
    }

    private buildStructureEmailSignature(form: UserRegistrationForm, origin: ProfileOrigin): string {
        if (origin === 'comision' && !form.commissionEnabled) {
            return 'SIN_COMISION';
        }

        const values = origin === 'comision'
            ? [
                form.commissionInstitutionType,
                form.commissionEntity,
                form.commissionMunicipality,
                form.commissionInstitution,
                form.commissionDecentralizedBody,
                form.commissionAdministrativeUnit,
            ]
            : [
                form.institutionType,
                form.entity,
                form.municipality,
                form.institution,
                form.decentralizedBody,
                form.administrativeUnit,
            ];

        return values.map((value) => this.formRules.toText(value)).join('|');
    }

    private buildStructureEmailDescription(
        form: UserRegistrationForm,
        origin: ProfileOrigin,
        catalogs: StructureEmailCatalogs,
    ): string {
        if (origin === 'comision' && !form.commissionEnabled) {
            return 'Sin comisión';
        }

        const fields = origin === 'comision'
            ? [
                ['Tipo', form.commissionInstitutionType, catalogs.institutionTypes] as const,
                ['Entidad', form.commissionEntity, catalogs.states] as const,
                ['Municipio', form.commissionMunicipality, catalogs.commissionMunicipalities] as const,
                ['Institución', form.commissionInstitution, catalogs.commissionInstitutions] as const,
                ['Órgano', form.commissionDecentralizedBody, catalogs.commissionDecentralizedBodies] as const,
                ['Unidad administrativa', form.commissionAdministrativeUnit, catalogs.commissionAdministrativeUnits] as const,
            ]
            : [
                ['Tipo', form.institutionType, catalogs.institutionTypes] as const,
                ['Entidad', form.entity, catalogs.states] as const,
                ['Municipio', form.municipality, catalogs.municipalities] as const,
                ['Institución', form.institution, catalogs.institutions] as const,
                ['Órgano', form.decentralizedBody, catalogs.decentralizedBodies] as const,
                ['Unidad administrativa', form.administrativeUnit, catalogs.administrativeUnits] as const,
            ];

        const description = fields
            .map(([label, value, options]) => {
                const resolved = this.resolveStructureEmailOptionLabel(value, options);
                return resolved ? `${label}: ${resolved}` : '';
            })
            .filter(Boolean)
            .join(' · ');

        return description || (origin === 'comision' ? 'Comisión sin detalle' : 'Adscripción sin detalle');
    }

    private resolveStructureEmailOptionLabel(
        value: string | null | undefined,
        options: readonly SiauSelectOption[],
    ): string {
        const cleanValue = this.formRules.toText(value);

        if (!cleanValue || cleanValue === NO_APLICA_VALUE || cleanValue === CLEAR_SELECTION_VALUE) {
            return '';
        }

        const normalized = this.formRules.normalizeText(cleanValue);
        const option = options.find(
            (item) =>
                item.value === cleanValue
                || this.formRules.normalizeText(item.value) === normalized
                || this.formRules.normalizeText(item.label) === normalized,
        );

        return this.formRules.toText(option?.label) || cleanValue;
    }

    private buildAssignedProfileKey(profile: AssignedSystemProfile): string {
        return [profile.origin, profile.system, profile.role]
            .map((value) => this.formRules.toText(value).trim().toUpperCase())
            .join('|');
    }

    private failedDelivery(message: string): CorreoDeliveryResult {
        return {
            accepted: false,
            message,
            status: null,
            correoId: null,
            recipientCount: 0,
            acceptedAtUtc: null,
            traceId: null,
        };
    }
}
