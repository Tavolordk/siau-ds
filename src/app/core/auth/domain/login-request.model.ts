export type LoginContactMethod = 'correo' | 'telefono';

export interface LoginRequest {
    username: string;
    contact: string;
    captcha: string;
    captchaToken?: string;
}
