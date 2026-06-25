import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { UsersApiRepository } from '../data-access/users-api.repository';
import {
    RegistroAdminRequest,
    RegistroAdminResponse,
    SolicitudOperacionRequest,
    SolicitudOperacionResponse,
    UserDetailRecord,
    UsersPageResult,
    UsersQuery,
} from '../domain/models/user-record.model';

@Injectable({ providedIn: 'root' })
export class UsersFacade {
    private readonly repository = inject(UsersApiRepository);

    getUsers(query: UsersQuery): Observable<UsersPageResult> {
        return this.repository.getUsers(query);
    }

    getUserDetail(userId: number): Observable<UserDetailRecord> {
        return this.repository.getUserDetail(userId);
    }

    createAdminUser(request: RegistroAdminRequest): Observable<RegistroAdminResponse> {
        return this.repository.createAdminUser(request);
    }
    darDeBajaUsuario(request: SolicitudOperacionRequest): Observable<SolicitudOperacionResponse> {
        return this.repository.darDeBajaUsuario(request);
    }
    darDeAltaUsuario(request: SolicitudOperacionRequest): Observable<SolicitudOperacionResponse> {
        return this.repository.darDeAltaUsuario(request);
    }
}