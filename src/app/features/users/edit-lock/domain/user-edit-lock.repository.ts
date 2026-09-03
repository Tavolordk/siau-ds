import { Observable } from 'rxjs';
import {
    AcquireUserEditLockCommand,
    ReleaseUserEditLockCommand,
    RenewUserEditLockCommand,
    UserEditLock,
} from './user-edit-lock.model';

export abstract class UserEditLockRepository {
    abstract list(): Observable<readonly UserEditLock[]>;
    abstract acquire(usuarioId: number, command: AcquireUserEditLockCommand): Observable<UserEditLock>;
    abstract renew(usuarioId: number, command: RenewUserEditLockCommand): Observable<UserEditLock>;
    abstract release(usuarioId: number, command: ReleaseUserEditLockCommand): Observable<void>;
}
