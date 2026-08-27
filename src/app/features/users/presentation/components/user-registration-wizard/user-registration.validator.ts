import { inject, Injectable } from '@angular/core';
import { getBirthDateError } from '../../../../../shared/validation/field-validators';
import { SiauSelectOption } from '../../../../../shared/ui';
import {
    AssignedSystemProfile,
    CLEAR_SELECTION_OPTION,
    CLEAR_SELECTION_VALUE,
    NO_APLICA_VALUE,
    ProfileOrigin,
    IdentitySnapshot,
    StructureSelectionLevel,
    DUPLICATE_COMMISSION_STRUCTURE_MESSAGE,
    StructureSelection,
    UserRegistrationForm,
    WizardStepId,
} from './user-registration-wizard.models';
import { UserRegistrationFormRules } from './user-registration-form.rules';

export interface UserRegistrationValidationContext {
    readonly isEditMode: boolean;
    readonly assignmentRequiresEntity: boolean;
    readonly assignmentRequiresMunicipality: boolean;
    readonly commissionRequiresEntity: boolean;
    readonly commissionRequiresMunicipality: boolean;
    readonly assignedProfiles: readonly AssignedSystemProfile[];
    readonly initialIdentitySnapshot: IdentitySnapshot | null;
    readonly initialEditFormSnapshot: UserRegistrationForm | null;
    readonly initialAssignedProfiles: readonly AssignedSystemProfile[];
}

/** Valida una sección sin conocer señales, navegación ni detalles de Angular. */
@Injectable({ providedIn: 'root' })
export class UserRegistrationValidator {
    private readonly formRules = inject(UserRegistrationFormRules);

validateStep(
        stepId: WizardStepId,
        current: UserRegistrationForm,
        context: UserRegistrationValidationContext,
    ): Record<string, string> {
        const nextErrors: Record<string, string> = {};

        if (stepId === 'personal-data') {
            if (this.shouldValidateIdentityFields(current, context)) {
                this.addIdentityValidationErrors(current, nextErrors);
            }

            this.addPersonalFieldValidationErrors(current, nextErrors, context);

            if (
                this.shouldValidateEditFields(current, ['firstName'], context) &&
                !this.formRules.hasText(current.firstName)
            ) {
                nextErrors['firstName'] = 'El nombre es obligatorio.';
            }

            if (
                this.shouldValidateEditFields(current, ['lastName'], context) &&
                !this.formRules.hasText(current.lastName)
            ) {
                nextErrors['lastName'] = 'El primer apellido es obligatorio.';
            }

            if (
                this.shouldValidateEditFields(current, ['gender'], context) &&
                !this.formRules.hasText(current.gender)
            ) {
                nextErrors['gender'] = 'El sexo es obligatorio.';
            }

        }

        if (stepId === 'assignment') {
            if (
                this.shouldValidateEditFields(current, ['institutionType'], context) &&
                !this.formRules.hasText(current.institutionType)
            ) {
                nextErrors['institutionType'] = 'El tipo de institución es obligatorio.';
            }

            if (
                context.assignmentRequiresEntity &&
                this.shouldValidateEditFields(current, ['institutionType', 'entity'], context) &&
                !this.formRules.hasText(current.entity)
            ) {
                nextErrors['entity'] = 'La entidad es obligatoria.';
            }

            if (
                context.assignmentRequiresMunicipality &&
                this.shouldValidateEditFields(current, ['institutionType', 'entity', 'municipality'], context) &&
                !this.formRules.hasText(current.municipality)
            ) {
                nextErrors['municipality'] = 'El municipio o alcaldía es obligatorio.';
            }

            if (
                this.shouldValidateEditFields(
                    current,
                    ['institutionType', 'entity', 'municipality', 'institution'],
                context) &&
                !this.formRules.hasText(current.institution)
            ) {
                nextErrors['institution'] = 'La institución es obligatoria.';
            }

            if (
                this.shouldValidateEditFields(current, ['admissionDate'], context) &&
                !this.formRules.hasText(current.admissionDate)
            ) {
                nextErrors['admissionDate'] = 'La fecha de ingreso es obligatoria.';
            }

            if (
                this.shouldValidateEditFields(current, ['admissionDate'], context) &&
                this.formRules.hasText(current.admissionDate) &&
                !this.formRules.isDateOnOrBeforeToday(current.admissionDate)
            ) {
                nextErrors['admissionDate'] = 'La fecha de ingreso debe ser válida y no posterior a la fecha actual.';
            }

            if (
                this.shouldValidateEditFields(current, ['employeeNumber'], context) &&
                !this.formRules.hasText(current.employeeNumber)
            ) {
                nextErrors['employeeNumber'] = 'El número de empleado es obligatorio.';
            }

            this.addAssignmentFormatValidationErrors(current, nextErrors, context);
        }

        if (stepId === 'commission') {
            if (current.commissionEnabled) {
                if (!this.hasValidAssignmentForCommission(current, context)) {
                    nextErrors['commissionInstitutionType'] =
                        'Primero registra una adscripción válida antes de capturar la comisión.';
                }

                if (
                    this.shouldValidateEditFields(
                        current,
                        ['commissionEnabled', 'commissionInstitutionType'],
                    context) &&
                    !this.formRules.hasText(current.commissionInstitutionType)
                ) {
                    nextErrors['commissionInstitutionType'] = 'El tipo de institución de comisión es obligatorio.';
                }

                if (
                    context.commissionRequiresEntity &&
                    this.shouldValidateEditFields(
                        current,
                        ['commissionEnabled', 'commissionInstitutionType', 'commissionEntity'],
                    context) &&
                    !this.formRules.hasText(current.commissionEntity)
                ) {
                    nextErrors['commissionEntity'] = 'La entidad de comisión es obligatoria.';
                }

                if (
                    context.commissionRequiresMunicipality &&
                    this.shouldValidateEditFields(
                        current,
                        [
                            'commissionEnabled',
                            'commissionInstitutionType',
                            'commissionEntity',
                            'commissionMunicipality',
                        ],
                    context) &&
                    !this.formRules.hasText(current.commissionMunicipality)
                ) {
                    nextErrors['commissionMunicipality'] = 'El municipio o alcaldía de comisión es obligatorio.';
                }

                if (
                    this.shouldValidateEditFields(
                        current,
                        [
                            'commissionEnabled',
                            'commissionInstitutionType',
                            'commissionEntity',
                            'commissionMunicipality',
                            'commissionInstitution',
                        ],
                    context) &&
                    !this.formRules.hasText(current.commissionInstitution)
                ) {
                    nextErrors['commissionInstitution'] = 'La institución de comisión es obligatoria.';
                }

                const shouldValidateCommissionDate = this.shouldValidateEditFields(
                    current,
                    ['commissionEnabled', 'commissionAdmissionDate', 'admissionDate'],
                context);

                if (
                    shouldValidateCommissionDate &&
                    !this.formRules.hasText(current.commissionAdmissionDate)
                ) {
                    nextErrors['commissionAdmissionDate'] =
                        'La fecha de inicio de comisión es obligatoria.';
                } else if (
                    shouldValidateCommissionDate &&
                    !this.formRules.isCommissionStartDateValid(
                        current.commissionAdmissionDate,
                        current.admissionDate,
                    )
                ) {
                    nextErrors['commissionAdmissionDate'] =
                        'La fecha de inicio de comisión debe ser válida, no posterior a hoy y no anterior a la fecha de ingreso.';
                }

                const structureConflict = this.getAssignmentCommissionStructureConflict(current);

                if (structureConflict) {
                    nextErrors[String(structureConflict.field)] =
                        DUPLICATE_COMMISSION_STRUCTURE_MESSAGE;
                }
            }
        }

        if (stepId === 'contact') {
            const hasEmail = this.formRules.hasText(current.email);
            const hasPhone = this.formRules.hasText(current.phone);
            const shouldValidateEmail = this.shouldValidateEditFields(current, ['email'], context); const shouldValidatePhone = this.shouldValidateEditFields(current, ['phone'], context);

            if (shouldValidateEmail && !hasEmail) {
                nextErrors['email'] = 'El correo electrónico es obligatorio.';
            }

            if (shouldValidatePhone && !hasPhone) {
                nextErrors['phone'] = 'El teléfono celular es obligatorio.';
            }

            if (shouldValidateEmail && hasEmail && !this.formRules.isValidEmail(current.email)) {
                nextErrors['email'] = 'El correo electrónico no tiene un formato válido.';
            }

            if (shouldValidatePhone && hasPhone && !/^\d{10}$/.test(current.phone)) {
                nextErrors['phone'] = 'El teléfono celular debe tener 10 dígitos.';
            }
        }

        if (stepId === 'profiles') {
            if (
                this.shouldValidateAssignedProfiles(context) &&
                context.assignedProfiles.some(
                    (profile) => !this.hasProfileAssignmentContext(current, profile.origin, context),
                )
            ) {
                nextErrors['profiles'] =
                    'Cada perfil debe corresponder a una adscripción o comisión válida.';
            }
        }

        return nextErrors;
    }

addIdentityValidationErrors(
        current: UserRegistrationForm,
        errors: Record<string, string>,
    ): void {
        const hasCurp = this.formRules.hasText(current.curp);
        const hasRfc = this.formRules.hasText(current.rfc);
        const hasBirthDate = this.formRules.hasText(current.birthDate);
        let validCurp = false;
        let validRfc = false;

        if (!hasCurp) {
            errors['curp'] = 'La CURP es obligatoria.';
        } else if (!this.formRules.isValidCurp(current.curp)) {
            if (hasCurp) {
                errors['curp'] = 'La CURP no tiene un formato o una fecha válidos.';
            }
        } else {
            validCurp = true;
        }

        if (!hasRfc) {
            errors['rfc'] = 'El RFC es obligatorio.';
        } else if (!this.formRules.isValidRfc(current.rfc)) {
            errors['rfc'] = 'El RFC no tiene un formato válido.';
        } else {
            validRfc = hasRfc;
        }

        const birthDateError = getBirthDateError(current.birthDate);

        if (birthDateError) {
            errors['birthDate'] = birthDateError;
        }

        if (validCurp && validRfc && !this.formRules.rfcMatchesCurp(current.rfc, current.curp)) {
            errors['rfc'] = 'Los primeros 10 caracteres del RFC deben coincidir con los datos de la CURP.';
        }

        const hasValidBirthDate = hasBirthDate && this.formRules.isValidDateInput(current.birthDate);
        const rfcBirthDateMatches =
            validRfc &&
            hasValidBirthDate &&
            this.formRules.rfcBirthDateMatchesDate(current.rfc, current.birthDate);

        if (validRfc && hasValidBirthDate && !rfcBirthDateMatches) {
            errors['rfc'] = 'La fecha contenida en el RFC debe coincidir con la fecha de nacimiento capturada.';
        }

        const curpBirthDate = validCurp ? this.formRules.getBirthDateFromCurp(current.curp) : null;
        const curpBirthDateMatches =
            Boolean(curpBirthDate) &&
            hasValidBirthDate &&
            this.formRules.areSameCalendarDates(current.birthDate, curpBirthDate ?? '');

        if (curpBirthDate && !this.formRules.isBirthDateOnOrAfterMinimum(curpBirthDate)) {
            errors['curp'] = 'La fecha contenida en la CURP no puede ser anterior al 01/01/1900.';
        } else if (curpBirthDate && !this.formRules.isAdult(curpBirthDate)) {
            errors['curp'] =
                'La fecha de nacimiento contenida en la CURP corresponde a una persona menor de 18 años.';
        }

        if (hasValidBirthDate) {
            const curpMismatch = Boolean(curpBirthDate) && !curpBirthDateMatches;
            const rfcMismatch = validRfc && !rfcBirthDateMatches;

            if (curpMismatch && rfcMismatch) {
                errors['birthDate'] =
                    'La fecha de nacimiento debe coincidir con las fechas contenidas en la CURP y el RFC.';
            } else if (curpMismatch) {
                errors['birthDate'] =
                    'La fecha de nacimiento debe coincidir con la fecha registrada en la CURP.';
            } else if (rfcMismatch) {
                errors['birthDate'] =
                    'La fecha de nacimiento debe coincidir con la fecha contenida en el RFC.';
            }
        }
    }

private addPersonalFieldValidationErrors(
        current: UserRegistrationForm,
        errors: Record<string, string>,
        context: UserRegistrationValidationContext,
    ): void {
        if (
            this.shouldValidateEditFields(current, ['cuip'], context) &&
            this.formRules.hasText(current.cuip) &&
            !this.isValidCuip(current.cuip)
        ) {
            errors['cuip'] =
                'La CUIP debe tener 20 caracteres con formato AAAA999999H999999999: 4 letras, 6 números, H/M y 9 números.';
        }

        this.addNameValidationError(
            current.firstName,
            'firstName',
            'El nombre',
            this.shouldValidateEditFields(current, ['firstName'], context),
            errors,
        );
        this.addNameValidationError(
            current.lastName,
            'lastName',
            'El primer apellido',
            this.shouldValidateEditFields(current, ['lastName'], context),
            errors,
        );
        this.addNameValidationError(
            current.secondLastName,
            'secondLastName',
            'El segundo apellido',
            this.shouldValidateEditFields(current, ['secondLastName'], context),
            errors,
        );
    }

private isValidCuip(value: unknown): boolean {
        return /^[A-Z]{4}\d{6}[HM]\d{9}$/.test(this.formRules.toText(value).toUpperCase());
    }

private addNameValidationError(
        value: string,
        key: string,
        label: string,
        shouldValidate: boolean,
        errors: Record<string, string>,
    ): void {
        if (!shouldValidate || !this.formRules.hasText(value)) {
            return;
        }

        const normalized = this.formRules.toText(value).normalize('NFC');

        if (normalized.length > 100 || !/^[A-Z ]+$/.test(normalized)) {
            errors[key] = `${label} debe contener únicamente letras A-Z y espacios (máximo 100 caracteres).`;
        }
    }

private addAssignmentFormatValidationErrors(
        current: UserRegistrationForm,
        errors: Record<string, string>,
        context: UserRegistrationValidationContext,
    ): void {
        if (
            this.shouldValidateEditFields(current, ['position'], context) &&
            this.formRules.hasText(current.position)
        ) {
            const positionError = this.formRules.getRestrictedTextValidationError(
                current.position,
                2,
                150,
                'El cargo',
            );

            if (positionError) {
                errors['position'] = positionError;
            }
        }

        if (
            this.shouldValidateEditFields(current, ['functions'], context) &&
            this.formRules.hasText(current.functions)
        ) {
            const functionsError = this.formRules.getRestrictedTextValidationError(
                current.functions,
                5,
                500,
                'Las funciones',
            );

            if (functionsError) {
                errors['functions'] = functionsError;
            }
        }

        if (
            this.shouldValidateEditFields(current, ['employeeNumber'], context) &&
            this.formRules.hasText(current.employeeNumber) &&
            !this.formRules.isValidEmployeeNumber(current.employeeNumber)
        ) {
            errors['employeeNumber'] =
                'El número de empleado debe contener de 3 a 20 caracteres: letras, números, espacios o guion.';
        }
    }

getAssignmentCommissionStructureConflict(
        current: UserRegistrationForm,
    ): StructureSelection | null {
        if (!current.commissionEnabled) {
            return null;
        }

        const assignment = this.resolveDeepestStructureSelection([
            {
                field: 'administrativeUnit',
                level: 'administrative-unit',
                value: current.administrativeUnit,
            },
            {
                field: 'decentralizedBody',
                level: 'decentralized-body',
                value: current.decentralizedBody,
            },
            {
                field: 'institution',
                level: 'institution',
                value: current.institution,
            },
        ]);
        const commission = this.resolveDeepestStructureSelection([
            {
                field: 'commissionAdministrativeUnit',
                level: 'administrative-unit',
                value: current.commissionAdministrativeUnit,
            },
            {
                field: 'commissionDecentralizedBody',
                level: 'decentralized-body',
                value: current.commissionDecentralizedBody,
            },
            {
                field: 'commissionInstitution',
                level: 'institution',
                value: current.commissionInstitution,
            },
        ]);

        if (!assignment || !commission || assignment.level !== commission.level) {
            return null;
        }

        const sameCatalogId =
            assignment.catalogId !== null &&
            commission.catalogId !== null &&
            assignment.catalogId === commission.catalogId;
        const sameRawValue =
            this.formRules.normalizeText(assignment.value) === this.formRules.normalizeText(commission.value);

        return sameCatalogId || sameRawValue ? commission : null;
    }

resolveDeepestStructureSelection(
        candidates: readonly {
            readonly field: keyof UserRegistrationForm;
            readonly level: StructureSelectionLevel;
            readonly value: string;
        }[],
    ): StructureSelection | null {
        for (const candidate of candidates) {
            const value = this.formRules.toText(candidate.value);

            if (!value || this.isNoAplicaValue(value)) {
                continue;
            }

            return {
                ...candidate,
                value,
                catalogId: this.toCatalogId(value) ?? null,
            };
        }

        return null;
    }

hasStructureSelection(value: string | null | undefined): boolean {
        return this.formRules.hasText(value) && !this.isNoAplicaValue(value);
    }

normalizeSelectValue(value: string | null): string {
        const text = this.formRules.toText(value);

        return text === CLEAR_SELECTION_VALUE ? '' : text;
    }

withClearOption(
        options: readonly SiauSelectOption[],
    ): readonly SiauSelectOption[] {
        if (options.length === 0) {
            return options;
        }

        return [CLEAR_SELECTION_OPTION, ...options];
    }

isNoAplicaValue(value: unknown): boolean {
        const normalized = this.formRules.normalizeText(this.formRules.toText(value));

        return normalized === this.formRules.normalizeText(NO_APLICA_VALUE) || normalized === 'no aplica';
    }

hasValidAssignmentForCommission(current: UserRegistrationForm,
        context: UserRegistrationValidationContext,
    ): boolean {
        if (
            !this.formRules.hasText(current.institutionType) ||
            !this.formRules.hasText(current.institution) ||
            this.isNoAplicaValue(current.institution) ||
            !this.formRules.hasText(current.admissionDate) ||
            !this.formRules.hasText(current.employeeNumber)
        ) {
            return false;
        }

        if (context.assignmentRequiresEntity && !this.formRules.hasText(current.entity)) {
            return false;
        }

        if (
            context.assignmentRequiresMunicipality &&
            !this.formRules.hasText(current.municipality)
        ) {
            return false;
        }

        return (
            this.formRules.isDateOnOrBeforeToday(current.admissionDate) &&
            this.formRules.isValidEmployeeNumber(current.employeeNumber)
        );
    }

hasValidCommissionContext(current: UserRegistrationForm,
        context: UserRegistrationValidationContext,
    ): boolean {
        if (
            !current.commissionEnabled ||
            !this.formRules.hasText(current.commissionInstitutionType) ||
            !this.formRules.hasText(current.commissionInstitution) ||
            this.isNoAplicaValue(current.commissionInstitution)
        ) {
            return false;
        }

        if (
            context.commissionRequiresEntity &&
            !this.formRules.hasText(current.commissionEntity)
        ) {
            return false;
        }

        if (
            context.commissionRequiresMunicipality &&
            !this.formRules.hasText(current.commissionMunicipality)
        ) {
            return false;
        }

        const hasCommissionStartDate = this.formRules.hasText(current.commissionAdmissionDate);
        const unchangedLegacyEdit =
            context.isEditMode &&
            !this.shouldValidateEditFields(
                current,
                ['commissionEnabled', 'commissionAdmissionDate', 'admissionDate'],
                context,
            );

        if (!hasCommissionStartDate) {
            return unchangedLegacyEdit;
        }

        return this.formRules.isCommissionStartDateValid(
            current.commissionAdmissionDate,
            current.admissionDate,
        );
    }

hasProfileAssignmentContext(
        current: UserRegistrationForm,
        origin: ProfileOrigin,
        context: UserRegistrationValidationContext,
    ): boolean {
        return origin === 'comision'
            ? current.commissionEnabled && this.hasValidCommissionContext(current, context)
            : this.hasValidAssignmentForCommission(current, context);
    }

resolveProfileStructureId(
        current: UserRegistrationForm,
        origin: ProfileOrigin,
    ): number | undefined {
        // El catálogo se consulta por origen. Ambos pueden coexistir en el detalle:
        // adscripción y comisión mantienen sus perfiles de forma independiente.
        const selection = origin === 'comision'
            ? this.resolveDeepestStructureSelection([
                {
                    field: 'commissionAdministrativeUnit',
                    level: 'administrative-unit',
                    value: current.commissionAdministrativeUnit,
                },
                {
                    field: 'commissionDecentralizedBody',
                    level: 'decentralized-body',
                    value: current.commissionDecentralizedBody,
                },
                {
                    field: 'commissionInstitution',
                    level: 'institution',
                    value: current.commissionInstitution,
                },
            ])
            : this.resolveDeepestStructureSelection([
                {
                    field: 'administrativeUnit',
                    level: 'administrative-unit',
                    value: current.administrativeUnit,
                },
                {
                    field: 'decentralizedBody',
                    level: 'decentralized-body',
                    value: current.decentralizedBody,
                },
                {
                    field: 'institution',
                    level: 'institution',
                    value: current.institution,
                },
            ]);

        return selection?.catalogId ?? undefined;
    }

shouldValidateIdentityFields(current: UserRegistrationForm,
        context: UserRegistrationValidationContext,
    ): boolean {
        if (!context.isEditMode) {
            return true;
        }

        const initialSnapshot = context.initialIdentitySnapshot;

        if (!initialSnapshot) {
            return true;
        }

        const currentSnapshot = this.formRules.toIdentitySnapshot(current);

        return (
            initialSnapshot.curp !== currentSnapshot.curp ||
            initialSnapshot.rfc !== currentSnapshot.rfc ||
            initialSnapshot.birthDate !== currentSnapshot.birthDate
        );
    }

shouldValidateEditFields(
        current: UserRegistrationForm,
        fields: readonly (keyof UserRegistrationForm)[],
        context: UserRegistrationValidationContext,
    ): boolean {
        if (!context.isEditMode) {
            return true;
        }

        const initialSnapshot = context.initialEditFormSnapshot;

        if (!initialSnapshot) {
            return true;
        }

        return fields.some(
            (field) => !this.areEditFieldValuesEqual(initialSnapshot[field], current[field]),
        );
    }

shouldValidateAssignedProfiles(context: UserRegistrationValidationContext): boolean {
        if (!context.isEditMode) {
            return true;
        }

        return this.buildAssignedProfileSignature(context.initialAssignedProfiles) !==
            this.buildAssignedProfileSignature(context.assignedProfiles);
    }

areEditFieldValuesEqual(
        initialValue: UserRegistrationForm[keyof UserRegistrationForm],
        currentValue: UserRegistrationForm[keyof UserRegistrationForm],
    ): boolean {
        if (Array.isArray(initialValue) && Array.isArray(currentValue)) {
            return (
                initialValue.length === currentValue.length &&
                initialValue.every((value, index) => value === currentValue[index])
            );
        }

        return initialValue === currentValue;
    }

buildAssignedProfileSignature(
        profiles: readonly AssignedSystemProfile[],
    ): string {
        return profiles
            .map((profile) => this.buildAssignedProfileKey(profile))
            .sort()
            .join('||');
    }

buildAssignedProfileKey(profile: AssignedSystemProfile): string {
        return [profile.origin, profile.system, profile.role]
            .map((value) => this.formRules.toText(value).trim().toUpperCase())
            .join('|');
    }

withoutIdentityFieldErrors(errors: Record<string, string>): Record<string, string> {
        const nextErrors = { ...errors };

        ['curp', 'rfc', 'birthDate'].forEach((field) => delete nextErrors[field]);

        return nextErrors;
    }

getStepValidationFields(stepId: WizardStepId): readonly string[] {
        const fieldsByStep: Record<WizardStepId, readonly string[]> = {
            'personal-data': [
                'cuip',
                'curp',
                'rfc',
                'firstName',
                'lastName',
                'secondLastName',
                'gender',
                'civilStatus',
                'birthDate',
            ],
            assignment: [
                'institutionType',
                'entity',
                'municipality',
                'institution',
                'position',
                'functions',
                'admissionDate',
                'employeeNumber',
            ],
            commission: [
                'commissionInstitutionType',
                'commissionEntity',
                'commissionMunicipality',
                'commissionInstitution',
                'commissionDecentralizedBody',
                'commissionAdministrativeUnit',
                'commissionAdmissionDate',
            ],
            documents: [],
            contact: [
                'email',
                'phone',
            ],
            profiles: [
                'profiles',
            ],
            account: [
                'password',
                'confirmPassword',
            ],
        };

        return fieldsByStep[stepId];
    }

    private toCatalogId(value: string | null | undefined): number | undefined {
        if (!value) return undefined;
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : undefined;
    }

}
