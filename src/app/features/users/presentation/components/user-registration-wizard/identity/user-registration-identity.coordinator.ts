import {
    DestroyRef,
    inject,
    Injectable,
    signal,
    WritableSignal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RenapoCurpData, RenapoFacade } from '../../../../../../core/renapo';
import { UsersFacade } from '../../../../application/facades/users.facade';
import { SiauSelectOption } from '../../../../../../shared/ui';
import {
    EcccPersonalApiRepository,
    EcccPersonalLookupRequest,
} from '../../../../data-access/identity/eccc-personal-api.repository';
import {
    CurpValidationSummary,
    RenapoLookupStatus,
    UserRegistrationForm,
} from '../models/user-registration-wizard.models';
import { UserRegistrationFormRules } from '../validation/user-registration-form.rules';

interface RenapoLookupContext {
    readonly form: WritableSignal<UserRegistrationForm>;
    readonly formErrors: WritableSignal<Record<string, string>>;
    readonly genderOptions: () => readonly SiauSelectOption[];
    readonly isEditMode: boolean;
    readonly detailCurpValidated: boolean;
    readonly applyLiveFieldValidation: (
        field: keyof UserRegistrationForm,
        value: UserRegistrationForm[keyof UserRegistrationForm],
    ) => void;
}

@Injectable()
export class UserRegistrationIdentityCoordinator {
    private readonly renapoFacade = inject(RenapoFacade);
    private readonly usersFacade = inject(UsersFacade);
    private readonly ecccPersonalApi = inject(EcccPersonalApiRepository);
    private readonly formRules = inject(UserRegistrationFormRules);
    private readonly destroyRef = inject(DestroyRef);

    private curpLookupSequence = 0;
    private curpAvailabilitySequence = 0;
    private ecccPersonalLookupSequence = 0;

    readonly lastRenapoCurp = signal<string>('');
    readonly renapoLookupStatus = signal<RenapoLookupStatus>('idle');
    readonly renapoMessage = signal<string>('');
    readonly renapoMessageVisible = signal<boolean>(false);
    readonly curpLocked = signal<boolean>(false);
    readonly curpUnlockChecked = signal<boolean>(false);
    readonly curpValidationSummary = signal<CurpValidationSummary | null>(null);
    readonly curpAvailabilityStatus = signal<'idle' | 'loading' | 'available' | 'unavailable' | 'error'>('idle');
    readonly curpAvailabilityValue = signal<string>('');

    validateCurpAvailabilityAndConsultRenapo(curp: string, context: RenapoLookupContext): void {
        const normalizedCurp = this.formRules.toText(curp).toUpperCase();

        if (!this.formRules.isValidCurp(normalizedCurp)) {
            return;
        }

        // En edición la CURP ya pertenece al usuario actual; no se valida como duplicada.
        if (context.isEditMode) {
            this.consultRenapo(normalizedCurp, context);
            return;
        }

        if (
            this.curpAvailabilityValue() === normalizedCurp &&
            (this.curpAvailabilityStatus() === 'loading' ||
                this.curpAvailabilityStatus() === 'available' ||
                this.curpAvailabilityStatus() === 'unavailable')
        ) {
            return;
        }

        const requestSequence = ++this.curpAvailabilitySequence;
        this.curpAvailabilityValue.set(normalizedCurp);
        this.curpAvailabilityStatus.set('loading');
        this.clearFieldError(context.formErrors, 'curp');

        this.usersFacade
            .validateRegistrationAvailability({ curp: normalizedCurp })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    if (
                        requestSequence !== this.curpAvailabilitySequence ||
                        context.form().curp !== normalizedCurp
                    ) {
                        return;
                    }

                    const message = response.curpMensaje?.trim();
                    if (response.curpFormatoValido === 0 || response.curpDisponible === 0) {
                        this.curpAvailabilityStatus.set('unavailable');
                        this.curpLocked.set(false);
                        context.formErrors.update((current) => ({
                            ...current,
                            curp:
                                message ||
                                (response.curpFormatoValido === 0
                                    ? 'La CURP no tiene un formato válido.'
                                    : 'La CURP ya se encuentra registrada.'),
                        }));
                        return;
                    }

                    this.curpAvailabilityStatus.set('available');
                    this.clearFieldError(context.formErrors, 'curp');
                    // La CURP está disponible: continúa exactamente con el flujo RENAPO existente.
                    this.consultRenapo(normalizedCurp, context);
                },
                error: (error: unknown) => {
                    if (
                        requestSequence !== this.curpAvailabilitySequence ||
                        context.form().curp !== normalizedCurp
                    ) {
                        return;
                    }

                    this.curpLocked.set(false);

                    if (error instanceof HttpErrorResponse && error.status === 409) {
                        this.curpAvailabilityStatus.set('unavailable');
                        const body = error.error as { mensaje?: string; message?: string } | null;
                        context.formErrors.update((current) => ({
                            ...current,
                            // Para 409 se muestra exactamente el mensaje funcional enviado por backend.
                            curp: body?.mensaje?.trim() || body?.message?.trim()
                                || 'La CURP ya se encuentra registrada o tiene una solicitud en curso.',
                        }));
                        return;
                    }

                    // Si el servicio de validación falla por un motivo distinto de 409,
                    // informamos al usuario pero permitimos continuar con RENAPO y el registro.
                    this.curpAvailabilityStatus.set('available');
                    context.formErrors.update((current) => ({
                        ...current,
                        curp: 'No fue posible validar si existe o no la CURP.',
                    }));
                    this.consultRenapo(normalizedCurp, context);
                },
            });
    }

    canContinueWithCurp(
        curp: string,
        formErrors: WritableSignal<Record<string, string>>,
        isEditMode: boolean,
    ): boolean {
        if (isEditMode) {
            return true;
        }

        const normalizedCurp = this.formRules.toText(curp).toUpperCase();
        // Las validaciones normales del paso se encargan del vacío/formato.
        if (!this.formRules.isValidCurp(normalizedCurp)) {
            return true;
        }

        if (
            this.curpAvailabilityValue() === normalizedCurp &&
            this.curpAvailabilityStatus() === 'available'
        ) {
            return true;
        }

        const status = this.curpAvailabilityStatus();
        const message =
            status === 'loading'
                ? 'Espera a que termine la validación de la CURP antes de continuar.'
                : status === 'unavailable'
                    ? (formErrors()['curp'] || 'La CURP ya se encuentra registrada. Captura una CURP diferente.')
                    : status === 'error'
                        ? 'No fue posible validar si existe o no la CURP.'
                        : 'La CURP debe validarse antes de continuar.';

        if (status === 'error') {
            formErrors.update((current) => ({ ...current, curp: message }));
            return true;
        }

        formErrors.update((current) => ({ ...current, curp: message }));
        return false;
    }

    consultRenapo(curp: string, context: RenapoLookupContext): void {
        const normalizedCurp = this.formRules.toText(curp).toUpperCase();

        if (context.isEditMode && context.detailCurpValidated) {
            return;
        }

        if (!this.formRules.isValidCurp(normalizedCurp)) {
            return;
        }

        const requestSequence = ++this.curpLookupSequence;

        context.form.update((current) => ({
            ...current,
            rfc: this.formRules.buildRfcFromCurp(normalizedCurp),
        }));
        this.clearFieldError(context.formErrors, 'rfc');

        this.clearCurpValidationSummary();
        this.curpUnlockChecked.set(false);
        this.curpLocked.set(false);
        this.renapoLookupStatus.set('loading');
        this.renapoMessage.set('Espera un momento mientras validamos la identidad.');
        this.renapoMessageVisible.set(true);

        this.renapoFacade
            .consultarCurp(normalizedCurp)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    if (
                        requestSequence !== this.curpLookupSequence ||
                        context.form().curp !== normalizedCurp
                    ) {
                        return;
                    }

                    this.lastRenapoCurp.set(normalizedCurp);
                    this.curpLocked.set(true);

                    if (
                        response.exito &&
                        response.datos &&
                        this.hasCompleteRenapoPersonalData(response.datos, context.genderOptions())
                    ) {
                        this.applyRenapoPersonalData(
                            response.datos,
                            normalizedCurp,
                            context,
                        );
                        this.renapoLookupStatus.set('success');
                        this.renapoMessageVisible.set(true);
                        this.renapoMessage.set(
                            response.mensaje ||
                            'Los datos personales fueron llenados con la información de RENAPO.',
                        );
                        return;
                    }

                    this.renapoLookupStatus.set('not-found');
                    this.renapoMessageVisible.set(true);
                    this.renapoMessage.set(
                        'RENAPO no encontró información para esta CURP. Captura manualmente nombre(s), apellidos, sexo y fecha de nacimiento.',
                    );
                },
                error: (error: unknown) => {
                    if (
                        requestSequence !== this.curpLookupSequence ||
                        context.form().curp !== normalizedCurp
                    ) {
                        return;
                    }

                    this.lastRenapoCurp.set(normalizedCurp);
                    this.curpLocked.set(true);
                    this.renapoLookupStatus.set('error');
                    this.renapoMessageVisible.set(true);
                    this.renapoMessage.set(
                        'No fue posible consultar RENAPO. Puedes reintentar o capturar manualmente nombre(s), apellidos, sexo y fecha de nacimiento.',
                    );
                    console.error('Error consultando CURP en RENAPO.', error);
                },
            });
    }

    clearCurpLookupResultsForEdit(
        form: WritableSignal<UserRegistrationForm>,
        formErrors: WritableSignal<Record<string, string>>,
    ): void {
        const hadRenapoResult =
            this.lastRenapoCurp().length > 0 ||
            this.renapoLookupStatus() !== 'idle';

        if (hadRenapoResult) {
            this.clearRenapoPersonalData(form, formErrors);
        }

        this.resetRenapoLookupState();
    }

    consultEcccAndPersonal(form: WritableSignal<UserRegistrationForm>): void {
        const request = this.buildEcccPersonalLookupRequest(form());

        if (!request) {
            this.clearCurpValidationSummary();
            return;
        }

        const lookupKey = JSON.stringify(request);
        const requestSequence = ++this.ecccPersonalLookupSequence;
        this.curpValidationSummary.set({
            personal: 'Consultando...',
            sau: 'Consultando...',
            eccc: 'Consultando...',
            expirationDate: 'Consultando...',
            message: 'Consultando información de Personal, SAU y ECCC...',
            messageTone: 'loading',
        });

        this.ecccPersonalApi
            .consultarIntegral(request)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    const currentRequest = this.buildEcccPersonalLookupRequest(form());
                    const currentLookupKey = currentRequest ? JSON.stringify(currentRequest) : '';

                    if (
                        requestSequence !== this.ecccPersonalLookupSequence ||
                        lookupKey !== currentLookupKey
                    ) {
                        return;
                    }

                    const personal = response.personal?.[0] ?? null;
                    const personalStatus = response.personalConsultado
                        ? response.personalEncontrado
                            ? this.formRules.toText(personal?.estatusPersonal) || 'Encontrado'
                            : 'No encontrado'
                        : 'No consultado';
                    const sauUsername = this.formRules.toText(response.sau?.usuario?.usuario);
                    const sauStatus = response.sauConsultado
                        ? sauUsername || 'No encontrado'
                        : 'No consultado';
                    const ecccResultado = this.formRules.toText(response.eccc?.resultadoIntegral);
                    const ecccVigencia = this.formRules.toText(response.eccc?.estatusVigencia);
                    const ecccStatus = response.ecccConsultado
                        ? [ecccResultado, ecccVigencia]
                            .filter((value, index, values) => value && values.indexOf(value) === index)
                            .join(' · ') || 'Sin información'
                        : 'No consultado';
                    const expirationDate = response.ecccConsultado
                        ? this.formRules.toDateInputValue(response.eccc?.fechaVencimiento ?? '') ||
                            this.formRules.toText(response.eccc?.fechaVencimiento) ||
                            'Sin información'
                        : 'No consultado';
                    const hasAnyResult =
                        response.personalEncontrado ||
                        Boolean(response.sau?.usuario) ||
                        Boolean(response.eccc);

                    this.curpValidationSummary.set({
                        personal: personalStatus,
                        sau: sauStatus,
                        eccc: ecccStatus,
                        expirationDate,
                        message:
                            this.formRules.toText(response.mensaje) ||
                            (hasAnyResult
                                ? 'La consulta integral se realizó correctamente.'
                                : 'La consulta se realizó correctamente, pero no se encontró información.'),
                        messageTone: hasAnyResult ? 'success' : 'warning',
                    });
                },
                error: (error: unknown) => {
                    const currentRequest = this.buildEcccPersonalLookupRequest(form());
                    const currentLookupKey = currentRequest ? JSON.stringify(currentRequest) : '';

                    if (
                        requestSequence !== this.ecccPersonalLookupSequence ||
                        lookupKey !== currentLookupKey
                    ) {
                        return;
                    }

                    const errorMessage =
                        error instanceof Error && this.formRules.toText(error.message)
                            ? this.formRules.toText(error.message)
                            : 'No fue posible consultar la información de Personal, SAU y ECCC.';

                    console.error('Error consultando Personal, SAU y ECCC.', error);
                    this.curpValidationSummary.set({
                        personal: 'No disponible',
                        sau: 'No disponible',
                        eccc: 'No disponible',
                        expirationDate: 'No disponible',
                        message: errorMessage,
                        messageTone: 'error',
                    });
                },
            });
    }

    resetRenapoLookupState(): void {
        this.curpLookupSequence += 1;
        this.curpAvailabilitySequence += 1;
        this.curpAvailabilityStatus.set('idle');
        this.curpAvailabilityValue.set('');
        this.lastRenapoCurp.set('');
        this.renapoLookupStatus.set('idle');
        this.renapoMessage.set('');
        this.renapoMessageVisible.set(false);
        this.curpLocked.set(false);
        this.curpUnlockChecked.set(false);
        this.clearCurpValidationSummary();
    }

    clearCurpValidationSummary(): void {
        this.ecccPersonalLookupSequence += 1;
        this.curpValidationSummary.set(null);
    }

    resetEcccPersonalLookupState(): void {
        this.ecccPersonalLookupSequence += 1;
        this.curpValidationSummary.set(null);
    }

    private applyRenapoPersonalData(
        data: RenapoCurpData,
        requestedCurp: string,
        context: RenapoLookupContext,
    ): void {
        const returnedCurp = this.formRules.toText(data.curp).toUpperCase();
        const curp = returnedCurp || requestedCurp;
        const gender = this.resolveRenapoGender(data.sexo, context.genderOptions());

        context.form.update((current) => ({
            ...current,
            curp,
            firstName: this.formRules.normalizeNameInput(data.nombre),
            lastName: this.formRules.normalizeNameInput(data.primerApellido),
            secondLastName: this.formRules.normalizeNameInput(data.segundoApellido),
            birthDate:
                this.formRules.toDateInputValue(data.fechaNacimiento) ||
                this.formRules.getBirthDateFromCurp(curp) ||
                current.birthDate,
            gender: gender || current.gender,
        }));

        context.formErrors.update((current) => {
            const next = { ...current };
            ['curp', 'rfc', 'firstName', 'lastName', 'birthDate', 'gender'].forEach((key) => {
                delete next[key];
            });
            return next;
        });

        context.applyLiveFieldValidation('birthDate', context.form().birthDate);
    }

    private clearRenapoPersonalData(
        form: WritableSignal<UserRegistrationForm>,
        formErrors: WritableSignal<Record<string, string>>,
    ): void {
        form.update((current) => ({
            ...current,
            firstName: '',
            lastName: '',
            secondLastName: '',
            birthDate: '',
            gender: '',
        }));

        formErrors.update((current) => {
            const next = { ...current };
            ['firstName', 'lastName', 'birthDate', 'gender'].forEach((key) => {
                delete next[key];
            });
            return next;
        });
    }

    private resolveRenapoGender(
        value: string,
        genderOptions: readonly SiauSelectOption[],
    ): string {
        const gender = this.formRules.normalizeText(value);
        if (!gender) return '';

        const aliases = gender === 'h'
            ? ['h', 'hombre', 'masculino']
            : gender === 'm'
                ? ['m', 'mujer', 'femenino']
                : [gender];

        const option = genderOptions.find((item) => {
            const metadata = this.optionMetadata(item);
            const candidates = [
                item.value,
                item.label,
                metadata['sexo'],
                metadata['clave'],
                metadata['codigo'],
                metadata['descripcion'],
            ].map((candidate) => this.formRules.normalizeText(this.formRules.toText(candidate)));
            return candidates.some((candidate) => aliases.includes(candidate));
        });

        return option?.value ?? '';
    }

    private buildEcccPersonalLookupRequest(
        form: UserRegistrationForm,
    ): EcccPersonalLookupRequest | null {
        const curp = this.formRules.toText(form.curp).toUpperCase();
        const rfc = this.formRules.toText(form.rfc).toUpperCase();
        const cuipValue = this.formRules.toText(form.cuip).trim();
        const cuip = cuipValue ? cuipValue.toUpperCase() : null;
        const nombre = this.formRules.toText(form.firstName).toUpperCase();
        const primerApellido = this.formRules.toText(form.lastName).toUpperCase();
        const segundoApellido = this.formRules.toText(form.secondLastName).toUpperCase();
        const fechaNacimiento = this.formRules.toDateInputValue(form.birthDate);

        if (
            !nombre ||
            !primerApellido ||
            !this.formRules.isValidCurp(curp) ||
            !rfc ||
            !fechaNacimiento
        ) {
            return null;
        }

        return {
            curp,
            rfc,
            cuip,
            nombre,
            primerApellido,
            segundoApellido,
            fechaNacimiento,
        };
    }

    private hasCompleteRenapoPersonalData(
        data: RenapoCurpData,
        genderOptions: readonly SiauSelectOption[],
    ): boolean {
        return (
            this.formRules.hasText(data.nombre) &&
            this.formRules.hasText(data.primerApellido) &&
            this.formRules.hasText(this.resolveRenapoGender(data.sexo, genderOptions))
        );
    }

    private clearFieldError(
        formErrors: WritableSignal<Record<string, string>>,
        key: string,
    ): void {
        formErrors.update((current) => {
            if (!current[key]) return current;
            const next = { ...current };
            delete next[key];
            return next;
        });
    }

    private optionMetadata(option: SiauSelectOption | undefined): Record<string, unknown> {
        const metadata = (option as { metadata?: Record<string, unknown> } | undefined)?.metadata;
        return this.toRecord(metadata);
    }

    private toRecord(value: unknown): Record<string, unknown> {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
            ? value as Record<string, unknown>
            : {};
    }
}
