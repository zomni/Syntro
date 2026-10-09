# Roadmap

## Fase 1 — Fundación

- Repositorio y documentación (SPEC 11).
- Configuración, branding y modelo de campus (SPECs 01–03).
- Identificadores internos (SPEC 10).

## Fase 2 — Capa de Datos

- Entidades núcleo y modelo de datos (SPECs 13–14).
- Inicialización del esquema y primera ejecución (SPEC 04).
- Roles y autenticación (SPEC 15).

## Fase 3 — Inventario y Telemetría

- Inventario, importación y reconciliación (SPEC 18).
- Categorías configurables (SPEC 08).
- Telemetría de red (SPECs 07, 21).
- Formulario de entrega (SPECs 06, 22).

## Fase 4 — Admin y Mapa

- Puntos de interés (SPEC 09). (HECHO)
- Editores administrativos del mapa (SPEC 20). (HECHO)
- Auditoría y respaldos (SPEC 23). (HECHO)
- Editor de salas: salas manuales, multiselección unificada (toggle Ctrl+click, marquee),
  rotación conforme en espacio de píxeles, backend `ManualRoom` +
  `/api/manual-rooms`, renderizado por piso en el mapa principal. (HECHO,
  SPEC 13/14/17/20; pendiente revisión del usuario en vivo)

## Fase 5 — Endurecimiento

- Defaults de seguridad (SPEC 24). (HECHO)
- Despliegue y primera ejecución (SPEC 25). (HECHO)
- Cobertura de tests (SPEC 26). (HECHO — backend 79, frontend 64)

## Fase 6 — Producto

- Organizaciones multi-tenant + sitios, `superadmin`, scoping por campus y schedules de
  telemetría (HECHO; pendientes: tests dedicados, agrupar selector por org en frontend).
- Decisiones de producto (SPECs 12–27).
- Refresh visual/branding: tema con variables CSS aplicado en frontend (SPEC 02 restante), paleta teal en admin Razor y Auth, logos neutrales recolorados. (PARCIAL, pendiente revisión de usuario)
- Checklist del formulario de entrega neutralizado: `appsettings` vacío + default genérico vacío (SPEC 06 restante); el usuario decidirá el contenido final.
- Documentación y onboarding (SPEC 11).
