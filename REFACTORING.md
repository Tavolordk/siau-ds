# SIAU — refactorización Clean Code / SOLID (V2)

## Objetivo

Reducir las clases de miles de líneas del `src/` recibido sin alterar intencionalmente reglas de negocio, endpoints, verbos HTTP, contratos públicos de request/response, templates o estilos.

La V2 lleva los dos componentes principales por debajo de 1,000 líneas y evita trasladar el problema a una nueva clase gigante.

## Resultado

| Archivo | Original | V2 |
| --- | ---: | ---: |
| `user-registration-wizard.ts` | 7,502 | **872** |
| `user-management-page.ts` | 2,577 | **780** |
| `users-api.repository.ts` | 1,186 | **346** |

**Máximo actual en todo el árbol TypeScript recibido: 872 líneas. No queda ningún `.ts` de 1,000 líneas o más.**

## Wizard de registro/edición

`UserRegistrationWizard` conserva la superficie que usa el HTML, pero delega responsabilidades a piezas especializadas:

- `user-registration.state.ts`: estado mutable del wizard.
- `user-registration.presenter.ts`: estado derivado y reglas de presentación.
- `user-registration-field.controller.ts`: edición de campos, CURP/RFC y consulta RENAPO iniciada desde campos.
- `user-registration-navigation.controller.ts`: navegación entre pasos y guardado asociado al avance.
- `user-registration-edit-scope.controller.ts`: alcance de edición y exclusividad adscripción/comisión.
- `user-registration-reset.service.ts`: reinicio consistente del estado.
- `user-registration-context.factory.ts`: construcción de contextos para coordinadores.
- `user-registration-form.rules.ts`: reglas puras de normalización, CURP, RFC y fechas.
- `user-registration.validator.ts`: validación del wizard.
- `user-registration-validation.coordinator.ts`: coordinación de validaciones.
- `user-registration-request.factory.ts`: construcción de requests de alta/actualización.
- `user-registration-edit.mapper.ts`: detalle de usuario -> formulario.
- `user-registration-identity.coordinator.ts`: RENAPO + Personal/SAU/ECCC.
- `user-registration-catalog.coordinator.ts`: catálogos y jerarquías.
- `user-registration-structure.controller.ts`: adscripción/comisión.
- `user-registration-profile.controller.ts`: selección y edición de perfiles.
- `user-profile.matcher.ts`: matching de perfiles/sistemas.
- `user-registration-draft.factory.ts`: payloads de borradores.
- `user-registration-draft-profile.service.ts`: perfiles al restaurar borradores.
- `user-registration-draft.coordinator.ts`: persistencia/restauración de borradores.
- `user-registration-notification.service.ts`: notificaciones/correos.
- `user-registration-submission.coordinator.ts`: caso de uso de alta/actualización.

Flujo principal:

`Template -> Wizard -> Controller/Coordinator -> Rules/Validator/Mapper -> RequestFactory -> UsersFacade -> Repository -> HTTP`

## Gestión de usuarios

`UserManagementPage` queda en 780 líneas y delega:

- `user-account-operations.controller.ts`: baja, suspensión, reactivación y desbloqueo.
- `user-management-filter.state.ts`: estado mutable de filtros.
- `user-management-filter.presenter.ts`: filtros derivados, validaciones y textos de presentación.
- `user-management-filter-catalog.controller.ts`: carga y dependencia de catálogos de adscripción/comisión.
- `user-management-filter.controller.ts`: interacción del panel, selección, aplicación y limpieza de filtros.
- `user-management-page.models.ts`: tipos y constantes de la página.

El componente mantiene wrappers pequeños para conservar exactamente los nombres utilizados por el template.

## Acceso HTTP

`UsersApiRepository` queda enfocado en transporte HTTP. La compatibilidad e interpretación de responses vive en:

- `users-api-response.mapper.ts`
- `users-api.contracts.ts`

`users.facade.ts` y `user-record.model.ts` permanecen byte por byte iguales al original recibido.

## Verificaciones realizadas

Comparación contra el `src/` original recibido:

- Literales de endpoint que contienen `/api/`: **14 original / 14 V2, idénticos**.
- Llamadas HTTP detectadas por verbo + expresión de destino: **25 original / 25 V2, idénticas**.
- `user-record.model.ts`: **idéntico byte por byte**.
- `users.facade.ts`: **idéntico byte por byte**.
- `user-registration-wizard.html`: **idéntico byte por byte**.
- `user-management-page.html`: **idéntico byte por byte**.
- Todos los archivos no TypeScript dentro de `src/`: **mismos paths y mismos bytes**.
- API no privada de `UserManagementPage`: **147 miembros original / 147 V2; ninguno faltante**.
- API no privada de `UserRegistrationWizard`: **187 miembros original / 187 V2; ninguno faltante**.
- Imports TypeScript relativos inexistentes: **0**.
- Archivos TypeScript procesados por comprobación de sintaxis/transpilación: **120; 0 errores**.
- Type-check semántico auxiliar de `features/users` y sus dependencias locales usando stubs de Angular/RxJS: **0 errores**.

## Limitación de validación

El ZIP original contiene solamente `src/`; no incluye `package.json`, `angular.json`, lockfile ni `node_modules`. Por eso no es posible ejecutar aquí el `ng build` real con las versiones exactas del proyecto.

Al integrar este `src/` en el repositorio completo se debe ejecutar, como mínimo, el flujo real definido por el proyecto, por ejemplo:

```bash
npm ci
npm run build
npm test
```

## Regla de mantenimiento

Para impedir que SIAU vuelva a clases de miles de líneas:

1. El componente expone bindings y coordina eventos; no implementa transporte ni reglas complejas.
2. Estado mutable -> `State`.
3. Estado derivado/textos de UI -> `Presenter`.
4. Flujos de interacción -> `Controller` / `Coordinator`.
5. Reglas deterministas -> `Rules` / `Validator`.
6. Transformación de datos -> `Mapper` / `Factory`.
7. HTTP -> `Facade` / `Repository`.
8. Evitar nuevas piezas de >1,000 líneas; si una responsabilidad crece, dividirla por caso de uso y no por regiones arbitrarias del archivo.
