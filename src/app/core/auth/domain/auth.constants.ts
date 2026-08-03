export const AUTH_SYSTEM = 'SIAU';
export const ADMIN_PROFILE_KEYWORD = 'ADMINISTRADOR';
export const DEFAULT_AUTHENTICATED_ROUTE = '/solicitudes';

// Mantiene rotando access y refresh token mientras exista actividad del usuario.
export const SESSION_TOKEN_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
export const SESSION_REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

// A los 28 minutos sin actividad inicia el aviso de cierre automático.
export const SESSION_INACTIVITY_PROMPT_MS = 28 * 60 * 1000;

// El aviso dura dos minutos. Al llegar a cero se cierra la sesión automáticamente.
export const SESSION_INACTIVITY_COUNTDOWN_MS = 2 * 60 * 1000;
export const SESSION_INACTIVITY_LIMIT_MS =
    SESSION_INACTIVITY_PROMPT_MS + SESSION_INACTIVITY_COUNTDOWN_MS;

// La última actividad se conserva entre recargas/pestañas. Se limita la escritura
// para no tocar localStorage por cada evento de mouse, sin perder precisión útil.
export const SESSION_ACTIVITY_STORAGE_THROTTLE_MS = 1 * 1000;

// Al volver después de esta pausa, renovar inmediatamente sin esperar al monitor.
export const SESSION_REFRESH_AFTER_IDLE_MS = 2 * 60 * 1000;

// Evita disparar renovaciones consecutivas por movimientos repetidos del usuario.
export const SESSION_MIN_REFRESH_INTERVAL_MS = 30 * 1000;

// Permite iniciar la cuenta regresiva prácticamente al cumplirse los 28 minutos.
// No genera llamadas por sí sola: el refresh conserva su intervalo de 2 minutos.
export const SESSION_MONITOR_INTERVAL_MS = 1000;

// Un fallo transitorio del refresh silencioso NO debe interrumpir al usuario activo:
// se reintenta en los siguientes ticks del monitor y solo se muestra el modal si
// acumulamos varios fallos consecutivos o el token ya está por morir.
export const SESSION_REFRESH_MAX_SILENT_FAILURES = 3;
export const SESSION_REFRESH_GIVE_UP_BEFORE_EXPIRY_MS = 30 * 1000;

// Candado entre pestañas para que solo una renueve el token (los refresh tokens rotan;
// si dos pestañas renuevan a la vez, una consume un token ya usado y falla).
export const SESSION_REFRESH_LOCK_TTL_MS = 20 * 1000;