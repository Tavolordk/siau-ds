import { Injectable } from '@angular/core';

export interface UserRegistrationDraft<TForm, TProfile> {
    readonly version: 1;
    readonly savedAt: string;
    readonly form: TForm;
    readonly profiles: readonly TProfile[];
    readonly activeStepId: string;
    readonly completedSteps: readonly string[];
}

/**
 * Conserva de forma local y recuperable el avance de un alta que todavía no se
 * ha enviado. Las contraseñas nunca se persisten en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class UserRegistrationDraftStorage {
    private readonly storageKey = 'siau.users.registration-draft.v1';

    load<TForm extends object, TProfile>(): UserRegistrationDraft<TForm, TProfile> | null {
        if (!this.canUseStorage()) {
            return null;
        }

        try {
            const raw = localStorage.getItem(this.storageKey);

            if (!raw) {
                return null;
            }

            const draft = JSON.parse(raw) as Partial<UserRegistrationDraft<TForm, TProfile>>;

            if (
                draft.version !== 1 ||
                !draft.form ||
                !Array.isArray(draft.profiles) ||
                typeof draft.activeStepId !== 'string' ||
                !Array.isArray(draft.completedSteps) ||
                typeof draft.savedAt !== 'string'
            ) {
                this.clear();
                return null;
            }

            return draft as UserRegistrationDraft<TForm, TProfile>;
        } catch {
            this.clear();
            return null;
        }
    }

    save<TForm extends object, TProfile>(
        draft: Omit<UserRegistrationDraft<TForm, TProfile>, 'version' | 'savedAt'>,
    ): void {
        if (!this.canUseStorage()) {
            return;
        }

        const form = {
            ...draft.form,
            password: '',
            confirmPassword: '',
        } as TForm;

        try {
            localStorage.setItem(
                this.storageKey,
                JSON.stringify({
                    ...draft,
                    version: 1,
                    savedAt: new Date().toISOString(),
                    form,
                } satisfies UserRegistrationDraft<TForm, TProfile>),
            );
        } catch {
            // El alta puede continuar aunque el navegador no permita persistir el borrador.
        }
    }

    clear(): void {
        if (!this.canUseStorage()) {
            return;
        }

        try {
            localStorage.removeItem(this.storageKey);
        } catch {
            // No hay una acción adicional segura cuando el almacenamiento está bloqueado.
        }
    }

    private canUseStorage(): boolean {
        return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    }
}
