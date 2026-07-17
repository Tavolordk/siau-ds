import { Observable } from 'rxjs';
import { RenapoCurpResponse } from './renapo.model';

export abstract class RenapoRepository {
    abstract consultarCurp(curp: string): Observable<RenapoCurpResponse>;
}