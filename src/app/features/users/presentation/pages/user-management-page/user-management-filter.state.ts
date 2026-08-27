import { Injectable, signal } from '@angular/core';
import { CatalogoOption } from '../../../../../core/catalogos';
import {
    EMPTY_USER_FILTERS,
    UserFilterKey,
    UserFilterTabKey,
    UserFilterValues,
} from './user-management-page.models';

/** Estado mutable exclusivo del panel de filtros de usuarios. */
@Injectable()
export class UserManagementFilterState {
    readonly isFilterPanelOpen = signal(false);
    readonly filterCatalogSearch = signal('');
    readonly selectedFilterTab = signal<UserFilterTabKey>('all');
    readonly draftFilterKeys = signal<readonly UserFilterKey[]>([]);
    readonly draftFilters = signal<UserFilterValues>({ ...EMPTY_USER_FILTERS });
    readonly appliedFilters = signal<UserFilterValues>({ ...EMPTY_USER_FILTERS });
    readonly draftCatalogLabels = signal<Partial<Record<UserFilterKey, string>>>({});

    readonly institutionTypeOptions = signal<readonly CatalogoOption[]>([]);
    readonly stateOptions = signal<readonly CatalogoOption[]>([]);
    readonly municipalityOptions = signal<readonly CatalogoOption[]>([]);
    readonly institutionOptions = signal<readonly CatalogoOption[]>([]);
    readonly decentralizedBodyOptions = signal<readonly CatalogoOption[]>([]);
    readonly administrativeUnitOptions = signal<readonly CatalogoOption[]>([]);
    readonly commissionMunicipalityOptions = signal<readonly CatalogoOption[]>([]);
    readonly commissionInstitutionOptions = signal<readonly CatalogoOption[]>([]);
    readonly commissionDecentralizedBodyOptions = signal<readonly CatalogoOption[]>([]);
    readonly commissionAdministrativeUnitOptions = signal<readonly CatalogoOption[]>([]);
    readonly accountStatusOptions = signal<readonly CatalogoOption[]>([]);
    readonly isFilterCatalogLoading = signal(true);
    readonly filterCatalogMessage = signal<string | null>(null);
}
