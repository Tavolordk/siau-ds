import { Injectable } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';
import { AuthSession, AuthUser, PendingAuthChallenge } from '../domain/auth-session.model';
import { LoginRequest } from '../domain/login-request.model';

const MOCK_CAPTCHA = 'PZEJ5N';
const MOCK_CODE = '123456';

interface MockUserRecord {
    username: string;
    password: string;
    user: AuthUser;
}

const MOCK_USERS: MockUserRecord[] = [
    {
        username: 'admin',
        password: 'admin123',
        user: {
            id: '1',
            name: 'Octavio Olea',
            username: 'admin',
            role: 'Administrador',
            initials: 'OO',
            requiresTwoFactor: true,
        },
    },
    {
        username: 'usuario',
        password: 'usuario123',
        user: {
            id: '2',
            name: 'Usuario Operativo',
            username: 'usuario',
            role: 'Operador',
            initials: 'UO',
            requiresTwoFactor: false,
        },
    },
];

@Injectable({ providedIn: 'root' })
export class AuthApi {
    login(request: LoginRequest): Observable<AuthSession | PendingAuthChallenge> {
        const username = request.username.trim().toLowerCase();
        const captcha = request.captcha.trim().toUpperCase();

        if (!username || !request.password || !captcha) {
            return throwError(() => new Error('Completa usuario, contraseña y captcha.')).pipe(delay(250));
        }

        if (captcha !== MOCK_CAPTCHA) {
            return throwError(() => new Error('El captcha no coincide. Intenta nuevamente.')).pipe(delay(250));
        }

        const foundUser = MOCK_USERS.find(
            (record) => record.username === username && record.password === request.password,
        );

        if (!foundUser) {
            return throwError(() => new Error('Usuario o contraseña incorrectos.')).pipe(delay(250));
        }

        if (foundUser.user.requiresTwoFactor) {
            return of({
                username: foundUser.username,
                issuedAt: new Date().toISOString(),
            }).pipe(delay(350));
        }

        return of(this.createSession(foundUser.user)).pipe(delay(350));
    }

    verifyCode(code: string, challenge: PendingAuthChallenge | null): Observable<AuthSession> {
        if (!challenge) {
            return throwError(() => new Error('No hay una verificación pendiente. Inicia sesión otra vez.')).pipe(
                delay(250),
            );
        }

        if (code !== MOCK_CODE) {
            return throwError(() => new Error('El código de verificación es incorrecto.')).pipe(delay(250));
        }

        const foundUser = MOCK_USERS.find((record) => record.username === challenge.username);

        if (!foundUser) {
            return throwError(() => new Error('No se encontró el usuario de la verificación.')).pipe(delay(250));
        }

        return of(this.createSession(foundUser.user)).pipe(delay(350));
    }

    private createSession(user: AuthUser): AuthSession {
        return {
            accessToken: 'mock-jwt-token-for-siau-frontend-only',
            issuedAt: new Date().toISOString(),
            user,
        };
    }
}