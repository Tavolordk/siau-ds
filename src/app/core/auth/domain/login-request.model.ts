export type LoginContactMethod = 'correo' | 'telegram';

export interface LoginRequest {
    username: string;
    contact: string;
    captcha: string;
    captchaToken?: string;
}