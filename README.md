# SIAU Design System — Base

Sistema de diseño base para el **Sistema Integral de Administración de Usuarios (SIAU)** de la SSPC.

## Stack

- **Angular 21** (standalone components, signals, zoneless)
- **Angular Material 21** (CDK + M3 tokens; usado selectivamente, no como skin)
- **Tailwind CSS 4** (utility layer; configurado vía `@tailwindcss/postcss`)
- **TypeScript estricto**

## Arquitectura (Clean Architecture aplicada al frontend)

```
src/app/shared/ui/                  ← Presentation layer (DS puro)
├── tokens/                         ← Design tokens (colores, spacing, type)
│   └── _tokens.scss                ← CSS custom properties (SSOT visual)
├── types/                          ← Contracts (types, enums, interfaces)
│   ├── ui-variant.type.ts
│   ├── ui-size.type.ts
│   └── ui-status.type.ts
└── components/                     ← Componentes presentacionales
    ├── button/
    ├── input/
    ├── select/
    └── badge/
```

### Principios

1. **Los componentes del DS NO conocen el dominio.** No hay `UserService`, no hay `User`. Solo primitivas visuales (`label`, `variant`, `status`).
2. **Una sola fuente de verdad para tokens.** Si cambia el morado institucional, se cambia en `_tokens.scss` y todo el sistema se actualiza.
3. **Inputs tipados con `input.required<T>()`** (signal inputs de Angular 17+). Outputs con `output<T>()`.
4. **Sin dependencias circulares** entre componentes. El `Badge` no usa el `Button`, etc.
5. **`ChangeDetectionStrategy.OnPush`** en todos los componentes (default en zoneless, pero explícito por claridad).
6. **Accesibilidad de fábrica**: labels, ARIA, focus visible, contraste WCAG AA.

### Lo que NO está acá (de propósito)

- Lógica de negocio (eso vive en `features/users/...`).
- HTTP / repositorios (capa `infrastructure/`).
- Casos de uso (`application/`).
- Stores / state management.

El DS es la capa más interna y estable. Todo lo demás depende de él, nunca al revés.

## Convenciones

- Selector prefix: `siau-`
- Inputs: nombres claros sin prefijo `i` (`label`, no `iLabel`).
- Eventos: nombre del hecho ocurrido (`valueChange`, no `onChange`).
- Tailwind para layout y espaciado; tokens CSS para color y tipografía corporativa.
