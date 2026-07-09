export const AUTH_SYSTEM = 'SIAU';
export const ADMIN_PROFILE_KEYWORD = 'ADMINISTRADOR';
export const DEFAULT_AUTHENTICATED_ROUTE = '/solicitudes';

// Renovar con margen suficiente antes del límite de 15 min, considerando que los
// setInterval en pestañas en segundo plano se limitan a ~1 tick por minuto.
export const SESSION_TOKEN_REFRESH_INTERVAL_MS = 13 * 60 * 1000;

// Si el token ya está cerca de expirar, renovar aunque todavía no se cumpla el intervalo.
export const SESSION_REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000;

// Si pasan 15 minutos sin actividad visible del usuario, se muestra el modal.
export const SESSION_INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

// Frecuencia ligera para revisar inactividad, pestaña oculta y refresh automático.
export const SESSION_MONITOR_INTERVAL_MS = 30 * 1000;