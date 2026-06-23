import { Observable } from 'rxjs';
import {
    CatalogoRecord,
    EstadoMunicipioQuery,
    EstructuraOrganizacionalQuery,
    EstructuraOrgQuery,
    SistemaPerfilesQuery,
} from './catalogo.model';

export abstract class CatalogosRepository {
    abstract obtenerEstadoCivil(): Observable<readonly CatalogoRecord[]>;

    abstract obtenerCuentaUsuario(): Observable<readonly CatalogoRecord[]>;

    abstract obtenerEstadosMunicipios(
        query?: EstadoMunicipioQuery,
    ): Observable<readonly CatalogoRecord[]>;

    abstract obtenerTipoInstitucion(): Observable<readonly CatalogoRecord[]>;

    abstract obtenerEstructuraOrganizacional(
        query?: EstructuraOrganizacionalQuery,
    ): Observable<readonly CatalogoRecord[]>;

    abstract obtenerEstructuraOrg(query?: EstructuraOrgQuery): Observable<readonly CatalogoRecord[]>;

    abstract obtenerSexo(): Observable<readonly CatalogoRecord[]>;

    abstract obtenerSistemas(): Observable<readonly CatalogoRecord[]>;

    abstract obtenerSistemaPerfiles(query?: SistemaPerfilesQuery): Observable<readonly CatalogoRecord[]>;

    abstract obtenerTipoEstructura(): Observable<readonly CatalogoRecord[]>;

    abstract obtenerTiposDocumentos(): Observable<readonly CatalogoRecord[]>;

    abstract obtenerTipoUsuario(): Observable<readonly CatalogoRecord[]>;
}