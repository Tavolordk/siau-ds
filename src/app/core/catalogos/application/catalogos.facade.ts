import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
    CatalogoOption,
    CatalogoRecord,
    EstructuraOrganizacionalQuery,
    EstructuraOrgQuery,
} from '../domain/catalogo.model';
import { CatalogosRepository } from '../domain/catalogos.repository';
import { mapCatalogoToOptions } from './catalogo-option.mapper';

@Injectable({ providedIn: 'root' })
export class CatalogosFacade {
    private readonly repository = inject(CatalogosRepository);

    obtenerEstadoCivilOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerEstadoCivil().pipe(map(mapCatalogoToOptions));
    }

    obtenerCuentaUsuarioOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerCuentaUsuario().pipe(map(mapCuentaUsuarioToOptions));
    }

    obtenerEstadosOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository
            .obtenerEstadosMunicipios({
                nivel: 'estado',
                soloActivos: 1,
            })
            .pipe(map(mapCatalogoToOptions));
    }

    obtenerMunicipiosOptions(estadoId: number): Observable<readonly CatalogoOption[]> {
        return this.repository
            .obtenerEstadosMunicipios({
                nivel: 'municipio',
                estadoId,
                soloActivos: 1,
            })
            .pipe(map(mapCatalogoToOptions));
    }

    obtenerTipoInstitucionOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerTipoInstitucion().pipe(map(mapCatalogoToOptions));
    }

    obtenerEstructuraOrganizacionalOptions(query: {
        tipoEstructuraId?: number;
        tipoInstitucionId?: number;
        padreId?: number;
        estadoId?: number;
        soloActivos?: 0 | 1;
    }): Observable<readonly CatalogoOption[]> {
        return this.repository
            .obtenerEstructuraOrganizacional(query)
            .pipe(map(mapCatalogoToOptions));
    }

    /**
     * Devuelve los registros crudos de estructura para poder reconstruir la
     * jerarquía padre -> hijo de un `estructuraId` persistido en borradores.
     */
    obtenerEstructuraOrganizacional(
        query: EstructuraOrganizacionalQuery = { soloActivos: 1 },
    ): Observable<readonly CatalogoRecord[]> {
        return this.repository.obtenerEstructuraOrganizacional(query);
    }

    obtenerEstructuraOrgOptions(query: EstructuraOrgQuery): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerEstructuraOrg(query).pipe(map(mapCatalogoToOptions));
    }

    /**
     * Variante cruda del catálogo regional; conserva padreId, estadoId y
     * tipoInstitucionId para rehidratar borradores desde el último hijo.
     */
    obtenerEstructuraOrg(
        query: EstructuraOrgQuery = { soloActivos: 1 },
    ): Observable<readonly CatalogoRecord[]> {
        return this.repository.obtenerEstructuraOrg(query);
    }

    obtenerSexoOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerSexo().pipe(map(mapCatalogoToOptions));
    }

    obtenerSistemasOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerSistemas().pipe(map(mapSistemaToOptions));
    }

    /**
     * Variante para filtros y contratos que requieren el identificador numérico
     * del sistema. Se mantiene obtenerSistemasOptions() para los formularios que
     * trabajan con la clave textual del sistema.
     */
    obtenerSistemasIdOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerSistemas().pipe(map(mapSistemaIdToOptions));
    }

    obtenerSistemaPerfilesOptions(sistema: string): Observable<readonly CatalogoOption[]> {
        return this.repository
            .obtenerSistemaPerfiles({
                sistema,
                soloActivos: 1,
            })
            .pipe(map(mapCatalogoToOptions));
    }

    obtenerEstructuraPerfil(estructuraId: number): Observable<readonly CatalogoRecord[]> {
        return this.repository.obtenerEstructuraPerfil({ estructuraId });
    }

    obtenerTipoEstructuraOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerTipoEstructura().pipe(map(mapCatalogoToOptions));
    }

    obtenerTiposDocumentosOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerTiposDocumentos().pipe(map(mapCatalogoToOptions));
    }

    obtenerTipoUsuarioOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerTipoUsuario().pipe(map(mapCatalogoToOptions));
    }
}



function mapCuentaUsuarioToOptions(items: readonly CatalogoRecord[]): readonly CatalogoOption[] {
    return items.reduce<CatalogoOption[]>((options, item) => {
        const value = toText(
            item['estadoCuentaId']
            ?? item['estatusId']
            ?? item['idEstadoCuenta']
            ?? item['idEstatus']
            ?? item['id'],
        );
        // En la búsqueda avanzada el catálogo de estatus debe mostrar la
        // clave funcional (por ejemplo: ACTIVO, SUSPENDIDO, BAJA) y no la
        // descripción larga del registro. El value conserva el identificador
        // numérico que se envía en estadoCuentaId.
        const label = toText(
            item['clave']
            ?? item['Clave']
            ?? item['CLAVE']
            ?? item['claveEstadoCuenta']
            ?? item['claveEstatus']
            ?? item['estadoCuenta']
            ?? item['estatus']
            ?? item['nombre']
            ?? item['descripcionEstadoCuenta']
            ?? item['descripcionEstatusCuenta']
            ?? item['descripcionCuentaUsuario']
            ?? item['descripcionEstatus']
            ?? item['descripcionEstado']
            ?? item['descripcion']
            ?? item['Descripcion']
            ?? item['DESCRIPCION']
            ?? item['detalle'],
        );

        if (!value || !label) {
            return options;
        }

        return [
            ...options,
            {
                value,
                label,
                metadata: item,
            },
        ];
    }, []);
}


function mapSistemaIdToOptions(items: readonly CatalogoRecord[]): readonly CatalogoOption[] {
    return items.reduce<CatalogoOption[]>((options, item) => {
        const id = toText(item['idSistema'] ?? item['sistemaId'] ?? item['id']);
        const sistema = toText(item['sistema'] ?? item['nombre'] ?? item['descripcion']);

        if (!id || !sistema) {
            return options;
        }

        return [
            ...options,
            {
                value: id,
                label: sistema,
                metadata: item,
            },
        ];
    }, []);
}

function mapSistemaToOptions(items: readonly CatalogoRecord[]): readonly CatalogoOption[] {
    return items.reduce<CatalogoOption[]>((options, item) => {
        const sistema = toText(item['sistema']);

        if (!sistema) {
            return options;
        }

        return [
            ...options,
            {
                value: sistema,
                label: sistema,
                metadata: item,
            },
        ];
    }, []);
}

function toText(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value).trim();
}
