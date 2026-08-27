import { inject, Injectable } from '@angular/core';
import { SiauSelectOption } from '../../../../../../shared/ui';
import {
    BorradorDatos,
    BorradorGuardarRequest,
} from '../../../../domain/models/user-record.model';
import {
    AssignedSystemProfile,
    UserRegistrationForm,
    WizardStepId,
} from '../models/user-registration-wizard.models';
import { UserRegistrationFormRules } from '../rules/user-registration-form.rules';

export interface DraftSaveRequestInput {
    readonly form: UserRegistrationForm;
    readonly assignedProfiles: readonly AssignedSystemProfile[];
    readonly userTypeOptions: readonly SiauSelectOption[];
    readonly draftId: number | null;
    readonly executorUserId: number | null;
    readonly resolveSystemId: (profile: AssignedSystemProfile) => number;
}

@Injectable({ providedIn: 'root' })
export class UserRegistrationDraftFactory {
    private readonly formRules = inject(UserRegistrationFormRules);

    buildSaveRequest(
        _nextStepId: WizardStepId,
        _completedSteps: readonly WizardStepId[],
        input: DraftSaveRequestInput,
    ): BorradorGuardarRequest {
        const current = input.form;
        const assignedProfiles = input.assignedProfiles;
        const assignedProfile = assignedProfiles[0] ?? null;
        const draftProfiles = assignedProfiles.map((profile) => ({
            idSistema: input.resolveSystemId(profile),
            idPerfil: this.requireCatalogId(profile.role, 'Selecciona un perfil válido.'),
        }));

        const datos: BorradorDatos = {
            datosPersonales: {
                cuip: this.toNullableText(current.cuip),
                curp: this.toNullableText(current.curp)?.toUpperCase() ?? null,
                rfc: this.toNullableText(current.rfc)?.toUpperCase() ?? null,
                nombres: this.toNullableText(current.firstName)?.toUpperCase() ?? null,
                primerApellido: this.toNullableText(current.lastName)?.toUpperCase() ?? null,
                segundoApellido: this.toNullableText(current.secondLastName)?.toUpperCase() ?? null,
                sexoId: this.toCatalogId(current.gender) ?? null,
                fechaNacimiento: this.toNullableText(current.birthDate),
                estadoCivilId: this.toCatalogId(current.civilStatus) ?? null,
            },
            adscripcion: {
                estructuraId: this.resolveOptionalAssignmentStructureId(current),
                cargo: this.toNullableText(current.position)?.toUpperCase() ?? null,
                funciones: this.toNullableText(current.functions),
                numeroEmpleado: this.toNullableText(current.employeeNumber),
                fechaInicio: this.toNullableText(current.admissionDate),
            },
            comision: current.commissionEnabled
                ? {
                    estructuraId: this.resolveOptionalCommissionStructureId(current),
                    cargo: null,
                    funciones: null,
                    numeroEmpleado: null,
                    fechaInicio: this.toNullableText(current.commissionAdmissionDate),
                }
                : null,
            medioContacto: {
                correo: this.formRules.normalizeEmail(current.email) || null,
                celular: this.toNullableText(current.phone),
            },
            cuenta: {
                tipoUsuarioId: this.resolveDefaultCatalogId(input.userTypeOptions, 1),
                sistemaId: assignedProfile ? input.resolveSystemId(assignedProfile) : null,
                perfilId: assignedProfile ? (this.toCatalogId(assignedProfile.role) ?? null) : null,
            },
            perfiles: draftProfiles,
            comentario: this.toNullableText(current.comment),
        };

        return {
            borradorId: input.draftId,
            datos,
            auditoria: {
                usuarioEjecutorId: input.executorUserId ?? 0,
                correlationId: this.createDraftCorrelationId(),
            },
        };
    }

    inferDraftStep(datos: BorradorDatos): WizardStepId {
        if (datos.cuenta.sistemaId && datos.cuenta.perfilId) {
            return 'profiles';
        }
        if (datos.medioContacto.correo || datos.medioContacto.celular) {
            return 'profiles';
        }
        if (datos.adscripcion.estructuraId) {
            return datos.comision ? 'contact' : 'commission';
        }
        if (
            datos.datosPersonales.curp
            || datos.datosPersonales.nombres
            || datos.datosPersonales.primerApellido
        ) {
            return 'assignment';
        }
        return 'personal-data';
    }

    restoreForm(
        datos: BorradorDatos,
        hierarchies: {
            readonly assignment: {
                readonly institutionType: string;
                readonly entity: string;
                readonly municipality: string;
                readonly institution: string;
                readonly decentralizedBody: string;
                readonly administrativeUnit: string;
            } | null;
            readonly commission: {
                readonly institutionType: string;
                readonly entity: string;
                readonly municipality: string;
                readonly institution: string;
                readonly decentralizedBody: string;
                readonly administrativeUnit: string;
            } | null;
        },
        initialForm: UserRegistrationForm,
    ): UserRegistrationForm {
        const personal = datos.datosPersonales;
        const assignment = datos.adscripcion;
        const commission = datos.comision;
        const contact = datos.medioContacto;
        const assignmentHierarchy = hierarchies.assignment;
        const commissionHierarchy = hierarchies.commission;

        return {
            ...initialForm,
            cuip: personal.cuip ?? '',
            curp: personal.curp ?? '',
            rfc: personal.rfc ?? '',
            firstName: personal.nombres ?? '',
            lastName: personal.primerApellido ?? '',
            secondLastName: personal.segundoApellido ?? '',
            birthDate: this.formRules.toDateInputValue(personal.fechaNacimiento),
            gender: personal.sexoId ? String(personal.sexoId) : '',
            civilStatus: personal.estadoCivilId ? String(personal.estadoCivilId) : '',
            institutionType: assignmentHierarchy?.institutionType ?? '',
            entity: assignmentHierarchy?.entity ?? '',
            municipality: assignmentHierarchy?.municipality ?? '',
            institution: assignmentHierarchy?.institution ?? '',
            decentralizedBody: assignmentHierarchy?.decentralizedBody ?? '',
            administrativeUnit: assignmentHierarchy?.administrativeUnit ?? '',
            position: assignment.cargo ?? '',
            functions: assignment.funciones ?? '',
            admissionDate: this.formRules.toDateInputValue(assignment.fechaInicio),
            employeeNumber: assignment.numeroEmpleado ?? '',
            commissionEnabled: Boolean(commission),
            commissionInstitutionType: commissionHierarchy?.institutionType ?? '',
            commissionEntity: commissionHierarchy?.entity ?? '',
            commissionMunicipality: commissionHierarchy?.municipality ?? '',
            commissionInstitution: commissionHierarchy?.institution ?? '',
            commissionDecentralizedBody: commissionHierarchy?.decentralizedBody ?? '',
            commissionAdministrativeUnit: commissionHierarchy?.administrativeUnit ?? '',
            commissionAdmissionDate: this.formRules.toDateInputValue(commission?.fechaInicio),
            email: contact.correo ?? '',
            phone: (contact.celular ?? '').replace(/\D/g, '').slice(0, 10),
            comment: datos.comentario ?? '',
            password: '',
            confirmPassword: '',
        };
    }

    private resolveOptionalAssignmentStructureId(current: UserRegistrationForm): number | null {
        return this.toCatalogId(current.administrativeUnit)
            ?? this.toCatalogId(current.decentralizedBody)
            ?? this.toCatalogId(current.institution)
            ?? null;
    }

    private resolveOptionalCommissionStructureId(current: UserRegistrationForm): number | null {
        return this.toCatalogId(current.commissionAdministrativeUnit)
            ?? this.toCatalogId(current.commissionDecentralizedBody)
            ?? this.toCatalogId(current.commissionInstitution)
            ?? null;
    }

    private createDraftCorrelationId(): string {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `siau-borrador-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
