const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "components", "roomEditor.js"),
  "utf8"
);

describe("contorno por piso en el editor de sectores", () => {
  test("carga la geometria del edificio con el piso activo", () => {
    expect(source).toMatch(
      /const fetchBuildingGeometry = async \(buildingExternalId, floor = null\) => \{/
    );
    expect(source).toContain("/geometry${floorParam}");
    expect(source).toContain(
      "const buildingData = await fetchBuildingGeometry(buildingExternalId, mapFloor);"
    );
  });

  test("al cambiar de piso recarga y repinta el contorno", () => {
    expect(source).toContain(
      "const buildingData = await fetchBuildingGeometry(currentEditorState.buildingExternalId, floor);"
    );
    expect(source).toMatch(
      /currentEditorState\.buildingGeometry = buildingData;\s*renderBuildingBoundary\(buildingData\);/
    );
  });
});

describe("modo mover vertices en el editor de sectores", () => {
  test("herramienta y atajo", () => {
    expect(source).toContain('{ id: "edit-vertices", icon: ICONS.vertices,');
    expect(source).toMatch(
      /else if \(e\.key === "v" && !e\.ctrlKey && !e\.metaKey\) \{/
    );
    expect(source).toContain('selectRoomMode("edit-vertices");');
    expect(source).toContain('vertices: \'');
  });

  test("requiere exactamente 1 sector seleccionado", () => {
    expect(source).toMatch(
      /case "edit-vertices": \{[\s\S]*?if \(ids\.length !== 1\) \{/
    );
    expect(source).toContain(
      '"Mover vertices requiere exactamente 1 sector seleccionado."'
    );
    expect(source).toContain("beginVertexEdit(findShapeById(ids[0]));");
  });

  test("hornear rotation/scale a coordenadas antes de editar", () => {
    expect(source).toContain("latLngs = transformLatLngs(latLngs, rotation, scaleX, scaleY);");
    expect(source).toMatch(/room\.rotation = 0;\s*room\.scaleX = 1;\s*room\.scaleY = 1;/);
    expect(source).toContain('type: "bake-transform",');
    expect(source).toContain('case "bake-transform": {');
  });

  test("marcadores arrastrables que actualizan el geometryJson", () => {
    expect(source).toContain('const VERTEX_CLASS = "room-editor-vertex-marker";');
    expect(source).toMatch(
      /currentEditorState\.vertexMarkerLayers = openRing\.map\(\(point, index\) => \{/
    );
    expect(source).toContain("room.geometryJson = ringToGeometryJson(openRing);");
    expect(source).toContain("currentEditorState.isDirty = true;");
    expect(source).toContain("layer.setLatLngs(openRing);");
    expect(source).toContain("const target = currentEditorState.snapEnabled ? applySnap(event.latlng) : event.latlng;");
  });

  test("limpia los marcadores al salir del modo", () => {
    expect(source).toContain("const clearVertexMarkers = () => {");
    expect(source).toMatch(
      /if \(currentEditorState\.mode === "edit-vertices" && mode !== "edit-vertices"\) \{\s*clearVertexMarkers\(\);/
    );
    expect(source).toContain("currentEditorState.vertexMarkerLayers = [];");
  });
});
