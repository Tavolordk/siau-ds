# SIAU — refactorización Clean Code / SOLID (V3)

## Objetivo

Reducir las clases de presentación que originalmente concentraban miles de líneas sin alterar intencionalmente reglas de negocio, endpoints, verbos HTTP, contratos públicos de request/response, templates ni estilos.

La V3 convierte los dos componentes principales en adaptadores Angular pequeños: exponen los mismos bindings del HTML y delegan estado, presentación y casos de uso a piezas específicas.

## Resultado

| Archivo | Original | V2 | V3 |
| --- | ---: | ---: | ---: |
| `user-registration-wizard.ts` | 7,502 | 872 | **237** |
| `user-management-page.ts` | 2,577 | 780 | **201** |
| `users-api.repository.ts` | 1,186 | 346 | **346** |

Las piezas agregadas en V3 también son pequeñas:

| Pieza | Líneas |
| --- | ---: |
| `user-registration-view.facade.ts` | 202 |
| `user-registration-lifecycle.coordinator.ts` | 183 |
| `user-management-data.controller.ts` | 217 |
| `user-management-page.presenter.ts` | 110 |
| `user-management-page.state.ts` | 27 |

No se trasladaron las ~800 líneas de cada componente a una única clase nueva.

## Wizard de registro/edición

`UserRegistrationWizard` ahora se limita a:

- declarar inputs/outputs Angular;
- exponer al template signals del `State` y cálculos del `Presenter`;
- conectar el ciclo de vida del modal;
- delegar los eventos del template.

Nuevas responsabilidades de V3:

- `user-registration-lifecycle.coordinator.ts`: apertura, hidratación de edición, restauración de borrador y refresco reactivo de perfiles.
- `user-registration-view.facade.ts`: fachada de acciones del template; delega a los controllers/coordinators existentes.
- `user-registration.providers.ts`: composición de dependencias locales del modal.

Las piezas ya existentes siguen separando:

- estado mutable -> `user-registration.state.ts`;
- estado derivado -> `user-registration.presenter.ts`;
- campos/CURP/RFC -> `user-registration-field.controller.ts`;
- navegación -> `user-registration-navigation.controller.ts`;
- adscripción/comisión -> `user-registration-structure.controller.ts`;
- perfiles -> `user-registration-profile.controller.ts`;
- identidad RENAPO/Personal/SAU/ECCC -> `user-registration-identity.coordinator.ts`;
- catálogos -> `user-registration-catalog.coordinator.ts`;
- borradores -> `user-registration-draft.coordinator.ts`;
- validación -> `user-registration.validator.ts` + `user-registration-validation.coordinator.ts`;
- requests -> `user-registration-request.factory.ts`;
- alta/actualización -> `user-registration-submission.coordinator.ts`;
- notificaciones -> `user-registration-notification.service.ts`.

Flujo principal:

`Template -> Wizard (237 líneas) -> ViewFacade -> Controller/Coordinator -> Rules/Mapper/Factory -> UsersFacade -> Repository -> HTTP`

## Gestión de usuarios

`UserManagementPage` queda en 201 líneas y conserva la misma superficie usada por el HTML.

V3 agrega:

- `user-management-page.state.ts`: estado de tabla, paginación, borradores y wizard.
- `user-management-page.presenter.ts`: paginador, formato de borradores y tonos visuales.
- `user-management-data.controller.ts`: listado, búsqueda, paginación, borradores y carga del detalle.
- `user-management.providers.ts`: composición de dependencias de alcance local.

Las operaciones de cuenta continúan aisladas en `user-account-operations.controller.ts` y los filtros siguen separados en State/Presenter/Controllers.

## Contratos preservados

La comparación se realizó contra el `src/` original recibido, no solamente contra V2.

- Expresiones de endpoint con `/api/` en literales de una línea: **21 original / 21 V3; idénticas**.
- Llamadas HTTP detectadas por verbo + expresión de destino: **26 original / 26 V3; idénticas**.
- `user-record.model.ts`: **idéntico byte por byte**.
- `users.facade.ts`: **idéntico byte por byte**.
- `user-registration-wizard.html`: **idéntico byte por byte**.
- `user-management-page.html`: **idéntico byte por byte**.
- API no privada de `UserRegistrationWizard`: **187 miembros V2 / 187 V3; ninguno faltante**.
- API no privada de `UserManagementPage`: **147 miembros V2 / 147 V3; ninguno faltante**.
- Imports TypeScript relativos inexistentes: **0**.
- Comprobación sintáctica/transpilación de todos los `.ts`: **0 errores**.
- Type-check semántico auxiliar con stubs de Angular/RxJS: **0 errores**.

## Sobre el tamaño de archivos

V3 ataca específicamente las clases de presentación que motivaron el refactor. Existen todavía servicios especializados de más de 500 líneas —por ejemplo validación, mapeo tolerante de responses y autenticación— que ya no forman parte de los componentes principales. No se dividieron sólo para cumplir una cifra: una siguiente fase debe separarlos por dominio/caso de uso si se desea imponer una política global de tamaño.

La regla recomendada para componentes/páginas es aproximadamente 150–400 líneas y que el componente actúe como adaptador de presentación, no como contenedor de reglas de negocio.

## Limitación de validación

El ZIP original contiene sólo `src/`; no incluye `package.json`, `angular.json`, lockfile ni `node_modules`. Por eso no se puede ejecutar aquí el `ng build` real con las versiones exactas del proyecto.

Al integrar este `src/` en el repositorio completo se debe ejecutar el flujo real del proyecto, como mínimo:

```bash
npm ci
npm run build
npm test
```

## Regla de mantenimiento

1. Component/Page -> inputs, outputs, bindings y delegación.
2. Estado mutable -> `State`.
3. Estado derivado/formato visual -> `Presenter`.
4. Casos de uso de UI -> `Controller` / `Coordinator` / `Facade`.
5. Reglas deterministas -> `Rules` / `Validator`.
6. Transformaciones -> `Mapper` / `Factory`.
7. Transporte -> `Facade` de aplicación / `Repository`.
8. No extraer código sólo para bajar líneas: cada archivo nuevo debe representar una responsabilidad nombrable y comprobable.
