# Administrative Map Editors

## Purpose

Admin tools for editing the map: buildings, geometry, walking routes, points of interest and the floor layout (rooms).

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

## Room Editor (manual rooms, floor layout)

`roomEditor.js` edits the floor layout of a building inside a modal Leaflet map
(`popupMap`, zoom up to 22). It manages manual rooms (SPEC 13 `ManualRoom`).
Only visible to admins and bound to the current building + floor of the main map.

- **Drawing**: hand-drawn free polygon, rectangle, circle, and free click-to-vertex
  drawing; vertex snap.
- **Multi-selection is always active** (no activation button). Expected gestures:
  - `ctrl+click` (left) = toggle selection (add/remove a room).
  - `Ctrl+drag` = move selection as a rigid group (single element → single handler).
  - `Shift+drag` = rotate selection around the group centroid
    (single element → rotate around its own center).
  - Plain drag = no-op; gestures act only when the drag starts on an
    already-selected element. The map is locked during a gesture and the lock is
    released on every exit path.
  - Drag over empty map area draws a selection box (marquee); ``ctrl+drag`` box
    adds to the current selection.
- **Rigid + conformal rotation**: rotation is applied in projected pixel space
  (`latLngToContainerPoint` / `containerPointToLatLng`), so shapes keep their exact
  form and size (no rhomboid/shrink distortion); each element keeps its own
  `scaleX/scaleY/rotation` as a separate visual transform.
- **Editing**: side panel with room properties (name, type, capacity, etc.), delete
  (soft-delete list kept in `removedExternalIds`), copy/paste (`Ctrl+C/V`),
  undo/redo (`Ctrl+Z/Y`) covering create, delete, move/rotate geometry, and
  property updates, save (`G`). Room IDs use the `MAN-*` prefix.
- **Suggestions**: "suggest rooms automatically" generates room bands against the
  building outline with wall contact, corner reservation, de-duplication and
  multi-band fill; results wrap the outline corners (`roomEditorGeometry.js`).
- **Layout copy**: copy the layout of one floor to another floor of the same building.
- **Persistence**: `PUT/POST /api/manual-rooms` per element plus deletes, then
  `refreshCurrentMapData()` + `syntro-rooms-changed` event.

## Rules

- Only one admin tool active at a time.
- Admin tools share visual state through the unified panel.
- Changes must reflect without requiring a manual reload.
- Tools visibility syncs with the session state.
