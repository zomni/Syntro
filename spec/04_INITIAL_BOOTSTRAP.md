# Bootstrap Inicial y Arranque Vacío

## Propósito

Una instalación nueva arranca prácticamente vacía. Solo se crea el administrador inicial desde la configuración de entorno.

## Estado Actual

- `Data/SeedData.cs` conserva 6 Locations y 10 Equipment, pero solo se ejecuta cuando `DemoData:Enabled` (env `DEMO_DATA`) es explícitamente `true`.
- `docker-compose.yml` ya no establece credenciales sembradas. Mapea `ADMIN_EMAIL` / `ADMIN_PASSWORD` a `AuthSettings__AdminUsername` / `AuthSettings__AdminPassword` (`backend/.env.example` documenta ambos).
- `BackendAuthService.EnsureInitialAdminAsync` crea solo el Administrator inicial desde env/config, y solo cuando no existe ningún admin activo (idempotente). Si faltan las variables, falla rápido con una `InvalidOperationException` clara.
- No se siembra ningún viewer. Las filas legacy de viewer (si existen) se normalizan a estado activo pero nunca se auto-crean.

## Reglas

- El arranque debe fallar si no se puede crear un Administrator y faltan las variables de entorno requeridas (regla existente, conservar).
- Los datos demo, si se conservan, están claramente separados y nunca se habilitan por defecto.

## Criterios de Aceptación

- Una instalación nueva arranca solo con el Administrator inicial.
- No se crean locations, buildings, equipment ni datos de campus sembrados por defecto.
- Si faltan las variables de entorno de bootstrap del admin, falla rápido con un error claro.

## Decisiones de implementación

- `EnsureInitialAdminAsync` se ejecuta en el arranque (Program.cs) tras la migración del esquema.
- Si ya existe un admin activo, el arranque solo normaliza roles legacy y continúa (no toca credenciales).
- Los datos demo viven en un módulo aparte activado por `DEMO_DATA=true`.
- La DB con el esquema anterior (PKs INTEGER) no es migrable automáticamente; una instalación nueva crea el esquema GUID vía EF migrations (`InitialCreate`).
