import { inject, Injectable } from '@angular/core';
import { UserAccountOperationsController } from './user-account-operations.controller';
import { UserManagementFilterCatalogController } from './user-management-filter-catalog.controller';
import { UserManagementFilterPresenter } from './user-management-filter.presenter';
import { UserManagementFilterState } from './user-management-filter.state';
import {
    DATE_FILTER_KEYS,
    EMPTY_USER_FILTERS,
    NAME_FILTER_KEYS,
    UserFilterDefinition,
    UserFilterKey,
    UserFilterTabKey,
    UserFilterValues,
} from './user-management-page.models';

/** Interacciones del panel de filtros. La página sólo expone estos casos de uso al template. */
@Injectable()
export class UserManagementFilterController {
    private readonly state = inject(UserManagementFilterState);
    private readonly presenter = inject(UserManagementFilterPresenter);
    private readonly catalogs = inject(UserManagementFilterCatalogController);
    private readonly accountOperations = inject(UserAccountOperationsController);

    togglePanel(): void {
        if (!this.accountOperations.isAdminUser()) return;
        if (this.state.isFilterPanelOpen()) {
            this.closePanel();
            return;
        }
        this.restoreAppliedFilters();
        this.state.isFilterPanelOpen.set(true);
    }

    closePanel(): void {
        this.restoreAppliedFilters();
        this.state.isFilterPanelOpen.set(false);
    }

    updateSearch(value: string): void {
        this.state.filterCatalogSearch.set(String(value ?? ''));
    }

    selectTab(tab: UserFilterTabKey): void {
        this.state.selectedFilterTab.set(tab);
    }

    addFromPicker(event: Event): void {
        const select = event.target as HTMLSelectElement | null;
        const key = String(select?.value ?? '').trim() as UserFilterKey;
        if (select) select.value = '';
        if (key) this.add(key);
    }

    add(key: UserFilterKey): void {
        const definition = this.findDefinition(key);
        if (!definition || this.presenter.isFilterCheckboxDisabled(definition)) return;
        this.addHierarchyParents(key);
        this.setSelected(key, true);
        this.ensureHierarchyParentsForCurrentInstitutionType(key);
    }

    remove(key: UserFilterKey): void {
        const keysToRemove = DATE_FILTER_KEYS.includes(key) ? DATE_FILTER_KEYS : [key];
        const definition = this.findDefinition(key);
        this.state.draftFilters.update((filters) => {
            const next = { ...filters } as Record<UserFilterKey, string>;
            keysToRemove.forEach((candidate) => { next[candidate] = ''; });
            return next as unknown as UserFilterValues;
        });
        this.state.draftCatalogLabels.update((labels) => {
            const next = { ...labels };
            keysToRemove.forEach((candidate) => delete next[candidate]);
            return next;
        });
        this.setSelected(key, false);
        if (definition?.kind === 'catalog') this.catalogs.handleHierarchyChange(key, '');
    }

    setSelected(key: UserFilterKey, selected: boolean): void {
        if (!selected) {
            const keysToRemove = DATE_FILTER_KEYS.includes(key) ? DATE_FILTER_KEYS : [key];
            this.state.draftFilterKeys.update((keys) => keys.filter((item) => !keysToRemove.includes(item)));
            return;
        }
        const definition = this.findDefinition(key);
        if (!definition || this.presenter.isFilterCheckboxDisabled(definition)) return;
        const keysToAdd = DATE_FILTER_KEYS.includes(key) ? DATE_FILTER_KEYS : [key];
        this.state.draftFilterKeys.update((keys) => [
            ...keys,
            ...keysToAdd.filter((candidate) => !keys.includes(candidate)),
        ]);
    }

    setAllSelected(selected: boolean): void {
        this.state.draftFilterKeys.set(
            selected ? this.presenter.selectableFilterDefinitions().map((filter) => filter.key) : [],
        );
    }

    updateValue(key: UserFilterKey, value: string): void {
        let normalizedValue = String(value ?? '');
        if (NAME_FILTER_KEYS.includes(key) || key === 'curp' || key === 'rfc' || key === 'nombreUsuario') {
            normalizedValue = normalizedValue.toUpperCase();
        }
        this.state.draftFilters.update((filters) => ({ ...filters, [key]: normalizedValue }));
    }

    updateCatalogValue(filter: UserFilterDefinition, label: string): void {
        const normalizedLabel = String(label ?? '');
        const selectedOption = filter.options.find(
            (option) => this.presenter.normalizeForCompare(option.label) === this.presenter.normalizeForCompare(normalizedLabel),
        );
        const previousValue = this.state.draftFilters()[filter.key];
        const nextValue = selectedOption?.value ?? '';
        this.state.draftCatalogLabels.update((labels) => ({ ...labels, [filter.key]: normalizedLabel }));
        this.state.draftFilters.update((filters) => ({ ...filters, [filter.key]: nextValue }));
        if (previousValue !== nextValue) {
            this.catalogs.handleHierarchyChange(filter.key, nextValue);
            this.ensureHierarchyParentsForCurrentInstitutionType(filter.key);
        }
    }

    clearDraft(): void {
        this.state.draftFilterKeys.set([]);
        this.state.draftFilters.set({ ...EMPTY_USER_FILTERS });
        this.state.draftCatalogLabels.set({});
        this.catalogs.resetDynamicCatalogs();
    }

    apply(reload: (page: number) => void): void {
        if (this.presenter.hasIncompleteDraftFilters()) return;
        const effective = this.presenter.effectiveDraftFilters();
        this.state.appliedFilters.set({ ...effective });
        this.state.draftFilterKeys.set(this.getActiveKeys(effective));
        this.closePanel();
        reload(1);
    }

    clearAll(reload: (page: number) => void): void {
        this.state.draftFilterKeys.set([]);
        this.state.draftFilters.set({ ...EMPTY_USER_FILTERS });
        this.state.appliedFilters.set({ ...EMPTY_USER_FILTERS });
        this.state.draftCatalogLabels.set({});
        this.catalogs.resetDynamicCatalogs();
        this.state.filterCatalogSearch.set('');
        this.state.selectedFilterTab.set('all');
        reload(1);
    }

    removeApplied(key: UserFilterKey, reload: (page: number) => void): void {
        const next = { ...this.state.appliedFilters(), [key]: '' } as Record<UserFilterKey, string>;
        if (DATE_FILTER_KEYS.includes(key)) {
            next.fechaInicio = '';
            next.fechaFin = '';
        }
        const filters = next as unknown as UserFilterValues;
        this.state.appliedFilters.set(filters);
        this.state.draftFilters.set({ ...filters });
        this.state.draftFilterKeys.set(this.getActiveKeys(filters));
        this.catalogs.syncDraftCatalogLabels(filters);
        reload(1);
    }

    private restoreAppliedFilters(): void {
        const applied = this.state.appliedFilters();
        this.state.draftFilters.set({ ...applied });
        this.state.draftFilterKeys.set(this.getActiveKeys(applied));
        this.catalogs.syncDraftCatalogLabels(applied);
        this.state.filterCatalogSearch.set('');
        this.state.selectedFilterTab.set('all');
    }

    private addHierarchyParents(key: UserFilterKey): void {
        const parentsByKey: Partial<Record<UserFilterKey, readonly UserFilterKey[]>> = {
            entidadId: ['tipoInstitucionId'],
            municipioId: ['tipoInstitucionId', 'entidadId'],
            institucionId: ['tipoInstitucionId'],
            organoAdministrativoDesconcentradoId: ['tipoInstitucionId', 'institucionId'],
            unidadAdministrativaId: ['tipoInstitucionId', 'institucionId'],
            comisionEntidadId: ['comisionTipoInstitucionId'],
            comisionMunicipioId: ['comisionTipoInstitucionId', 'comisionEntidadId'],
            comisionInstitucionId: ['comisionTipoInstitucionId'],
            comisionOrganoAdministrativoDesconcentradoId: ['comisionTipoInstitucionId', 'comisionInstitucionId'],
            comisionUnidadAdministrativaId: ['comisionTipoInstitucionId', 'comisionInstitucionId'],
        };
        (parentsByKey[key] ?? []).forEach((parent) => this.setSelected(parent, true));
    }

    private ensureHierarchyParentsForCurrentInstitutionType(changedKey: UserFilterKey): void {
        const selected = this.state.draftFilterKeys();
        const filters = this.state.draftFilters();
        const adscription: readonly UserFilterKey[] = ['entidadId', 'municipioId', 'institucionId', 'organoAdministrativoDesconcentradoId', 'unidadAdministrativaId'];
        const commission: readonly UserFilterKey[] = ['comisionEntidadId', 'comisionMunicipioId', 'comisionInstitucionId', 'comisionOrganoAdministrativoDesconcentradoId', 'comisionUnidadAdministrativaId'];

        if ((changedKey === 'tipoInstitucionId' || adscription.includes(changedKey)) && adscription.some((key) => selected.includes(key))) {
            this.setSelected('tipoInstitucionId', true);
            if (filters.tipoInstitucionId && this.presenter.requiresEntityForInstitution(filters.tipoInstitucionId)) this.setSelected('entidadId', true);
            if (filters.tipoInstitucionId && this.presenter.requiresMunicipalityForInstitution(filters.tipoInstitucionId)) this.setSelected('municipioId', true);
        }
        if ((changedKey === 'comisionTipoInstitucionId' || commission.includes(changedKey)) && commission.some((key) => selected.includes(key))) {
            this.setSelected('comisionTipoInstitucionId', true);
            if (filters.comisionTipoInstitucionId && this.presenter.requiresEntityForInstitution(filters.comisionTipoInstitucionId)) this.setSelected('comisionEntidadId', true);
            if (filters.comisionTipoInstitucionId && this.presenter.requiresMunicipalityForInstitution(filters.comisionTipoInstitucionId)) this.setSelected('comisionMunicipioId', true);
        }
    }

    private findDefinition(key: UserFilterKey): UserFilterDefinition | undefined {
        return this.presenter.filterDefinitions().find((filter) => filter.key === key);
    }

    private getActiveKeys(filters: UserFilterValues): readonly UserFilterKey[] {
        return (Object.keys(filters) as UserFilterKey[]).filter((key) => Boolean(filters[key]));
    }
}
