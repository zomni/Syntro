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
- Room layout geometry: contiguous rooms, wall sharing, no overlaps, bounds
  (`roomEditorGeometry.test.js`).

## Rules

- Tests must not depend on a real database path or real LibreOffice.
- PDF layout is user-testable after template changes.
- Telemetry tests cover disabled configuration (SPEC 07).
- `npm test` (jest) and `dotnet test backend/Syntro.sln` must be green before delivery.

## Decisiones de implementación

- Backend: proyecto xUnit `Syntro.API.Tests` (SQLite en memoria; los tests nunca usan
  `syntro.db`). Cubre `PasswordPolicyService`, `BackendAuthService` (bootstrap admin,
  lockout, break-glass), importación Excel (fixture .xlsx generado con ClosedXML),
  reconciliación de inventario, auditoría, servicios de configuración y ML/ML-settings.
  Estado actual: **79 tests, 79 pasando** (2026-09-11).
- Frontend: jest + babel (`npm test`) sobre módulos puros de configuración, identificadores,
  generación de cron y geometría de salas. Estado actual: **64 tests en 7 suites**:
  `campusConfig`, `identifiers`, `floorButtons`, `buildingCatalog`, `viewportRules`,
  `scheduleCronBuilder`, `roomEditorGeometry` (2026-09-11). El resto del mapa (Leaflet/DOM)
  se cubre con smoke tests manuales.
