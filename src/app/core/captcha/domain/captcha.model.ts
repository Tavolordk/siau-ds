export interface CaptchaChallenge {
    id: string;
    imageBase64: string;
    imageDataUrl: string;
    ttlSeconds: number;
    expiresAt: Date;
}

export interface CaptchaGenerationOptions {
    colorFondoHex?: string;
    ttlSegundos?: number;
    longitud?: number;
}

export interface CaptchaVerifyCommand {
    id: string;
    answer: string;
}

export interface CaptchaVerification {
    ok: boolean;
    token: string | null;
}