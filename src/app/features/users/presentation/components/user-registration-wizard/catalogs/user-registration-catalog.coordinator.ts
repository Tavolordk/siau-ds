import {
    DestroyRef,
    inject,
    Injectable,
    WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { CatalogosFacade } from '../../../../../../core/catalogos';
import { SiauSelectOption } from '../../../../../../shared/ui';
import {
    NO_APLICA_OPTION,
    NO_APLICA_VALUE,
    ProfileOrigin,
    StructureProfileLookupStatus,
    TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO,
    TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA,
    UserRegistrationForm,
} from '../models/user-registration-wizard.models';
import { UserRegistrationFormRules } from '../rules/user-registration-form.rules';
import { UserProfileMatcher } from '../profiles/user-profile.matcher';

export interface UserRegistrationCatalogState {
    readonly form: WritableSignal<UserRegistrationForm>;
    readonly catalogosReady: WritableSignal<boolean>;
    readonly genderOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly civilStatusOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly userTypeOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly allSystemOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly systemOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly roleOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly institutionTypeOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly stateOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly municipalityOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly institutionOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly decentralizedBodyOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly administrativeUnitOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionMunicipalityOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionInstitutionOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionDecentralizedBodyOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionAdministrativeUnitOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly selectedSystem: WritableSignal<string>;
    readonly selectedRole: WritableSignal<string>;
    readonly structureProfileLookupStatus: WritableSignal<StructureProfileLookupStatus>;
    readonly structureProfileMessage: WritableSignal<string>;
    readonly structureRoleOptionsBySystem: WritableSignal<Record<string, readonly SiauSelectOption[]>>;
    readonly activeProfileOrigin: () => ProfileOrigin;
    readonly selectedProfileOriginLabel: () => string;
    readonly clearFieldError: (key: string) => void;
    readonly ensureDefaultSiauProfile: () => void;
}

@Injectable()
export class UserRegistrationCatalogCoordinator {
    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly profileMatcher = inject(UserProfileMatcher);
    private readonly destroyRef = inject(DestroyRef);

    private structureProfileLookupSequence = 0;
    private assignmentCatalogGeneration = 0;
    private commissionCatalogGeneration = 0;
    private loadedProfileStructureId: number | null = null;

    loadCatalogos(state: UserRegistrationCatalogState): void {
        forkJoin({
            sexos: this.catalogosFacade.obtenerSexoOptions(),
            estadosCivil: this.catalogosFacade.obtenerEstadoCivilOptions(),
            tiposUsuario: this.catalogosFacade.obtenerTipoUsuarioOptions(),
            sistemas: this.catalogosFacade.obtenerSistemasOptions(),
            tiposInstitucion: this.catalogosFacade.obtenerTipoInstitucionOptions(),
            estados: this.catalogosFacade.obtenerEstadosOptions(),
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (catalogos) => {
                    state.genderOptions.set(catalogos.sexos);
                    state.civilStatusOptions.set(catalogos.estadosCivil);
                    state.userTypeOptions.set(catalogos.tiposUsuario);
                    state.allSystemOptions.set(catalogos.sistemas);
                    state.systemOptions.set(catalogos.sistemas);
                    state.roleOptions.set([]);
                    state.institutionTypeOptions.update((current) =>
                        this.mergeSelectOptions(current, catalogos.tiposInstitucion),
                    );
                    state.stateOptions.update((current) =>
                        this.mergeSelectOptions(current, catalogos.estados),
                    );
                    state.catalogosReady.set(true);
                },
                error: (error: unknown) => {
                    state.catalogosReady.set(true);
                    console.error('Error cargando catálogos del usuario.', error);
                },
            });
    }

    loadHydratedAssignmentCatalogs(
        form: UserRegistrationForm,
        state: UserRegistrationCatalogState,
    ): void {
        if (this.requiresMunicipalityForInstitution(form.institutionType, state) && form.entity) {
            this.loadMunicipalities(form.entity, state.municipalityOptions, 'assignment', state);
        }

        if (form.institutionType) {
            this.loadAssignmentInstitutions(state);
        }

        if (form.institutionType && form.institution) {
            this.loadAssignmentDecentralizedBodies(state);
            this.loadAssignmentAdministrativeUnits(state);
        }

        if (!form.commissionEnabled) {
            return;
        }

        if (
            this.requiresMunicipalityForInstitution(form.commissionInstitutionType, state) &&
            form.commissionEntity
        ) {
            this.loadMunicipalities(
                form.commissionEntity,
                state.commissionMunicipalityOptions,
                'commission',
                state,
            );
        }

        if (form.commissionInstitutionType) {
            this.loadCommissionInstitutions(state);
        }

        if (form.commissionInstitutionType && form.commissionInstitution) {
            this.loadCommissionDecentralizedBodies(state);
            this.loadCommissionAdministrativeUnits(state);
        }
    }

    loadProfileOptionsForSystem(systemValue: string, state: UserRegistrationCatalogState): void {
        if (!systemValue || state.structureProfileLookupStatus() !== 'success') {
            state.roleOptions.set([]);
            return;
        }

        state.roleOptions.set(this.findStructureRoleOptionsForSystem(systemValue, state));
    }

    loadStructureProfileOptions(
        structureId: number | undefined,
        state: UserRegistrationCatalogState,
    ): void {
        if (!structureId) {
            this.resetStructureProfileCatalog(state);
            state.structureProfileMessage.set(
                state.activeProfileOrigin() === 'comision'
                    ? 'Completa la estructura de comisión para consultar sus perfiles.'
                    : 'Completa la estructura de adscripción para consultar sus perfiles.',
            );
            return;
        }

        if (
            this.loadedProfileStructureId === structureId &&
            state.structureProfileLookupStatus() === 'success'
        ) {
            return;
        }

        const lookupSequence = ++this.structureProfileLookupSequence;
        this.loadedProfileStructureId = structureId;
        state.structureProfileLookupStatus.set('loading');
        state.structureProfileMessage.set(
            `Consultando perfiles permitidos para la ${state.selectedProfileOriginLabel()} seleccionada...`,
        );
        state.systemOptions.set([]);
        state.structureRoleOptionsBySystem.set({});
        state.selectedSystem.set('');
        state.selectedRole.set('');
        state.roleOptions.set([]);

        this.catalogosFacade
            .obtenerEstructuraPerfil(structureId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (items) => {
                    if (lookupSequence !== this.structureProfileLookupSequence) {
                        return;
                    }

                    const catalog = this.profileMatcher.buildStructureProfileCatalog(
                        items,
                        state.allSystemOptions(),
                    );

                    state.systemOptions.set(catalog.systems);
                    state.structureRoleOptionsBySystem.set({ ...catalog.rolesBySystem });
                    state.structureProfileLookupStatus.set('success');
                    state.structureProfileMessage.set(
                        catalog.systems.length > 0
                            ? `Perfiles de ${state.selectedProfileOriginLabel()} cargados correctamente.`
                            : `La ${state.selectedProfileOriginLabel()} seleccionada no tiene sistemas y perfiles configurados.`,
                    );
                    state.clearFieldError('profiles');
                    state.ensureDefaultSiauProfile();
                },
                error: (error: unknown) => {
                    if (lookupSequence !== this.structureProfileLookupSequence) {
                        return;
                    }

                    state.systemOptions.set([]);
                    state.structureRoleOptionsBySystem.set({});
                    state.structureProfileLookupStatus.set('error');
                    state.structureProfileMessage.set(
                        error instanceof Error
                            ? error.message
                            : 'No fue posible consultar los perfiles de la estructura.',
                    );
                    console.error('Error cargando perfiles por estructura.', error);
                },
            });
    }

    resetStructureProfileCatalog(state: UserRegistrationCatalogState): void {
        this.structureProfileLookupSequence += 1;
        this.loadedProfileStructureId = null;
        state.structureProfileLookupStatus.set('idle');
        state.structureProfileMessage.set('');
        state.structureRoleOptionsBySystem.set({});
        state.systemOptions.set([]);
        state.selectedSystem.set('');
        state.selectedRole.set('');
        state.roleOptions.set([]);
    }

    loadMunicipalities(
        stateValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
        context: 'assignment' | 'commission',
        state: UserRegistrationCatalogState,
    ): void {
        const estadoId = this.toCatalogId(stateValue);
        const requestGeneration = this.catalogGeneration(context);

        if (!estadoId) {
            target.set(this.formRules.hasText(stateValue) ? [NO_APLICA_OPTION] : []);
            return;
        }

        this.catalogosFacade
            .obtenerMunicipiosOptions(estadoId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) return;
                    this.setDynamicCatalogOptions(target, options, state);
                },
                error: (error: unknown) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) return;
                    this.resetDynamicCatalogOptions(target, state);
                    console.error('Error cargando municipios.', error);
                },
            });
    }

    loadAssignmentInstitutions(state: UserRegistrationCatalogState): void {
        const current = state.form();
        const tipoInstitucionId = this.toCatalogId(current.institutionType);
        const estadoId = this.requiresEntityForInstitution(current.institutionType, state)
            ? this.toCatalogId(current.entity)
            : undefined;
        const padreId = this.requiresMunicipalityForInstitution(current.institutionType, state)
            ? this.toCatalogId(current.municipality)
            : undefined;

        if (
            !tipoInstitucionId ||
            (this.requiresEntityForInstitution(current.institutionType, state) && !estadoId) ||
            (this.requiresMunicipalityForInstitution(current.institutionType, state) && !padreId)
        ) {
            state.institutionOptions.set([]);
            return;
        }

        this.loadRegionalOrgOptions(
            state.institutionOptions,
            { tipoInstitucionId, estadoId, padreId },
            'assignment',
            state,
        );
    }

    loadAssignmentDecentralizedBodies(state: UserRegistrationCatalogState): void {
        this.loadAssignmentChildren(
            state.form().institution,
            state.decentralizedBodyOptions,
            TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO,
            state,
        );
    }

    loadAssignmentAdministrativeUnits(state: UserRegistrationCatalogState): void {
        const current = state.form();
        const parentValue = this.resolveAdministrativeUnitParent(
            current.institutionType,
            current.institution,
            current.decentralizedBody,
            state,
        );

        if (!parentValue) {
            state.administrativeUnitOptions.set([]);
            return;
        }

        this.loadAssignmentChildren(
            parentValue,
            state.administrativeUnitOptions,
            TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA,
            state,
        );
    }

    loadCommissionInstitutions(state: UserRegistrationCatalogState): void {
        const current = state.form();
        const tipoInstitucionId = this.toCatalogId(current.commissionInstitutionType);
        const estadoId = this.requiresEntityForInstitution(current.commissionInstitutionType, state)
            ? this.toCatalogId(current.commissionEntity)
            : undefined;
        const padreId = this.requiresMunicipalityForInstitution(current.commissionInstitutionType, state)
            ? this.toCatalogId(current.commissionMunicipality)
            : undefined;

        if (
            !tipoInstitucionId ||
            (this.requiresEntityForInstitution(current.commissionInstitutionType, state) && !estadoId) ||
            (this.requiresMunicipalityForInstitution(current.commissionInstitutionType, state) && !padreId)
        ) {
            state.commissionInstitutionOptions.set([]);
            return;
        }

        this.loadRegionalOrgOptions(
            state.commissionInstitutionOptions,
            { tipoInstitucionId, estadoId, padreId },
            'commission',
            state,
        );
    }

    loadCommissionDecentralizedBodies(state: UserRegistrationCatalogState): void {
        this.loadCommissionChildren(
            state.form().commissionInstitution,
            state.commissionDecentralizedBodyOptions,
            TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO,
            state,
        );
    }

    loadCommissionAdministrativeUnits(state: UserRegistrationCatalogState): void {
        const current = state.form();
        const parentValue = this.resolveAdministrativeUnitParent(
            current.commissionInstitutionType,
            current.commissionInstitution,
            current.commissionDecentralizedBody,
            state,
        );

        if (!parentValue) {
            state.commissionAdministrativeUnitOptions.set([]);
            return;
        }

        this.loadCommissionChildren(
            parentValue,
            state.commissionAdministrativeUnitOptions,
            TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA,
            state,
        );
    }

    bumpAssignmentCatalogGeneration(): void {
        this.assignmentCatalogGeneration += 1;
    }

    bumpCommissionCatalogGeneration(): void {
        this.commissionCatalogGeneration += 1;
    }

    private loadAssignmentChildren(
        parentValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
        tipoEstructuraId: number | undefined,
        state: UserRegistrationCatalogState,
    ): void {
        const padreId = this.toCatalogId(parentValue);
        const current = state.form();

        if (!padreId) {
            target.set(this.formRules.hasText(parentValue) ? [NO_APLICA_OPTION] : []);
            return;
        }

        if (this.isFederalInstitutionType(current.institutionType, state)) {
            this.loadFederalOrgOptions(target, { tipoEstructuraId, padreId }, 'assignment', state);
            return;
        }

        this.loadRegionalOrgOptions(
            target,
            {
                tipoInstitucionId: this.toCatalogId(current.institutionType),
                estadoId: this.requiresEntityForInstitution(current.institutionType, state)
                    ? this.toCatalogId(current.entity)
                    : undefined,
                padreId,
            },
            'assignment',
            state,
        );
    }

    private loadCommissionChildren(
        parentValue: string | null,
        target: WritableSignal<readonly SiauSelectOption[]>,
        tipoEstructuraId: number | undefined,
        state: UserRegistrationCatalogState,
    ): void {
        const padreId = this.toCatalogId(parentValue);
        const current = state.form();

        if (!padreId) {
            target.set(this.formRules.hasText(parentValue) ? [NO_APLICA_OPTION] : []);
            return;
        }

        if (this.isFederalInstitutionType(current.commissionInstitutionType, state)) {
            this.loadFederalOrgOptions(target, { tipoEstructuraId, padreId }, 'commission', state);
            return;
        }

        this.loadRegionalOrgOptions(
            target,
            {
                tipoInstitucionId: this.toCatalogId(current.commissionInstitutionType),
                estadoId: this.requiresEntityForInstitution(current.commissionInstitutionType, state)
                    ? this.toCatalogId(current.commissionEntity)
                    : undefined,
                padreId,
            },
            'commission',
            state,
        );
    }

    private loadFederalOrgOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        query: { readonly tipoEstructuraId?: number; readonly padreId: number },
        context: 'assignment' | 'commission',
        state: UserRegistrationCatalogState,
    ): void {
        const requestGeneration = this.catalogGeneration(context);

        this.catalogosFacade
            .obtenerEstructuraOrganizacionalOptions({
                tipoEstructuraId: query.tipoEstructuraId,
                padreId: query.padreId,
                soloActivos: 1,
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) return;
                    this.setDynamicCatalogOptions(target, options, state);
                },
                error: (error: unknown) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) return;
                    this.resetDynamicCatalogOptions(target, state);
                    console.error('Error cargando estructura organizacional federal.', error);
                },
            });
    }

    private loadRegionalOrgOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        query: {
            readonly tipoInstitucionId?: number;
            readonly estadoId?: number;
            readonly padreId?: number;
        },
        context: 'assignment' | 'commission',
        state: UserRegistrationCatalogState,
    ): void {
        const requestGeneration = this.catalogGeneration(context);

        this.catalogosFacade
            .obtenerEstructuraOrgOptions({
                tipoInstitucionId: query.tipoInstitucionId,
                estadoId: query.estadoId,
                padreId: query.padreId,
                soloActivos: 1,
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) return;
                    this.setDynamicCatalogOptions(target, options, state);
                },
                error: (error: unknown) => {
                    if (!this.isCatalogRequestCurrent(context, requestGeneration)) return;
                    this.resetDynamicCatalogOptions(target, state);
                    console.error('Error cargando estructura orgánica estatal o municipal.', error);
                },
            });
    }

    private resolveAdministrativeUnitParent(
        institutionType: string,
        institution: string,
        decentralizedBody: string,
        state: UserRegistrationCatalogState,
    ): string {
        if (this.hasStructureSelection(decentralizedBody)) return decentralizedBody;
        if (!this.isFederalInstitutionType(institutionType, state)) return '';
        return this.hasStructureSelection(institution) ? institution : '';
    }

    findStructureRoleOptionsForSystem(
        system: string,
        state: UserRegistrationCatalogState,
    ): readonly SiauSelectOption[] {
        return this.profileMatcher.findStructureRoleOptionsForSystem(
            system,
            state.structureRoleOptionsBySystem(),
            state.systemOptions(),
            state.allSystemOptions(),
        );
    }

    private catalogGeneration(context: 'assignment' | 'commission'): number {
        return context === 'assignment'
            ? this.assignmentCatalogGeneration
            : this.commissionCatalogGeneration;
    }

    private isCatalogRequestCurrent(
        context: 'assignment' | 'commission',
        requestGeneration: number,
    ): boolean {
        return requestGeneration === this.catalogGeneration(context);
    }

    private setDynamicCatalogOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        options: readonly SiauSelectOption[],
        state: UserRegistrationCatalogState,
    ): void {
        const cleanOptions = this.deduplicateSelectOptions(options);
        const preservedSelectedOption = this.preservedSelectedOption(target, state);

        if (cleanOptions.length === 0) {
            target.set(preservedSelectedOption ? [preservedSelectedOption] : [NO_APLICA_OPTION]);
            return;
        }

        target.set(
            preservedSelectedOption
                ? this.deduplicateSelectOptions([preservedSelectedOption, ...cleanOptions])
                : cleanOptions,
        );
    }

    private preservedSelectedOption(
        target: WritableSignal<readonly SiauSelectOption[]>,
        state: UserRegistrationCatalogState,
    ): SiauSelectOption | null {
        const selectedValue = this.selectedValueForDynamicTarget(target, state);
        if (!selectedValue || this.isNoAplicaValue(selectedValue)) return null;
        return target().find((option) => option.value === selectedValue) ?? null;
    }

    private resetDynamicCatalogOptions(
        target: WritableSignal<readonly SiauSelectOption[]>,
        state: UserRegistrationCatalogState,
    ): void {
        const preserved = this.preservedSelectedOption(target, state);
        target.set(preserved ? [preserved] : [NO_APLICA_OPTION]);
    }

    private selectedValueForDynamicTarget(
        target: WritableSignal<readonly SiauSelectOption[]>,
        state: UserRegistrationCatalogState,
    ): string {
        const current = state.form();
        if (target === state.municipalityOptions) return current.municipality;
        if (target === state.institutionOptions) return current.institution;
        if (target === state.decentralizedBodyOptions) return current.decentralizedBody;
        if (target === state.administrativeUnitOptions) return current.administrativeUnit;
        if (target === state.commissionMunicipalityOptions) return current.commissionMunicipality;
        if (target === state.commissionInstitutionOptions) return current.commissionInstitution;
        if (target === state.commissionDecentralizedBodyOptions) return current.commissionDecentralizedBody;
        if (target === state.commissionAdministrativeUnitOptions) return current.commissionAdministrativeUnit;
        return '';
    }

    private deduplicateSelectOptions(
        options: readonly SiauSelectOption[],
    ): readonly SiauSelectOption[] {
        const unique = new Map<string, SiauSelectOption>();
        options.forEach((option) => {
            const value = this.formRules.toText(option.value);
            if (!value) return;
            const key = this.formRules.normalizeText(value);
            if (!unique.has(key)) unique.set(key, option);
        });
        return [...unique.values()];
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
                    this.formRules.normalizeText(option.value) ===
                        this.formRules.normalizeText(preservedOption.value),
            );
            if (!alreadyExists) result.push(preservedOption);
        });
        return result;
    }

    private isFederalInstitutionType(
        value: string | null | undefined,
        state: UserRegistrationCatalogState,
    ): boolean {
        return (
            this.toCatalogId(value) === 1 ||
            this.getInstitutionTypeLabel(value, state).includes('federal')
        );
    }

    private requiresEntityForInstitution(
        value: string | null | undefined,
        state: UserRegistrationCatalogState,
    ): boolean {
        const label = this.getInstitutionTypeLabel(value, state);
        return label.includes('estatal') || label.includes('municipal');
    }

    private requiresMunicipalityForInstitution(
        value: string | null | undefined,
        state: UserRegistrationCatalogState,
    ): boolean {
        return this.getInstitutionTypeLabel(value, state).includes('municipal');
    }

    private getInstitutionTypeLabel(
        value: string | null | undefined,
        state: UserRegistrationCatalogState,
    ): string {
        if (!value) return '';
        const option = state.institutionTypeOptions().find((item) => item.value === value);
        return this.formRules.normalizeText(option?.label ?? value);
    }

    private hasStructureSelection(value: string | null | undefined): boolean {
        return this.formRules.hasText(value) && !this.isNoAplicaValue(value);
    }

    private isNoAplicaValue(value: unknown): boolean {
        const normalized = this.formRules.normalizeText(this.formRules.toText(value));
        return normalized === this.formRules.normalizeText(NO_APLICA_VALUE) || normalized === 'no aplica';
    }

    private toCatalogId(value: string | null | undefined): number | undefined {
        if (!value) return undefined;
        const id = Number(value);
        return Number.isFinite(id) && id > 0 ? id : undefined;
    }
}
