import { Injectable } from '@angular/core';
import {
    MINIMUM_BIRTH_DATE,
    getAdultCutoffDate,
    isValidContactEmail,
    sanitizeContactEmailInput,
    sanitizeRestrictedText,
    getRestrictedTextError,
} from '../../../../../shared/validation/field-validators';
import { IdentitySnapshot, UserRegistrationForm } from './user-registration-wizard.models';

/**
 * Reglas puras de captura y normalización del registro de usuarios.
 * Mantener estas reglas fuera del componente evita mezclar UI con transformación de datos.
 */
@Injectable({ providedIn: 'root' })
export class UserRegistrationFormRules {
    hasText(value: unknown): boolean {
        return this.toText(value).length > 0;
    }

    toText(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value).trim();
    }

    toDateInputValue(value: unknown): string {
        const textValue = this.toText(value);

        if (!textValue) {
            return '';
        }

        // Algunos orígenes legacy entregan fechas como serial de Excel/OLE
        // (por ejemplo, 45100 = 2023-06-23). Se convierte antes de intentar
        // interpretar formatos de texto para evitar mostrar el serial en el input.
        if (/^\d{4,6}(?:\.\d+)?$/.test(textValue)) {
            const serial = Number(textValue);

            if (Number.isFinite(serial) && serial >= 1 && serial <= 100000) {
                const excelEpochUtc = Date.UTC(1899, 11, 30);
                const date = new Date(excelEpochUtc + Math.floor(serial) * 86_400_000);

                if (!Number.isNaN(date.getTime())) {
                    const year = date.getUTCFullYear();
                    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(date.getUTCDate()).padStart(2, '0');

                    return `${year}-${month}-${day}`;
                }
            }
        }

        const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(textValue);

        if (isoMatch) {
            return isoMatch[1];
        }

        const slashDateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(textValue);

        if (slashDateMatch) {
            const [, day, month, year] = slashDateMatch;

            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        const spanishDateMatch = /^(\d{1,2})\s+([a-záéíóúñ.]+)\s+(\d{4})$/i.exec(textValue);

        if (spanishDateMatch) {
            const [, rawDay, rawMonth, rawYear] = spanishDateMatch;
            const monthMap: Record<string, string> = {
                ene: '01',
                enero: '01',
                feb: '02',
                febrero: '02',
                mar: '03',
                marzo: '03',
                abr: '04',
                abril: '04',
                may: '05',
                mayo: '05',
                jun: '06',
                junio: '06',
                jul: '07',
                julio: '07',
                ago: '08',
                agosto: '08',
                sep: '09',
                septiembre: '09',
                oct: '10',
                octubre: '10',
                nov: '11',
                noviembre: '11',
                dic: '12',
                diciembre: '12',
            };
            const month = monthMap[this.normalizeText(rawMonth.replace('.', ''))];

            if (month) {
                return `${rawYear}-${month}-${rawDay.padStart(2, '0')}`;
            }
        }

        return '';
    }

    normalizeFormInputValue<K extends keyof UserRegistrationForm>(
        key: K,
        value: UserRegistrationForm[K] | string | null,
    ): UserRegistrationForm[K] {
        if (key === 'commissionEnabled') {
            return Boolean(value) as UserRegistrationForm[K];
        }

        const textValue = this.toText(value);

        if (key === 'cuip') {
            return this.normalizeAlphanumericInput(textValue, 20) as UserRegistrationForm[K];
        }

        if (key === 'curp') {
            return this.normalizeAlphanumericInput(textValue, 18) as UserRegistrationForm[K];
        }

        if (key === 'employeeNumber') {
            return this.normalizeEmployeeNumberInput(textValue) as UserRegistrationForm[K];
        }

        if (this.isNameField(key)) {
            return this.normalizeNameInput(textValue) as UserRegistrationForm[K];
        }

        if (key === 'position') {
            return this.normalizeRestrictedTextInput(textValue, 150, true) as UserRegistrationForm[K];
        }

        if (key === 'functions') {
            return this.normalizeRestrictedTextInput(textValue, 500, true) as UserRegistrationForm[K];
        }

        if (key === 'comment') {
            return this.normalizeRestrictedTextInput(textValue, 1000, false) as UserRegistrationForm[K];
        }

        if (this.shouldUppercaseField(key)) {
            return textValue.toUpperCase() as UserRegistrationForm[K];
        }

        if (key === 'phone') {
            return this.normalizeNumericInput(textValue, 10) as UserRegistrationForm[K];
        }

        if (
            key === 'birthDate' ||
            key === 'admissionDate' ||
            key === 'commissionAdmissionDate'
        ) {
            // Sin fallback al texto original: si el origen manda un serial o una
            // cadena que no se puede interpretar, el campo queda vacío en lugar
            // de mostrar basura como "45100" y saltarse las validaciones.
            return this.toDateInputValue(textValue) as UserRegistrationForm[K];
        }

        if (key === 'email') {
            return this.normalizeEmail(textValue) as UserRegistrationForm[K];
        }

        return textValue as UserRegistrationForm[K];
    }

    shouldUppercaseField(key: keyof UserRegistrationForm): boolean {
        return [
            'cuip',
            'policeIdentificationKey',
            'curp',
            'rfc',
            'firstName',
            'lastName',
            'secondLastName',
            'employeeNumber',
            'username',
        ].includes(key);
    }

    isNameField(key: keyof UserRegistrationForm): boolean {
        return ['firstName', 'lastName', 'secondLastName'].includes(key);
    }

    normalizeNameInput(value: unknown): string {
        return this.toText(value)
            .normalize('NFKC')
            .toUpperCase()
            .replace(/[^A-Z\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    normalizeAlphanumericInput(value: unknown, maxLength: number): string {
        return this.toText(value)
            .normalize('NFKC')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, maxLength);
    }

    normalizeEmployeeNumberInput(value: unknown): string {
        return String(value ?? '')
            .normalize('NFKC')
            .toUpperCase()
            .replace(/[^A-Z0-9\s-]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^\s+/, '')
            .slice(0, 20);
    }

    isValidEmployeeNumber(value: unknown): boolean {
        return /^(?=.*[A-Z0-9])[A-Z0-9 -]{3,20}$/.test(
            this.toText(value).toUpperCase(),
        );
    }

    normalizeNumericInput(value: unknown, maxLength: number): string {
        return this.toText(value)
            .normalize('NFKC')
            .replace(/\D/g, '')
            .slice(0, maxLength);
    }

    isValidCurp(value: string): boolean {
        const curp = this.toText(value).toUpperCase();

        return (
            /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/.test(curp) &&
            this.getBirthDateFromCurp(curp) !== null
        );
    }

    normalizeRfc(value: string): string {
        return this.normalizeAlphanumericInput(value, 13);
    }

    getRfcPrefixFromCurp(value: string): string | null {
        const prefix = this.toText(value).toUpperCase().slice(0, 10);

        return /^[A-Z0-9]{10}$/.test(prefix) ? prefix : null;
    }

    buildRfcFromCurp(curp: string): string {
        const prefix = this.getRfcPrefixFromCurp(curp);

        return prefix ?? '';
    }

    getRfcHomoclave(value: string, prefix: string, currentRfc: string): string {
        const entered = this.normalizeRfc(value);

        if (entered.startsWith(prefix)) {
            return entered.slice(prefix.length, prefix.length + 3).replace(/[^A-Z0-9]/g, '');
        }

        const existing = this.normalizeRfc(currentRfc);

        return existing.startsWith(prefix)
            ? existing.slice(prefix.length, prefix.length + 3).replace(/[^A-Z0-9]/g, '')
            : '';
    }

    rfcMatchesCurp(rfc: string, curp: string): boolean {
        const normalizedRfc = this.toText(rfc).toUpperCase();
        const normalizedCurp = this.toText(curp).toUpperCase();

        return normalizedRfc.slice(0, 10) === normalizedCurp.slice(0, 10);
    }

    rfcBirthDateMatchesDate(rfc: string, birthDate: string): boolean {
        const rfcDateCode = this.getBirthDateCodeFromRfc(rfc);
        const parsedBirthDate = this.parseDateInput(birthDate);

        if (!rfcDateCode || !parsedBirthDate) {
            return false;
        }

        return rfcDateCode === this.formatRfcBirthDateCode(parsedBirthDate);
    }

    getBirthDateCodeFromRfc(value: string): string | null {
        const rfc = this.toText(value).toUpperCase();

        if (!this.isValidRfc(rfc)) {
            return null;
        }

        const prefixLength = rfc.length === 13 ? 4 : 3;
        const dateCode = rfc.slice(prefixLength, prefixLength + 6);

        return /^\d{6}$/.test(dateCode) ? dateCode : null;
    }

    formatRfcBirthDateCode(date: Date): string {
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}${month}${day}`;
    }

    getBirthDateFromCurp(value: string): string | null {
        const curp = this.toText(value).toUpperCase();

        if (curp.length !== 18) {
            return null;
        }

        const shortYear = Number(curp.slice(4, 6));
        const month = curp.slice(6, 8);
        const day = curp.slice(8, 10);
        const fullYear = this.resolveCurpBirthYear(shortYear);
        const birthDate = `${fullYear}-${month}-${day}`;

        return this.isValidDateInput(birthDate) ? birthDate : null;
    }

    resolveCurpBirthYear(shortYear: number): number {
        const currentYear = new Date().getFullYear();
        const currentCentury = Math.floor(currentYear / 100) * 100;
        const candidateYear = currentCentury + shortYear;

        return candidateYear > currentYear ? candidateYear - 100 : candidateYear;
    }

    isValidRfc(value: string): boolean {
        const rfc = this.toText(value).toUpperCase();

        // MVC03 VC03: RFC de persona física, exactamente 13 caracteres.
        return /^[A-Z]{4}\d{6}[A-Z0-9]{3}$/.test(rfc);
    }

    isValidEmail(value: string): boolean {
        return isValidContactEmail(this.toText(value));
    }

    normalizeEmail(value: unknown): string {
        return sanitizeContactEmailInput(value);
    }

    formatPhoneForDisplay(value: unknown): string {
        const digits = this.toText(value).replace(/\D/g, '').slice(0, 10);

        if (digits.length !== 10) {
            return digits;
        }

        return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
    }

    isDateOnOrBeforeToday(value: string): boolean {
        const date = this.parseDateInput(value);

        if (!date) {
            return false;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return date.getTime() <= today.getTime();
    }

    isCommissionStartDateValid(
        commissionDateValue: string,
        admissionDateValue: string,
    ): boolean {
        const commissionDate = this.parseDateInput(commissionDateValue);

        if (!commissionDate || !this.isDateOnOrBeforeToday(commissionDateValue)) {
            return false;
        }

        if (!this.hasText(admissionDateValue)) {
            return true;
        }

        const admissionDate = this.parseDateInput(admissionDateValue);

        return admissionDate !== null && commissionDate.getTime() >= admissionDate.getTime();
    }

    getRestrictedTextValidationError(
        value: string,
        minimum: number,
        maximum: number,
        label: string,
    ): string | null {
        return getRestrictedTextError(this.toText(value), minimum, maximum, label);
    }

    normalizeRestrictedTextInput(
        value: unknown,
        maximum: number,
        uppercase: boolean,
    ): string {
        return sanitizeRestrictedText(value, maximum, uppercase);
    }

    isBirthDateOnOrAfterMinimum(dateValue: string): boolean {
        const birthDate = this.parseDateInput(dateValue);

        if (!birthDate) {
            return false;
        }

        return birthDate.getTime() >= this.getMinimumBirthDate().getTime();
    }

    isAdult(dateValue: string): boolean {
        const birthDate = this.parseDateInput(dateValue);

        if (!birthDate) {
            return false;
        }

        return birthDate.getTime() <= this.getAdultCutoffDate().getTime();
    }

    getMinimumBirthDate(): Date {
        return this.parseDateInput(MINIMUM_BIRTH_DATE) as Date;
    }

    getAdultCutoffDate(): Date {
        return getAdultCutoffDate();
    }

    isValidDateInput(value: string): boolean {
        return this.parseDateInput(value) !== null;
    }

    areSameCalendarDates(leftValue: string, rightValue: string): boolean {
        const leftDate = this.parseDateInput(this.toDateInputValue(leftValue) || leftValue);
        const rightDate = this.parseDateInput(this.toDateInputValue(rightValue) || rightValue);

        if (!leftDate || !rightDate) {
            return false;
        }

        return (
            leftDate.getFullYear() === rightDate.getFullYear() &&
            leftDate.getMonth() === rightDate.getMonth() &&
            leftDate.getDate() === rightDate.getDate()
        );
    }

    parseDateInput(value: string): Date | null {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.toText(value));

        if (!match) {
            return null;
        }

        const [, rawYear, rawMonth, rawDay] = match;
        const year = Number(rawYear);
        const month = Number(rawMonth);
        const day = Number(rawDay);
        const date = new Date(year, month - 1, day);

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) {
            return null;
        }

        date.setHours(0, 0, 0, 0);

        return date;
    }

    formatDateInputValue(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    toEditFormSnapshot(form: UserRegistrationForm): UserRegistrationForm {
        return {
            ...form,
            profiles: [...form.profiles],
        };
    }

    toIdentitySnapshot(form: UserRegistrationForm): IdentitySnapshot {
        return {
            curp: this.toText(form.curp).toUpperCase(),
            rfc: this.toText(form.rfc).toUpperCase(),
            birthDate: this.toDateInputValue(form.birthDate),
        };
    }

    normalizeText(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }
}
