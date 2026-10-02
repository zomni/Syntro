const DEFAULT_RESULT_ICON = "building.svg";

const ICON_EXTENSIONS = [".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"];

// Ni cs_sotero_search.json ni el catalogo traen properties.image. Sin este guard cada
// resultado pedia assets/icons_os/undefined y el fallback SPA del servidor respondia
// 200 text/html con el index.html, que el navegador no puede decodificar como imagen.
export const resolveResultIcon = (image) => {
  const candidate = String(image ?? "").trim();

  if (!candidate || candidate === "undefined" || candidate === "null") {
    return DEFAULT_RESULT_ICON;
  }

  return ICON_EXTENSIONS.some((extension) => candidate.toLowerCase().endsWith(extension))
    ? candidate
    : `${candidate}.svg`;
};

// El contenedor del buscador es una pastilla con overflow:hidden (index.css), asi que el
// dropdown no puede colgar de el: quedaria recortado a los 44px de alto y no se veria
// nada. Se monta en body y se posiciona con el rect real del input.
export const computeDropDownPosition = (inputRect) => ({
  position: "fixed",
  left: `${inputRect.left}px`,
  top: `${inputRect.bottom + 4}px`,
  width: `${inputRect.width}px`,
  right: "auto",
  bottom: "auto",
  zIndex: "1300",
});