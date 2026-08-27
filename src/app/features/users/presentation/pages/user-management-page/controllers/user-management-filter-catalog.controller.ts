import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { CatalogoOption, CatalogosFacade } from '../../../../../../core/catalogos';
import {
    TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO,
    TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA,
    UserFilterKey,
    UserFilterValues,
} from '../models/user-management-page.models';
import { UserManagementFilterPresenter } from '../presenters/user-management-filter.presenter';
import { UserManagementFilterState } from '../state/user-management-filter.state';

/** Carga y dependencia jerárquica de los catálogos del buscador. */
@Injectable()
export class UserManagementFilterCatalogController {
    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly destroyRef = inject(DestroyRef);
    private readonly state = inject(UserManagementFilterState);
    private readonly presenter = inject(UserManagementFilterPresenter);

    loadInitialCatalogs(): void {
        this.state.isFilterCatalogLoading.set(true);
        this.state.filterCatalogMessage.set(null);

        forkJoin({
            institutionTypes: this.catalogosFacade
                .obtenerTipoInstitucionOptions()
                .pipe(catchError(() => of([] as readonly CatalogoOption[]))),
            states: this.catalogosFacade
                .obtenerEstadosOptions()
                .pipe(catchError(() => of([] as readonly CatalogoOption[]))),
            accountStatuses: this.catalogosFacade
                .obtenerCuentaUsuarioOptions()
                .pipe(catchError(() => of([] as readonly CatalogoOption[]))),
        })
            .pipe(
                finalize(() => this.state.isFilterCatalogLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(({ institutionTypes, states, accountStatuses }) => {
                this.state.institutionTypeOptions.set(institutionTypes);
                this.state.stateOptions.set(states);
                this.state.accountStatusOptions.set(accountStatuses);
                if (!institutionTypes.length || !states.length || !accountStatuses.length) {
                    this.state.filterCatalogMessage.set(
                        'Algunos catálogos de búsqueda no están disponibles. Los demás criterios pueden seguir utilizándose.',
                    );
                }
            });
    }

    handleHierarchyChange(key: UserFilterKey, value: string): void {
        switch (key) {
            case 'tipoInstitucionId':
                this.clearDependentValues(['entidadId', 'municipioId', 'institucionId', 'organoAdministrativoDesconcentradoId', 'unidadAdministrativaId']);
                this.resetAssignmentDynamicCatalogs();
                if (value && !this.presenter.requiresEntityForInstitution(value)) this.loadInstitutions();
                break;
            case 'entidadId':
                this.clearDependentValues(['municipioId', 'institucionId', 'organoAdministrativoDesconcentradoId', 'unidadAdministrativaId']);
                this.resetAssignmentDynamicCatalogs();
                if (value && this.presenter.requiresMunicipalityForInstitution(this.state.draftFilters().tipoInstitucionId)) {
                    this.loadMunicipalities(value);
                } else if (value) {
                    this.loadInstitutions();
                }
                break;
            case 'municipioId':
                this.clearDependentValues(['institucionId', 'organoAdministrativoDesconcentradoId', 'unidadAdministrativaId']);
                this.state.institutionOptions.set([]);
                this.state.decentralizedBodyOptions.set([]);
                this.state.administrativeUnitOptions.set([]);
                if (value) this.loadInstitutions();
                break;
            case 'institucionId':
                this.clearDependentValues(['organoAdministrativoDesconcentradoId', 'unidadAdministrativaId']);
                this.state.decentralizedBodyOptions.set([]);
                this.state.administrativeUnitOptions.set([]);
                if (value) {
                    this.loadDecentralizedBodies(value);
                    this.loadAdministrativeUnits();
                }
                break;
            case 'organoAdministrativoDesconcentradoId':
                this.clearDependentValues(['unidadAdministrativaId']);
                this.state.administrativeUnitOptions.set([]);
                if (this.state.draftFilters().institucionId) this.loadAdministrativeUnits();
                break;
            case 'comisionTipoInstitucionId':
                this.clearDependentValues(['comisionEntidadId', 'comisionMunicipioId', 'comisionInstitucionId', 'comisionOrganoAdministrativoDesconcentradoId', 'comisionUnidadAdministrativaId']);
                this.resetCommissionDynamicCatalogs();
                if (value && !this.presenter.requiresEntityForInstitution(value)) this.loadCommissionInstitutions();
                break;
            case 'comisionEntidadId':
                this.clearDependentValues(['comisionMunicipioId', 'comisionInstitucionId', 'comisionOrganoAdministrativoDesconcentradoId', 'comisionUnidadAdministrativaId']);
                this.resetCommissionDynamicCatalogs();
                if (value && this.presenter.requiresMunicipalityForInstitution(this.state.draftFilters().comisionTipoInstitucionId)) {
                    this.loadCommissionMunicipalities(value);
                } else if (value) {
                    this.loadCommissionInstitutions();
                }
                break;
            case 'comisionMunicipioId':
                this.clearDependentValues(['comisionInstitucionId', 'comisionOrganoAdministrativoDesconcentradoId', 'comisionUnidadAdministrativaId']);
                this.state.commissionInstitutionOptions.set([]);
                this.state.commissionDecentralizedBodyOptions.set([]);
                this.state.commissionAdministrativeUnitOptions.set([]);
                if (value) this.loadCommissionInstitutions();
                break;
            case 'comisionInstitucionId':
                this.clearDependentValues(['comisionOrganoAdministrativoDesconcentradoId', 'comisionUnidadAdministrativaId']);
                this.state.commissionDecentralizedBodyOptions.set([]);
                this.state.commissionAdministrativeUnitOptions.set([]);
                if (value) {
                    this.loadCommissionDecentralizedBodies(value);
                    this.loadCommissionAdministrativeUnits();
                }
                break;
            case 'comisionOrganoAdministrativoDesconcentradoId':
                this.clearDependentValues(['comisionUnidadAdministrativaId']);
                this.state.commissionAdministrativeUnitOptions.set([]);
                if (this.state.draftFilters().comisionInstitucionId) this.loadCommissionAdministrativeUnits();
                break;
        }
    }

    loadMunicipalities(entityId: string): void {
        const estadoId = this.toOptionalPositiveNumber(entityId);
        if (!estadoId) {
            this.state.municipalityOptions.set([]);
            return;
        }
        this.catalogosFacade.obtenerMunicipiosOptions(estadoId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.state.municipalityOptions.set(options),
                error: () => {
                    this.state.municipalityOptions.set([]);
                    this.warn('No fue posible cargar los municipios de la entidad seleccionada.');
                },
            });
    }

    loadInstitutions(): void {
        const filters = this.state.draftFilters();
        const tipoInstitucionId = this.toOptionalPositiveNumber(filters.tipoInstitucionId);
        const estadoId = this.presenter.requiresEntityForInstitution(filters.tipoInstitucionId)
            ? this.toOptionalPositiveNumber(filters.entidadId) : undefined;
        const padreId = this.presenter.requiresMunicipalityForInstitution(filters.tipoInstitucionId)
            ? this.toOptionalPositiveNumber(filters.municipioId) : undefined;
        if (!tipoInstitucionId || !this.presenter.canSelectInstitution(filters)) {
            this.state.institutionOptions.set([]);
            return;
        }
        this.catalogosFacade.obtenerEstructuraOrgOptions({ tipoInstitucionId, estadoId, padreId, soloActivos: 1 })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.state.institutionOptions.set(options),
                error: () => {
                    this.state.institutionOptions.set([]);
                    this.warn('No fue posible cargar las instituciones relacionadas.');
                },
            });
    }

    loadDecentralizedBodies(institutionId: string): void {
        const filters = this.state.draftFilters();
        const padreId = this.toOptionalPositiveNumber(institutionId);
        if (!padreId) {
            this.state.decentralizedBodyOptions.set([]);
            return;
        }
        const request$ = this.presenter.isFederalInstitutionType(filters.tipoInstitucionId)
            ? this.catalogosFacade.obtenerEstructuraOrganizacionalOptions({ tipoEstructuraId: TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO, padreId, soloActivos: 1 })
            : this.catalogosFacade.obtenerEstructuraOrgOptions({
                tipoInstitucionId: this.toOptionalPositiveNumber(filters.tipoInstitucionId),
                estadoId: this.toOptionalPositiveNumber(filters.entidadId),
                padreId,
                soloActivos: 1,
            });
        request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (options) => this.state.decentralizedBodyOptions.set(options),
            error: () => {
                this.state.decentralizedBodyOptions.set([]);
                this.warn('No fue posible cargar los órganos administrativos desconcentrados.');
            },
        });
    }

    loadAdministrativeUnits(): void {
        const filters = this.state.draftFilters();
        const padreId = this.toOptionalPositiveNumber(filters.organoAdministrativoDesconcentradoId || filters.institucionId);
        if (!padreId) {
            this.state.administrativeUnitOptions.set([]);
            return;
        }
        const request$ = this.presenter.isFederalInstitutionType(filters.tipoInstitucionId)
            ? this.catalogosFacade.obtenerEstructuraOrganizacionalOptions({ tipoEstructuraId: TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA, padreId, soloActivos: 1 })
            : this.catalogosFacade.obtenerEstructuraOrgOptions({
                tipoInstitucionId: this.toOptionalPositiveNumber(filters.tipoInstitucionId),
                estadoId: this.toOptionalPositiveNumber(filters.entidadId),
                padreId,
                soloActivos: 1,
            });
        request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (options) => this.state.administrativeUnitOptions.set(options),
            error: () => {
                this.state.administrativeUnitOptions.set([]);
                this.warn('No fue posible cargar las unidades administrativas.');
            },
        });
    }

    loadCommissionMunicipalities(entityId: string): void {
        const estadoId = this.toOptionalPositiveNumber(entityId);
        if (!estadoId) {
            this.state.commissionMunicipalityOptions.set([]);
            return;
        }
        this.catalogosFacade.obtenerMunicipiosOptions(estadoId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.state.commissionMunicipalityOptions.set(options),
                error: () => {
                    this.state.commissionMunicipalityOptions.set([]);
                    this.warn('No fue posible cargar los municipios de la comisión.');
                },
            });
    }

    loadCommissionInstitutions(): void {
        const filters = this.state.draftFilters();
        const tipoInstitucionId = this.toOptionalPositiveNumber(filters.comisionTipoInstitucionId);
        const estadoId = this.presenter.requiresEntityForInstitution(filters.comisionTipoInstitucionId)
            ? this.toOptionalPositiveNumber(filters.comisionEntidadId) : undefined;
        const padreId = this.presenter.requiresMunicipalityForInstitution(filters.comisionTipoInstitucionId)
            ? this.toOptionalPositiveNumber(filters.comisionMunicipioId) : undefined;
        if (!tipoInstitucionId || !this.presenter.canSelectCommissionInstitution(filters)) {
            this.state.commissionInstitutionOptions.set([]);
            return;
        }
        this.catalogosFacade.obtenerEstructuraOrgOptions({ tipoInstitucionId, estadoId, padreId, soloActivos: 1 })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.state.commissionInstitutionOptions.set(options),
                error: () => {
                    this.state.commissionInstitutionOptions.set([]);
                    this.warn('No fue posible cargar las instituciones de la comisión.');
                },
            });
    }

    loadCommissionDecentralizedBodies(institutionId: string): void {
        const filters = this.state.draftFilters();
        const padreId = this.toOptionalPositiveNumber(institutionId);
        if (!padreId) {
            this.state.commissionDecentralizedBodyOptions.set([]);
            return;
        }
        const request$ = this.presenter.isFederalInstitutionType(filters.comisionTipoInstitucionId)
            ? this.catalogosFacade.obtenerEstructuraOrganizacionalOptions({ tipoEstructuraId: TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO, padreId, soloActivos: 1 })
            : this.catalogosFacade.obtenerEstructuraOrgOptions({
                tipoInstitucionId: this.toOptionalPositiveNumber(filters.comisionTipoInstitucionId),
                estadoId: this.toOptionalPositiveNumber(filters.comisionEntidadId),
                padreId,
                soloActivos: 1,
            });
        request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (options) => this.state.commissionDecentralizedBodyOptions.set(options),
            error: () => {
                this.state.commissionDecentralizedBodyOptions.set([]);
                this.warn('No fue posible cargar los órganos de la comisión.');
            },
        });
    }

    loadCommissionAdministrativeUnits(): void {
        const filters = this.state.draftFilters();
        const padreId = this.toOptionalPositiveNumber(
            filters.comisionOrganoAdministrativoDesconcentradoId || filters.comisionInstitucionId,
        );
        if (!padreId) {
            this.state.commissionAdministrativeUnitOptions.set([]);
            return;
        }
        const request$ = this.presenter.isFederalInstitutionType(filters.comisionTipoInstitucionId)
            ? this.catalogosFacade.obtenerEstructuraOrganizacionalOptions({ tipoEstructuraId: TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA, padreId, soloActivos: 1 })
            : this.catalogosFacade.obtenerEstructuraOrgOptions({
                tipoInstitucionId: this.toOptionalPositiveNumber(filters.comisionTipoInstitucionId),
                estadoId: this.toOptionalPositiveNumber(filters.comisionEntidadId),
                padreId,
                soloActivos: 1,
            });
        request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (options) => this.state.commissionAdministrativeUnitOptions.set(options),
            error: () => {
                this.state.commissionAdministrativeUnitOptions.set([]);
                this.warn('No fue posible cargar las unidades administrativas de la comisión.');
            },
        });
    }

    clearDependentValues(keys: readonly UserFilterKey[]): void {
        this.state.draftFilters.update((filters) => {
            const next = { ...filters } as Record<UserFilterKey, string>;
            keys.forEach((key) => { next[key] = ''; });
            return next as unknown as UserFilterValues;
        });
        this.state.draftCatalogLabels.update((labels) => {
            const next = { ...labels };
            keys.forEach((key) => delete next[key]);
            return next;
        });
    }

    resetDynamicCatalogs(): void {
        this.resetAssignmentDynamicCatalogs();
        this.resetCommissionDynamicCatalogs();
    }

    resetCommissionDynamicCatalogs(): void {
        this.state.commissionMunicipalityOptions.set([]);
        this.state.commissionInstitutionOptions.set([]);
        this.state.commissionDecentralizedBodyOptions.set([]);
        this.state.commissionAdministrativeUnitOptions.set([]);
    }

    syncDraftCatalogLabels(filters: UserFilterValues): void {
        const labels: Partial<Record<UserFilterKey, string>> = {};
        this.presenter.filterDefinitions().forEach((definition) => {
            if (definition.kind !== 'catalog' || !filters[definition.key]) return;
            labels[definition.key] = definition.options.find(
                (option) => option.value === filters[definition.key],
            )?.label ?? '';
        });
        this.state.draftCatalogLabels.set(labels);
    }

    private resetAssignmentDynamicCatalogs(): void {
        this.state.municipalityOptions.set([]);
        this.state.institutionOptions.set([]);
        this.state.decentralizedBodyOptions.set([]);
        this.state.administrativeUnitOptions.set([]);
    }

    private warn(message: string): void {
        this.state.filterCatalogMessage.set(message);
    }

    private toOptionalPositiveNumber(value: unknown): number | undefined {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : undefined;
    }
}
