import { inject, Injectable } from '@angular/core';
import { SiauSelectOption } from '../../../../../shared/ui';
import {
    ActualizarAdminPerfil,
    ActualizarAdminRequest,
    RegistroAdminCuenta,
    RegistroAdminRequest,
    RegistroAsignacion,
    RegistroMedioContacto,
} from '../../../domain/models/user-record.model';
import {
    AssignedSystemProfile,
    DEFAULT_NORMAL_PROFILE_ID,
    DEFAULT_NORMAL_SYSTEM_ID,
    ProfileOrigin,
    RenapoLookupStatus,
    UserRegistrationForm,
} from './user-registration-wizard.models';
import { UserRegistrationFormRules } from './user-registration-form.rules';

export interface CreateUserRequestInput {
    readonly form: UserRegistrationForm;
    readonly assignedProfiles: readonly AssignedSystemProfile[];
    readonly userTypeOptions: readonly SiauSelectOption[];
    readonly renapoLookupStatus: RenapoLookupStatus;
    readonly executorUserId: number | null;
    readonly resolveSystemId: (profile: AssignedSystemProfile) => number;
}

export interface UpdateUserRequestInput {
    readonly targetUserId: number | null;
    readonly form: UserRegistrationForm;
    readonly assignedProfiles: readonly AssignedSystemProfile[];
    readonly detailCurpValidated: boolean;
    readonly renapoLookupStatus: RenapoLookupStatus;
    readonly executorUserId: number | null;
    readonly resolveSystemId: (profile: AssignedSystemProfile) => number;
}

/**
 * Construye exclusivamente los payloads que ya consume el backend de SIAU.
 * No hace HTTP y no decide flujo de pantalla. Mantiene los nombres/shape del contrato existente.
 */
@Injectable({ providedIn: 'root' })
export class UserRegistrationRequestFactory {
    private readonly formRules = inject(UserRegistrationFormRules);

    buildCreate(input: CreateUserRequestInput): RegistroAdminRequest {
        const current = input.form;
        const assignedProfiles = input.assignedProfiles;
        const assignedProfile = assignedProfiles[0] ?? null;

        return {
            datosPersonales: {
                cuip: this.toNullableText(current.cuip),
                curp: this.requireText(current.curp, 'Captura la CURP.').toUpperCase(),
                rfc: this.toNullableText(current.rfc)?.toUpperCase() ?? null,
                nombres: this.requireText(current.firstName, 'Captura el nombre.').toUpperCase(),
                primerApellido: this.requireText(current.lastName, 'Captura el primer apellido.').toUpperCase(),
                segundoApellido: this.toNullableText(current.secondLastName)?.toUpperCase() ?? null,
                sexoId: this.requireCatalogId(current.gender, 'Selecciona el sexo.'),
                fechaNacimiento: this.requireText(current.birthDate, 'Captura la fecha de nacimiento.'),
                estadoCivilId: this.toCatalogId(current.civilStatus) ?? null,
                curpValidada: input.renapoLookupStatus === 'success' ? 1 : 0,
            },
            adscripcion: {
                estructuraId: this.resolveAssignmentStructureId(current),
                cargo: this.toNullableText(current.position)?.toUpperCase() ?? null,
                funciones: this.toNullableText(current.functions),
                numeroEmpleado: this.toNullableText(current.employeeNumber),
                fechaInicio: this.toNullableText(current.admissionDate),
            },
            comision: this.buildCommissionRequest(current, false),
            medioContacto: this.buildContactRequest(current),
            cuenta: this.buildAdminAccountRequest(
                assignedProfile,
                input.userTypeOptions,
                input.resolveSystemId,
            ),
            perfiles: assignedProfiles.length > 0
                ? assignedProfiles.map((profile) => ({
                    idSistema: input.resolveSystemId(profile),
                    idPerfil: this.requireCatalogId(profile.role, 'Selecciona un perfil válido.'),
                }))
                : null,
            comentario: this.toNullableText(current.comment),
            auditoria: {
                usuarioEjecutorId: input.executorUserId,
                correlationId: `siau-admin-${Date.now()}`,
            },
        };
    }

    buildUpdate(input: UpdateUserRequestInput): ActualizarAdminRequest {
        const userId = input.targetUserId;
        const current = input.form;

        if (!userId || userId <= 0) {
            throw new Error('No fue posible identificar al usuario que se desea actualizar.');
        }

        return {
            usuarioId: userId,
            ...(input.detailCurpValidated
                ? {}
                : {
                    curp: this.requireText(current.curp, 'Captura la CURP.').toUpperCase(),
                    nombres: this.requireText(current.firstName, 'Captura el nombre.').toUpperCase(),
                    primerApellido: this.requireText(current.lastName, 'Captura el primer apellido.').toUpperCase(),
                    segundoApellido: this.toNullableText(current.secondLastName)?.toUpperCase() ?? null,
                    fechaNacimiento: this.requireText(current.birthDate, 'Captura la fecha de nacimiento.'),
                }),
            rfc: this.toNullableText(current.rfc)?.toUpperCase() ?? null,
            sexoId: this.requireCatalogId(current.gender, 'Selecciona el sexo.'),
            estadoCivilId: this.toCatalogId(current.civilStatus) ?? null,
            cuip: this.toNullableText(current.cuip),
            curpValidada: this.resolveCurpValidatedValue(
                input.renapoLookupStatus,
                input.detailCurpValidated,
            ),
            adscripcion: {
                estructuraId: this.resolveAssignmentStructureId(current),
                cargo: this.toNullableText(current.position)?.toUpperCase() ?? null,
                funciones: this.toNullableText(current.functions),
                numeroEmpleado: this.toNullableText(current.employeeNumber),
                fechaInicio: this.toNullableText(current.admissionDate),
            },
            comision: this.buildCommissionRequest(current, true),
            contacto: this.buildContactRequest(current),
            perfiles: this.buildProfilesForOrigin(input, 'adscripcion'),
            perfilesComision: this.buildProfilesForOrigin(input, 'comision'),
            auditoria: {
                usuarioEjecutorId: input.executorUserId,
                correlationId: 'SIAU-FRONT',
            },
        };
    }

    private buildProfilesForOrigin(
        input: UpdateUserRequestInput,
        origin: ProfileOrigin,
    ): readonly ActualizarAdminPerfil[] {
        const profiles = input.assignedProfiles.filter((profile) => profile.origin === origin);

        if (profiles.length > 0) {
            return profiles.map((profile) => ({
                idSistema: input.resolveSystemId(profile),
                idPerfil: this.requireCatalogId(profile.role, 'Selecciona un perfil válido.'),
            }));
        }

        if (origin === 'comision') {
            return [];
        }

        return input.assignedProfiles.length > 0
            ? []
            : [{ idSistema: DEFAULT_NORMAL_SYSTEM_ID, idPerfil: DEFAULT_NORMAL_PROFILE_ID }];
    }

    private resolveCurpValidatedValue(
        status: RenapoLookupStatus,
        detailCurpValidated: boolean,
    ): 0 | 1 {
        if (status === 'success') return 1;
        if (status === 'not-found') return 0;
        return detailCurpValidated ? 1 : 0;
    }

    private buildCommissionRequest(
        current: UserRegistrationForm,
        isEditMode: boolean,
    ): RegistroAsignacion | null {
        if (!current.commissionEnabled) {
            return null;
        }

        return {
            estructuraId: this.resolveCommissionStructureId(current),
            cargo: null,
            funciones: null,
            numeroEmpleado: null,
            fechaInicio: isEditMode
                ? this.toNullableText(current.commissionAdmissionDate)
                : this.requireText(
                    current.commissionAdmissionDate,
                    'Captura la fecha de inicio de la comisión.',
                ),
        };
    }

    private buildAdminAccountRequest(
        assignedProfile: AssignedSystemProfile | null,
        userTypeOptions: readonly SiauSelectOption[],
        resolveSystemId: (profile: AssignedSystemProfile) => number,
    ): RegistroAdminCuenta {
        return {
            tipoUsuarioId: this.resolveDefaultCatalogId(userTypeOptions, 1),
            sistemaId: assignedProfile ? resolveSystemId(assignedProfile) : DEFAULT_NORMAL_SYSTEM_ID,
            perfilId: assignedProfile
                ? this.requireCatalogId(assignedProfile.role, 'Selecciona un perfil válido.')
                : DEFAULT_NORMAL_PROFILE_ID,
            estadoCuentaId: 1,
        };
    }

    private buildContactRequest(current: UserRegistrationForm): RegistroMedioContacto {
        const correo = this.formRules.normalizeEmail(current.email);
        const celular = this.formRules.toText(current.phone);

        if (!correo || !celular) {
            throw new Error('Captura el correo electrónico y el teléfono celular.');
        }

        return { correo, celular };
    }

    private resolveAssignmentStructureId(current: UserRegistrationForm): number {
        return this.resolveStructureId(
            [current.administrativeUnit, current.decentralizedBody, current.institution],
            'Selecciona la institución, órgano o unidad de adscripción.',
        );
    }

    private resolveCommissionStructureId(current: UserRegistrationForm): number {
        return this.resolveStructureId(
            [
                current.commissionAdministrativeUnit,
                current.commissionDecentralizedBody,
                current.commissionInstitution,
            ],
            'Selecciona la institución, órgano o unidad de comisión.',
        );
    }

    private resolveStructureId(values: readonly string[], errorMessage: string): number {
        const value = values
            .map((item) => this.toCatalogId(item))
            .find((item) => item !== undefined);

        if (!value) {
            throw new Error(errorMessage);
        }

        return value;
    }

    private resolveDefaultCatalogId(options: readonly SiauSelectOption[], fallback: number): number {
        const firstOption = options[0];
        if (!firstOption) return fallback;
        return this.toCatalogId(firstOption.value) ?? fallback;
    }

    private requireCatalogId(value: string, errorMessage: string): number {
        const id = this.toCatalogId(value);
        if (!id) throw new Error(errorMessage);
        return id;
    }

    private requireText(value: string, errorMessage: string): string {
        const text = this.formRules.toText(value);
        if (!text) throw new Error(errorMessage);
        return text;
    }

    private toNullableText(value: string | null | undefined): string | null {
        const text = this.formRules.toText(value);
        return text || null;
    }

    private toCatalogId(value: string | null | undefined): number | undefined {
        if (!value) return undefined;
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : undefined;
    }
}
