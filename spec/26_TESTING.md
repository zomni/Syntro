# Pruebas

## Capas

- Backend: tests xUnit para services, importaciones y reconciliación.
- Frontend: tests de componentes y carga de datos (jest).
- Build: bundles de Webpack y verificación del build estático.
- Manual: smoke tests de las herramientas de edición de mapa y la generación de PDF.

## Prioridades de Cobertura

- Lógica de importación y reconciliación de inventario.
- Generación del formulario de entrega y conversión a PDF.
- Flujos de auditoría y respaldo.
- Auth, MFA y aplicación de roles.
- CRUD de puntos de interés y editores.
- Geometría del layout de salas: salas contiguas, muros compartidos, sin solapamientos, bounds
  (`roomEditorGeometry.test.js`).

## Reglas

- Los tests no deben depender de una ruta de base de datos real ni de LibreOffice real.
- El layout del PDF es testeable por el usuario tras cambios de plantilla.
- Los tests de telemetría cubren la configuración deshabilitada (SPEC 07).
- `npm test` (jest) y `dotnet test backend/Syntro.sln` deben estar en verde antes de entregar.

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
