const path = require("path");
const webpack = require("webpack");

const src = (...segments) => path.resolve(__dirname, "src", ...segments);

module.exports = {
  mode: "production",
  entry: ["./src/index.js"],
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "dist/"),
  },
  experiments: {
    topLevelAwait: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      __API_BASE_URL__: JSON.stringify(process.env.API_BASE_URL || "http://localhost:5001"),
    }),
  ],
  resolve: {
    alias: {
      "@app/index": src("index.js"),
      "@app/findByUrl": src("utils", "findByUrl.js"),
      "@app/routePlanner": src("components", "routePlanner.js"),
      "@app/featureDisplay": src("views", "featureDisplay.js"),
      "@app/goToCampus": src("utils", "goToCampus.js"),
      "@app/searchMetadata": src("utils", "searchMetadata.js"),
      "@app/addData": src("utils", "addData.js"),
      "@app/autocompleteSearchBox": src("components", "autocompleteSearchBox.js"),
      "@app/walkingRouteLayer": src("components", "walkingRouteLayer.js"),
      "@app/manualBuildingEditor": src("components", "manualBuildingEditor.js"),
      "@app/sessionModeBadge": src("components", "sessionModeBadge.js"),
"@app/sessionExpiryOverlay": src("components", "sessionExpiryOverlay.js"),
      "@app/buildingGeometryEditor": src("components", "buildingGeometryEditor.js"),
      "@app/campusMarkerEditor": src("components", "campusMarkerEditor.js"),
      "@app/walkingRouteEditor": src("components", "walkingRouteEditor.js"),
      "@app/adminMapToolsPanel": src("components", "adminMapToolsPanel.js"),
      "@app/siteViewportPanel": src("components", "siteViewportPanel.js"),
      "@app/roomEditor": src("components", "roomEditor.js"),
      "leaflet": src("lib", "leaflet", "leaflet.js"),
    },
  },
  module: {
    parser: {
      javascript: {
        // Rompio el merge 94da17f: addData.js quedo vacio y webpack solo aviso
        // por consola que faltaban addDataToMap/clearAllMapData/
        // resetBuildingsCatalogCache, asi que goToCampus, featureDisplay,
        // manualBuildingEditor y buildingGeometryEditor se quedaron importando
        // undefined. Con "error" el build falla en vez de avisar.
        exportsPresence: "error",
      },
    },
  },
};
