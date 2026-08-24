import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, forkJoin, of, timeout } from 'rxjs';
import { AuthStorage } from '../../../../../core/auth/data-access/auth.storage';
import { CatalogoOption, CatalogosFacade } from '../../../../../core/catalogos';
import { SiauModal } from '../../../../../shared/ui';
import {
    CONTACT_EMAIL_MAX_LENGTH,
    RESTRICTED_TEXT_LIMITS,
    getContactEmailError,
    getRestrictedTextError,
    sanitizeRestrictedText,
} from '../../../../../shared/validation/field-validators';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UsersFacade } from '../../../application/users.facade';
import {
    SolicitudOperacionRequest,
    SolicitudOperacionResponse,
    BorradorItem,
    UserDetailRecord,
    UserPagination,
    UserRecord,
    UsersQuery,
} from '../../../domain/models/user-record.model';
import { UserRegistrationWizard } from '../../components/user-registration-wizard/user-registration-wizard';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'dark' | 'light';
type UserWizardMode = 'create' | 'edit';
type AccountOperationKind = 'baja' | 'suspension' | 'reactivacion' | 'desbloqueo';
type UserFilterKey =
    | 'primerApellido'
    | 'segundoApellido'
    | 'nombres'
    | 'curp'
    | 'rfc'
    | 'correo'
    | 'numeroTelefonico'
    | 'tipoInstitucionId'
    | 'entidadId'
    | 'municipioId'
    | 'institucionId'
    | 'organoAdministrativoDesconcentradoId'
    | 'unidadAdministrativaId'
    | 'comisionTipoInstitucionId'
    | 'comisionEntidadId'
    | 'comisionMunicipioId'
    | 'comisionInstitucionId'
    | 'comisionOrganoAdministrativoDesconcentradoId'
    | 'comisionUnidadAdministrativaId'
    | 'nombreUsuario'
    | 'estadoCuentaId'
    | 'fechaInicio'
    | 'fechaFin';
type UserFilterGroupKey = 'general' | 'adscription' | 'commission' | 'account';
type UserFilterTabKey = 'all' | UserFilterGroupKey;
type UserFilterKind = 'text' | 'catalog' | 'date';

interface UserFilterValues {
    readonly primerApellido: string;
    readonly segundoApellido: string;
    readonly nombres: string;
    readonly curp: string;
    readonly rfc: string;
    readonly correo: string;
    readonly numeroTelefonico: string;
    readonly tipoInstitucionId: string;
    readonly entidadId: string;
    readonly municipioId: string;
    readonly institucionId: string;
    readonly organoAdministrativoDesconcentradoId: string;
    readonly unidadAdministrativaId: string;
    readonly comisionTipoInstitucionId: string;
    readonly comisionEntidadId: string;
    readonly comisionMunicipioId: string;
    readonly comisionInstitucionId: string;
    readonly comisionOrganoAdministrativoDesconcentradoId: string;
    readonly comisionUnidadAdministrativaId: string;
    readonly nombreUsuario: string;
    readonly estadoCuentaId: string;
    readonly fechaInicio: string;
    readonly fechaFin: string;
}

interface UserFilterDefinition {
    readonly key: UserFilterKey;
    readonly label: string;
    readonly placeholder: string;
    readonly group: UserFilterGroupKey;
    readonly kind: UserFilterKind;
    readonly options: readonly CatalogoOption[];
    readonly maxLength?: number;
    readonly inputMode?: 'text' | 'email' | 'numeric';
}

interface UserFilterTab {
    readonly id: UserFilterTabKey;
    readonly label: string;
}

interface UserFilterChip {
    readonly key: UserFilterKey;
    readonly label: string;
    readonly value: string;
}

interface AccountOperationSuccessState {
    readonly operation: AccountOperationKind;
    readonly title: string;
    readonly heading: string;
    readonly message: string;
    readonly icon: string;
    readonly badge: string;
    readonly newStatus: string;
    readonly fullName: string;
    readonly username: string;
    readonly email: string;
    readonly userId: number;
}

/** Elemento del paginador: un número de página o un separador "…". */
interface PaginationItem {
    readonly key: string;
    readonly page: number;
    readonly isGap: boolean;
}

/** Páginas visibles a cada lado de la actual antes de cortar con "…". */
const PAGINATION_SIBLINGS = 1;

const DEFAULT_PAGINATION: UserPagination = {
    totalRegistros: 0,
    totalPaginas: 1,
    paginaActual: 1,
    porPagina: 15,
};

const EMPTY_USER_FILTERS: UserFilterValues = {
    primerApellido: '',
    segundoApellido: '',
    nombres: '',
    curp: '',
    rfc: '',
    correo: '',
    numeroTelefonico: '',
    tipoInstitucionId: '',
    entidadId: '',
    municipioId: '',
    institucionId: '',
    organoAdministrativoDesconcentradoId: '',
    unidadAdministrativaId: '',
    comisionTipoInstitucionId: '',
    comisionEntidadId: '',
    comisionMunicipioId: '',
    comisionInstitucionId: '',
    comisionOrganoAdministrativoDesconcentradoId: '',
    comisionUnidadAdministrativaId: '',
    nombreUsuario: '',
    estadoCuentaId: '',
    fechaInicio: '',
    fechaFin: '',
};

const NAME_FILTER_KEYS: readonly UserFilterKey[] = [
    'primerApellido',
    'segundoApellido',
    'nombres',
];
const DATE_FILTER_KEYS: readonly UserFilterKey[] = ['fechaInicio', 'fechaFin'];
const TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO = 2;
const TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA = 4;

@Component({
    selector: 'app-user-management-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, SiauLucideIcon, SiauModal, UserRegistrationWizard],
    templateUrl: './user-management-page.html',
    styleUrl: './user-management-page.scss',
})
export class UserManagementPage {
    private readonly usersFacade = inject(UsersFacade);
    private readonly authStorage = inject(AuthStorage);
    private readonly catalogosFacade = inject(CatalogosFacade);
    private readonly destroyRef = inject(DestroyRef);
    private detailRequestSequence = 0;

    protected readonly isFilterPanelOpen = signal<boolean>(false);
    protected readonly filterCatalogSearch = signal<string>('');
    protected readonly selectedFilterTab = signal<UserFilterTabKey>('all');
    protected readonly draftFilterKeys = signal<readonly UserFilterKey[]>([]);
    protected readonly draftFilters = signal<UserFilterValues>({ ...EMPTY_USER_FILTERS });
    protected readonly appliedFilters = signal<UserFilterValues>({ ...EMPTY_USER_FILTERS });
    protected readonly draftCatalogLabels = signal<Partial<Record<UserFilterKey, string>>>({});
    protected readonly institutionTypeOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly stateOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly municipalityOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly institutionOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly decentralizedBodyOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly administrativeUnitOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly commissionMunicipalityOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly commissionInstitutionOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly commissionDecentralizedBodyOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly commissionAdministrativeUnitOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly accountStatusOptions = signal<readonly CatalogoOption[]>([]);
    protected readonly isFilterCatalogLoading = signal<boolean>(true);
    protected readonly filterCatalogMessage = signal<string | null>(null);
    protected readonly todayDate = this.toDateInputValue(new Date());
    protected readonly users = signal<readonly UserRecord[]>([]);
    protected readonly pagination = signal<UserPagination>(DEFAULT_PAGINATION);

    /**
     * Página que el front pidió. Es la fuente de verdad del pie de tabla: si se
     * dependiera de `pagination().paginaActual`, cualquier respuesta que no
     * refleje la página solicitada deja el contador congelado en 1.
     */
    protected readonly currentPage = signal<number>(1);
    protected readonly isLoading = signal<boolean>(false);
    protected readonly errorMessage = signal<string | null>(null);
    protected readonly informationMessage = signal<string | null>(null);

    protected readonly isUserWizardOpen = signal<boolean>(false);
    protected readonly userWizardMode = signal<UserWizardMode>('create');

    /** Menú desplegable del botón "Nuevo Usuario". */
    protected readonly isNewUserMenuOpen = signal<boolean>(false);
    protected readonly isDraftsModalOpen = signal<boolean>(false);
    protected readonly drafts = signal<readonly BorradorItem[]>([]);
    protected readonly isDraftsLoading = signal<boolean>(false);
    protected readonly draftsError = signal<string | null>(null);

    /**
     * Borrador que se abrirá en el asistente. Cuando es `null` y
     * `autoRestoreDraft` está apagado, el asistente arranca en blanco.
     */
    protected readonly draftToOpen = signal<BorradorItem | null>(null);
    protected readonly autoRestoreDraft = signal<boolean>(false);
    protected readonly selectedUser = signal<UserRecord | null>(null);
    protected readonly selectedUserDetail = signal<UserDetailRecord | null>(null);
    protected readonly isDetailLoading = signal<boolean>(false);

    protected readonly isBajaModalOpen = signal<boolean>(false);
    protected readonly bajaTargetUser = signal<UserRecord | null>(null);
    protected readonly bajaComment = signal<string>('');
    protected readonly bajaCommentError = signal<string | null>(null);
    protected readonly isBajaSubmitting = signal<boolean>(false);

    protected readonly isStatusModalOpen = signal<boolean>(false);
    protected readonly statusTargetUser = signal<UserRecord | null>(null);
    protected readonly statusComment = signal<string>('');
    protected readonly statusCommentError = signal<string | null>(null);
    protected readonly isStatusSubmitting = signal<boolean>(false);

    protected readonly operationSuccess = signal<AccountOperationSuccessState | null>(null);

    protected readonly isAdminUser = computed(() => {
        const sessionUser = this.authStorage.session()?.user;
        const role = this.normalizeForCompare(sessionUser?.role ?? '');
        const profiles = sessionUser?.profiles ?? [];

        return role.includes('admin')
            || profiles.some((profile) => this.normalizeForCompare(profile).includes('admin'));
    });

    protected readonly filteredUsers = computed(() => this.users());
    protected readonly filterTabs: readonly UserFilterTab[] = [
        { id: 'all', label: 'Todos' },
        { id: 'general', label: 'Información general' },
        { id: 'adscription', label: 'Adscripción' },
        { id: 'commission', label: 'Comisión' },
        { id: 'account', label: 'Cuenta y acceso' },
    ];
    protected readonly filterDefinitions = computed<readonly UserFilterDefinition[]>(() => [
        {
            key: 'primerApellido',
            label: 'Primer apellido',
            placeholder: 'Captura el primer apellido',
            group: 'general',
            kind: 'text',
            options: [],
            maxLength: 100,
            inputMode: 'text',
        },
        {
            key: 'segundoApellido',
            label: 'Segundo apellido',
            placeholder: 'Captura el segundo apellido',
            group: 'general',
            kind: 'text',
            options: [],
            maxLength: 100,
            inputMode: 'text',
        },
        {
            key: 'nombres',
            label: 'Nombre(s)',
            placeholder: 'Captura el nombre o nombres',
            group: 'general',
            kind: 'text',
            options: [],
            maxLength: 100,
            inputMode: 'text',
        },
        {
            key: 'curp',
            label: 'CURP',
            placeholder: '18 caracteres',
            group: 'general',
            kind: 'text',
            options: [],
            maxLength: 18,
            inputMode: 'text',
        },
        {
            key: 'rfc',
            label: 'RFC',
            placeholder: '13 caracteres',
            group: 'general',
            kind: 'text',
            options: [],
            maxLength: 13,
            inputMode: 'text',
        },
        {
            key: 'correo',
            label: 'Correo electrónico',
            placeholder: 'usuario@dominio.com',
            group: 'general',
            kind: 'text',
            options: [],
            maxLength: CONTACT_EMAIL_MAX_LENGTH,
            inputMode: 'email',
        },
        {
            key: 'numeroTelefonico',
            label: 'Número telefónico',
            placeholder: '10 dígitos',
            group: 'general',
            kind: 'text',
            options: [],
            maxLength: 10,
            inputMode: 'numeric',
        },
        {
            key: 'tipoInstitucionId',
            label: 'Tipo de institución',
            placeholder: 'Escribe para buscar y selecciona',
            group: 'adscription',
            kind: 'catalog',
            options: this.institutionTypeOptions(),
        },
        {
            key: 'entidadId',
            label: 'Entidad',
            placeholder: 'Escribe para buscar y selecciona',
            group: 'adscription',
            kind: 'catalog',
            options: this.stateOptions(),
        },
        {
            key: 'municipioId',
            label: 'Municipio/Alcaldía',
            placeholder: 'Escribe para buscar y selecciona',
            group: 'adscription',
            kind: 'catalog',
            options: this.municipalityOptions(),
        },
        {
            key: 'institucionId',
            label: 'Institución',
            placeholder: 'Escribe para buscar y selecciona',
            group: 'adscription',
            kind: 'catalog',
            options: this.institutionOptions(),
        },
        {
            key: 'organoAdministrativoDesconcentradoId',
            label: 'Órgano Administrativo Desconcentrado',
            placeholder: 'Escribe para buscar y selecciona',
            group: 'adscription',
            kind: 'catalog',
            options: this.decentralizedBodyOptions(),
        },
        {
            key: 'unidadAdministrativaId',
            label: 'Unidad Administrativa',
            placeholder: 'Escribe para buscar y selecciona',
            group: 'adscription',
            kind: 'catalog',
            options: this.administrativeUnitOptions(),
        },
        {
            key: 'nombreUsuario',
            label: 'Nombre de usuario',
            placeholder: '14 caracteres',
            group: 'account',
            kind: 'text',
            options: [],
            maxLength: 14,
            inputMode: 'text',
        },
        {
            key: 'estadoCuentaId',
            label: 'Estatus',
            placeholder: 'Escribe para buscar y selecciona',
            group: 'account',
            kind: 'catalog',
            options: this.accountStatusOptions(),
        },
        {
            key: 'fechaInicio',
            label: 'Fecha de inicio del último movimiento',
            placeholder: 'dd/mm/aaaa',
            group: 'account',
            kind: 'date',
            options: [],
        },
        {
            key: 'fechaFin',
            label: 'Fecha de fin del último movimiento',
            placeholder: 'dd/mm/aaaa',
            group: 'account',
            kind: 'date',
            options: [],
        },
    ]);
    protected readonly visibleFilterDefinitions = computed<readonly UserFilterDefinition[]>(() => {
        const search = this.normalizeForCompare(this.filterCatalogSearch());
        const selectedTab = this.selectedFilterTab();

        return this.filterDefinitions().filter((filter) => {
            const matchesTab = selectedTab === 'all' || filter.group === selectedTab;
            const matchesSearch = !search || this.normalizeForCompare(filter.label).includes(search);
            return matchesTab && matchesSearch;
        });
    });
    protected readonly selectableFilterDefinitions = computed<readonly UserFilterDefinition[]>(() =>
        this.filterDefinitions().filter((filter) => !this.isFilterCheckboxDisabled(filter)),
    );
    protected readonly selectedFilterDefinitions = computed<readonly UserFilterDefinition[]>(() => {
        const selectedKeys = this.draftFilterKeys();
        return this.filterDefinitions().filter((filter) => selectedKeys.includes(filter.key));
    });
    protected readonly availableFilterDefinitions = computed<readonly UserFilterDefinition[]>(() => {
        const selectedKeys = this.draftFilterKeys();
        return this.filterDefinitions().filter((filter) => !selectedKeys.includes(filter.key));
    });
    protected readonly effectiveDraftFilters = computed<UserFilterValues>(() => {
        const draft = this.draftFilters();
        const effective = { ...EMPTY_USER_FILTERS } as Record<UserFilterKey, string>;

        (Object.keys(EMPTY_USER_FILTERS) as UserFilterKey[]).forEach((key) => {
            effective[key] = String(draft[key] ?? '').trim();
        });

        return effective as unknown as UserFilterValues;
    });
    protected readonly draftFilterErrors = computed<Partial<Record<UserFilterKey, string>>>(() => {
        const errors: Partial<Record<UserFilterKey, string>> = {};
        const filters = this.draftFilters();

        (Object.keys(filters) as UserFilterKey[]).forEach((key) => {
            if (!filters[key]) {
                return;
            }

            const error = this.validateFilterValue(key, filters[key]);
            if (error) {
                errors[key] = error;
            }
        });

        const start = filters.fechaInicio;
        const end = filters.fechaFin;
        if (start && end && start > end) {
            errors.fechaInicio = 'La fecha de inicio no puede ser posterior a la fecha de fin.';
            errors.fechaFin = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
        }

        return errors;
    });
    protected readonly filterFormError = computed<string | null>(() => {
        const filters = this.draftFilters();
        const hasStart = Boolean(filters.fechaInicio);
        const hasEnd = Boolean(filters.fechaFin);

        if (hasStart !== hasEnd) {
            return 'El período de último movimiento requiere fecha de inicio y fecha de fin.';
        }

        // MVC10 VC01-VC03: si se usa Nombre(s), Primer apellido o Segundo
        // apellido como criterio de búsqueda, deben capturarse al menos dos
        // de los tres campos que integran el nombre.
        const capturedNameCriteria = [
            filters.primerApellido,
            filters.segundoApellido,
            filters.nombres,
        ].filter((value) => Boolean(String(value ?? '').trim())).length;

        if (capturedNameCriteria === 1) {
            return 'Para buscar por nombre debes capturar al menos dos campos entre Nombre(s), Primer apellido y Segundo apellido.';
        }

        return null;
    });
    protected readonly activeFilterCount = computed(() =>
        Object.values(this.appliedFilters()).filter((value) => Boolean(value)).length,
    );
    protected readonly selectedDraftFilterCount = computed(() => this.draftFilterKeys().length);
    protected readonly allDraftFiltersSelected = computed(() => {
        const selectableFilters = this.selectableFilterDefinitions();
        return Boolean(selectableFilters.length)
            && selectableFilters.every((filter) => this.isDraftFilterSelected(filter.key));
    });
    protected readonly someDraftFiltersSelected = computed(() =>
        this.selectedDraftFilterCount() > 0 && !this.allDraftFiltersSelected(),
    );
    protected readonly hasIncompleteDraftFilters = computed(() =>
        Boolean(this.filterFormError()) || Object.keys(this.draftFilterErrors()).length > 0,
    );
    protected readonly hasPendingFilterChanges = computed(() =>
        JSON.stringify(this.effectiveDraftFilters()) !== JSON.stringify(this.appliedFilters()),
    );
    protected readonly activeFilterChips = computed<readonly UserFilterChip[]>(() => {
        const filters = this.appliedFilters();

        return this.filterDefinitions().reduce<UserFilterChip[]>((chips, definition) => {
            const value = filters[definition.key];
            if (!value) {
                return chips;
            }

            const displayValue = definition.kind === 'catalog'
                ? definition.options.find((option) => option.value === value)?.label ?? value
                : definition.kind === 'date'
                    ? this.formatDateForDisplay(value)
                    : value;

            chips.push({
                key: definition.key,
                label: definition.label,
                value: displayValue,
            });
            return chips;
        }, []);
    });
    protected readonly shownUsersCount = computed(() => {
        const pagination = this.pagination();
        const totalRecords = Math.max(0, pagination.totalRegistros);
        const pageSize = Math.max(0, pagination.porPagina);
        const previousPagesCount = Math.max(0, this.currentPage() - 1) * pageSize;

        return Math.min(totalRecords, previousPagesCount + this.filteredUsers().length);
    });
    protected readonly canGoPrevious = computed(() => this.currentPage() > 1);
    protected readonly canGoNext = computed(() => this.currentPage() < this.pagination().totalPaginas);

    /**
     * Botones numerados del paginador. La primera y la última página siempre
     * son visibles; el resto se recorta con separadores "…" alrededor de la
     * actual, para que 1000 páginas no dibujen 1000 botones.
     *
     *   1 … 499 [500] 501 … 1000
     */
    protected readonly pageItems = computed<readonly PaginationItem[]>(() => {
        const totalPages = Math.max(1, this.pagination().totalPaginas);
        const current = Math.min(Math.max(1, this.currentPage()), totalPages);

        // primera + última + actual + hermanos + los dos separadores
        const maxSlots = PAGINATION_SIBLINGS * 2 + 5;

        if (totalPages <= maxSlots) {
            return this.toPaginationItems(this.pageRange(1, totalPages));
        }

        const leftSibling = Math.max(current - PAGINATION_SIBLINGS, 1);
        const rightSibling = Math.min(current + PAGINATION_SIBLINGS, totalPages);
        const showLeftGap = leftSibling > 2;
        const showRightGap = rightSibling < totalPages - 1;
        const edgeCount = PAGINATION_SIBLINGS * 2 + 3;

        if (!showLeftGap && showRightGap) {
            return this.toPaginationItems([
                ...this.pageRange(1, edgeCount),
                0,
                totalPages,
            ]);
        }

        if (showLeftGap && !showRightGap) {
            return this.toPaginationItems([
                1,
                0,
                ...this.pageRange(totalPages - edgeCount + 1, totalPages),
            ]);
        }

        return this.toPaginationItems([
            1,
            0,
            ...this.pageRange(leftSibling, rightSibling),
            0,
            totalPages,
        ]);
    });

    constructor() {
        if (this.isAdminUser()) {
            this.loadFilterCatalogs();
        } else {
            this.isFilterCatalogLoading.set(false);
        }

        this.loadUsers();
    }

    @HostListener('document:keydown.escape')
    protected handleEscapeKey(): void {
        if (this.isNewUserMenuOpen()) {
            this.closeNewUserMenu();
        }

        if (this.isFilterPanelOpen()) {
            this.closeFilterPanel();
        }
    }

    protected toggleFilterPanel(): void {
        if (!this.isAdminUser()) {
            return;
        }

        if (this.isFilterPanelOpen()) {
            this.closeFilterPanel();
            return;
        }

        const appliedFilters = this.appliedFilters();
        this.draftFilters.set({ ...appliedFilters });
        this.draftFilterKeys.set(this.getActiveFilterKeys(appliedFilters));
        this.syncDraftCatalogLabels(appliedFilters);
        this.filterCatalogSearch.set('');
        this.selectedFilterTab.set('all');
        this.isFilterPanelOpen.set(true);
    }

    protected closeFilterPanel(): void {
        const appliedFilters = this.appliedFilters();
        this.draftFilters.set({ ...appliedFilters });
        this.draftFilterKeys.set(this.getActiveFilterKeys(appliedFilters));
        this.syncDraftCatalogLabels(appliedFilters);
        this.filterCatalogSearch.set('');
        this.selectedFilterTab.set('all');
        this.isFilterPanelOpen.set(false);
    }

    protected updateFilterCatalogSearch(value: string): void {
        this.filterCatalogSearch.set(String(value ?? ''));
    }

    protected selectFilterTab(tab: UserFilterTabKey): void {
        this.selectedFilterTab.set(tab);
    }

    protected getFilterGroupLabel(group: UserFilterGroupKey): string {
        switch (group) {
            case 'general':
                return 'Datos personales';
            case 'adscription':
                return 'Adscripción';
            case 'commission':
                return 'Comisión';
            case 'account':
                return 'Cuenta y acceso';
            default:
                return 'Otros';
        }
    }

    protected addDraftFilterFromPicker(event: Event): void {
        const select = event.target as HTMLSelectElement | null;
        const key = String(select?.value ?? '').trim() as UserFilterKey;

        if (select) {
            select.value = '';
        }

        if (!key) {
            return;
        }
        this.addDraftFilter(key);
    }

    protected addDraftFilter(key: UserFilterKey): void {
        const definition = this.filterDefinitions().find((filter) => filter.key === key);
        if (!definition || this.isFilterCheckboxDisabled(definition)) {
            return;
        }

        // Si el usuario agrega un filtro dependiente, mostramos también los
        // padres necesarios para que pueda completar la jerarquía de arriba
        // hacia abajo, en lugar de dejarle un campo bloqueado sin contexto.
        this.addHierarchyParentFilters(key);
        this.setDraftFilterSelected(key, true);
        this.ensureHierarchyParentsForCurrentInstitutionType(key);
    }

    private addHierarchyParentFilters(key: UserFilterKey): void {
        const parentsByKey: Partial<Record<UserFilterKey, readonly UserFilterKey[]>> = {
            // Adscripción
            entidadId: ['tipoInstitucionId'],
            municipioId: ['tipoInstitucionId', 'entidadId'],
            institucionId: ['tipoInstitucionId'],
            organoAdministrativoDesconcentradoId: ['tipoInstitucionId', 'institucionId'],
            unidadAdministrativaId: ['tipoInstitucionId', 'institucionId'],

            // Comisión
            comisionEntidadId: ['comisionTipoInstitucionId'],
            comisionMunicipioId: ['comisionTipoInstitucionId', 'comisionEntidadId'],
            comisionInstitucionId: ['comisionTipoInstitucionId'],
            comisionOrganoAdministrativoDesconcentradoId: [
                'comisionTipoInstitucionId',
                'comisionInstitucionId',
            ],
            comisionUnidadAdministrativaId: [
                'comisionTipoInstitucionId',
                'comisionInstitucionId',
            ],
        };

        const parents = parentsByKey[key] ?? [];
        parents.forEach((parentKey) => this.setDraftFilterSelected(parentKey, true));
    }

    private ensureHierarchyParentsForCurrentInstitutionType(changedKey: UserFilterKey): void {
        const selectedKeys = this.draftFilterKeys();
        const filters = this.draftFilters();

        const adscriptionKeys: readonly UserFilterKey[] = [
            'entidadId',
            'municipioId',
            'institucionId',
            'organoAdministrativoDesconcentradoId',
            'unidadAdministrativaId',
        ];
        const commissionKeys: readonly UserFilterKey[] = [
            'comisionEntidadId',
            'comisionMunicipioId',
            'comisionInstitucionId',
            'comisionOrganoAdministrativoDesconcentradoId',
            'comisionUnidadAdministrativaId',
        ];

        const isAdscriptionChange = changedKey === 'tipoInstitucionId'
            || adscriptionKeys.includes(changedKey);
        const isCommissionChange = changedKey === 'comisionTipoInstitucionId'
            || commissionKeys.includes(changedKey);

        if (isAdscriptionChange && adscriptionKeys.some((key) => selectedKeys.includes(key))) {
            this.setDraftFilterSelected('tipoInstitucionId', true);

            if (filters.tipoInstitucionId && this.requiresEntityForInstitution(filters.tipoInstitucionId)) {
                this.setDraftFilterSelected('entidadId', true);
            }
            if (filters.tipoInstitucionId && this.requiresMunicipalityForInstitution(filters.tipoInstitucionId)) {
                this.setDraftFilterSelected('municipioId', true);
            }
        }

        if (isCommissionChange && commissionKeys.some((key) => selectedKeys.includes(key))) {
            this.setDraftFilterSelected('comisionTipoInstitucionId', true);

            if (
                filters.comisionTipoInstitucionId
                && this.requiresEntityForInstitution(filters.comisionTipoInstitucionId)
            ) {
                this.setDraftFilterSelected('comisionEntidadId', true);
            }
            if (
                filters.comisionTipoInstitucionId
                && this.requiresMunicipalityForInstitution(filters.comisionTipoInstitucionId)
            ) {
                this.setDraftFilterSelected('comisionMunicipioId', true);
            }
        }
    }

    protected removeDraftFilter(key: UserFilterKey): void {
        const keysToRemove = DATE_FILTER_KEYS.includes(key) ? DATE_FILTER_KEYS : [key];
        const definition = this.filterDefinitions().find((filter) => filter.key === key);

        this.draftFilters.update((filters) => {
            const next = { ...filters } as Record<UserFilterKey, string>;
            keysToRemove.forEach((candidate) => {
                next[candidate] = '';
            });
            return next as unknown as UserFilterValues;
        });

        this.draftCatalogLabels.update((labels) => {
            const next = { ...labels };
            keysToRemove.forEach((candidate) => delete next[candidate]);
            return next;
        });

        this.setDraftFilterSelected(key, false);

        if (definition?.kind === 'catalog') {
            this.handleHierarchyFilterChange(key, '');
        }
    }

    protected setDraftFilterSelected(key: UserFilterKey, selected: boolean): void {
        if (!selected) {
            const keysToRemove = DATE_FILTER_KEYS.includes(key) ? DATE_FILTER_KEYS : [key];
            this.draftFilterKeys.update((keys) =>
                keys.filter((selectedKey) => !keysToRemove.includes(selectedKey)),
            );
            return;
        }

        const definition = this.filterDefinitions().find((filter) => filter.key === key);
        if (!definition || this.isFilterCheckboxDisabled(definition)) {
            return;
        }

        const keysToAdd = DATE_FILTER_KEYS.includes(key) ? DATE_FILTER_KEYS : [key];
        this.draftFilterKeys.update((keys) => [
            ...keys,
            ...keysToAdd.filter((candidate) => !keys.includes(candidate)),
        ]);
    }

    protected setAllDraftFiltersSelected(selected: boolean): void {
        this.draftFilterKeys.set(
            selected
                ? this.selectableFilterDefinitions().map((filter) => filter.key)
                : [],
        );
    }

    protected isDraftFilterSelected(key: UserFilterKey): boolean {
        return this.draftFilterKeys().includes(key);
    }

    protected isFilterDefinitionDisabled(filter: UserFilterDefinition): boolean {
        if (filter.kind !== 'catalog') {
            return false;
        }

        if (this.isFilterCatalogLoading()) {
            return true;
        }

        const filters = this.draftFilters();
        switch (filter.key) {
            case 'entidadId':
                return !this.requiresEntityForInstitution(filters.tipoInstitucionId) || !filter.options.length;
            case 'municipioId':
                return !this.requiresMunicipalityForInstitution(filters.tipoInstitucionId)
                    || !filters.entidadId
                    || !filter.options.length;
            case 'institucionId':
                return !this.canSelectInstitution(filters) || !filter.options.length;
            case 'organoAdministrativoDesconcentradoId':
                return !filters.institucionId || !filter.options.length;
            case 'unidadAdministrativaId':
                return !filters.institucionId || !filter.options.length;
            case 'comisionEntidadId':
                return !this.requiresEntityForInstitution(filters.comisionTipoInstitucionId) || !filter.options.length;
            case 'comisionMunicipioId':
                return !this.requiresMunicipalityForInstitution(filters.comisionTipoInstitucionId)
                    || !filters.comisionEntidadId
                    || !filter.options.length;
            case 'comisionInstitucionId':
                return !this.canSelectCommissionInstitution(filters) || !filter.options.length;
            case 'comisionOrganoAdministrativoDesconcentradoId':
            case 'comisionUnidadAdministrativaId':
                return !filters.comisionInstitucionId || !filter.options.length;
            default:
                return !filter.options.length;
        }
    }

    protected isFilterCheckboxDisabled(filter: UserFilterDefinition): boolean {
        if (filter.kind !== 'catalog') {
            return false;
        }

        if (this.isFilterCatalogLoading()) {
            return true;
        }

        // Los filtros dependientes se pueden marcar desde el inicio; únicamente
        // su campo de valor permanece deshabilitado hasta completar la jerarquía.
        // Así, "Seleccionar todos" incluye también Entidad, Municipio,
        // Institución, OAD y Unidad Administrativa.
        if (
            filter.key === 'entidadId'
            || filter.key === 'municipioId'
            || filter.key === 'institucionId'
            || filter.key === 'organoAdministrativoDesconcentradoId'
            || filter.key === 'unidadAdministrativaId'
            || filter.key === 'comisionEntidadId'
            || filter.key === 'comisionMunicipioId'
            || filter.key === 'comisionInstitucionId'
            || filter.key === 'comisionOrganoAdministrativoDesconcentradoId'
            || filter.key === 'comisionUnidadAdministrativaId'
        ) {
            return false;
        }

        return !filter.options.length;
    }

    protected updateDraftFilter(key: UserFilterKey, value: string): void {
        let normalizedValue = String(value ?? '');
        if (
            NAME_FILTER_KEYS.includes(key)
            || key === 'curp'
            || key === 'rfc'
            || key === 'nombreUsuario'
        ) {
            normalizedValue = normalizedValue.toUpperCase();
        }

        this.draftFilters.update((filters) => ({
            ...filters,
            [key]: normalizedValue,
        }));
    }

    protected updateCatalogDraftFilter(filter: UserFilterDefinition, label: string): void {
        const normalizedLabel = String(label ?? '');
        const selectedOption = filter.options.find(
            (option) => this.normalizeForCompare(option.label) === this.normalizeForCompare(normalizedLabel),
        );
        const previousValue = this.draftFilters()[filter.key];
        const nextValue = selectedOption?.value ?? '';

        this.draftCatalogLabels.update((labels) => ({
            ...labels,
            [filter.key]: normalizedLabel,
        }));
        this.draftFilters.update((filters) => ({
            ...filters,
            [filter.key]: nextValue,
        }));

        if (previousValue !== nextValue) {
            this.handleHierarchyFilterChange(filter.key, nextValue);
            this.ensureHierarchyParentsForCurrentInstitutionType(filter.key);
        }
    }

    protected getDraftCatalogLabel(filter: UserFilterDefinition): string {
        const labels = this.draftCatalogLabels();
        if (labels[filter.key] !== undefined) {
            return labels[filter.key] ?? '';
        }

        const value = this.draftFilters()[filter.key];
        return filter.options.find((option) => option.value === value)?.label ?? '';
    }

    protected getFilterError(key: UserFilterKey): string | null {
        return this.draftFilterErrors()[key] ?? null;
    }

    protected getFilterPlaceholder(filter: UserFilterDefinition): string {
        if (!this.isFilterDefinitionDisabled(filter)) {
            return filter.placeholder;
        }

        switch (filter.key) {
            case 'entidadId':
                return 'Selecciona primero un tipo estatal o municipal';
            case 'municipioId':
                return 'Selecciona primero una entidad y tipo municipal';
            case 'institucionId':
                return 'Completa primero la ubicación requerida';
            case 'organoAdministrativoDesconcentradoId':
                return 'Selecciona primero una institución';
            case 'unidadAdministrativaId':
                return 'Selecciona primero una institución';
            case 'comisionEntidadId':
                return 'Selecciona primero un tipo estatal o municipal';
            case 'comisionMunicipioId':
                return 'Selecciona primero una entidad y tipo municipal';
            case 'comisionInstitucionId':
                return 'Completa primero la ubicación requerida de la comisión';
            case 'comisionOrganoAdministrativoDesconcentradoId':
            case 'comisionUnidadAdministrativaId':
                return 'Selecciona primero una institución de comisión';
            default:
                return 'Catálogo no disponible';
        }
    }

    protected clearDraftFilters(): void {
        this.draftFilterKeys.set([]);
        this.draftFilters.set({ ...EMPTY_USER_FILTERS });
        this.draftCatalogLabels.set({});
        this.resetDynamicCatalogs();
    }

    protected applyFilters(): void {
        if (this.hasIncompleteDraftFilters()) {
            return;
        }

        this.appliedFilters.set({ ...this.effectiveDraftFilters() });
        this.draftFilterKeys.set(this.getActiveFilterKeys(this.effectiveDraftFilters()));
        this.closeFilterPanel();
        this.loadUsers(1);
    }

    protected clearAllFilters(): void {
        this.draftFilterKeys.set([]);
        this.draftFilters.set({ ...EMPTY_USER_FILTERS });
        this.appliedFilters.set({ ...EMPTY_USER_FILTERS });
        this.draftCatalogLabels.set({});
        this.resetDynamicCatalogs();
        this.filterCatalogSearch.set('');
        this.selectedFilterTab.set('all');
        this.loadUsers(1);
    }

    protected removeAppliedFilter(key: UserFilterKey): void {
        const nextFilters = {
            ...this.appliedFilters(),
            [key]: '',
        } as Record<UserFilterKey, string>;

        if (DATE_FILTER_KEYS.includes(key)) {
            nextFilters.fechaInicio = '';
            nextFilters.fechaFin = '';
        }

        const typedNextFilters = nextFilters as unknown as UserFilterValues;
        this.appliedFilters.set(typedNextFilters);
        this.draftFilters.set({ ...typedNextFilters });
        this.draftFilterKeys.set(this.getActiveFilterKeys(typedNextFilters));
        this.syncDraftCatalogLabels(typedNextFilters);
        this.loadUsers(1);
    }

    protected reloadUsers(): void {
        this.loadUsers(this.currentPage());
    }

    protected previousPage(): void {
        if (!this.canGoPrevious()) {
            return;
        }

        this.loadUsers(this.currentPage() - 1);
    }

    protected nextPage(): void {
        if (!this.canGoNext()) {
            return;
        }

        this.loadUsers(this.currentPage() + 1);
    }

    private pageRange(start: number, end: number): readonly number[] {
        const length = Math.max(0, end - start + 1);

        return Array.from({ length }, (_, index) => start + index);
    }

    /** El 0 representa un separador; `key` mantiene estable el @for. */
    private toPaginationItems(pages: readonly number[]): readonly PaginationItem[] {
        return pages.map((page, index) => ({
            key: page > 0 ? `page-${page}` : `gap-${index}`,
            page,
            isGap: page <= 0,
        }));
    }

    protected goToPage(page: number): void {
        const totalPages = Math.max(1, this.pagination().totalPaginas);
        const target = Math.min(Math.max(1, page), totalPages);

        if (target === this.currentPage() || this.isLoading()) {
            return;
        }

        this.loadUsers(target);
    }

    protected toggleNewUserMenu(): void {
        this.isNewUserMenuOpen.update((isOpen) => !isOpen);
    }

    protected closeNewUserMenu(): void {
        this.isNewUserMenuOpen.set(false);
    }

    /** "Nueva solicitud": asistente en blanco y borrador nuevo (borradorId null). */
    protected startNewRegistration(): void {
        this.closeNewUserMenu();
        this.draftToOpen.set(null);
        this.autoRestoreDraft.set(false);
        this.openRegistration();
    }

    /** "Ver borradores": lista los borradores del usuario en sesión. */
    protected openDraftsModal(): void {
        this.closeNewUserMenu();
        this.isDraftsModalOpen.set(true);
        this.loadDrafts();
    }

    protected closeDraftsModal(): void {
        this.isDraftsModalOpen.set(false);
    }

    protected loadDrafts(): void {
        this.isDraftsLoading.set(true);
        this.draftsError.set(null);

        this.usersFacade
            .getRegistrationDrafts(this.currentSessionUserId())
            .pipe(
                timeout(15000),
                finalize(() => this.isDraftsLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
                next: (drafts) => this.drafts.set(drafts),
                error: (error: unknown) => {
                    this.drafts.set([]);
                    this.draftsError.set(this.toFriendlyError(error));
                },
            });
    }

    /** Abre el asistente posicionado en el borrador elegido. */
    protected openDraft(draft: BorradorItem): void {
        this.closeDraftsModal();
        this.draftToOpen.set(draft);
        this.autoRestoreDraft.set(false);
        this.openRegistration();
    }

    protected draftTitle(draft: BorradorItem): string {
        const personales = draft.datos?.datosPersonales;
        const nombre = [
            personales?.nombres,
            personales?.primerApellido,
            personales?.segundoApellido,
        ]
            .map((part) => (part ?? '').trim())
            .filter(Boolean)
            .join(' ');

        if (nombre) {
            return nombre;
        }

        const correo = draft.datos?.medioContacto?.correo?.trim();

        return correo || `Borrador ${draft.borradorId ?? 'sin folio'}`;
    }

    protected draftSubtitle(draft: BorradorItem): string {
        const estructura = draft.catalogos?.adscripcionEstructura;

        // Se muestra la ruta de adscripción de lo general a lo particular para
        // distinguir borradores de la misma persona en distintas áreas.
        const partes = [
            estructura?.tipoInstitucion,
            estructura?.institucion ?? draft.catalogos?.adscripcion,
            estructura?.organo,
            estructura?.unidad,
            draft.catalogos?.tipoUsuario,
        ]
            .map((part) => (part ?? '').trim())
            .filter(Boolean);

        return partes.join(' · ') || 'Sin adscripción capturada';
    }

    protected draftTimestamp(draft: BorradorItem): string {
        const fecha = draft.fechaActualizacion ?? draft.fechaCreacion;

        if (!fecha) {
            return 'Sin fecha';
        }

        const parsed = new Date(fecha);

        if (Number.isNaN(parsed.getTime())) {
            return fecha;
        }

        return parsed.toLocaleString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    protected trackDraft(_index: number, draft: BorradorItem): string {
        return String(draft.borradorId ?? _index);
    }

    private currentSessionUserId(): number | null {
        return this.toPositiveNumber(this.authStorage.session()?.user.id) ?? null;
    }

    private openRegistration(): void {
        this.detailRequestSequence++;
        this.userWizardMode.set('create');
        this.selectedUser.set(null);
        this.selectedUserDetail.set(null);
        this.isDetailLoading.set(false);
        this.errorMessage.set(null);
        this.informationMessage.set(null);
        this.isUserWizardOpen.set(true);
    }

    protected openUserDetail(user: UserRecord): void {
        const userId = this.resolveTargetUserId(user);

        if (!userId) {
            this.errorMessage.set('No se puede consultar el detalle porque el usuario no tiene identificador interno.');
            return;
        }

        const requestId = ++this.detailRequestSequence;

        this.selectedUser.set(user);
        this.selectedUserDetail.set(null);
        this.userWizardMode.set('edit');
        this.errorMessage.set(null);
        this.informationMessage.set(null);
        this.isDetailLoading.set(true);
        this.isUserWizardOpen.set(true);

        this.usersFacade
            .getUserDetail(userId)
            .pipe(timeout(15000))
            .subscribe({
                next: (detail) => {
                    if (requestId !== this.detailRequestSequence) {
                        return;
                    }

                    this.selectedUserDetail.set(detail);
                    this.isDetailLoading.set(false);
                },
                error: (error: unknown) => {
                    if (requestId !== this.detailRequestSequence) {
                        return;
                    }

                    this.selectedUserDetail.set(null);
                    this.isDetailLoading.set(false);
                    this.errorMessage.set(this.toFriendlyError(error));
                },
            });
    }

    protected closeUserWizard(): void {
        this.detailRequestSequence++;
        this.isDetailLoading.set(false);
        this.isUserWizardOpen.set(false);
        this.userWizardMode.set('create');
        this.selectedUser.set(null);
        this.selectedUserDetail.set(null);
        this.draftToOpen.set(null);
        this.autoRestoreDraft.set(false);
    }

    protected openBajaModal(user: UserRecord): void {
        if (this.isCurrentSessionUser(user)) {
            this.errorMessage.set('No puedes dar de baja la cuenta con la que tienes la sesión activa.');
            return;
        }

        this.bajaTargetUser.set(user);
        this.bajaComment.set('');
        this.bajaCommentError.set(null);
        this.errorMessage.set(null);
        this.informationMessage.set(null);
        this.isBajaModalOpen.set(true);

        if (this.isUserBaja(user)) {
            this.bajaCommentError.set('El usuario ya está dado de baja.');
            return;
        }

        if (!this.resolveTargetUserId(user)) {
            this.bajaCommentError.set('No se encontró el identificador interno del usuario. Revisa el mapeo de usuarioId.');
        }
    }

    protected closeBajaModal(): void {
        if (this.isBajaSubmitting()) {
            return;
        }

        this.isBajaModalOpen.set(false);
        this.bajaTargetUser.set(null);
        this.bajaComment.set('');
        this.bajaCommentError.set(null);
    }

    protected updateBajaComment(value: string): void {
        const normalizedValue = this.normalizeOperationCommentInput(value);

        this.bajaComment.set(normalizedValue);

        if (normalizedValue.trim()) {
            this.bajaCommentError.set(null);
        }
    }

    protected confirmDarDeBajaUsuario(): void {
        const user = this.bajaTargetUser();
        const userId = this.resolveTargetUserId(user);

        if (!user || !userId) {
            this.bajaCommentError.set('No se puede dar de baja porque el usuario no tiene identificador interno.');
            return;
        }

        if (this.isCurrentSessionUser(user)) {
            this.bajaCommentError.set('No puedes dar de baja la cuenta con la que tienes la sesión activa.');
            return;
        }

        if (this.isUserBaja(user)) {
            this.bajaCommentError.set('El usuario ya está dado de baja.');
            return;
        }

        const comentarioNormalizado = this.bajaComment().trim().toUpperCase();
        const commentError = this.validateOperationComment(comentarioNormalizado);

        if (commentError) {
            this.bajaCommentError.set(commentError);
            return;
        }

        const request: SolicitudOperacionRequest = {
            usuarioId: userId,
            comentario: comentarioNormalizado,
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-baja-${Date.now()}`,
            },
        };

        this.isBajaSubmitting.set(true);
        this.errorMessage.set(null);
        this.bajaCommentError.set(null);

        this.usersFacade
            .darDeBajaUsuario(request)
            .pipe(finalize(() => this.isBajaSubmitting.set(false)))
            .subscribe({
                next: (response) => {
                    this.isBajaSubmitting.set(false);
                    this.isBajaModalOpen.set(false);
                    this.bajaTargetUser.set(null);
                    this.bajaComment.set('');
                    this.bajaCommentError.set(null);
                    this.showOperationSuccess('baja', user, response);
                },
                error: (error: unknown) => {
                    this.bajaCommentError.set(this.toFriendlyError(error));
                },
            });
    }

    protected openStatusModal(user: UserRecord): void {
        if (this.isCurrentSessionUser(user)) {
            this.errorMessage.set('Solo puedes consultar el detalle de la cuenta con la que tienes la sesión activa.');
            return;
        }

        if (this.isUserBaja(user) || this.isUserBlocked(user)) {
            this.errorMessage.set(
                this.isUserBlocked(user)
                    ? 'Utiliza la acción de desbloqueo para esta cuenta.'
                    : 'La cuenta dada de baja no es reactivable.',
            );
            return;
        }

        this.prepareStatusModal(user);
    }

    protected openUnlockModal(user: UserRecord): void {
        if (!this.isUserBlocked(user)) {
            return;
        }

        if (this.isCurrentSessionUser(user)) {
            this.errorMessage.set('No puedes desbloquear la cuenta con la que tienes la sesión activa.');
            return;
        }

        this.prepareStatusModal(user);
    }

    private prepareStatusModal(user: UserRecord): void {
        this.statusTargetUser.set(user);
        this.statusComment.set('');
        this.statusCommentError.set(null);
        this.errorMessage.set(null);
        this.informationMessage.set(null);
        this.isStatusModalOpen.set(true);

        if (!this.resolveTargetUserId(user)) {
            this.statusCommentError.set('No se encontró el identificador interno del usuario. Revisa el mapeo de usuarioId.');
        }
    }

    protected closeStatusModal(): void {
        if (this.isStatusSubmitting()) {
            return;
        }

        this.isStatusModalOpen.set(false);
        this.statusTargetUser.set(null);
        this.statusComment.set('');
        this.statusCommentError.set(null);
    }

    protected updateStatusComment(value: string): void {
        const normalizedValue = this.normalizeOperationCommentInput(value);

        this.statusComment.set(normalizedValue);

        if (normalizedValue.trim()) {
            this.statusCommentError.set(null);
        }
    }

    protected confirmToggleUserStatus(): void {
        const user = this.statusTargetUser();
        const userId = this.resolveTargetUserId(user);

        if (!user || !userId) {
            this.statusCommentError.set('No se puede procesar la operación porque el usuario no tiene identificador interno.');
            return;
        }

        if (this.isCurrentSessionUser(user)) {
            this.statusCommentError.set('No puedes cambiar el estatus de la cuenta con la que tienes la sesión activa.');
            return;
        }

        if (this.isUserBaja(user)) {
            this.statusCommentError.set('La cuenta dada de baja no es reactivable.');
            return;
        }

        const isUnlockOperation = this.isUserBlocked(user);
        const comentarioNormalizado = isUnlockOperation
            ? 'DESBLOQUEO DE CUENTA'
            : this.statusComment().trim().toUpperCase();
        const commentError = isUnlockOperation
            ? null
            : this.validateOperationComment(comentarioNormalizado);

        if (commentError) {
            this.statusCommentError.set(commentError);
            return;
        }

        const operationName: AccountOperationKind = isUnlockOperation
            ? 'desbloqueo'
            : this.isUserSuspended(user)
                ? 'reactivacion'
                : 'suspension';

        const request: SolicitudOperacionRequest = {
            usuarioId: userId,
            comentario: comentarioNormalizado,
            auditoria: {
                usuarioEjecutorId: this.resolveCurrentUserId(),
                correlationId: `siau-${operationName}-${Date.now()}`,
            },
        };

        const operation$ = this.isUserBlocked(user)
            ? this.usersFacade.desbloquearUsuario(request)
            : this.isUserSuspended(user)
                ? this.usersFacade.reactivarUsuario(request)
                : this.usersFacade.suspenderUsuario(request);

        this.isStatusSubmitting.set(true);
        this.errorMessage.set(null);
        this.statusCommentError.set(null);

        operation$
            .pipe(finalize(() => this.isStatusSubmitting.set(false)))
            .subscribe({
                next: (response) => {
                    this.isStatusSubmitting.set(false);
                    this.isStatusModalOpen.set(false);
                    this.statusTargetUser.set(null);
                    this.statusComment.set('');
                    this.statusCommentError.set(null);
                    this.showOperationSuccess(operationName, user, response);
                },
                error: (error: unknown) => {
                    this.statusCommentError.set(this.toFriendlyError(error));
                },
            });
    }

    protected handleUserSaved(): void {
        this.reloadUsers();
    }

    protected closeOperationSuccessModal(): void {
        if (!this.operationSuccess()) {
            return;
        }

        this.operationSuccess.set(null);
    }

    private showOperationSuccess(
        operation: AccountOperationKind,
        user: UserRecord,
        response: SolicitudOperacionResponse,
    ): void {
        const config = this.getOperationSuccessConfig(operation);
        const responseUserId = this.toPositiveNumber(response.datos?.usuarioId);

        this.operationSuccess.set({
            operation,
            title: config.title,
            heading: config.heading,
            message: response.mensaje?.trim() || config.defaultMessage,
            icon: config.icon,
            badge: 'Operación exitosa',
            newStatus: config.newStatus,
            fullName: user.fullName,
            username: user.username,
            email: user.email,
            userId: responseUserId ?? this.resolveTargetUserId(user) ?? user.userId,
        });

        // Refresca la información en cuanto el backend confirma cualquier modificación.
        this.loadUsers(this.currentPage());
    }

    private getOperationSuccessConfig(operation: AccountOperationKind): {
        readonly title: string;
        readonly heading: string;
        readonly defaultMessage: string;
        readonly icon: string;
        readonly newStatus: string;
    } {
        switch (operation) {
            case 'baja':
                return {
                    title: 'Baja realizada correctamente',
                    heading: 'La cuenta fue dada de baja',
                    defaultMessage: 'La baja del usuario se procesó correctamente.',
                    icon: 'trash-2',
                    newStatus: 'Baja',
                };
            case 'suspension':
                return {
                    title: 'Suspensión realizada correctamente',
                    heading: 'La cuenta fue suspendida',
                    defaultMessage: 'La suspensión del usuario se procesó correctamente.',
                    icon: 'ban',
                    newStatus: 'Suspendido',
                };
            case 'reactivacion':
                return {
                    title: 'Reactivación realizada correctamente',
                    heading: 'La cuenta fue reactivada',
                    defaultMessage: 'La reactivación del usuario se procesó correctamente.',
                    icon: 'circle-check',
                    newStatus: 'Activo',
                };
            case 'desbloqueo':
                return {
                    title: 'Desbloqueo realizado correctamente',
                    heading: 'La cuenta fue desbloqueada',
                    defaultMessage: 'El desbloqueo del usuario se procesó correctamente.',
                    icon: 'unlock',
                    newStatus: 'Activo',
                };
        }

        const unsupportedOperation: never = operation;
        throw new Error(`Operación de cuenta no soportada: ${unsupportedOperation}`);
    }

    protected getToggleTitle(user: UserRecord): string {
        return this.isUserSuspended(user) ? 'Reactivar' : 'Suspender';
    }

    protected getToggleIcon(user: UserRecord): string {
        return this.isUserSuspended(user) ? 'check' : 'ban';
    }

    protected getToggleActionClass(user: UserRecord): string {
        return this.isUserSuspended(user)
            ? 'users-table__action users-table__action--activate'
            : 'users-table__action users-table__action--ban';
    }

    protected getStatusModalTitle(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Desbloquear usuario';
        }

        return user && this.isUserSuspended(user) ? 'Reactivar usuario' : 'Suspender usuario';
    }

    protected getStatusModalSubtitle(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Esta acción desbloqueará el acceso del usuario seleccionado';
        }

        return user && this.isUserSuspended(user)
            ? 'Esta acción reactivará el acceso del usuario seleccionado'
            : 'Esta acción suspenderá temporalmente el acceso del usuario seleccionado';
    }

    protected getStatusModalIcon(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'unlock';
        }

        return user && this.isUserSuspended(user) ? 'check' : 'ban';
    }

    protected getStatusModalBadge(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Solicitud de desbloqueo';
        }

        return user && this.isUserSuspended(user)
            ? 'Solicitud de reactivación'
            : 'Solicitud de suspensión';
    }

    protected getStatusModalWarning(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'El usuario bloqueado recuperará el acceso cuando el desbloqueo se procese correctamente.';
        }

        return user && this.isUserSuspended(user)
            ? 'El usuario suspendido volverá a tener acceso cuando la operación sea procesada correctamente.'
            : 'El usuario quedará suspendido y no podrá acceder mientras esté en ese estado.';
    }

    protected getStatusCommentPlaceholder(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'ESCRIBE EL MOTIVO DEL DESBLOQUEO';
        }

        return user && this.isUserSuspended(user)
            ? 'ESCRIBE EL MOTIVO DE LA REACTIVACIÓN'
            : 'ESCRIBE EL MOTIVO DE LA SUSPENSIÓN';
    }

    protected getStatusConfirmLabel(): string {
        const user = this.statusTargetUser();

        if (user && this.isUserBlocked(user)) {
            return 'Confirmar desbloqueo';
        }

        return user && this.isUserSuspended(user)
            ? 'Confirmar reactivación'
            : 'Confirmar suspensión';
    }

    protected isStatusReactivateOperation(): boolean {
        const user = this.statusTargetUser();

        return user
            ? this.isUserSuspended(user) || this.isUserBlocked(user)
            : false;
    }

    protected shouldShowStatusButton(user: UserRecord): boolean {
        // Las acciones pertenecen exclusivamente al perfil Administrador.
        // Se mantienen visibles incluso en la fila de la cuenta en sesión;
        // el template las deshabilita ahí para impedir autosuspensión/reactivación.
        return this.isAdminUser() && !this.isUserBaja(user) && !this.isUserBlocked(user);
    }

    protected shouldShowUnlockButton(user: UserRecord): boolean {
        return this.isAdminUser() && this.isUserBlocked(user);
    }

    protected shouldShowDeleteButton(user: UserRecord): boolean {
        // Un administrador debe conservar visible la acción de baja mientras
        // la cuenta no se encuentre ya dada de baja.
        return this.isAdminUser() && !this.isUserBaja(user);
    }

    protected statusOperationRequiresComment(): boolean {
        const user = this.statusTargetUser();
        return Boolean(user) && !this.isUserBlocked(user!);
    }

    protected isUserReadOnly(user: UserRecord): boolean {
        return (
            this.isCurrentSessionUser(user)
            || this.isUserBaja(user)
            || this.isUserSuspended(user)
            || this.isUserBlocked(user)
        );
    }

    protected isCurrentSessionUser(user: UserRecord): boolean {
        const sessionUser = this.authStorage.session()?.user;

        if (!sessionUser) {
            return false;
        }

        const currentUserId = this.toPositiveNumber(sessionUser.id);
        const targetUserId = this.resolveTargetUserId(user);

        if (currentUserId && targetUserId) {
            return currentUserId === targetUserId;
        }

        const currentUsername = this.normalizeForCompare(sessionUser.username);
        const targetUsername = this.normalizeForCompare(user.username);

        return Boolean(currentUsername) && currentUsername === targetUsername;
    }

    protected isUserBaja(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'BAJA';
    }

    protected isUserSuspended(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'SUSPENDIDO';
    }

    protected isUserBlocked(user: UserRecord): boolean {
        return this.getAccountStatusKey(user) === 'BLOQUEADO';
    }

    private getAccountStatusKey(user: UserRecord): string {
        const statusKey = String(user.statusKey ?? '').trim();

        if (statusKey) {
            return this.normalizeAccountStatusKey(statusKey);
        }

        return this.normalizeAccountStatusKey(user.status);
    }

    private normalizeAccountStatusKey(value: string): string {
        const normalizedValue = value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase();

        if (normalizedValue.includes('SUSPEND')) {
            return 'SUSPENDIDO';
        }

        if (normalizedValue.includes('BLOQUE')) {
            return 'BLOQUEADO';
        }

        if (
            normalizedValue === 'BAJA' ||
            normalizedValue.includes('DADO DE BAJA') ||
            normalizedValue.includes('INHABIL') ||
            normalizedValue.includes('DESHABIL') ||
            normalizedValue === 'INACTIVO'
        ) {
            return 'BAJA';
        }

        if (normalizedValue.includes('ACTIVO')) {
            return 'ACTIVO';
        }

        return normalizedValue;
    }

    private syncDraftFilterKey(key: UserFilterKey, value: string): void {
        const hasValue = Boolean(String(value ?? '').trim());
        this.draftFilterKeys.update((keys) => {
            if (hasValue && !keys.includes(key)) {
                return [...keys, key];
            }

            if (!hasValue && keys.includes(key)) {
                return keys.filter((item) => item !== key);
            }

            return keys;
        });
    }

    private getActiveFilterKeys(filters: UserFilterValues): readonly UserFilterKey[] {
        return (Object.keys(filters) as UserFilterKey[]).filter((key) => Boolean(filters[key]));
    }

    private loadUsers(page = 1): void {
        const filters = this.appliedFilters();
        const currentUsername = this.authStorage.session()?.user.username?.trim() ?? '';
        const isAdmin = this.isAdminUser();
        const query: UsersQuery = {
            primerApellido: this.toOptionalText(filters.primerApellido),
            segundoApellido: this.toOptionalText(filters.segundoApellido),
            nombres: this.toOptionalText(filters.nombres),
            curp: this.toOptionalText(filters.curp),
            rfc: this.toOptionalText(filters.rfc),
            correo: this.toOptionalText(filters.correo),
            telefono: this.toOptionalText(filters.numeroTelefonico),
            tipoInstitucionId: this.toOptionalPositiveNumber(filters.tipoInstitucionId),
            entidadId: this.toOptionalPositiveNumber(filters.entidadId),
            municipioId: this.toOptionalPositiveNumber(filters.municipioId),
            institucionId: this.toOptionalPositiveNumber(filters.institucionId),
            organoId: this.toOptionalPositiveNumber(filters.organoAdministrativoDesconcentradoId),
            unidadId: this.toOptionalPositiveNumber(filters.unidadAdministrativaId),
            comisionTipoInstitucionId: this.toOptionalPositiveNumber(filters.comisionTipoInstitucionId),
            comisionEntidadId: this.toOptionalPositiveNumber(filters.comisionEntidadId),
            comisionMunicipioId: this.toOptionalPositiveNumber(filters.comisionMunicipioId),
            comisionInstitucionId: this.toOptionalPositiveNumber(filters.comisionInstitucionId),
            comisionOrganoId: this.toOptionalPositiveNumber(filters.comisionOrganoAdministrativoDesconcentradoId),
            comisionUnidadId: this.toOptionalPositiveNumber(filters.comisionUnidadAdministrativaId),
            // Fuera del perfil Administrador la consulta queda limitada a la cuenta en sesión.
            nombreUsuario: isAdmin
                ? this.toOptionalText(filters.nombreUsuario)
                : this.toOptionalText(currentUsername),
            estadoCuentaId: this.toOptionalPositiveNumber(filters.estadoCuentaId),
            // <input type="date"> ya entrega yyyy-MM-dd, que es el formato del endpoint.
            fechaInicio: this.toOptionalText(filters.fechaInicio),
            fechaFin: this.toOptionalText(filters.fechaFin),
            pagina: page,
            porPagina: 15,
        };

        this.currentPage.set(Math.max(1, page));
        this.isLoading.set(true);
        this.errorMessage.set(null);
        this.informationMessage.set(null);

        const hasAdvancedFilters = Object.entries(filters).some(([, value]) => Boolean(String(value ?? '').trim()));
        const request$ = !isAdmin || hasAdvancedFilters
            ? this.usersFacade.searchUsers(query)
            : this.usersFacade.getAllUsers(page, 15);

        request$
            .pipe(finalize(() => this.isLoading.set(false)))
            .subscribe({
                next: (response) => {
                    this.users.set(response.usuarios);
                    this.pagination.set(response.paginacion);
                },
                error: (error: unknown) => {
                    this.users.set([]);
                    this.pagination.set(DEFAULT_PAGINATION);
                    this.currentPage.set(1);
                    this.errorMessage.set(this.toFriendlyError(error));
                },
            });
    }

    private loadFilterCatalogs(): void {
        this.isFilterCatalogLoading.set(true);
        this.filterCatalogMessage.set(null);

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
                finalize(() => this.isFilterCatalogLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(({ institutionTypes, states, accountStatuses }) => {
                this.institutionTypeOptions.set(institutionTypes);
                this.stateOptions.set(states);
                this.accountStatusOptions.set(accountStatuses);

                if (
                    !institutionTypes.length
                    || !states.length
                    || !accountStatuses.length
                ) {
                    this.filterCatalogMessage.set(
                        'Algunos catálogos de búsqueda no están disponibles. Los demás criterios pueden seguir utilizándose.',
                    );
                }
            });
    }

    private handleHierarchyFilterChange(key: UserFilterKey, value: string): void {
        switch (key) {
            case 'tipoInstitucionId':
                this.clearDependentFilterValues([
                    'entidadId',
                    'municipioId',
                    'institucionId',
                    'organoAdministrativoDesconcentradoId',
                    'unidadAdministrativaId',
                ]);
                this.municipalityOptions.set([]);
                this.institutionOptions.set([]);
                this.decentralizedBodyOptions.set([]);
                this.administrativeUnitOptions.set([]);
                if (value && !this.requiresEntityForInstitution(value)) {
                    this.loadInstitutions();
                }
                break;
            case 'entidadId':
                this.clearDependentFilterValues([
                    'municipioId',
                    'institucionId',
                    'organoAdministrativoDesconcentradoId',
                    'unidadAdministrativaId',
                ]);
                this.municipalityOptions.set([]);
                this.institutionOptions.set([]);
                this.decentralizedBodyOptions.set([]);
                this.administrativeUnitOptions.set([]);
                if (value && this.requiresMunicipalityForInstitution(this.draftFilters().tipoInstitucionId)) {
                    this.loadMunicipalities(value);
                } else if (value) {
                    this.loadInstitutions();
                }
                break;
            case 'municipioId':
                this.clearDependentFilterValues([
                    'institucionId',
                    'organoAdministrativoDesconcentradoId',
                    'unidadAdministrativaId',
                ]);
                this.institutionOptions.set([]);
                this.decentralizedBodyOptions.set([]);
                this.administrativeUnitOptions.set([]);
                if (value) {
                    this.loadInstitutions();
                }
                break;
            case 'institucionId':
                this.clearDependentFilterValues([
                    'organoAdministrativoDesconcentradoId',
                    'unidadAdministrativaId',
                ]);
                this.decentralizedBodyOptions.set([]);
                this.administrativeUnitOptions.set([]);
                if (value) {
                    this.loadDecentralizedBodies(value);
                    this.loadAdministrativeUnits();
                }
                break;
            case 'organoAdministrativoDesconcentradoId':
                this.clearDependentFilterValues(['unidadAdministrativaId']);
                this.administrativeUnitOptions.set([]);
                if (this.draftFilters().institucionId) {
                    this.loadAdministrativeUnits();
                }
                break;
            case 'comisionTipoInstitucionId':
                this.clearDependentFilterValues([
                    'comisionEntidadId',
                    'comisionMunicipioId',
                    'comisionInstitucionId',
                    'comisionOrganoAdministrativoDesconcentradoId',
                    'comisionUnidadAdministrativaId',
                ]);
                this.resetCommissionDynamicCatalogs();
                if (value && !this.requiresEntityForInstitution(value)) {
                    this.loadCommissionInstitutions();
                }
                break;
            case 'comisionEntidadId':
                this.clearDependentFilterValues([
                    'comisionMunicipioId',
                    'comisionInstitucionId',
                    'comisionOrganoAdministrativoDesconcentradoId',
                    'comisionUnidadAdministrativaId',
                ]);
                this.resetCommissionDynamicCatalogs();
                if (value && this.requiresMunicipalityForInstitution(this.draftFilters().comisionTipoInstitucionId)) {
                    this.loadCommissionMunicipalities(value);
                } else if (value) {
                    this.loadCommissionInstitutions();
                }
                break;
            case 'comisionMunicipioId':
                this.clearDependentFilterValues([
                    'comisionInstitucionId',
                    'comisionOrganoAdministrativoDesconcentradoId',
                    'comisionUnidadAdministrativaId',
                ]);
                this.commissionInstitutionOptions.set([]);
                this.commissionDecentralizedBodyOptions.set([]);
                this.commissionAdministrativeUnitOptions.set([]);
                if (value) {
                    this.loadCommissionInstitutions();
                }
                break;
            case 'comisionInstitucionId':
                this.clearDependentFilterValues([
                    'comisionOrganoAdministrativoDesconcentradoId',
                    'comisionUnidadAdministrativaId',
                ]);
                this.commissionDecentralizedBodyOptions.set([]);
                this.commissionAdministrativeUnitOptions.set([]);
                if (value) {
                    this.loadCommissionDecentralizedBodies(value);
                    this.loadCommissionAdministrativeUnits();
                }
                break;
            case 'comisionOrganoAdministrativoDesconcentradoId':
                this.clearDependentFilterValues(['comisionUnidadAdministrativaId']);
                this.commissionAdministrativeUnitOptions.set([]);
                if (this.draftFilters().comisionInstitucionId) {
                    this.loadCommissionAdministrativeUnits();
                }
                break;
        }
    }

    private loadMunicipalities(entityId: string): void {
        const estadoId = this.toOptionalPositiveNumber(entityId);
        if (!estadoId) {
            this.municipalityOptions.set([]);
            return;
        }

        this.catalogosFacade
            .obtenerMunicipiosOptions(estadoId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.municipalityOptions.set(options),
                error: () => {
                    this.municipalityOptions.set([]);
                    this.showCatalogWarning('No fue posible cargar los municipios de la entidad seleccionada.');
                },
            });
    }

    private loadInstitutions(): void {
        const filters = this.draftFilters();
        const tipoInstitucionId = this.toOptionalPositiveNumber(filters.tipoInstitucionId);
        const estadoId = this.requiresEntityForInstitution(filters.tipoInstitucionId)
            ? this.toOptionalPositiveNumber(filters.entidadId)
            : undefined;
        const padreId = this.requiresMunicipalityForInstitution(filters.tipoInstitucionId)
            ? this.toOptionalPositiveNumber(filters.municipioId)
            : undefined;

        if (!tipoInstitucionId || !this.canSelectInstitution(filters)) {
            this.institutionOptions.set([]);
            return;
        }

        this.catalogosFacade
            .obtenerEstructuraOrgOptions({
                tipoInstitucionId,
                estadoId,
                padreId,
                soloActivos: 1,
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.institutionOptions.set(options),
                error: () => {
                    this.institutionOptions.set([]);
                    this.showCatalogWarning('No fue posible cargar las instituciones relacionadas.');
                },
            });
    }

    private loadDecentralizedBodies(institutionId: string): void {
        const padreId = this.toOptionalPositiveNumber(institutionId);
        if (!padreId) {
            this.decentralizedBodyOptions.set([]);
            return;
        }

        const request$ = this.isFederalInstitutionType(this.draftFilters().tipoInstitucionId)
            ? this.catalogosFacade.obtenerEstructuraOrganizacionalOptions({
                tipoEstructuraId: TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO,
                padreId,
                soloActivos: 1,
            })
            : this.catalogosFacade.obtenerEstructuraOrgOptions({
                tipoInstitucionId: this.toOptionalPositiveNumber(this.draftFilters().tipoInstitucionId),
                estadoId: this.toOptionalPositiveNumber(this.draftFilters().entidadId),
                padreId,
                soloActivos: 1,
            });

        request$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.decentralizedBodyOptions.set(options),
                error: () => {
                    this.decentralizedBodyOptions.set([]);
                    this.showCatalogWarning('No fue posible cargar los órganos administrativos desconcentrados.');
                },
            });
    }

    private loadAdministrativeUnits(): void {
        const filters = this.draftFilters();
        const parentValue = filters.organoAdministrativoDesconcentradoId || filters.institucionId;
        const padreId = this.toOptionalPositiveNumber(parentValue);
        if (!padreId) {
            this.administrativeUnitOptions.set([]);
            return;
        }

        const request$ = this.isFederalInstitutionType(filters.tipoInstitucionId)
            ? this.catalogosFacade.obtenerEstructuraOrganizacionalOptions({
                tipoEstructuraId: TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA,
                padreId,
                soloActivos: 1,
            })
            : this.catalogosFacade.obtenerEstructuraOrgOptions({
                tipoInstitucionId: this.toOptionalPositiveNumber(filters.tipoInstitucionId),
                estadoId: this.toOptionalPositiveNumber(filters.entidadId),
                padreId,
                soloActivos: 1,
            });

        request$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.administrativeUnitOptions.set(options),
                error: () => {
                    this.administrativeUnitOptions.set([]);
                    this.showCatalogWarning('No fue posible cargar las unidades administrativas.');
                },
            });
    }

    private loadCommissionMunicipalities(entityId: string): void {
        const estadoId = this.toOptionalPositiveNumber(entityId);
        if (!estadoId) {
            this.commissionMunicipalityOptions.set([]);
            return;
        }

        this.catalogosFacade
            .obtenerMunicipiosOptions(estadoId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.commissionMunicipalityOptions.set(options),
                error: () => {
                    this.commissionMunicipalityOptions.set([]);
                    this.showCatalogWarning('No fue posible cargar los municipios de la comisión.');
                },
            });
    }

    private loadCommissionInstitutions(): void {
        const filters = this.draftFilters();
        const tipoInstitucionId = this.toOptionalPositiveNumber(filters.comisionTipoInstitucionId);
        const estadoId = this.requiresEntityForInstitution(filters.comisionTipoInstitucionId)
            ? this.toOptionalPositiveNumber(filters.comisionEntidadId)
            : undefined;
        const padreId = this.requiresMunicipalityForInstitution(filters.comisionTipoInstitucionId)
            ? this.toOptionalPositiveNumber(filters.comisionMunicipioId)
            : undefined;

        if (!tipoInstitucionId || !this.canSelectCommissionInstitution(filters)) {
            this.commissionInstitutionOptions.set([]);
            return;
        }

        this.catalogosFacade
            .obtenerEstructuraOrgOptions({
                tipoInstitucionId,
                estadoId,
                padreId,
                soloActivos: 1,
            })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.commissionInstitutionOptions.set(options),
                error: () => {
                    this.commissionInstitutionOptions.set([]);
                    this.showCatalogWarning('No fue posible cargar las instituciones de la comisión.');
                },
            });
    }

    private loadCommissionDecentralizedBodies(institutionId: string): void {
        const filters = this.draftFilters();
        const padreId = this.toOptionalPositiveNumber(institutionId);
        if (!padreId) {
            this.commissionDecentralizedBodyOptions.set([]);
            return;
        }

        const request$ = this.isFederalInstitutionType(filters.comisionTipoInstitucionId)
            ? this.catalogosFacade.obtenerEstructuraOrganizacionalOptions({
                tipoEstructuraId: TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO,
                padreId,
                soloActivos: 1,
            })
            : this.catalogosFacade.obtenerEstructuraOrgOptions({
                tipoInstitucionId: this.toOptionalPositiveNumber(filters.comisionTipoInstitucionId),
                estadoId: this.toOptionalPositiveNumber(filters.comisionEntidadId),
                padreId,
                soloActivos: 1,
            });

        request$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.commissionDecentralizedBodyOptions.set(options),
                error: () => {
                    this.commissionDecentralizedBodyOptions.set([]);
                    this.showCatalogWarning('No fue posible cargar los órganos de la comisión.');
                },
            });
    }

    private loadCommissionAdministrativeUnits(): void {
        const filters = this.draftFilters();
        const parentValue = filters.comisionOrganoAdministrativoDesconcentradoId
            || filters.comisionInstitucionId;
        const padreId = this.toOptionalPositiveNumber(parentValue);
        if (!padreId) {
            this.commissionAdministrativeUnitOptions.set([]);
            return;
        }

        const request$ = this.isFederalInstitutionType(filters.comisionTipoInstitucionId)
            ? this.catalogosFacade.obtenerEstructuraOrganizacionalOptions({
                tipoEstructuraId: TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA,
                padreId,
                soloActivos: 1,
            })
            : this.catalogosFacade.obtenerEstructuraOrgOptions({
                tipoInstitucionId: this.toOptionalPositiveNumber(filters.comisionTipoInstitucionId),
                estadoId: this.toOptionalPositiveNumber(filters.comisionEntidadId),
                padreId,
                soloActivos: 1,
            });

        request$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (options) => this.commissionAdministrativeUnitOptions.set(options),
                error: () => {
                    this.commissionAdministrativeUnitOptions.set([]);
                    this.showCatalogWarning('No fue posible cargar las unidades administrativas de la comisión.');
                },
            });
    }

    private clearDependentFilterValues(keys: readonly UserFilterKey[]): void {
        this.draftFilters.update((filters) => {
            const next = { ...filters } as Record<UserFilterKey, string>;
            keys.forEach((key) => {
                next[key] = '';
            });
            return next as unknown as UserFilterValues;
        });
        this.draftCatalogLabels.update((labels) => {
            const next = { ...labels };
            keys.forEach((key) => delete next[key]);
            return next;
        });
    }

    private resetDynamicCatalogs(): void {
        this.municipalityOptions.set([]);
        this.institutionOptions.set([]);
        this.decentralizedBodyOptions.set([]);
        this.administrativeUnitOptions.set([]);
        this.resetCommissionDynamicCatalogs();
    }

    private resetCommissionDynamicCatalogs(): void {
        this.commissionMunicipalityOptions.set([]);
        this.commissionInstitutionOptions.set([]);
        this.commissionDecentralizedBodyOptions.set([]);
        this.commissionAdministrativeUnitOptions.set([]);
    }

    private syncDraftCatalogLabels(filters: UserFilterValues): void {
        const labels: Partial<Record<UserFilterKey, string>> = {};
        this.filterDefinitions().forEach((definition) => {
            if (definition.kind !== 'catalog' || !filters[definition.key]) {
                return;
            }
            labels[definition.key] = definition.options.find(
                (option) => option.value === filters[definition.key],
            )?.label ?? '';
        });
        this.draftCatalogLabels.set(labels);
    }

    private canSelectInstitution(filters: UserFilterValues): boolean {
        if (!filters.tipoInstitucionId) {
            return false;
        }
        if (this.requiresEntityForInstitution(filters.tipoInstitucionId) && !filters.entidadId) {
            return false;
        }
        if (this.requiresMunicipalityForInstitution(filters.tipoInstitucionId) && !filters.municipioId) {
            return false;
        }
        return true;
    }

    private canSelectCommissionInstitution(filters: UserFilterValues): boolean {
        if (!filters.comisionTipoInstitucionId) {
            return false;
        }
        if (this.requiresEntityForInstitution(filters.comisionTipoInstitucionId) && !filters.comisionEntidadId) {
            return false;
        }
        if (this.requiresMunicipalityForInstitution(filters.comisionTipoInstitucionId) && !filters.comisionMunicipioId) {
            return false;
        }
        return true;
    }

    private isFederalInstitutionType(value: string): boolean {
        const label = this.getInstitutionTypeLabel(value);
        return this.toOptionalPositiveNumber(value) === 1 || label.includes('federal');
    }

    private requiresEntityForInstitution(value: string): boolean {
        const label = this.getInstitutionTypeLabel(value);
        return label.includes('estatal') || label.includes('municipal');
    }

    private requiresMunicipalityForInstitution(value: string): boolean {
        return this.getInstitutionTypeLabel(value).includes('municipal');
    }

    private getInstitutionTypeLabel(value: string): string {
        const option = this.institutionTypeOptions().find((item) => item.value === value);
        return this.normalizeForCompare(option?.label ?? value);
    }

    private validateFilterValue(key: UserFilterKey, rawValue: string): string | null {
        const value = rawValue.trim();
        if (!value) {
            return 'Captura o selecciona un valor.';
        }

        if (NAME_FILTER_KEYS.includes(key)) {
            return /^[A-Z ]{1,100}$/.test(value)
                ? null
                : 'Solo se permiten letras A-Z y espacios, con máximo 100 caracteres.';
        }

        switch (key) {
            case 'curp':
                return /^[A-Z]{4}\d{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/.test(value)
                    ? null
                    : 'La CURP debe tener 18 caracteres y cumplir el formato establecido.';
            case 'rfc':
                return /^[A-Z]{4}\d{6}[A-Z0-9]{3}$/.test(value)
                    ? null
                    : 'El RFC debe tener 13 caracteres y cumplir el formato establecido.';
            case 'correo':
                // Misma regla VC02 que usa el login y el alta de usuario.
                return getContactEmailError(value);
            case 'numeroTelefonico':
                return /^\d{10}$/.test(value)
                    ? null
                    : 'El número telefónico debe contener exactamente 10 dígitos.';
            case 'nombreUsuario':
                return /^[A-Z0-9]{14}$/.test(value)
                    ? null
                    : 'El nombre de usuario debe contener exactamente 14 caracteres A-Z o 0-9.';
            case 'fechaInicio':
            case 'fechaFin':
                return value <= this.todayDate
                    ? null
                    : 'La fecha no puede ser posterior a la fecha actual.';
            default:
                return null;
        }
    }

    private validateOperationComment(value: string): string | null {
        const text = String(value ?? '').trim();
        const { min, max } = RESTRICTED_TEXT_LIMITS.comment;

        if (!text) {
            return 'El comentario es obligatorio.';
        }

        // MVC11/MVC12/MVC13: A-Z, espacios, 0-9 y
        // -.,!#$%&/()=?¿¡+@:;_" con longitud de 5 a 1,000.
        return getRestrictedTextError(text, min, max, 'El comentario');
    }

    private normalizeOperationCommentInput(value: unknown): string {
        const { max } = RESTRICTED_TEXT_LIMITS.comment;

        return sanitizeRestrictedText(value, max, true);
    }

    private toOptionalText(value: unknown): string | undefined {
        const normalized = String(value ?? '').trim();
        return normalized || undefined;
    }

    private toDateInputValue(value: Date): string {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatDateForDisplay(value: string): string {
        const [year, month, day] = value.split('-');
        return year && month && day ? `${day}/${month}/${year}` : value;
    }

    private showCatalogWarning(message: string): void {
        this.filterCatalogMessage.set(message);
    }

    private toOptionalPositiveNumber(value: unknown): number | undefined {
        const normalizedValue = Number(value);

        return Number.isFinite(normalizedValue) && normalizedValue > 0
            ? normalizedValue
            : undefined;
    }

    private isUserInactiveStatus(status: string): boolean {
        const value = this.normalizeForCompare(status);

        return (
            value.includes('inhabil') ||
            value.includes('inactivo')
        );
    }

    private resolveCurrentUserId(): number | null {
        const rawUserId = this.authStorage.session()?.user.id;
        const userId = Number(rawUserId);

        return Number.isFinite(userId) && userId > 0 ? userId : null;
    }

    private resolveTargetUserId(user: UserRecord | null): number | null {
        if (!user) {
            return null;
        }

        const record = user as unknown as Record<string, unknown>;

        return this.toPositiveNumber(
            user.userId ??
            record['usuarioId'] ??
            record['idUsuario'] ??
            record['id_usuario'] ??
            record['id'] ??
            record['usuarioID'],
        );
    }

    private toPositiveNumber(value: unknown): number | null {
        const numberValue = Number(value);

        return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
    }

    private normalizeForCompare(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    private toFriendlyError(error: unknown): string {
        if (error instanceof Error) {
            if (error.name === 'TimeoutError') {
                return 'El servicio de detalle tardó demasiado en responder.';
            }

            return error.message;
        }

        return 'Ocurrió un error inesperado al consultar usuarios.';
    }
    protected getRoleTone(role: UserRecord['role']): BadgeTone {
        const value = this.normalizeForCompare(role);

        if (value.includes('admin')) {
            return 'neutral';
        }

        if (value.includes('enlace')) {
            return 'info';
        }

        if (value.includes('supervisor')) {
            return 'dark';
        }

        return 'light';
    }

    protected getStatusTone(user: UserRecord): BadgeTone {
        switch (this.getAccountStatusKey(user)) {
            case 'ACTIVO':
                return 'success';
            case 'SUSPENDIDO':
                return 'warning';
            case 'BAJA':
            case 'BLOQUEADO':
                return 'danger';
            default:
                return 'info';
        }
    }

    protected getRegistryTone(status: UserRecord['rnpsp']): BadgeTone {
        const value = this.normalizeForCompare(status);

        return value.includes('registrado') && !value.includes('no') ? 'success' : 'danger';
    }

    protected getTrustTone(status: UserRecord['trust']): BadgeTone {
        const value = this.normalizeForCompare(status);

        if (value.includes('vigente') || value.includes('aprobado')) {
            return 'success';
        }

        if (value.includes('expir') || value.includes('vencid')) {
            return 'warning';
        }

        return 'info';
    }
}