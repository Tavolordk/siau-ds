export interface RenapoCurpRequest {
    readonly Curp: string;
}

export interface RenapoCurpData {
    readonly curp: string;
    readonly nombre: string;
    readonly primerApellido: string;
    readonly segundoApellido: string;
    readonly nombreCompleto: string;
    readonly sexo: string;
    readonly fechaNacimiento: string;
    readonly entidadNacimiento: string;
    readonly nacionalidad: string;
    readonly estatusCurp: string;
    readonly mensajeRenapo: string;
    readonly statusOperacion: string;
    readonly tipoError: string;
    readonly codigoError: string;
    readonly sessionId: string;
    readonly cveEntidadEmisora: string;
    readonly cveEntidadNacimiento: string;
    readonly documentoProbatorio: string;
    readonly anioRegistro: string;
    readonly numeroActa: string;
}

export interface RenapoCurpResponse {
    readonly exito: boolean;
    readonly mensaje: string;
    readonly datos: RenapoCurpData | null;
    readonly errores: readonly unknown[];
}