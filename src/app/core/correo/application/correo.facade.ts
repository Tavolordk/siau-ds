import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CorreoApiRepository } from '../data-access/correo-api.repository';
import { CorreoDeliveryResult, CorreoRequest } from '../domain/correo.model';

@Injectable({ providedIn: 'root' })
export class CorreoFacade {
    private readonly repository = inject(CorreoApiRepository);

    send(request: CorreoRequest): Observable<CorreoDeliveryResult> {
        return this.repository.send(request);
    }
}