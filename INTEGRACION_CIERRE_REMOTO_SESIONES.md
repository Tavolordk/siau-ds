# Integración de cierre remoto de sesiones (SignalR)

Esta integración toma como referencia `siau-sesion-revocada-demo` y la adapta al Angular real de SIAU.

## Objetivo

El cierre remoto no vive únicamente en la pantalla de administración. El listener de SignalR se inicializa desde la raíz de la aplicación y queda asociado al ciclo de vida de la sesión autenticada, por lo que cualquier usuario conectado puede recibir `SesionRevocada` aunque esté navegando en Usuarios, Solicitudes, Administración u otro módulo.

## Contrato usado

### Revocación desde administración

```http
POST /api/v1/sesiones/{usuarioId}/revocar
Authorization: Bearer <JWT_ADMIN>
Content-Type: application/json
```

Suspensión:

```json
{
  "motivo": "SUSPENSION_CUENTA"
}
```

Baja:

```json
{
  "motivo": "BAJA_CUENTA"
}
```

En el SIAU, la revocación se dispara después de que la operación existente de **Suspensión** o **Baja** termina correctamente. Reactivación y desbloqueo no revocan la sesión.

Si el cambio de estado ya fue aplicado pero falla la llamada de revocación, no se repite ni se revierte la baja/suspensión: el modal informa que el estado sí cambió y que falló únicamente el cierre remoto.

### Listener global

Hub:

```text
/hubs/sesiones
```

Evento:

```text
SesionRevocada
```

Payload esperado:

```json
{
  "usuarioId": 123,
  "motivo": "SUSPENSION_CUENTA",
  "mensaje": "La sesión fue revocada.",
  "fechaUtc": "2026-09-04T18:00:00Z"
}
```

Cuando el usuario actual recibe el evento:

1. se detiene el monitor local de sesión;
2. se limpia la sesión/token del navegador;
3. se desconecta SignalR;
4. se navega a `/login` usando `replaceUrl`;
5. se muestra en login el mensaje enviado por backend (o un mensaje de respaldo según el motivo).

SignalR usa el JWT vigente mediante `accessTokenFactory`, tiene reconexión automática y además reintenta la conexión inicial si el Hub no estaba disponible al momento de iniciar sesión.

## Archivos principales

- `src/app/core/auth/data-access/session-revocation-signalr.service.ts`
  - conexión y listener de `/hubs/sesiones`;
  - evento `SesionRevocada`;
  - token vigente;
  - reconexión y reintento inicial.
- `src/app/core/auth/data-access/session-revocation.api.ts`
  - `POST /api/v1/sesiones/{usuarioId}/revocar`.
- `src/app/core/auth/domain/session-revocation.model.ts`
  - modelos y motivos soportados.
- `src/app/core/auth/application/auth.facade.ts`
  - conecta/desconecta el Hub según exista sesión autenticada;
  - procesa el cierre remoto de forma global.
- `src/app/app.ts`
  - inicializa `AuthFacade` desde la raíz para que el listener no dependa de un módulo concreto.
- `src/app/features/users/presentation/pages/user-management-page/accounts/user-account-operations.controller.ts`
  - revoca después de Baja/Suspensión exitosas.
- `src/app/core/http/sesiones-api-base-url.token.ts`
  - base URL lógica `/sesiones-api`.
- `proxy.conf.json`
  - proxy de desarrollo a `http://10.237.3.12:62374` con WebSockets habilitados.

## Requisito del backend

Debe estar mapeado el Hub:

```csharp
app.MapHub<SesionesHub>("/hubs/sesiones");
```

El identificador que devuelve `SiauUserIdProvider` debe ser exactamente el mismo `usuarioId` utilizado por el endpoint de administración y por:

```csharp
Clients.User(usuarioId.ToString())
```

Si el `POST` devuelve 200 pero el usuario no recibe `SesionRevocada`, revisar primero el claim del JWT utilizado por `SiauUserIdProvider`.

## Proxy y despliegue

En desarrollo `npm start` usa `proxy.conf.json` y `/sesiones-api` se reescribe hacia `http://10.237.3.12:62374`.

En el ambiente desplegado también debe existir una ruta equivalente hacia el servicio de sesiones. Para SignalR no basta con HTTP normal: el proxy/reverse proxy debe permitir el upgrade de WebSocket para la ruta del Hub. Si infraestructura publica el servicio bajo otra URL, modificar `SESIONES_API_BASE_URL` o proveer ese token con la URL correspondiente al ambiente.

## Prueba recomendada

Este proyecto ya tiene protección de una sola pestaña propietaria de la sesión. Por eso, para probar administrador y usuario simultáneamente, usar **dos perfiles de navegador distintos** o **ventana normal + incógnito**, no dos pestañas normales del mismo perfil.

1. Instalar dependencias con `npm install` (esto también sincroniza `package-lock.json` con la nueva dependencia de SignalR).
2. Iniciar Angular con `npm start`.
3. Perfil/ventana A: iniciar sesión como el usuario objetivo y navegar a cualquier módulo, por ejemplo Solicitudes.
4. Perfil/ventana B: iniciar sesión como administrador.
5. Desde Usuarios, suspender o dar de baja al usuario del perfil A.
6. Verificar en Network que el administrador ejecute:
   - la operación de cuenta existente;
   - después, `POST /sesiones-api/api/v1/sesiones/{usuarioId}/revocar`.
7. El perfil A debe recibir `SesionRevocada` sin importar la ruta actual, limpiar su sesión y terminar en `/login`.
8. Verificar que al reactivar o desbloquear una cuenta no se llame al endpoint de revocación.

## Dependencia nueva

```json
"@microsoft/signalr": "9.0.19"
```

La versión es la misma usada por la demo de referencia. El ZIP fuente no incluía el lock de la demo y este entorno no tiene acceso al registro npm, por lo que el `package-lock.json` original de SIAU se conserva sin regenerar. Antes de usar `npm ci`, ejecutar una vez `npm install` en un entorno con acceso al registro y versionar el lock resultante.
