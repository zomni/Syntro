# Editores Administrativos del Mapa

## Propósito

Herramientas admin para editar el mapa: edificios, geometría, rutas peatonales, puntos de interés y el layout de piso (salas).

## Panel Unificado

`adminMapToolsPanel.js` aloja las herramientas admin:

- Agregar edificio
- Editar forma
- Mover edificio
- Editar rutas
- Eliminar rutas
- Dividir vértice
- Conectar edificio
- Deshacer

El panel se muestra solo con una sesión de admin.

## Editor de Edificios

- Crear edificios dibujando un polígono (`manualBuildingEditor.js`).
- POST al backend y refrescar el mapa y las cachés.

## Editor de Geometría

- Editar la forma de un edificio existente (`buildingGeometryEditor.js`).
- Mover un edificio.
- Persistir el override en el backend.

## Editor de Rutas Peatonales

- Crear rutas con clics.
- Dibujo libre.
- Mover, unir y dividir vértices.
- Conectar rutas a los bordes de edificios.
- Eliminar segmentos y deshacer la última acción.
- Guardar y refrescar la capa de rutas peatonales.

## Editor de Puntos de Interés

- Crear, editar y eliminar marcadores de campus (SPEC 09). (HECHO: `campusMarkerEditor.js`)
- Renderizados reutilizando `markers.js`. (HECHO)
- Modo agregar: un clic en el mapa coloca el punto y abre el formulario de creación.
- Modo gestionar: lista todos los POIs con acciones de editar y eliminar.

## Editor de Salas (salas manuales, layout de piso)

`roomEditor.js` edita el layout de piso de un edificio dentro de un mapa Leaflet modal
(`popupMap`, zoom hasta 22). Gestiona salas manuales (SPEC 13 `ManualRoom`).
Solo visible para admins y ligado al edificio + piso actual del mapa principal.

- **Dibujo**: polígono libre a mano, rectángulo, círculo y dibujo libre clic-a-vértice;
  snap de vértices.
- **La multiselección está siempre activa** (sin botón de activación). Gestos esperados:
  - `ctrl+click` (izquierdo) = alternar selección (agregar/quitar una sala).
  - `Ctrl+drag` = mover la selección como grupo rígido (elemento único → un solo handler).
  - `Shift+drag` = rotar la selección alrededor del centroide del grupo
    (elemento único → rotar alrededor de su propio centro).
  - Drag simple = no-op; los gestos actúan solo cuando el drag comienza sobre un
    elemento ya seleccionado. El mapa se bloquea durante un gesto y el bloqueo se
    libera en todas las rutas de salida.
  - Arrastrar sobre área vacía del mapa dibuja un recuadro de selección (marquee); el recuadro
    `ctrl+drag` suma a la selección actual.
- **Rotación rígida + conforme**: la rotación se aplica en espacio de píxeles proyectado
  (`latLngToContainerPoint` / `containerPointToLatLng`), de modo que las formas conservan su
  forma y tamaño exactos (sin distorsión romboide/encogimiento); cada elemento conserva su
  propio `scaleX/scaleY/rotation` como una transformación visual separada.
- **Edición**: panel lateral con propiedades de la sala (nombre, tipo, capacidad, etc.), eliminar
  (lista de soft-delete en `removedExternalIds`), copiar/pegar (`Ctrl+C/V`),
  deshacer/rehacer (`Ctrl+Z/Y`) cubriendo crear, eliminar, mover/rotar geometría y
  actualizaciones de propiedades, guardar (`G`). Los IDs de sala usan el prefijo `MAN-*`.
- **Sugerencias**: "sugerir salas automáticamente" genera bandas de salas contra el
  contorno del edificio con contacto de muro, reserva de esquinas, de-duplicación y
  relleno multi-banda; los resultados envuelven las esquinas del contorno (`roomEditorGeometry.js`).
- **Copiar layout**: copiar el layout de un piso a otro piso del mismo edificio.
- **Persistencia**: `PUT/POST /api/manual-rooms` por elemento más eliminaciones, luego
  `refreshCurrentMapData()` + evento `syntro-rooms-changed`.

## Reglas

- Solo una herramienta admin activa a la vez.
- Las herramientas admin comparten estado visual a través del panel unificado.
- Los cambios deben reflejarse sin requerir recarga manual.
- La visibilidad de las herramientas se sincroniza con el estado de sesión.
