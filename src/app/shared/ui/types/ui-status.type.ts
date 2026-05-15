/**
 * Semantic tone for badges and status indicators.
 *
 * Mapped to real states observed in the SIAU mockups:
 *   - `success`: Activo, Registrado, Vigente
 *   - `warning`: Suspendido, Expirado
 *   - `danger`:  Inhabilitado, errores duros
 *   - `info`:    Administrador, Enlace Institucional, Supervisor Estatal (roles)
 *   - `neutral`: Usuario, No registrado (estado base, sin connotación)
 *
 * NOTE: the mapping from a domain status (e.g. `UserStatus.ACTIVE`) to a
 * `UiTone` happens in a feature-level mapper, NOT inside the component.
 * The DS only knows about visual tones.
 */
export type UiTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';