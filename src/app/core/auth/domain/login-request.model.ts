export interface LoginRequest {
    username: string;
    password: string;
    captcha: string;
    captchaToken?: string;
}