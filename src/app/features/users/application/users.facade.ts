import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { UsersApiRepository } from '../data-access/users-api.repository';
import {
    ActualizarAdminRequest,
    ActualizarAdminResponse,
    BorradorGuardarRequest,
    BorradorItem,
    BorradorOperacionResponse,
    PasswordTemporalResponse,
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

    getAllUsers(page = 1, pageSize = 15): Observable<UsersPageResult> {
        return this.repository.getAllUsers(page, pageSize);
    }

    searchUsers(query: UsersQuery): Observable<UsersPageResult> {
        return this.repository.searchUsers(query);
    }

    getUsers(query: UsersQuery): Observable<UsersPageResult> {
        return this.repository.getUsers(query);
    }

    saveRegistrationDraft(request: BorradorGuardarRequest): Observable<BorradorOperacionResponse> {
        return this.repository.saveRegistrationDraft(request);
    }

    getRegistrationDraft(usuarioEjecutorId?: number | null): Observable<BorradorItem | null> {
        return this.repository.getRegistrationDraft(usuarioEjecutorId);
    }

    getRegistrationDrafts(
        usuarioEjecutorId?: number | null,
        borradorId?: number | null,
    ): Observable<readonly BorradorItem[]> {
        return this.repository.getRegistrationDrafts(usuarioEjecutorId, borradorId);
    }

    deleteRegistrationDraft(
        borradorId: number,
        usuarioEjecutorId?: number | null,
    ): Observable<void> {
        return this.repository.deleteRegistrationDraft(borradorId, usuarioEjecutorId);
    }

    getTemporaryPassword(account: string): Observable<PasswordTemporalResponse> {
        return this.repository.getTemporaryPassword(account);
    }

    getUserDetail(userId: number): Observable<UserDetailRecord> {
        return this.repository.getUserDetail(userId);
    }

    createAdminUser(request: RegistroAdminRequest): Observable<RegistroAdminResponse> {
        return this.repository.createAdminUser(request);
    }

    updateAdminUser(request: ActualizarAdminRequest): Observable<ActualizarAdminResponse> {
        return this.repository.updateAdminUser(request);
    }

    darDeBajaUsuario(request: SolicitudOperacionRequest): Observable<SolicitudOperacionResponse> {
        return this.repository.darDeBajaUsuario(request);
    }

    suspenderUsuario(request: SolicitudOperacionRequest): Observable<SolicitudOperacionResponse> {
        return this.repository.suspenderUsuario(request);
    }

    reactivarUsuario(request: SolicitudOperacionRequest): Observable<SolicitudOperacionResponse> {
        return this.repository.reactivarUsuario(request);
    }

    desbloquearUsuario(request: SolicitudOperacionRequest): Observable<SolicitudOperacionResponse> {
        return this.repository.desbloquearUsuario(request);
    }
}