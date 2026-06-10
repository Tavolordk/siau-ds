import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { CatalogoOption } from '../domain/catalogo.model';
import { CatalogosRepository } from '../domain/catalogos.repository';
import { mapCatalogoToOptions } from './catalogo-option.mapper';

@Injectable({ providedIn: 'root' })
export class CatalogosFacade {
    private readonly repository = inject(CatalogosRepository);

    obtenerEstadoCivilOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerEstadoCivil().pipe(map(mapCatalogoToOptions));
    }

    obtenerCuentaUsuarioOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerCuentaUsuario().pipe(map(mapCatalogoToOptions));
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

    obtenerSexoOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerSexo().pipe(map(mapCatalogoToOptions));
    }

    obtenerSistemasOptions(): Observable<readonly CatalogoOption[]> {
        return this.repository.obtenerSistemas().pipe(map(mapCatalogoToOptions));
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