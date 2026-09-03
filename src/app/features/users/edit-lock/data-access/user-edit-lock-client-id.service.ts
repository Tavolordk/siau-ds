import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserEditLockClientIdService {
    readonly value = this.createClientId();

    private createClientId(): string {
        if (globalThis.crypto?.randomUUID) {
            return globalThis.crypto.randomUUID();
        }

        return `siau-edit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
