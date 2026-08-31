# Testing

## Layers

- Backend: xUnit tests for services, imports and reconciliation.
- Frontend: component and data-loading tests (jest).
- Build: Webpack bundles and static build verification.
- Manual: map editing tools and PDF generation smoke tests.

## Coverage Priorities

- Inventory import and reconciliation logic.
- Delivery form generation and PDF conversion.
- Audit and backup flows.
- Auth, MFA and role enforcement.
- Points of interest CRUD and editors.

## Rules

- Tests must not depend on a real database path or real LibreOffice.
- PDF layout is user-testable after template changes.
- Telemetry tests cover disabled configuration (SPEC 07).

## Decisiones de implementación

- Backend: proyecto xUnit `Syntro.API.Tests` (SQLite en memoria; los tests nunca usan
  `syntro.db`). Cubre `PasswordPolicyService`, `BackendAuthService` (bootstrap admin,
  lockout, break-glass), importación Excel (fixture .xlsx generado con ClosedXML),
  reconciliación de inventario, auditoría y servicios de configuración.
- Frontend: jest + babel (`npm test`) sobre los módulos puros de configuración e
  identificadores (`campusConfig.js`, `identifiers.js`); el resto del mapa (Leaflet/DOM)
  se cubre con smoke tests manuales.
