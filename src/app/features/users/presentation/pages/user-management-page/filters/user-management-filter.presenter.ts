import { computed, inject, Injectable } from '@angular/core';
import {
    CONTACT_EMAIL_MAX_LENGTH,
    sanitizeContactEmailInput,
} from '../../../../../../shared/validation/field-validators';
import {
    EMPTY_USER_FILTERS,
    NAME_FILTER_KEYS,
    UserFilterChip,
    UserFilterDefinition,
    UserFilterGroupKey,
    UserFilterKey,
    UserFilterTab,
    UserFilterValues,
} from '../models/user-management-page.models';
import { UserManagementFilterState } from './user-management-filter.state';

/** Estado derivado y reglas de presentación del panel de filtros. */
@Injectable()
export class UserManagementFilterPresenter {
    private readonly state = inject(UserManagementFilterState);
    readonly todayDate = this.toDateInputValue(new Date());

    readonly filterTabs: readonly UserFilterTab[] = [
        { id: 'all', label: 'Todos' },
        { id: 'general', label: 'Información general' },
        { id: 'adscription', label: 'Adscripción' },
        { id: 'commission', label: 'Comisión' },
        { id: 'account', label: 'Cuenta y acceso' },
    ];

    readonly filterDefinitions = computed<readonly UserFilterDefinition[]>(() => [
        { key: 'primerApellido', label: 'Primer apellido', placeholder: 'Captura el primer apellido', group: 'general', kind: 'text', options: [], maxLength: 100, inputMode: 'text' },
        { key: 'segundoApellido', label: 'Segundo apellido', placeholder: 'Captura el segundo apellido', group: 'general', kind: 'text', options: [], maxLength: 100, inputMode: 'text' },
        { key: 'nombres', label: 'Nombre(s)', placeholder: 'Captura el nombre o nombres', group: 'general', kind: 'text', options: [], maxLength: 100, inputMode: 'text' },
        { key: 'curp', label: 'CURP', placeholder: '18 caracteres', group: 'general', kind: 'text', options: [], maxLength: 18, inputMode: 'text' },
        { key: 'rfc', label: 'RFC', placeholder: '13 caracteres', group: 'general', kind: 'text', options: [], maxLength: 13, inputMode: 'text' },
        { key: 'correo', label: 'Correo electrónico', placeholder: 'usuario@dominio.com', group: 'general', kind: 'text', options: [], maxLength: CONTACT_EMAIL_MAX_LENGTH, inputMode: 'email' },
        { key: 'numeroTelefonico', label: 'Número telefónico', placeholder: '10 dígitos', group: 'general', kind: 'text', options: [], maxLength: 10, inputMode: 'numeric' },
        { key: 'tipoInstitucionId', label: 'Tipo de institución', placeholder: 'Escribe para buscar y selecciona', group: 'adscription', kind: 'catalog', options: this.state.institutionTypeOptions(), maxLength: 100 },
        { key: 'entidadId', label: 'Entidad', placeholder: 'Escribe para buscar y selecciona', group: 'adscription', kind: 'catalog', options: this.state.stateOptions(), maxLength: 100 },
        { key: 'municipioId', label: 'Municipio/Alcaldía', placeholder: 'Escribe para buscar y selecciona', group: 'adscription', kind: 'catalog', options: this.state.municipalityOptions(), maxLength: 100 },
        { key: 'institucionId', label: 'Institución', placeholder: 'Escribe para buscar y selecciona', group: 'adscription', kind: 'catalog', options: this.state.institutionOptions(), maxLength: 100 },
        { key: 'organoAdministrativoDesconcentradoId', label: 'Órgano Administrativo Desconcentrado', placeholder: 'Escribe para buscar y selecciona', group: 'adscription', kind: 'catalog', options: this.state.decentralizedBodyOptions(), maxLength: 100 },
        { key: 'unidadAdministrativaId', label: 'Unidad Administrativa', placeholder: 'Escribe para buscar y selecciona', group: 'adscription', kind: 'catalog', options: this.state.administrativeUnitOptions(), maxLength: 100 },
        { key: 'nombreUsuario', label: 'Nombre de usuario', placeholder: '14 caracteres', group: 'account', kind: 'text', options: [], maxLength: 14, inputMode: 'text' },
        { key: 'estadoCuentaId', label: 'Estatus', placeholder: 'Escribe para buscar y selecciona', group: 'account', kind: 'catalog', options: this.state.accountStatusOptions(), maxLength: 15 },
        { key: 'fechaInicio', label: 'Fecha de inicio del último movimiento', placeholder: 'dd/mm/aaaa', group: 'account', kind: 'date', options: [] },
        { key: 'fechaFin', label: 'Fecha de fin del último movimiento', placeholder: 'dd/mm/aaaa', group: 'account', kind: 'date', options: [] },
    ]);

    readonly visibleFilterDefinitions = computed(() => {
        const search = this.normalizeForCompare(this.state.filterCatalogSearch());
        const selectedTab = this.state.selectedFilterTab();
        return this.filterDefinitions().filter((filter) => {
            const matchesTab = selectedTab === 'all' || filter.group === selectedTab;
            const matchesSearch = !search || this.normalizeForCompare(filter.label).includes(search);
            return matchesTab && matchesSearch;
        });
    });

    readonly selectableFilterDefinitions = computed(() =>
        this.filterDefinitions().filter((filter) => !this.isFilterCheckboxDisabled(filter)),
    );
    readonly selectedFilterDefinitions = computed(() => {
        const keys = this.state.draftFilterKeys();
        return this.filterDefinitions().filter((filter) => keys.includes(filter.key));
    });
    readonly availableFilterDefinitions = computed(() => {
        const keys = this.state.draftFilterKeys();
        return this.filterDefinitions().filter((filter) => !keys.includes(filter.key));
    });

    readonly effectiveDraftFilters = computed<UserFilterValues>(() => {
        const draft = this.state.draftFilters();
        const effective = { ...EMPTY_USER_FILTERS } as Record<UserFilterKey, string>;
        (Object.keys(EMPTY_USER_FILTERS) as UserFilterKey[]).forEach((key) => {
            effective[key] = String(draft[key] ?? '').trim();
        });
        return effective as unknown as UserFilterValues;
    });

    readonly draftFilterErrors = computed<Partial<Record<UserFilterKey, string>>>(() => {
        const errors: Partial<Record<UserFilterKey, string>> = {};
        const filters = this.state.draftFilters();
        this.state.draftFilterKeys().forEach((key) => {
            const error = this.validateFilterValue(key, filters[key]);
            if (error) errors[key] = error;
        });
        if (filters.fechaInicio && filters.fechaFin && filters.fechaInicio > filters.fechaFin) {
            errors.fechaInicio = 'La fecha de inicio no puede ser posterior a la fecha de fin.';
            errors.fechaFin = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
        }
        return errors;
    });

    readonly filterFormError = computed<string | null>(() => {
        const filters = this.state.draftFilters();
        const hasAnyNameFilter = NAME_FILTER_KEYS.some((key) => Boolean(filters[key]?.trim()));
        const hasNames = Boolean(filters.nombres?.trim());
        const hasSurname = Boolean(filters.primerApellido?.trim() || filters.segundoApellido?.trim());

        if (hasAnyNameFilter && (!hasNames || !hasSurname)) {
            return 'Para buscar por nombre debes capturar Nombre(s) y al menos un apellido.';
        }
        if (Boolean(filters.fechaInicio) !== Boolean(filters.fechaFin)) {
            return 'El período de último movimiento requiere fecha de inicio y fecha de fin.';
        }
        return null;
    });

    readonly activeFilterCount = computed(() =>
        Object.values(this.state.appliedFilters()).filter(Boolean).length,
    );
    readonly selectedDraftFilterCount = computed(() => this.state.draftFilterKeys().length);
    readonly allDraftFiltersSelected = computed(() => {
        const filters = this.selectableFilterDefinitions();
        return Boolean(filters.length) && filters.every((filter) => this.isDraftFilterSelected(filter.key));
    });
    readonly someDraftFiltersSelected = computed(() =>
        this.selectedDraftFilterCount() > 0 && !this.allDraftFiltersSelected(),
    );
    readonly hasIncompleteDraftFilters = computed(() =>
        Boolean(this.filterFormError()) || Object.keys(this.draftFilterErrors()).length > 0,
    );
    readonly hasPendingFilterChanges = computed(() =>
        JSON.stringify(this.effectiveDraftFilters()) !== JSON.stringify(this.state.appliedFilters()),
    );

    readonly activeFilterChips = computed<readonly UserFilterChip[]>(() => {
        const filters = this.state.appliedFilters();
        return this.filterDefinitions().reduce<UserFilterChip[]>((chips, definition) => {
            const value = filters[definition.key];
            if (!value) return chips;
            const displayValue = definition.kind === 'catalog'
                ? definition.options.find((option) => option.value === value)?.label ?? value
                : definition.kind === 'date'
                    ? this.formatDateForDisplay(value)
                    : value;
            chips.push({ key: definition.key, label: definition.label, value: displayValue });
            return chips;
        }, []);
    });

    getFilterGroupLabel(group: UserFilterGroupKey): string {
        switch (group) {
            case 'general': return 'Datos personales';
            case 'adscription': return 'Adscripción';
            case 'commission': return 'Comisión';
            case 'account': return 'Cuenta y acceso';
            default: return 'Otros';
        }
    }

    isFilterDefinitionDisabled(filter: UserFilterDefinition): boolean {
        if (filter.kind !== 'catalog') return false;
        if (this.state.isFilterCatalogLoading()) return true;
        const filters = this.state.draftFilters();
        switch (filter.key) {
            case 'entidadId':
                return !this.requiresEntityForInstitution(filters.tipoInstitucionId) || !filter.options.length;
            case 'municipioId':
                return !this.requiresMunicipalityForInstitution(filters.tipoInstitucionId) || !filters.entidadId || !filter.options.length;
            case 'institucionId':
                return !this.canSelectInstitution(filters) || !filter.options.length;
            case 'organoAdministrativoDesconcentradoId':
            case 'unidadAdministrativaId':
                return !filters.institucionId || !filter.options.length;
            case 'comisionEntidadId':
                return !this.requiresEntityForInstitution(filters.comisionTipoInstitucionId) || !filter.options.length;
            case 'comisionMunicipioId':
                return !this.requiresMunicipalityForInstitution(filters.comisionTipoInstitucionId) || !filters.comisionEntidadId || !filter.options.length;
            case 'comisionInstitucionId':
                return !this.canSelectCommissionInstitution(filters) || !filter.options.length;
            case 'comisionOrganoAdministrativoDesconcentradoId':
            case 'comisionUnidadAdministrativaId':
                return !filters.comisionInstitucionId || !filter.options.length;
            default:
                return !filter.options.length;
        }
    }

    isFilterCheckboxDisabled(filter: UserFilterDefinition): boolean {
        if (filter.kind !== 'catalog') return false;
        if (this.state.isFilterCatalogLoading()) return true;
        const dependentKeys: readonly UserFilterKey[] = [
            'entidadId', 'municipioId', 'institucionId',
            'organoAdministrativoDesconcentradoId', 'unidadAdministrativaId',
            'comisionEntidadId', 'comisionMunicipioId', 'comisionInstitucionId',
            'comisionOrganoAdministrativoDesconcentradoId', 'comisionUnidadAdministrativaId',
        ];
        return dependentKeys.includes(filter.key) ? false : !filter.options.length;
    }

    getDraftCatalogLabel(filter: UserFilterDefinition): string {
        const labels = this.state.draftCatalogLabels();
        if (labels[filter.key] !== undefined) return labels[filter.key] ?? '';
        const value = this.state.draftFilters()[filter.key];
        return filter.options.find((option) => option.value === value)?.label ?? '';
    }

    getFilterError(key: UserFilterKey): string | null {
        return this.draftFilterErrors()[key] ?? null;
    }

    getFilterPlaceholder(filter: UserFilterDefinition): string {
        if (!this.isFilterDefinitionDisabled(filter)) return filter.placeholder;
        switch (filter.key) {
            case 'entidadId': return 'Selecciona primero un tipo estatal o municipal';
            case 'municipioId': return 'Selecciona primero una entidad y tipo municipal';
            case 'institucionId': return 'Completa primero la ubicación requerida';
            case 'organoAdministrativoDesconcentradoId':
            case 'unidadAdministrativaId': return 'Selecciona primero una institución';
            case 'comisionEntidadId': return 'Selecciona primero un tipo estatal o municipal';
            case 'comisionMunicipioId': return 'Selecciona primero una entidad y tipo municipal';
            case 'comisionInstitucionId': return 'Completa primero la ubicación requerida de la comisión';
            case 'comisionOrganoAdministrativoDesconcentradoId':
            case 'comisionUnidadAdministrativaId': return 'Selecciona primero una institución de comisión';
            default: return 'Catálogo no disponible';
        }
    }

    isDraftFilterSelected(key: UserFilterKey): boolean {
        return this.state.draftFilterKeys().includes(key);
    }

    validateFilterValue(key: UserFilterKey, rawValue: string): string | null {
        const value = String(rawValue ?? '').trim();
        if (!value) return 'Captura o selecciona al menos un carácter.';

        if (NAME_FILTER_KEYS.includes(key)) {
            return /^[A-ZÑ ]{1,100}$/.test(value)
                ? null
                : 'Sólo se permiten letras, Ñ y espacios, de 1 a 100 caracteres.';
        }

        switch (key) {
            case 'curp':
                return /^[A-Z0-9]{1,18}$/.test(value)
                    ? null : 'La CURP sólo permite letras y números, de 1 a 18 caracteres.';
            case 'rfc':
                return /^[A-Z0-9]{1,13}$/.test(value)
                    ? null : 'El RFC sólo permite letras y números, de 1 a 13 caracteres.';
            case 'correo':
                return this.isValidPartialEmail(value)
                    ? null : 'El correo contiene caracteres o una estructura no permitida.';
            case 'numeroTelefonico':
                return /^\d{1,10}$/.test(value)
                    ? null : 'El número telefónico sólo permite de 1 a 10 dígitos.';
            case 'nombreUsuario':
                return /^[A-Z0-9]{1,14}$/.test(value)
                    ? null : 'El nombre de usuario sólo permite letras y números, de 1 a 14 caracteres.';
            case 'fechaInicio':
            case 'fechaFin':
                if (!this.isValidDateInput(value)) return 'Captura una fecha válida.';
                return value <= this.todayDate ? null : 'La fecha no puede ser posterior a la fecha actual.';
            default:
                return null;
        }
    }

    private isValidPartialEmail(value: string): boolean {
        if (value.length < 1 || value.length > CONTACT_EMAIL_MAX_LENGTH) return false;
        if (sanitizeContactEmailInput(value) !== value) return false;
        if (!/^[A-Za-z]/.test(value)) return false;
        if ((value.match(/@/g) ?? []).length > 1) return false;

        const [local, domain] = value.split('@');
        if (!local) return false;
        if (domain === undefined || domain === '') return true;

        return domain
            .split('.')
            .every((label) => label === '' || /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label));
    }

    private isValidDateInput(value: string): boolean {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return false;

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(year, month - 1, day);

        return date.getFullYear() === year
            && date.getMonth() === month - 1
            && date.getDate() === day;
    }

    normalizeForCompare(value: unknown): string {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    formatDateForDisplay(value: string): string {
        const [year, month, day] = value.split('-');
        return year && month && day ? `${day}/${month}/${year}` : value;
    }

    requiresEntityForInstitution(value: string): boolean {
        const label = this.getInstitutionTypeLabel(value);
        return label.includes('estatal') || label.includes('municipal');
    }

    requiresMunicipalityForInstitution(value: string): boolean {
        return this.getInstitutionTypeLabel(value).includes('municipal');
    }

    isFederalInstitutionType(value: string): boolean {
        return this.toOptionalPositiveNumber(value) === 1 || this.getInstitutionTypeLabel(value).includes('federal');
    }

    canSelectInstitution(filters: UserFilterValues): boolean {
        if (!filters.tipoInstitucionId) return false;
        if (this.requiresEntityForInstitution(filters.tipoInstitucionId) && !filters.entidadId) return false;
        if (this.requiresMunicipalityForInstitution(filters.tipoInstitucionId) && !filters.municipioId) return false;
        return true;
    }

    canSelectCommissionInstitution(filters: UserFilterValues): boolean {
        if (!filters.comisionTipoInstitucionId) return false;
        if (this.requiresEntityForInstitution(filters.comisionTipoInstitucionId) && !filters.comisionEntidadId) return false;
        if (this.requiresMunicipalityForInstitution(filters.comisionTipoInstitucionId) && !filters.comisionMunicipioId) return false;
        return true;
    }

    private getInstitutionTypeLabel(value: string): string {
        const option = this.state.institutionTypeOptions().find((item) => item.value === value);
        return this.normalizeForCompare(option?.label ?? value);
    }

    private toOptionalPositiveNumber(value: unknown): number | undefined {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : undefined;
    }

    private toDateInputValue(value: Date): string {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
