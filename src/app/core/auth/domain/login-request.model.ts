export type LoginContactMethod = 'correo' | 'telegram';

export interface LoginRequest {
    username: string;
    contactMethod: LoginContactMethod;
    contact: string;
    captcha: string;
    captchaToken?: string;
}