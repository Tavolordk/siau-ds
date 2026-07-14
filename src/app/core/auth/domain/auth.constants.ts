export const AUTH_SYSTEM = 'SIAU';
export const ADMIN_PROFILE_KEYWORD = 'ADMINISTRADOR';
export const DEFAULT_AUTHENTICATED_ROUTE = '/solicitudes';

// TEMPORAL PARA PRUEBAS: renovar cada 10 minutos para inspeccionar el PATCH en Network.
// Después de validar el flujo, regresar este valor a 13 * 60 * 1000.
export const SESSION_TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
export const SESSION_REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
// Si pasan 15 minutos sin actividad visible del usuario, se muestra el modal.
export const SESSION_INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

// Frecuencia ligera para revisar inactividad, pestaña oculta y refresh automático.
export const SESSION_MONITOR_INTERVAL_MS = 30 * 1000;

// Un fallo transitorio del refresh silencioso NO debe interrumpir al usuario activo:
// se reintenta en los siguientes ticks del monitor y solo se muestra el modal si
// acumulamos varios fallos consecutivos o el token ya está por morir.
export const SESSION_REFRESH_MAX_SILENT_FAILURES = 3;
export const SESSION_REFRESH_GIVE_UP_BEFORE_EXPIRY_MS = 30 * 1000;

// Candado entre pestañas para que solo una renueve el token (los refresh tokens rotan;
// si dos pestañas renuevan a la vez, una consume un token ya usado y falla).
export const SESSION_REFRESH_LOCK_TTL_MS = 20 * 1000;