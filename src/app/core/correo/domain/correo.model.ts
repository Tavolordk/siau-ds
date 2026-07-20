export interface CorreoAttachmentRequest {
    readonly fileName: string;
    readonly contentType: string;
    readonly contentBase64: string;
}

export interface CorreoRequest {
    readonly from?: string | null;
    readonly fromName?: string | null;
    readonly to: readonly string[];
    readonly cc?: readonly string[] | null;
    readonly bcc?: readonly string[] | null;
    readonly subject: string;
    readonly body: string;
    readonly isHtml: boolean;
    readonly attachments?: readonly CorreoAttachmentRequest[] | null;
}

export interface CorreoResponse {
    readonly correoId?: string | null;
    readonly estado?: string | null;
    readonly totalDestinatarios?: number | null;
    readonly fechaAceptacionUtc?: string | null;
}

export interface CorreoResponseApiResponse {
    readonly success?: boolean;
    readonly message?: string | null;
    readonly traceId?: string | null;
    readonly data?: CorreoResponse | null;
}

export interface CorreoDeliveryResult {
    readonly accepted: boolean;
    readonly message: string;
    readonly status: string | null;
    readonly correoId: string | null;
    readonly recipientCount: number;
    readonly acceptedAtUtc: string | null;
    readonly traceId: string | null;
}