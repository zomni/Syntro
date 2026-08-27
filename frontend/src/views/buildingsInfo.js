import { getCurrentCampusKey } from "../utils/campusConfig.js";

export const getCampusBuildings = () => ({
  [getCurrentCampusKey()]: {},
});

export const getLatLngBuildings = () => ({
  [getCurrentCampusKey()]: {},
});

export const campusBuildings = new Proxy({}, {
    get: function (_, key) {
        var campusKey = getCurrentCampusKey();
        if (key === campusKey) return {};
        return undefined;
    }
});

export const latlngBuildings = new Proxy({}, {
    get: function (_, key) {
        var campusKey = getCurrentCampusKey();
        if (key === campusKey) return {};
        return undefined;
    }
});
