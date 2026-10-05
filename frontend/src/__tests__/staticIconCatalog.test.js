import { staticIconUrl, staticIconLabel, STATIC_ICON_KEYS } from "../config/staticIconCatalog.js";

describe("staticIconUrl", () => {
  test("resuelve las claves que si existen en el catalogo", () => {
    for (const key of STATIC_ICON_KEYS) {
      expect(staticIconUrl(key)).toBe(`data/assets/static_icons/${key}.png`);
    }
  });

  test("cae a un icono valido cuando el IconKey guardado no existe", () => {
    // Regresion: un marcador guardado con IconKey "hotel" (SR-BLD-010,
    // Hospitalizacion) no esta en el catalogo y hotel.png no existe. Sin
    // fallback se pedia hotel.png, nginx lo resolvia con index.html (200) y el
    // navegador dibujaba el icono roto al recibir HTML donde esperaba un PNG.
    // Ese marcador se elimino de MapMarkers; el fallback sigue como red por si
    // vuelve a llegar un IconKey fuera del catalogo.
    const url = staticIconUrl("hotel");

    expect(url).not.toContain("hotel");
    expect(url).toMatch(/^data\/assets\/static_icons\/[\w-]+\.png$/);
    expect(STATIC_ICON_KEYS).toContain(url.replace("data/assets/static_icons/", "").replace(".png", ""));
  });

  test("tolera claves vacias o nulas", () => {
    for (const key of ["", null, undefined, "  "]) {
      const url = staticIconUrl(key);
      expect(url).toMatch(/^data\/assets\/static_icons\/[\w-]+\.png$/);
    }
  });
});

describe("staticIconLabel", () => {
  test("devuelve la etiqueta del catalogo cuando existe", () => {
    expect(staticIconLabel(STATIC_ICON_KEYS[0])).not.toBe(STATIC_ICON_KEYS[0]);
  });

  test("devuelve la clave cruda como ultimo recurso", () => {
    expect(staticIconLabel("hotel")).toBe("hotel");
  });
});
