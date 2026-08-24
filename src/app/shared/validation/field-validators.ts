/**
 * Reglas de validación del catálogo VC (documento de validaciones SIAU).
 *
 * Este archivo es la ÚNICA fuente de verdad. Antes existían tres expresiones
 * regulares distintas para el correo (login-page, auth.api y
 * user-management-page) y se habían desincronizado entre ellas.
 *
 * Son funciones puras, sin dependencias de Angular, para poder usarlas desde
 * componentes, interceptores, repositorios y pruebas unitarias.
 */

/* -------------------------------------------------------------------------- */
/* VC02 · Medio de contacto (correo electrónico)                              */
/* -------------------------------------------------------------------------- */

export const CONTACT_EMAIL_MAX_LENGTH = 254;

/** Caracteres permitidos en la parte local, después del primer carácter. */
const EMAIL_LOCAL_ALLOWED_CHARS = /^[A-Za-z0-9._%+-]*$/;
/** Cada etiqueta del dominio: alfanumérica, con guiones sólo en medio. */
const EMAIL_DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

export type ContactEmailErrorCode =
    | 'required'
    | 'maxLength'
    | 'structure'
    | 'localStart'
    | 'localChars'
    | 'domainDot'
    | 'domainLabel';

const CONTACT_EMAIL_MESSAGES: Record<ContactEmailErrorCode, string> = {
    required: 'Captura un correo electrónico.',
    maxLength: `El correo no puede exceder ${CONTACT_EMAIL_MAX_LENGTH} caracteres.`,
    structure: 'El correo debe tener el formato usuario@dominio.com (una sola arroba).',
    localStart: 'El correo debe iniciar con una letra, no con número.',
    localChars: 'Antes de la @ sólo se permiten letras, números y los signos . _ % + -',
    domainDot: 'El dominio debe incluir al menos un punto, por ejemplo gmail.com.',
    domainLabel: 'El dominio admite letras, números y guiones, pero el guion no puede ir al inicio ni al final de cada segmento.',
};

/**
 * Elimina cualquier carácter fuera del catálogo VC02. Se usa al teclear para
 * que el campo no acepte caracteres inválidos (bug reportado: "no tiene el
 * formato adecuado"). No cambia mayúsculas/minúsculas: VC02 admite A-Z y a-z.
 */
export function sanitizeContactEmailInput(rawValue: unknown): string {
    const value = String(rawValue ?? '')
        .normalize('NFKC')
        .replace(/[\u0000-\u001F\u007F-\u009F\u00A0\u200B-\u200D\u2028\u2029\u2060\uFEFF]/g, '')
        .replace(/\s+/g, '');

    const separatorIndex = value.indexOf('@');

    if (separatorIndex < 0) {
        return value.replace(/[^A-Za-z0-9._%+-]/g, '').slice(0, CONTACT_EMAIL_MAX_LENGTH);
    }

    const local = value.slice(0, separatorIndex).replace(/[^A-Za-z0-9._%+-]/g, '');
    // Se conserva una sola arroba y se limpia el dominio.
    const domain = value
        .slice(separatorIndex + 1)
        .replace(/@/g, '')
        .replace(/[^A-Za-z0-9.-]/g, '');

    return `${local}@${domain}`.slice(0, CONTACT_EMAIL_MAX_LENGTH);
}

export function getContactEmailErrorCode(rawValue: unknown): ContactEmailErrorCode | null {
    const value = String(rawValue ?? '').trim();

    if (!value) {
        return 'required';
    }

    if (value.length > CONTACT_EMAIL_MAX_LENGTH) {
        return 'maxLength';
    }

    const parts = value.split('@');

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return 'structure';
    }

    const [local, domain] = parts;

    if (!/^[A-Za-z]/.test(local)) {
        return 'localStart';
    }

    if (!EMAIL_LOCAL_ALLOWED_CHARS.test(local.slice(1))) {
        return 'localChars';
    }

    if (!domain.includes('.')) {
        return 'domainDot';
    }

    const labels = domain.split('.');

    // VC02 permite subdominios y no acota la longitud del último segmento.
    if (labels.some((label) => !EMAIL_DOMAIN_LABEL.test(label))) {
        return 'domainLabel';
    }

    return null;
}

export function getContactEmailError(rawValue: unknown): string | null {
    const code = getContactEmailErrorCode(rawValue);

    return code ? CONTACT_EMAIL_MESSAGES[code] : null;
}

export function isValidContactEmail(rawValue: unknown): boolean {
    return getContactEmailErrorCode(rawValue) === null;
}

/* -------------------------------------------------------------------------- */
/* VC02 · Medio de contacto (teléfono celular)                                */
/* -------------------------------------------------------------------------- */

export const CONTACT_PHONE_LENGTH = 10;

export function sanitizeContactPhoneInput(rawValue: unknown): string {
    return String(rawValue ?? '')
        .normalize('NFKC')
        .replace(/\D/g, '')
        .slice(0, CONTACT_PHONE_LENGTH);
}

export function isValidContactPhone(rawValue: unknown): boolean {
    return /^\d{10}$/.test(String(rawValue ?? '').trim());
}

/** El medio de contacto se interpreta como teléfono si comienza con dígito. */
export function isPhoneContactValue(rawValue: unknown): boolean {
    return /^\d/.test(String(rawValue ?? '').trim());
}

export function sanitizeContactInput(rawValue: unknown): string {
    const value = String(rawValue ?? '').trim();

    return isPhoneContactValue(value)
        ? sanitizeContactPhoneInput(value)
        : sanitizeContactEmailInput(value);
}

/**
 * Valida el medio de contacto completo (correo o celular) y regresa un mensaje
 * específico en lugar del genérico "captura un correo o teléfono válido".
 */
export function getContactValueError(rawValue: unknown): string | null {
    const value = String(rawValue ?? '').trim();

    if (!value) {
        return 'Captura un correo electrónico o un teléfono celular.';
    }

    if (isPhoneContactValue(value)) {
        return isValidContactPhone(value)
            ? null
            : 'El teléfono celular debe contener exactamente 10 dígitos.';
    }

    return getContactEmailError(value);
}

export function isValidContactValue(rawValue: unknown): boolean {
    return getContactValueError(rawValue) === null;
}

/* -------------------------------------------------------------------------- */
/* VC07 / VC08 · Texto restringido (Cargo, Funciones, Comentarios)            */
/* -------------------------------------------------------------------------- */

export const RESTRICTED_TEXT_SYMBOLS = '- _ , . ! # $ % & / ( ) = ? ¿ ¡ + @ : ; "';

/**
 * Catálogo VC07/VC08: A-Z, espacios, 0-9 y  -.,!#$%&/()=?¿¡+@:;_"
 * Literal según el documento: no incluye acentos ni ñ.
 */
const RESTRICTED_TEXT_ALLOWED_GLOBAL = /[^A-Za-z0-9\s\-_,.!#$%&/()=?¿¡+@:;"]/g;

export const RESTRICTED_TEXT_LIMITS = {
    position: { min: 2, max: 150 },
    functions: { min: 5, max: 500 },
    comment: { min: 5, max: 1000 },
} as const;

export function sanitizeRestrictedText(
    rawValue: unknown,
    maxLength: number,
    uppercase = false,
): string {
    const normalized = String(rawValue ?? '')
        .normalize('NFC')
        .replace(RESTRICTED_TEXT_ALLOWED_GLOBAL, '')
        .replace(/\s+/g, ' ')
        .replace(/^\s+/, '')
        .slice(0, maxLength);

    return uppercase ? normalized.toUpperCase() : normalized;
}

/** Devuelve los caracteres no permitidos, sin repetir, para poder listarlos. */
export function getRejectedRestrictedTextChars(rawValue: unknown): string[] {
    const matches = String(rawValue ?? '')
        .normalize('NFC')
        .match(RESTRICTED_TEXT_ALLOWED_GLOBAL);

    return matches ? [...new Set(matches)] : [];
}

/**
 * Mensaje detallado: dice cuántos caracteres sobran o faltan y exactamente qué
 * caracteres se rechazaron, en lugar de repetir el catálogo completo.
 */
export function getRestrictedTextError(
    rawValue: unknown,
    minLength: number,
    maxLength: number,
    label: string,
): string | null {
    const text = String(rawValue ?? '').trim();

    if (!text) {
        return null;
    }

    const rejected = getRejectedRestrictedTextChars(text);

    if (rejected.length > 0) {
        return `${label} no admite ${rejected.map((char) => `"${char}"`).join(', ')}. Sólo se permiten letras, números, espacios y los signos ${RESTRICTED_TEXT_SYMBOLS}`;
    }

    if (text.length < minLength) {
        return `${label} debe tener al menos ${minLength} caracteres (llevas ${text.length}).`;
    }

    if (text.length > maxLength) {
        return `${label} no puede exceder ${maxLength} caracteres (llevas ${text.length}).`;
    }

    return null;
}

/* -------------------------------------------------------------------------- */
/* Fecha de nacimiento                                                        */
/* -------------------------------------------------------------------------- */

export const MINIMUM_BIRTH_DATE = '1900-01-01';
export const MINIMUM_AGE_YEARS = 18;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDateInput(date: Date): string {
    const year = String(date.getFullYear()).padStart(4, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function parseDateInput(rawValue: unknown): Date | null {
    const match = ISO_DATE_PATTERN.exec(String(rawValue ?? '').trim());

    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    date.setHours(0, 0, 0, 0);

    const isRealDate =
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day;

    return isRealDate ? date : null;
}

export function getTodayDate(): Date {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return today;
}

/** Última fecha de nacimiento con la que la persona ya cumplió 18 años hoy. */
export function getAdultCutoffDate(): Date {
    const cutoff = getTodayDate();

    cutoff.setFullYear(cutoff.getFullYear() - MINIMUM_AGE_YEARS);

    return cutoff;
}

export function getAdultCutoffDateInput(): string {
    return formatDateInput(getAdultCutoffDate());
}

export type BirthDateErrorCode = 'required' | 'format' | 'belowMinimum' | 'future' | 'minor';

export function getBirthDateErrorCode(rawValue: unknown): BirthDateErrorCode | null {
    const value = String(rawValue ?? '').trim();

    if (!value) {
        return 'required';
    }

    const date = parseDateInput(value);

    if (!date) {
        return 'format';
    }

    if (date.getTime() < (parseDateInput(MINIMUM_BIRTH_DATE) as Date).getTime()) {
        return 'belowMinimum';
    }

    if (date.getTime() > getTodayDate().getTime()) {
        return 'future';
    }

    if (date.getTime() > getAdultCutoffDate().getTime()) {
        return 'minor';
    }

    return null;
}

export function getBirthDateError(rawValue: unknown): string | null {
    const code = getBirthDateErrorCode(rawValue);

    if (!code) {
        return null;
    }

    const messages: Record<BirthDateErrorCode, string> = {
        required: 'La fecha de nacimiento es obligatoria.',
        format: 'Captura una fecha de nacimiento válida con formato dd/mm/aaaa.',
        belowMinimum: `La fecha de nacimiento no puede ser anterior al 01/01/1900. Verifica el año que escribiste.`,
        future: 'La fecha de nacimiento no puede ser posterior a la fecha actual.',
        minor: `El usuario debe tener al menos ${MINIMUM_AGE_YEARS} años cumplidos. La fecha más reciente permitida es ${toDisplayDate(getAdultCutoffDateInput())}.`,
    };

    return messages[code];
}

/**
 * Ajusta un valor escrito a mano al rango permitido. El <input type="date">
 * nativo respeta [min]/[max] en el calendario, pero NO al teclear el año, así
 * que se aplica al salir del campo.
 */
export function clampDateInput(
    rawValue: unknown,
    minimum: string,
    maximum: string,
): string {
    const date = parseDateInput(rawValue);

    if (!date) {
        return '';
    }

    const minimumDate = parseDateInput(minimum);
    const maximumDate = parseDateInput(maximum);

    if (minimumDate && date.getTime() < minimumDate.getTime()) {
        return minimum;
    }

    if (maximumDate && date.getTime() > maximumDate.getTime()) {
        return maximum;
    }

    return formatDateInput(date);
}

export function toDisplayDate(rawValue: unknown): string {
    const date = parseDateInput(rawValue);

    if (!date) {
        return '';
    }

    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function areSameCalendarDates(leftValue: unknown, rightValue: unknown): boolean {
    const left = parseDateInput(leftValue);
    const right = parseDateInput(rightValue);

    if (!left || !right) {
        return false;
    }

    return left.getTime() === right.getTime();
}
