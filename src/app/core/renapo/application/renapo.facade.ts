import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RenapoCurpResponse } from '../domain/renapo.model';
import { RenapoRepository } from '../domain/renapo.repository';

@Injectable({ providedIn: 'root' })
export class RenapoFacade {
    private readonly repository = inject(RenapoRepository);

    consultarCurp(curp: string): Observable<RenapoCurpResponse> {
        return this.repository.consultarCurp(curp);
    }
}