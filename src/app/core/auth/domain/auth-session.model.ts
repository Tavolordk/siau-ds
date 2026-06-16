import { LoginContactMethod } from './login-request.model';

export interface AuthUser {
    id: string;
    name: string;
    username: string;
    role: string;
    initials: string;
    requiresTwoFactor: boolean;
    profiles: string[];
}

export interface AuthSession {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
    expiresAtUtc: string;
    sid: string;
    jti: string;
    sistema: string;
    audience: string | null;
    profileVersion: number;
    perfiles: string[];
    issuedAt: string;
    user: AuthUser;
}

export interface PendingAuthChallenge {
    username: string;
    contact: string;
    contactMethod: LoginContactMethod;
    contactMethodLabel: string;
    maskedContact: string | null;
    sistema: string;
    audience: string | null;
    profileVersion: number;
    perfiles: string[];
    codeId: string | null;
    issuedAt: string;
}

export interface SessionValidation {
    active: boolean;
    sid: string | null;
    jti: string | null;
    usuarioId: number;
    sistema: string | null;
    audience: string | null;
    profileVersion: number;
    expiresAtUtc: string | null;
    perfiles: string[];
}