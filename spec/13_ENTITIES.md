# Entidades Núcleo

## Campus
Sitio de nivel superior configurado en la configuración de la plantilla. Define bounds, centro, pisos y rutas de datos del mapa.

## Building
Edificio físico dentro de un campus.

## Floor
Nivel dentro de un building.

## Room
Espacio dentro de un building.

## Equipment
Activo de inventario identificado por número de serie.

## Category
Clasificación de inventario configurable (por ejemplo pc, printer, scanner).

## PointOfInterest
Marcador del mapa con tipo, nombre y coordenadas.

## SyncedBuilding / SyncedRoom
Ubicaciones gestionadas o sobreescritas por el backend.

## ManualRoom
Una sala creada desde el mapa (`roomEditor.js`). Pertenece a un building (`BuildingExternalId`)
y a un `Floor`, se identifica por `ExternalId` (prefijo `MAN-*` en el editor, único), geometría
de polígono en `GeometryJson`, más metadatos de visualización (ShortName, Type, Unit, Service,
Status, Capacity, Notes). Entidad SERVER: `ManualRoom` (auditable, soft delete).

## Organization / CampusSite
Contenedores multi-tenant: una `Organization` posee registros `CampusSite` (cada uno con
`CampusKey`, nombre, school, pisos, defaultFloor, centro/zoom/bounds); un sitio mapea a un
campus en la configuración runtime del frontend. Solo `superadmin` gestiona organizaciones; los
admins de org solo pueden acceder a sus propios sitios.

## ManualBuilding
Un building creado desde el mapa.

## BuildingGeometryOverride
Edición o movimiento de polígono aplicado a un building existente.

## WalkingRouteNode / WalkingRouteEdge
Nodos y aristas de la red peatonal.

## NetworkTelemetrySnapshot
Un resultado de escaneo programado para un objetivo.

## NetworkTelemetryObservation
Un único resultado de sonda dentro de un snapshot.

## ImportedInventoryItem
Inventario importado desde Excel o creado desde un formulario de entrega.

## AuthUser
Cuenta con acceso a la plataforma.

Roles
- superadmin (multi-tenant: gestiona organizaciones/sitios, ve todos los campuses)
- admin
- editor
- viewer
- auditor

Toda entidad usa las invariantes de auditoría comunes definidas en SPEC 14.
