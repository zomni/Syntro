export const getBuildingDisplayName = (feature, building) =>
  building?.searchTitle || building?.realName || building?.displayName ||
  feature?.properties?.name || feature?.properties?.sourceId || "Edificio sin nombre";

export const createBuildingNameLabelController = ({ loadCatalog, getCampus, render }) => {
  const entries = new Map();
  let generation = 0;
  let pending = null;
  let currentCatalog = null;
  let loaded = false;

  const renderEntry = (feature, layer) => {
    const buildings = Array.isArray(currentCatalog?.buildings) ? currentCatalog.buildings : [];
    const building = buildings.find((item) => item.id === feature?.properties?.id);
    render(feature, layer, building || null);
  };

  const refresh = () => {
    const version = ++generation;
    const campus = getCampus();
    pending = Promise.resolve().then(loadCatalog).catch(() => null).then((catalog) => {
      if (version !== generation || campus !== getCampus()) return;
      currentCatalog = catalog;
      loaded = true;
      pending = null;
      for (const [layer, feature] of entries) {
        renderEntry(feature, layer);
      }
    });
    return pending;
  };

  return {
    add(feature, layer) {
      entries.set(layer, feature);
      renderEntry(feature, layer);
      if (!pending && !loaded) void refresh();
    },
    remove(layer) { entries.delete(layer); },
    refresh,
    clear() {
      generation += 1;
      pending = null;
      currentCatalog = null;
      loaded = false;
      entries.clear();
    },
  };
};
