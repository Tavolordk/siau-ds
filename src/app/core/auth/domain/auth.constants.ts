export const AUTH_SYSTEM = 'SIAU';
export const ADMIN_PROFILE_KEYWORD = 'ADMINISTRADOR';
export const DEFAULT_AUTHENTICATED_ROUTE = '/solicitudes';

// Renovar antes del límite de inactividad para evitar que ambos eventos choquen al minuto 15.
export const SESSION_TOKEN_REFRESH_INTERVAL_MS = 14 * 60 * 1000;

// Si el token ya está cerca de expirar, renovar aunque todavía no hayan pasado 14 minutos.
export const SESSION_REFRESH_BEFORE_EXPIRY_MS = 60 * 1000;

// Si pasan 15 minutos sin actividad visible del usuario, se muestra el modal.
export const SESSION_INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

// Frecuencia ligera para revisar inactividad, pestaña oculta y refresh automático.
export const SESSION_MONITOR_INTERVAL_MS = 30 * 1000;