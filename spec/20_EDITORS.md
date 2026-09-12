# Administrative Map Editors

## Purpose

Admin tools for editing the map: buildings, geometry, walking routes, points of interest and the floor layout (rooms + door/stair annotations).

## Unified Panel

`adminMapToolsPanel.js` hosts the admin tools:

- Add building
- Edit shape
- Move building
- Edit routes
- Delete routes
- Split vertex
- Connect building
- Undo

The panel shows only with an admin session.

## Building Editor

- Create buildings by drawing a polygon (`manualBuildingEditor.js`).
- POST to the backend and refresh the map and caches.

## Geometry Editor

- Edit the shape of an existing building (`buildingGeometryEditor.js`).
- Move a building.
- Persist the override in the backend.

## Walking Route Editor

- Create routes by clicks.
- Free drawing.
- Move, join and split vertices.
- Connect routes to building edges.
- Delete segments and undo the last action.
- Save and refresh the walking route layer.

## Points of Interest Editor

- Create, edit and delete points of interest (SPEC 09). (DONE: `poiEditor.js`)
- Rendered reusing `markers.js`. (DONE)
- Add mode: single map click places the point and opens the create form.
- Manage mode: list all POIs with edit and delete actions.

## Room & Annotation Editor (manual rooms, doors, stairs)

`roomEditor.js` edits the floor layout of a building inside a modal Leaflet map
(`popupMap`, zoom up to 22). It manages manual rooms (SPEC 13 `ManualRoom`) and
map annotations for the building's entrance/exit doors and stairs (SPEC 13
`BuildingAnnotation`). Only visible to admins and bound to the current
building + floor of the main map.

- **Drawing**: hand-drawn free polygon, rectangle, circle, and free click-to-vertex
  drawing; vertex snap; `D` = draw door, `E` = draw stair (or toolbar buttons).
- **Multi-selection is always active** (no activation button). Expected gestures:
  - `click` = toggle selection (rooms and annotations mix freely).
  - `Ctrl+drag` = move selection as a rigid group (single element → single handler).
  - `Shift+drag` = rotate selection around the group centroid
    (single element → rotate around its own center).
  - Plain drag = no-op; gestures act only when the drag starts on an
    already-selected element. The map is locked during a gesture and the lock is
    released on every exit path.
- **Rigid + conformal rotation**: rotation is applied in projected pixel space
  (`latLngToContainerPoint` / `containerPointToLatLng`), so shapes keep their exact
  form and size (no rhomboid/shrink distortion); each element keeps its own
  `scaleX/scaleY/rotation` as a separate visual transform.
- **Editing**: side panel with properties (room: name, type, capacity, etc.;
  annotation: read-only header + hint + delete), delete (soft-delete list kept in
  `removedExternalIds` / `removedAnnotationExternalIds`), copy/paste (`Ctrl+C/V`,
  a copied door always pastes a door), undo/redo (`Ctrl+Z/Y`) covering create,
  delete, move/rotate geometry, and property updates, save (`G`).
- **Annotations**: persist per building + floor and render on the main map for all
  users (SPEC 20 "annotations" endpoints: `GET/POST/PUT/DELETE /api/annotations`).
  Doors are drawn in `#0ea5e9`, stairs in `#7c3aed`, selection in `#f59e0b`.
  IDs use the `ANN-*` prefix (rooms use `MAN-*`).
- **Suggestions**: "suggest rooms automatically" generates room bands against the
  building outline with wall contact, corner reservation, de-duplication and
  multi-band fill; results wrap the outline corners (`roomEditorGeometry.js`).
- **Layout copy**: copy the layout of one floor to another floor of the same building.
- **Persistence**: `PUT/POST /api/manual-rooms` (or `/api/annotations`) per element
  plus deletes, then `refreshCurrentMapData()` + `syntro-rooms-changed` event.

## Rules

- Only one admin tool active at a time.
- Admin tools share visual state through the unified panel.
- Changes must reflect without requiring a manual reload.
- Tools visibility syncs with the session state.
