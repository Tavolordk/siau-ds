import { inject, Injectable, WritableSignal } from '@angular/core';
import { SiauSelectOption } from '../../../../../shared/ui';
import { UserDetailRecord, UserRecord } from '../../../domain/models/user-record.model';
import {
    AccountStatus,
    AssignedSystemProfile,
    INITIAL_FORM,
    UserRegistrationForm,
} from './user-registration-wizard.models';
import { UserRegistrationFormRules } from './user-registration-form.rules';
import { UserProfileMatcher } from './user-profile.matcher';

export interface EditHydrationSelectTargets {
    readonly gender: WritableSignal<readonly SiauSelectOption[]>;
    readonly civilStatus: WritableSignal<readonly SiauSelectOption[]>;
    readonly institutionType: WritableSignal<readonly SiauSelectOption[]>;
    readonly state: WritableSignal<readonly SiauSelectOption[]>;
    readonly municipality: WritableSignal<readonly SiauSelectOption[]>;
    readonly institution: WritableSignal<readonly SiauSelectOption[]>;
    readonly decentralizedBody: WritableSignal<readonly SiauSelectOption[]>;
    readonly administrativeUnit: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionMunicipality: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionInstitution: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionDecentralizedBody: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionAdministrativeUnit: WritableSignal<readonly SiauSelectOption[]>;
}

export interface EditHydrationResult {
    readonly persistedCurpValidated: boolean;
    readonly form: UserRegistrationForm;
    readonly assignedProfiles: readonly AssignedSystemProfile[];
    readonly roleOptionsBySystem: Readonly<Record<string, readonly SiauSelectOption[]>>;
}

@Injectable({ providedIn: 'root' })
export class UserRegistrationEditMapper {
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly profileMatcher = inject(UserProfileMatcher);

    hydrate(
        detail: UserDetailRecord,
        user: UserRecord | null,
        targets: EditHydrationSelectTargets,
        knownSystems: readonly SiauSelectOption[],
    ): EditHydrationResult {
        const datos = detail.datos;
        const personalData = this.toSectionRecord(datos, ['s1DatosPersonales', 'datosPersonales']);
        const assignment = this.toSectionRecord(datos, ['s2Adscripcion', 'adscripcion']);
        const s3Commission = this.toSectionRecord(datos, ['s3Comision']);
        const commission = Object.keys(s3Commission).length > 0
            ? s3Commission
            : this.toSectionRecord(datos, ['comision']);
        const contact = this.toSectionRecord(datos, ['s5Contacto', 'medioContacto', 'contacto']);

        const institutionType = this.resolveRecordSelectValue(
            assignment,
            ['tipoInstitucionId', 'idTipoInstitucion'],
            ['tipoInstitucion', 'tipoInstitucionNombre', 'tipoInstitucionClave'],
            targets.institutionType,
        );
        const assignmentRequiresEntity = this.requiresEntityForInstitution(
            institutionType,
            targets.institutionType(),
        );
        const assignmentEntity = !assignmentRequiresEntity
            ? ''
            : this.resolveRecordSelectValue(
                assignment,
                ['estadoId', 'entidadId', 'idEstado'],
                ['estado', 'entidad', 'estadoNombre'],
                targets.state,
            );

        const commissionInstitutionType = this.resolveRecordSelectValue(
            commission,
            ['tipoInstitucionId', 'idTipoInstitucion'],
            ['tipoInstitucion', 'tipoInstitucionNombre', 'tipoInstitucionClave'],
            targets.institutionType,
        );
        const commissionRequiresEntity = this.requiresEntityForInstitution(
            commissionInstitutionType,
            targets.institutionType(),
        );
        const commissionEntity = !commissionRequiresEntity
            ? ''
            : this.resolveRecordSelectValue(
                commission,
                ['estadoId', 'entidadId', 'idEstado', 'idEntidad'],
                ['estado', 'entidad', 'estadoNombre', 'entidadNombre'],
                targets.state,
            );

        const hasCommissionData =
            this.formRules.hasText(this.firstValue(commission, ['tipoInstitucion', 'tipoInstitucionId'])) ||
            this.formRules.hasText(this.firstValue(commission, ['estado', 'entidad', 'estadoId'])) ||
            this.formRules.hasText(this.firstValue(commission, ['municipio', 'municipioAlcaldia', 'municipioId'])) ||
            this.formRules.hasText(this.firstValue(commission, ['institucion', 'institucionId'])) ||
            this.formRules.hasText(this.firstValue(commission, ['dependencia', 'dependenciaId'])) ||
            this.formRules.hasText(this.firstValue(commission, ['organo', 'organoId', 'organoDesconcentrado', 'desconcentrado', 'decentralizedBody'])) ||
            this.formRules.hasText(this.firstValue(commission, ['unidad', 'unidadId', 'unidadAdministrativa', 'administrativeUnit'])) ||
            this.formRules.hasText(this.firstValue(commission, ['fechaInicio', 'fechaIngreso'])) ||
            this.formRules.hasText(this.firstValue(commission, ['estructuraId', 'estructuraOrgId']));

        const nextForm: UserRegistrationForm = {
            ...INITIAL_FORM,
            cuip: this.formRules.toText(this.firstValue(personalData, ['cuip'])),
            policeIdentificationKey: this.formRules.toText(
                this.firstValue(personalData, ['claveUnicaIdentificacionPolicial', 'claveIdentificacionPolicial']),
            ),
            curp: this.formRules.toText(this.firstValue(personalData, ['curp'])),
            rfc: this.formRules.toText(this.firstValue(personalData, ['rfc'])),
            firstName: this.formRules.toText(this.firstValue(personalData, ['nombres', 'nombre', 'nombreS'])),
            lastName: this.formRules.toText(this.firstValue(personalData, ['primerApellido', 'apellidoPaterno'])),
            secondLastName: this.formRules.toText(this.firstValue(personalData, ['segundoApellido', 'apellidoMaterno'])),
            birthDate: this.formRules.toDateInputValue(this.firstValue(personalData, ['fechaNacimiento'])),
            gender: this.resolveSelectValue(this.firstValue(personalData, ['sexo', 'sexoId']), targets.gender),
            civilStatus: this.resolveSelectValue(
                this.firstValue(personalData, ['estadoCivil', 'estadoCivilId']),
                targets.civilStatus,
            ),
            institutionType,
            entity: assignmentEntity,
            municipality: !this.requiresMunicipalityForInstitution(institutionType, targets.institutionType())
                ? ''
                : this.resolveRecordSelectValue(
                    assignment,
                    ['municipioId', 'municipioAlcaldiaId', 'idMunicipio'],
                    ['municipio', 'municipioAlcaldia', 'municipioNombre'],
                    targets.municipality,
                ),
            institution: this.resolveRecordSelectValue(
                assignment,
                ['institucionId', 'idInstitucion', 'estructuraId'],
                ['institucion', 'institucionNombre', 'estructura'],
                targets.institution,
            ),
            decentralizedBody: this.resolveRecordSelectValue(
                assignment,
                ['organoId', 'organoDesconcentradoId', 'organoAdministrativoDesconcentradoId', 'desconcentradoId', 'idOrganoDesconcentrado', 'idOrgano'],
                ['organo', 'organoDesconcentrado', 'organoAdministrativoDesconcentrado', 'desconcentrado', 'decentralizedBody'],
                targets.decentralizedBody,
            ),
            administrativeUnit: this.resolveRecordSelectValue(
                assignment,
                ['unidadId', 'unidadAdministrativaId', 'administrativeUnitId', 'idUnidadAdministrativa', 'idUnidad'],
                ['unidad', 'unidadAdministrativa', 'administrativeUnit'],
                targets.administrativeUnit,
            ),
            position: this.formRules.toText(this.firstValue(assignment, ['cargo', 'puesto'])),
            functions: this.formRules.toText(this.firstValue(assignment, ['funciones'])),
            admissionDate: this.formRules.toDateInputValue(this.firstValue(assignment, ['fechaInicio', 'fechaIngreso'])),
            employeeNumber: this.formRules.toText(this.firstValue(assignment, ['numeroEmpleado', 'numEmpleado'])),
            commissionEnabled: hasCommissionData,
            commissionInstitutionType,
            commissionEntity,
            commissionMunicipality: !this.requiresMunicipalityForInstitution(commissionInstitutionType, targets.institutionType())
                ? ''
                : this.resolveRecordSelectValue(
                    commission,
                    ['municipioId', 'municipioAlcaldiaId', 'idMunicipio'],
                    ['municipio', 'municipioAlcaldia', 'municipioNombre'],
                    targets.commissionMunicipality,
                ),
            commissionInstitution: this.resolveRecordSelectValue(
                commission,
                ['institucionId', 'idInstitucion', 'estructuraId'],
                ['institucion', 'institucionNombre', 'estructura'],
                targets.commissionInstitution,
            ),
            commissionDecentralizedBody: this.resolveRecordSelectValue(
                commission,
                ['organoId', 'organoDesconcentradoId', 'organoAdministrativoDesconcentradoId', 'desconcentradoId', 'idOrganoDesconcentrado', 'idOrgano'],
                ['organo', 'organoDesconcentrado', 'organoAdministrativoDesconcentrado', 'desconcentrado', 'decentralizedBody'],
                targets.commissionDecentralizedBody,
            ),
            commissionAdministrativeUnit: this.resolveRecordSelectValue(
                commission,
                ['unidadId', 'unidadAdministrativaId', 'administrativeUnitId', 'idUnidadAdministrativa', 'idUnidad'],
                ['unidad', 'unidadAdministrativa', 'administrativeUnit'],
                targets.commissionAdministrativeUnit,
            ),
            commissionAdmissionDate: this.formRules.toDateInputValue(this.firstValue(commission, ['fechaInicio', 'fechaIngreso'])),
            email: this.resolveHydratedEmail(contact, datos, user),
            phone: this.formRules.toText(this.firstValue(contact, ['celular', 'telefono', 'phone']))
                .replace(/\D/g, '')
                .slice(0, 10),
            profiles: [],
            username: this.formRules.toText(datos['cuenta']) || user?.username || '',
            password: '',
            confirmPassword: '',
            accountStatus: this.toAccountStatus(this.firstText([datos['estatus'], datos['estatusClave'], user?.status])),
            comment: this.formRules.toText(datos['comentario']),
        };

        const assignedProfiles = this.profileMatcher.toAssignedSystemProfiles(
            datos['s6Perfiles'],
            nextForm.commissionEnabled ? 'comision' : 'adscripcion',
            knownSystems,
        );

        return {
            persistedCurpValidated: detail.curpValidada === 1,
            form: nextForm,
            assignedProfiles,
            roleOptionsBySystem: this.profileMatcher.buildDetailRoleOptionsBySystem(
                assignedProfiles,
                knownSystems,
            ),
        };
    }

    private resolveSelectValue(
        rawValue: unknown,
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): string {
        const textValue = this.formRules.toText(rawValue);
        if (!textValue) return '';

        const options = target();
        const normalizedValue = this.formRules.normalizeText(textValue);
        const matchedOption = options.find(
            (option) =>
                this.formRules.normalizeText(option.value) === normalizedValue ||
                this.formRules.normalizeText(option.label) === normalizedValue,
        );
        if (matchedOption) return matchedOption.value;

        target.set([...options, { value: textValue, label: textValue }]);
        return textValue;
    }

    private resolveRecordSelectValue(
        record: Record<string, unknown>,
        idKeys: readonly string[],
        labelKeys: readonly string[],
        target: WritableSignal<readonly SiauSelectOption[]>,
    ): string {
        const rawIdValue = this.firstValue(record, idKeys);
        const rawLabelValue = this.firstValue(record, labelKeys);
        const nestedValue = this.toRecord(rawLabelValue);
        const idValue = this.formRules.toText(rawIdValue) || this.formRules.toText(
            this.firstValue(nestedValue, ['id', 'value', ...idKeys]),
        );
        const labelValue = this.formRules.toText(
            this.firstValue(nestedValue, ['descripcion', 'nombre', 'label', ...labelKeys]),
        ) || this.formRules.toText(rawLabelValue);

        if (!idValue) return this.resolveSelectValue(labelValue, target);

        const options = target();
        const matchedOption = options.find(
            (option) =>
                option.value === idValue ||
                this.formRules.normalizeText(option.value) === this.formRules.normalizeText(idValue) ||
                (labelValue && this.formRules.normalizeText(option.label) === this.formRules.normalizeText(labelValue)),
        );
        if (matchedOption) return matchedOption.value;

        target.set(this.mergeSelectOptions(
            [{ value: idValue, label: labelValue || idValue }],
            options,
        ));
        return idValue;
    }

    private resolveHydratedEmail(
        contact: Record<string, unknown>,
        datos: Record<string, unknown>,
        user: UserRecord | null,
    ): string {
        const candidates = [this.firstValue(contact, ['correo', 'email']), datos['correo'], user?.email];
        for (const candidate of candidates) {
            const email = this.formRules.normalizeEmail(candidate);
            const normalized = this.formRules.normalizeText(email);
            if (!email || ['sin correo', 'no registrado', 'no capturado'].includes(normalized)) continue;
            return email;
        }
        return '';
    }

    private toSectionRecord(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
        for (const key of keys) {
            const value = source[key];
            if (Array.isArray(value)) {
                const firstRecord = value
                    .map((item) => this.toRecord(item))
                    .find((item) => Object.keys(item).length > 0);
                if (firstRecord) return firstRecord;
            }
            const record = this.toRecord(value);
            if (Object.keys(record).length > 0) return record;
        }
        return {};
    }

    private firstValue(record: Record<string, unknown>, keys: readonly string[]): unknown {
        return keys.map((key) => record[key]).find((value) => this.formRules.toText(value).length > 0) ?? '';
    }

    private firstText(values: readonly unknown[]): string {
        return values.map((value) => this.formRules.toText(value)).find((value) => value.length > 0) ?? '';
    }

    private toRecord(value: unknown): Record<string, unknown> {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : {};
    }

    private toAccountStatus(value: string): AccountStatus {
        const normalizedValue = this.formRules.normalizeText(value);
        if (normalizedValue.includes('bloque')) return 'blocked';
        if (normalizedValue.includes('suspend')) return 'suspended';
        if (
            normalizedValue.includes('baja') || normalizedValue.includes('inhabil') ||
            normalizedValue.includes('inactivo') || normalizedValue.includes('deshabil')
        ) return 'baja';
        return 'active';
    }

    private requiresEntityForInstitution(
        value: string | null | undefined,
        institutionTypeOptions: readonly SiauSelectOption[],
    ): boolean {
        const label = this.getInstitutionTypeLabel(value, institutionTypeOptions);
        return label.includes('estatal') || label.includes('municipal');
    }

    private requiresMunicipalityForInstitution(
        value: string | null | undefined,
        institutionTypeOptions: readonly SiauSelectOption[],
    ): boolean {
        return this.getInstitutionTypeLabel(value, institutionTypeOptions).includes('municipal');
    }

    private getInstitutionTypeLabel(
        value: string | null | undefined,
        institutionTypeOptions: readonly SiauSelectOption[],
    ): string {
        if (!value) return '';
        const option = institutionTypeOptions.find((item) => item.value === value);
        return this.formRules.normalizeText(option?.label ?? value);
    }

    private mergeSelectOptions(
        preferredOptions: readonly SiauSelectOption[],
        preservedOptions: readonly SiauSelectOption[],
    ): readonly SiauSelectOption[] {
        const result = [...preferredOptions];
        preservedOptions.forEach((preservedOption) => {
            const alreadyExists = result.some(
                (option) =>
                    option.value === preservedOption.value ||
                    this.formRules.normalizeText(option.value) === this.formRules.normalizeText(preservedOption.value),
            );
            if (!alreadyExists) result.push(preservedOption);
        });
        return result;
    }
}
