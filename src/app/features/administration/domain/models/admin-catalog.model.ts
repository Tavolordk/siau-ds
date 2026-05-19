export type CatalogStatus = 'Activo' | 'Inactivo';

export interface AdminModule {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly icon: string;
    readonly totalRecords: number;
}

export interface AdminCatalog {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly records: number;
    readonly lastUpdate: string;
    readonly status: CatalogStatus;
}