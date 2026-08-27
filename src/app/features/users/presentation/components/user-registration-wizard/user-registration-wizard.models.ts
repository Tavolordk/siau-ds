import { SiauSelectOption } from '../../../../../shared/ui';

export type AccountStatus = 'active' | 'baja' | 'suspended' | 'blocked';
export type UserWizardMode = 'create' | 'edit';
export type RenapoLookupStatus = 'idle' | 'loading' | 'success' | 'not-found' | 'error';
export type CurpValidationStatus = string;
export type CurpValidationMessageTone = 'loading' | 'success' | 'warning' | 'error';
export type StructureProfileLookupStatus = 'idle' | 'loading' | 'success' | 'error';
export type ProfileOrigin = 'adscripcion' | 'comision';

export type WizardStepId =
    | 'personal-data'
    | 'assignment'
    | 'commission'
    | 'documents'
    | 'contact'
    | 'profiles'
    | 'account';

export interface UserRegistrationForm {
    cuip: string;
    policeIdentificationKey: string;
    curp: string;
    rfc: string;
    firstName: string;
    lastName: string;
    secondLastName: string;
    birthDate: string;
    gender: string;
    civilStatus: string;

    institutionType: string;
    entity: string;
    municipality: string;
    institution: string;
    decentralizedBody: string;
    administrativeUnit: string;
    position: string;
    functions: string;
    admissionDate: string;
    employeeNumber: string;

    commissionEnabled: boolean;
    commissionInstitutionType: string;
    commissionInstitution: string;
    commissionEntity: string;
    commissionMunicipality: string;
    commissionDecentralizedBody: string;
    commissionAdministrativeUnit: string;
    commissionAdmissionDate: string;

    email: string;
    phone: string;
    profiles: string[];

    username: string;
    password: string;
    confirmPassword: string;
    accountStatus: AccountStatus;
    comment: string;
}

export interface IdentitySnapshot {
    readonly curp: string;
    readonly rfc: string;
    readonly birthDate: string;
}

export interface CurpValidationSummary {
    readonly personal: string;
    readonly sau: string;
    readonly eccc: string;
    readonly expirationDate: string;
    readonly message: string;
    readonly messageTone: CurpValidationMessageTone;
}

export interface UserProfileOption {
    readonly value: string;
    readonly label: string;
    readonly description: string;
}

export interface AssignedSystemProfile {
    readonly id: string;
    readonly system: string;
    readonly systemLabel: string;
    readonly role: string;
    readonly roleLabel: string;
    /** Origen funcional que devuelve el detalle: adscripción o comisión. */
    readonly origin: ProfileOrigin;
    /** Descripción que devuelve el GET de borradores; se usa para resolver clavePerfil. */
    readonly roleDescription?: string;
}

export interface ProfileResetNotice {
    readonly origin: ProfileOrigin;
    readonly message: string;
}

export interface StructureEmailSnapshot {
    readonly adscriptionSignature: string;
    readonly adscriptionDescription: string;
    readonly commissionSignature: string;
    readonly commissionDescription: string;
}

export interface SystemProfileFallbackOption extends SiauSelectOption {
    /** descripcionPerfil del catálogo sistema_perfiles. */
    readonly description: string;
}

export type StructureSelectionLevel =
    | 'institution'
    | 'dependency'
    | 'decentralized-body'
    | 'administrative-unit';

export interface StructureSelection {
    readonly field: keyof UserRegistrationForm;
    readonly level: StructureSelectionLevel;
    readonly value: string;
    readonly catalogId: number | null;
}

export interface StructureProfileCatalog {
    readonly systems: readonly SiauSelectOption[];
    readonly rolesBySystem: Readonly<Record<string, readonly SiauSelectOption[]>>;
}

export interface ValidationMessage {
    readonly key: string;
    readonly message: string;
}

export interface SaveSuccessModalState {
    readonly isUpdate: boolean;
    readonly message: string;
    readonly userNumber: string;
    readonly account: string;
    readonly fullName: string;
    readonly system: string;
    readonly hasAccessEmail: boolean;
    readonly accessEmail: string;
    readonly accessPhone: string;
    readonly emailAccepted: boolean;
    readonly emailStatus: string;
    readonly emailMessage: string;
    readonly emailReference: string;
}

export const DEFAULT_NORMAL_SYSTEM_ID = 1;
export const DEFAULT_NORMAL_PROFILE_ID = 267;
export const NO_APLICA_VALUE = '__NO_APLICA__';
export const NO_APLICA_OPTION: SiauSelectOption = {
    value: NO_APLICA_VALUE,
    label: 'NO APLICA',
};
/**
 * Ids de cat_tipo_estructura usados por sp_cat_estructura_organizacional_obtener.
 * Los OAD y las Unidades Administrativas son hermanos: ambos cuelgan directo de
 * la institución (padreId = institución). Una UA también puede colgar de un OAD
 * (UA_OAD, las "nietas"), y para eso se vuelve a consultar con padreId = OAD.
 */
export const TIPO_ESTRUCTURA_ORGANO_DESCONCENTRADO = 2;
export const TIPO_ESTRUCTURA_UNIDAD_ADMINISTRATIVA = 4;

/**
 * El <option> placeholder del select nativo está deshabilitado, así que se
 * agrega una opción explícita para poder deshacer la selección y liberar el
 * nivel hermano que quedó bloqueado.
 */
export const CLEAR_SELECTION_VALUE = '__SIN_SELECCION__';
export const CLEAR_SELECTION_OPTION: SiauSelectOption = {
    value: CLEAR_SELECTION_VALUE,
    label: 'SIN SELECCIÓN',
};

export const LOCKED_BY_ADMINISTRATIVE_UNIT_HINT =
    'Bloqueado: ya elegiste una unidad administrativa de la institución.';
export const SCOPED_BY_DECENTRALIZED_BODY_HINT =
    'Solo se muestran las unidades del órgano seleccionado.';

export const DUPLICATE_COMMISSION_STRUCTURE_MESSAGE =
    'La comisión no puede coincidir con la adscripción en su último nivel seleccionado. Elige otra institución, órgano o unidad administrativa.';

export const CREATE_WIZARD_STEPS: readonly WizardStepId[] = [
    'personal-data',
    'assignment',
    'commission',
    'contact',
    'profiles',
];

export const ALL_WIZARD_STEPS: readonly WizardStepId[] = [
    ...CREATE_WIZARD_STEPS,
    'account',
];

export const INITIAL_FORM: UserRegistrationForm = {
    cuip: '',
    policeIdentificationKey: '',
    curp: '',
    rfc: '',
    firstName: '',
    lastName: '',
    secondLastName: '',
    birthDate: '',
    gender: '',
    civilStatus: '',

    institutionType: '',
    entity: '',
    municipality: '',
    institution: '',
    decentralizedBody: '',
    administrativeUnit: '',
    position: '',
    functions: '',
    admissionDate: '',
    employeeNumber: '',

    commissionEnabled: false,
    commissionInstitutionType: '',
    commissionInstitution: '',
    commissionEntity: '',
    commissionMunicipality: '',
    commissionDecentralizedBody: '',
    commissionAdministrativeUnit: '',
    commissionAdmissionDate: '',

    email: '',
    phone: '',
    profiles: [],

    username: '',
    password: '',
    confirmPassword: '',
    accountStatus: 'active',
    comment: '',
};

