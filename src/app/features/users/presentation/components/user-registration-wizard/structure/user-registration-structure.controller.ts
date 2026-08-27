import { Injectable, WritableSignal } from '@angular/core';
import { SiauSelectOption } from '../../../../../../shared/ui';
import {
    ProfileOrigin,
    UserRegistrationForm,
} from '../models/user-registration-wizard.models';

export interface UserRegistrationStructureContext {
    readonly form: WritableSignal<UserRegistrationForm>;
    readonly formErrors: WritableSignal<Record<string, string>>;
    readonly editStructureScope: WritableSignal<ProfileOrigin | null>;
    readonly selectedProfileOrigin: WritableSignal<ProfileOrigin>;
    readonly municipalityOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly institutionOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly decentralizedBodyOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly administrativeUnitOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionMunicipalityOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionInstitutionOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionDecentralizedBodyOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionAdministrativeUnitOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly isFormDisabled: () => boolean;
    readonly isSubmitting: () => boolean;
    readonly isEditMode: () => boolean;
    readonly canConfigureCommission: () => boolean;
    readonly assignmentRequiresEntity: () => boolean;
    readonly assignmentRequiresMunicipality: () => boolean;
    readonly commissionRequiresEntity: () => boolean;
    readonly commissionRequiresMunicipality: () => boolean;
    readonly assignmentDecentralizedBodyLocked: () => boolean;
    readonly commissionDecentralizedBodyLocked: () => boolean;
    readonly claimEditStructureScope: (
        origin: ProfileOrigin,
        changed?: boolean,
        resetProfileCatalog?: boolean,
    ) => boolean;
    readonly bumpAssignmentCatalogGeneration: () => void;
    readonly bumpCommissionCatalogGeneration: () => void;
    readonly clearAllProfilesAfterCreationContextChange: (message: string) => void;
    readonly clearProfilesForOrigin: (origin: ProfileOrigin, message: string) => void;
    readonly clearProfilesAfterAssignmentInstitutionChange: (
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
    ) => void;
    readonly clearProfilesAfterCommissionInstitutionChange: (
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
    ) => void;
    readonly resetStructureProfileCatalog: () => void;
    readonly refreshCommissionStructureConflict: () => void;
    readonly requiresEntityForInstitution: (value: string | null | undefined) => boolean;
    readonly requiresMunicipalityForInstitution: (value: string | null | undefined) => boolean;
    readonly loadMunicipalities: (
        stateValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
        context: 'assignment' | 'commission',
    ) => void;
    readonly loadAssignmentInstitutions: () => void;
    readonly loadAssignmentDecentralizedBodies: () => void;
    readonly loadAssignmentAdministrativeUnits: () => void;
    readonly loadCommissionInstitutions: () => void;
    readonly loadCommissionDecentralizedBodies: () => void;
    readonly loadCommissionAdministrativeUnits: () => void;
    readonly normalizeSelectValue: (value: string | null) => string;
    readonly clearFieldError: (key: string) => void;
}

/**
 * Coordina los cambios de adscripción y comisión.
 *
 * No conoce el componente ni los endpoints: recibe el estado mínimo necesario
 * y conserva las mismas reglas de negocio que antes vivían en el wizard.
 */
@Injectable()
export class UserRegistrationStructureController {
    toggleCommissionSection(checked: boolean, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        const commissionChanged = ctx.form().commissionEnabled !== checked;

        if (checked && !ctx.canConfigureCommission()) {
            ctx.formErrors.update((current) => ({
                ...current,
                commissionInstitutionType:
                    'Primero registra una adscripción válida antes de capturar la comisión.',
            }));
            return;
        }

        if (!ctx.claimEditStructureScope('comision', commissionChanged)) {
            return;
        }

        ctx.bumpCommissionCatalogGeneration();

        if (commissionChanged) {
            if (ctx.isEditMode()) {
                if (!checked) {
                    ctx.clearProfilesForOrigin(
                        'comision',
                        'Se desactivó la comisión. Se eliminaron únicamente los perfiles asociados a la comisión; los perfiles de adscripción se conservaron.',
                    );
                    ctx.selectedProfileOrigin.set('comision');
                }
            } else {
                // Creación: existe un solo contexto de perfiles. Al alternar comisión
                // se invalida toda la selección y el catálogo pasa al último origen.
                ctx.clearAllProfilesAfterCreationContextChange(
                    checked
                        ? 'Se activó la comisión. Selecciona su estructura para consultar los perfiles correspondientes.'
                        : 'Se eliminó la comisión. Debes volver a seleccionar los perfiles correspondientes a la adscripción.',
                );
                ctx.selectedProfileOrigin.set(checked ? 'comision' : 'adscripcion');
            }
        }

        ctx.form.update((current) => ({
            ...current,
            commissionEnabled: checked,
            commissionInstitutionType: checked ? current.commissionInstitutionType : '',
            commissionInstitution: checked ? current.commissionInstitution : '',
            commissionEntity: checked ? current.commissionEntity : '',
            commissionMunicipality: checked ? current.commissionMunicipality : '',
            commissionDecentralizedBody: checked ? current.commissionDecentralizedBody : '',
            commissionAdministrativeUnit: checked ? current.commissionAdministrativeUnit : '',
            commissionAdmissionDate: checked ? current.commissionAdmissionDate : '',
        }));

        if (!checked) {
            ctx.commissionMunicipalityOptions.set([]);
            ctx.commissionInstitutionOptions.set([]);
            ctx.commissionDecentralizedBodyOptions.set([]);
            ctx.commissionAdministrativeUnitOptions.set([]);

            if (ctx.isEditMode() && commissionChanged) {
                // Si durante edición se eligió comisión y después se retira,
                // adscripción debe quedar habilitada nuevamente. El origen se
                // libera para que la siguiente modificación pueda fijar
                // adscripción como el único alcance editable de la operación.
                ctx.editStructureScope.set(null);
                ctx.selectedProfileOrigin.set('adscripcion');
                ctx.resetStructureProfileCatalog();
            }
        }

        ctx.formErrors.update((current) => {
            const next = { ...current };

            [
                'commissionInstitutionType',
                'commissionEntity',
                'commissionMunicipality',
                'commissionInstitution',
                'commissionDecentralizedBody',
                'commissionAdministrativeUnit',
                'commissionAdmissionDate',
            ].forEach((key) => delete next[key]);

            return next;
        });

        ctx.refreshCommissionStructureConflict();
    
    }
    updateAssignmentInstitutionType(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        ctx.bumpAssignmentCatalogGeneration();

        const institutionType = value ?? '';
        if (!ctx.claimEditStructureScope('adscripcion', ctx.form().institutionType !== institutionType)) {
            return;
        }
        const requiresEntity = ctx.requiresEntityForInstitution(institutionType);

        ctx.clearProfilesAfterAssignmentInstitutionChange(ctx.form().institution, '');

        ctx.form.update((current) => ({
            ...current,
            institutionType,
            entity: requiresEntity ? current.entity : '',
            municipality: '',
            institution: '',
            decentralizedBody: '',
            administrativeUnit: '',
        }));

        if (!ctx.requiresMunicipalityForInstitution(institutionType)) {
            ctx.municipalityOptions.set([]);
        } else {
            ctx.municipalityOptions.set([]);

            const preservedEntity = ctx.form().entity;

            if (preservedEntity) {
                ctx.loadMunicipalities(preservedEntity, ctx.municipalityOptions, 'assignment');
            }
        }

        ctx.institutionOptions.set([]);
        ctx.decentralizedBodyOptions.set([]);
        ctx.administrativeUnitOptions.set([]);
        ctx.loadAssignmentInstitutions();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateAssignmentEntity(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        if (!ctx.claimEditStructureScope('adscripcion', ctx.form().entity !== (value ?? ''))) {
            return;
        }

        ctx.bumpAssignmentCatalogGeneration();

        if (!ctx.assignmentRequiresEntity()) {
            ctx.clearProfilesAfterAssignmentInstitutionChange(ctx.form().institution, '');
            ctx.form.update((current) => ({
                ...current,
                entity: '',
                municipality: '',
            }));
            ctx.municipalityOptions.set([]);
            ctx.loadAssignmentInstitutions();
            ctx.refreshCommissionStructureConflict();
            return;
        }

        ctx.clearProfilesAfterAssignmentInstitutionChange(ctx.form().institution, '');

        ctx.form.update((current) => ({
            ...current,
            entity: value ?? '',
            municipality: '',
            institution: '',
            decentralizedBody: '',
            administrativeUnit: '',
        }));
        ctx.municipalityOptions.set([]);
        ctx.institutionOptions.set([]);
        ctx.decentralizedBodyOptions.set([]);
        ctx.administrativeUnitOptions.set([]);
        if (ctx.assignmentRequiresMunicipality()) {
            ctx.loadMunicipalities(value, ctx.municipalityOptions, 'assignment');
        }
        ctx.loadAssignmentInstitutions();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateAssignmentMunicipality(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        if (!ctx.claimEditStructureScope('adscripcion', ctx.form().municipality !== (value ?? ''))) {
            return;
        }

        ctx.bumpAssignmentCatalogGeneration();

        if (!ctx.assignmentRequiresMunicipality()) {
            ctx.form.update((current) => ({ ...current, municipality: '' }));
            return;
        }

        ctx.clearProfilesAfterAssignmentInstitutionChange(ctx.form().institution, '');

        ctx.form.update((current) => ({
            ...current,
            municipality: value ?? '',
            institution: '',
            decentralizedBody: '',
            administrativeUnit: '',
        }));
        ctx.institutionOptions.set([]);
        ctx.decentralizedBodyOptions.set([]);
        ctx.administrativeUnitOptions.set([]);
        ctx.loadAssignmentInstitutions();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateAssignmentInstitution(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        ctx.bumpAssignmentCatalogGeneration();

        const institution = value ?? '';
        if (!ctx.claimEditStructureScope('adscripcion', ctx.form().institution !== institution)) {
            return;
        }
        ctx.clearProfilesAfterAssignmentInstitutionChange(
            ctx.form().institution,
            institution,
        );

        ctx.form.update((current) => ({
            ...current,
            institution,
            decentralizedBody: '',
            administrativeUnit: '',
        }));
        ctx.decentralizedBodyOptions.set([]);
        ctx.administrativeUnitOptions.set([]);
        // OAD y UA son hermanos: los dos catálogos se piden con padreId = institución.
        ctx.loadAssignmentDecentralizedBodies();
        ctx.loadAssignmentAdministrativeUnits();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateAssignmentDecentralizedBody(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        if (ctx.assignmentDecentralizedBodyLocked()) {
            return;
        }

        ctx.bumpAssignmentCatalogGeneration();

        const decentralizedBody = ctx.normalizeSelectValue(value);
        if (!ctx.claimEditStructureScope('adscripcion', ctx.form().decentralizedBody !== decentralizedBody)) {
            return;
        }

        // El catálogo de perfiles se consulta con el último nivel seleccionado,
        // por lo que cambiar el OAD invalida los perfiles ya elegidos.
        ctx.clearProfilesAfterAssignmentInstitutionChange(
            ctx.form().decentralizedBody,
            decentralizedBody,
        );

        ctx.form.update((current) => ({
            ...current,
            decentralizedBody,
            administrativeUnit: '',
        }));
        ctx.clearFieldError('decentralizedBody');
        ctx.administrativeUnitOptions.set([]);
        // Con OAD elegido las UA se acotan a sus hijas; sin OAD vuelven al
        // nivel de institución.
        ctx.loadAssignmentAdministrativeUnits();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateAssignmentAdministrativeUnit(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        ctx.bumpAssignmentCatalogGeneration();

        const administrativeUnit = ctx.normalizeSelectValue(value);
        if (!ctx.claimEditStructureScope('adscripcion', ctx.form().administrativeUnit !== administrativeUnit)) {
            return;
        }

        ctx.clearProfilesAfterAssignmentInstitutionChange(
            ctx.form().administrativeUnit,
            administrativeUnit,
        );
        ctx.form.update((current) => ({
            ...current,
            administrativeUnit,
        }));
        ctx.clearFieldError('administrativeUnit');
        ctx.refreshCommissionStructureConflict();
    
    }
    updateCommissionInstitutionType(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        ctx.bumpCommissionCatalogGeneration();

        const commissionInstitutionType = value ?? '';
        if (!ctx.claimEditStructureScope('comision', ctx.form().commissionInstitutionType !== commissionInstitutionType)) {
            return;
        }
        const requiresEntity = ctx.requiresEntityForInstitution(commissionInstitutionType);

        ctx.clearProfilesAfterCommissionInstitutionChange(ctx.form().commissionInstitution, '');

        ctx.form.update((current) => ({
            ...current,
            commissionInstitutionType,
            commissionEntity: requiresEntity ? current.commissionEntity : '',
            commissionMunicipality: '',
            commissionInstitution: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));

        if (!ctx.requiresMunicipalityForInstitution(commissionInstitutionType)) {
            ctx.commissionMunicipalityOptions.set([]);
        } else {
            ctx.commissionMunicipalityOptions.set([]);

            const preservedEntity = ctx.form().commissionEntity;

            if (preservedEntity) {
                ctx.loadMunicipalities(preservedEntity, ctx.commissionMunicipalityOptions, 'commission');
            }
        }

        ctx.commissionInstitutionOptions.set([]);
        ctx.commissionDecentralizedBodyOptions.set([]);
        ctx.commissionAdministrativeUnitOptions.set([]);
        ctx.loadCommissionInstitutions();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateCommissionEntity(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        if (!ctx.claimEditStructureScope('comision', ctx.form().commissionEntity !== (value ?? ''))) {
            return;
        }

        ctx.bumpCommissionCatalogGeneration();

        if (!ctx.commissionRequiresEntity()) {
            ctx.clearProfilesAfterCommissionInstitutionChange(ctx.form().commissionInstitution, '');
            ctx.form.update((current) => ({
                ...current,
                commissionEntity: '',
                commissionMunicipality: '',
            }));
            ctx.commissionMunicipalityOptions.set([]);
            ctx.loadCommissionInstitutions();
            ctx.refreshCommissionStructureConflict();
            return;
        }

        ctx.clearProfilesAfterCommissionInstitutionChange(ctx.form().commissionInstitution, '');

        ctx.form.update((current) => ({
            ...current,
            commissionEntity: value ?? '',
            commissionMunicipality: '',
            commissionInstitution: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        ctx.commissionMunicipalityOptions.set([]);
        ctx.commissionInstitutionOptions.set([]);
        ctx.commissionDecentralizedBodyOptions.set([]);
        ctx.commissionAdministrativeUnitOptions.set([]);
        if (ctx.commissionRequiresMunicipality()) {
            ctx.loadMunicipalities(value, ctx.commissionMunicipalityOptions, 'commission');
        }
        ctx.loadCommissionInstitutions();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateCommissionMunicipality(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        if (!ctx.claimEditStructureScope('comision', ctx.form().commissionMunicipality !== (value ?? ''))) {
            return;
        }

        ctx.bumpCommissionCatalogGeneration();

        if (!ctx.commissionRequiresMunicipality()) {
            ctx.form.update((current) => ({ ...current, commissionMunicipality: '' }));
            return;
        }

        ctx.clearProfilesAfterCommissionInstitutionChange(ctx.form().commissionInstitution, '');

        ctx.form.update((current) => ({
            ...current,
            commissionMunicipality: value ?? '',
            commissionInstitution: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        ctx.commissionInstitutionOptions.set([]);
        ctx.commissionDecentralizedBodyOptions.set([]);
        ctx.commissionAdministrativeUnitOptions.set([]);
        ctx.loadCommissionInstitutions();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateCommissionInstitution(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        ctx.bumpCommissionCatalogGeneration();

        const commissionInstitution = value ?? '';
        if (!ctx.claimEditStructureScope('comision', ctx.form().commissionInstitution !== commissionInstitution)) {
            return;
        }
        ctx.clearProfilesAfterCommissionInstitutionChange(
            ctx.form().commissionInstitution,
            commissionInstitution,
        );

        ctx.form.update((current) => ({
            ...current,
            commissionInstitution,
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
        }));
        ctx.commissionDecentralizedBodyOptions.set([]);
        ctx.commissionAdministrativeUnitOptions.set([]);
        ctx.loadCommissionDecentralizedBodies();
        ctx.loadCommissionAdministrativeUnits();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateCommissionDecentralizedBody(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        if (ctx.commissionDecentralizedBodyLocked()) {
            return;
        }

        ctx.bumpCommissionCatalogGeneration();

        const commissionDecentralizedBody = ctx.normalizeSelectValue(value);
        if (!ctx.claimEditStructureScope('comision', ctx.form().commissionDecentralizedBody !== commissionDecentralizedBody)) {
            return;
        }

        ctx.clearProfilesAfterCommissionInstitutionChange(
            ctx.form().commissionDecentralizedBody,
            commissionDecentralizedBody,
        );

        ctx.form.update((current) => ({
            ...current,
            commissionDecentralizedBody,
            commissionAdministrativeUnit: '',
        }));
        ctx.clearFieldError('commissionDecentralizedBody');
        ctx.commissionAdministrativeUnitOptions.set([]);
        ctx.loadCommissionAdministrativeUnits();
        ctx.refreshCommissionStructureConflict();
    
    }
    updateCommissionAdministrativeUnit(value: string | null, ctx: UserRegistrationStructureContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        ctx.bumpCommissionCatalogGeneration();

        const commissionAdministrativeUnit = ctx.normalizeSelectValue(value);
        if (!ctx.claimEditStructureScope('comision', ctx.form().commissionAdministrativeUnit !== commissionAdministrativeUnit)) {
            return;
        }

        ctx.clearProfilesAfterCommissionInstitutionChange(
            ctx.form().commissionAdministrativeUnit,
            commissionAdministrativeUnit,
        );
        ctx.form.update((current) => ({
            ...current,
            commissionAdministrativeUnit,
        }));
        ctx.clearFieldError('commissionAdministrativeUnit');
        ctx.refreshCommissionStructureConflict();
    
    }
}
