export const AUTH_SYSTEM = 'SIAU';
export const ADMIN_PROFILE_KEYWORD = 'ADMINISTRADOR';
export const DEFAULT_AUTHENTICATED_ROUTE = '/solicitudes';

// El access token vive 15 minutos. Se refresca antes de expirar para evitar 401 en peticiones activas.
export const SESSION_TOKEN_REFRESH_INTERVAL_MS = 14 * 60 * 1000;

// El modal de conservar sesión sólo debe mostrarse si no hay actividad del usuario por 15 minutos.
export const SESSION_INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

// Frecuencia ligera para revisar inactividad y refresh automático.
export const SESSION_MONITOR_INTERVAL_MS = 30 * 1000;