# Visión General del Dominio

La plataforma es independiente del dominio.

La jerarquía núcleo es:

Campus
└── Building
    └── Floor
        └── Room

Entidades de apoyo:

- Equipment (ítem de inventario)
- Category (clasificación de inventario configurable)
- PointOfInterest (marcador del mapa)
- WalkingRouteNode / WalkingRouteEdge (red peatonal)
- NetworkTelemetrySnapshot / NetworkTelemetryObservation
- ImportedInventoryItem (inventario importado)
- SyncedBuilding / SyncedRoom (ubicaciones gestionadas por backend)
- BuildingGeometryOverride (polígonos editados o movidos)
- ManualBuilding (creado desde el mapa)

Subsistemas:

- Inventario y reconciliación
- Telemetría de red
- Formularios de entrega de equipos
- Edición administrativa del mapa
- Auditoría y respaldos

La plantilla arranca vacía: campuses, buildings, floors, rooms, categories, points of interest y assets se crean tras la instalación.
