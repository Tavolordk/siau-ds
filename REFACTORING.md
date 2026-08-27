# SIAU — refactorización Clean Code / SOLID (V4)

## Objetivo

Mantener la refactorización funcional de V3 y corregir además la **organización física de la capa de presentación**. La raíz de cada component/page ya no mezcla modelos, estado, presenters, controllers, factories, validators y servicios.

V4 es una reorganización estructural sobre V3: no modifica intencionalmente reglas de negocio, endpoints, verbos HTTP, contratos request/response, HTML ni estilos.

## Resultado de tamaño

| Archivo | Original | V2 | V3 / V4 |
| --- | ---: | ---: | ---: |
| `user-registration-wizard.ts` | 7,502 | 872 | **237** |
| `user-management-page.ts` | 2,577 | 780 | **201** |
| `users-api.repository.ts` | 1,186 | 346 | **346** |

## División física acordada

### User registration wizard

La raíz contiene solamente el componente y sus recursos visuales:

```text
user-registration-wizard/
├── user-registration-wizard.ts
├── user-registration-wizard.html
├── user-registration-wizard.scss
│
├── catalogs/
│   └── user-registration-catalog.coordinator.ts
│
├── controllers/
│   ├── user-registration-edit-scope.controller.ts
│   ├── user-registration-field.controller.ts
│   ├── user-registration-navigation.controller.ts
│   ├── user-registration-profile.controller.ts
│   └── user-registration-structure.controller.ts
│
├── coordinators/
│   ├── user-registration-draft.coordinator.ts
│   ├── user-registration-identity.coordinator.ts
│   ├── user-registration-lifecycle.coordinator.ts
│   ├── user-registration-submission.coordinator.ts
│   └── user-registration-validation.coordinator.ts
│
├── facades/
│   └── user-registration-view.facade.ts
│
├── factories/
│   ├── user-registration-context.factory.ts
│   ├── user-registration-draft.factory.ts
│   └── user-registration-request.factory.ts
│
├── mappers/
│   └── user-registration-edit.mapper.ts
│
├── models/
│   └── user-registration-wizard.models.ts
│
├── presenters/
│   └── user-registration.presenter.ts
│
├── profiles/
│   └── user-profile.matcher.ts
│
├── providers/
│   └── user-registration.providers.ts
│
├── rules/
│   └── user-registration-form.rules.ts
│
├── services/
│   ├── user-registration-draft-profile.service.ts
│   ├── user-registration-notification.service.ts
│   └── user-registration-reset.service.ts
│
├── state/
│   └── user-registration.state.ts
│
└── validators/
    └── user-registration.validator.ts
```

### User management page

La raíz de la page también contiene solamente la page y sus recursos visuales:

```text
user-management-page/
├── user-management-page.ts
├── user-management-page.html
├── user-management-page.scss
│
├── controllers/
│   ├── user-account-operations.controller.ts
│   ├── user-management-data.controller.ts
│   ├── user-management-filter-catalog.controller.ts
│   └── user-management-filter.controller.ts
│
├── models/
│   └── user-management-page.models.ts
│
├── presenters/
│   ├── user-management-filter.presenter.ts
│   └── user-management-page.presenter.ts
│
├── providers/
│   └── user-management.providers.ts
│
└── state/
    ├── user-management-filter.state.ts
    └── user-management-page.state.ts
```

## Regla de ubicación

1. `Component/Page` -> únicamente adaptación Angular, bindings y delegación.
2. `models/` -> interfaces, aliases, enums y constantes de modelo de presentación.
3. `state/` -> estado mutable de la vista.
4. `presenters/` -> estado derivado y formato visual.
5. `controllers/` -> acciones directas de UI y coordinación acotada.
6. `coordinators/` -> flujos que cruzan varias responsabilidades/casos de uso.
7. `facades/` -> fachada de acciones que consume la vista.
8. `factories/` -> construcción de requests, contextos o estructuras.
9. `mappers/` -> transformaciones entre modelos.
10. `validators/` -> validaciones con resultado de negocio/presentación.
11. `rules/` -> reglas deterministas y funciones puras.
12. `services/` -> servicios especializados sin responsabilidad visual directa.
13. `catalogs/` -> coordinación/resolución específica de catálogos.
14. `profiles/` -> reglas y matching específico de perfiles.
15. `providers/` -> composición de dependencias locales del component/page.

No se deben volver a colocar estos archivos en la raíz del component/page sólo por comodidad.

## Verificaciones V4

La V4 se comparó contra V3 normalizando las rutas de importación:

- Archivos lógicos con diferencias de contenido distintas a imports: **0**.
- Archivos lógicos faltantes o adicionales dentro de `src`: **0**.
- Imports TypeScript relativos inexistentes después de mover archivos: **0**.
- Archivos TypeScript revisados mediante transpilación sintáctica: **127**.
- Errores sintácticos/transpilación: **0**.
- Literales de endpoint que contienen `/api/`: mismo multiset que el `src` original recibido (**14 ocurrencias / 13 valores distintos**).
- `user-registration-wizard.html`: sin modificación respecto de V3.
- `user-management-page.html`: sin modificación respecto de V3.
- Lógica V3: sin modificación; V4 sólo cambia ubicación física e imports relativos.

## Limitación de validación

El paquete original contiene únicamente `src/`; no incluye `package.json`, `angular.json`, lockfile ni `node_modules`. Por eso aquí no se puede ejecutar el `ng build` real con las versiones exactas del proyecto.

Al integrarlo en el repositorio completo:

```bash
npm ci
npm run build
npm test
```
