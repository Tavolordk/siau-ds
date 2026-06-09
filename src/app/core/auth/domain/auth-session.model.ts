export interface AuthUser {
    id: string;
    name: string;
    username: string;
    role: string;
    initials: string;
    requiresTwoFactor: boolean;
}

export interface PendingAuthChallenge {
    username: string;
    issuedAt: string;
}

export interface AuthSession {
    accessToken: string;
    user: AuthUser;
    issuedAt: string;
}