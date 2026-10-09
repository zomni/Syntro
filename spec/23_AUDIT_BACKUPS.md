# Auditoría y Respaldos

## Propósito

Registro formal de auditoría y respaldos programados de la base de datos.

## Auditoría

`AuditLogEntries` registra:

- usuario
- IP
- user-agent
- recurso
- resultado
- severidad
- valor anterior y nuevo

Acciones auditadas:

- Mutaciones de inventario
- Exportación/importación/restauración de base de datos
- Subida/descarga/eliminación de PDF
- Login / logout / MFA / acceso denegado
- Cambios de configuración críticos
- Mutaciones de los editores de mapa (edificios manuales, overrides de geometría, rutas peatonales)
- Mutaciones de puntos de interés (crear/actualizar/eliminar, ver SPEC 09)

## Respaldos

- Respaldos SQLite vía un hosted service.
- Hash e historial de respaldos en `BackupHistories`.
- Política de retención y limpieza de respaldos expirados.
- Endpoint de respaldo manual.
- Exportación / importación / restauración de base de datos desde el dashboard.

## Reglas

- El archivo de base de datos no se versiona.
- La ruta de respaldo y la retención son configurables.
- Las entradas del historial de respaldos son auditables.
