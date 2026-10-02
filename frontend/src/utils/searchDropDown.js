const DEFAULT_RESULT_ICON = "building.svg";

const ICONS_BY_RESULT_KIND = {
  building: "building.svg",
  sector: "room.svg",
};

// El campus solo tiene pc e impresora. Todo lo demas cae en device.svg en vez de
// inventar un icono por cada categoria: se agrega el glyph si aparece una nueva.
const ICONS_BY_EQUIPMENT_TYPE = {
  pc: "computer_room.svg",
  printer: "printer.svg",
};

const GENERIC_EQUIPMENT_ICON = "device.svg";

const DESCRIPTION_KINDS = {
  edificio: "building",
  sala: "sector",
  equipo: "equipment",
};

const normalizeToken = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

// El indice de busqueda ya separa los tres tipos en el description, asi que se usa
// como contrato: "Edificio · BLD-001 · piso(s): 1", "Sala · Hospitalizacion · piso 1",
// "Equipo · pc · Sala 101 · piso 1". Los equipos que llegan del endpoint de inventario
// traen resultKind explicito y no dependen de este formato.
export const resolveResultKind = (properties) => {
  const explicit = normalizeToken(properties?.resultKind);
  if (ICONS_BY_RESULT_KIND[explicit] || explicit === "equipment") {
    return explicit;
  }

  return DESCRIPTION_KINDS[normalizeToken(properties?.description).split(" · ")[0]] || "";
};

export const resolveEquipmentType = (properties) => {
  const explicit = normalizeToken(properties?.equipmentType);
  if (explicit) {
    return explicit;
  }

  const [, second] = normalizeToken(properties?.description).split(" · ");
  return second || "";
};

export const resolveResultIcon = (properties) => {
  const kind = resolveResultKind(properties);

  if (kind === "equipment") {
    return ICONS_BY_EQUIPMENT_TYPE[resolveEquipmentType(properties)] || GENERIC_EQUIPMENT_ICON;
  }

  if (kind) {
    return ICONS_BY_RESULT_KIND[kind];
  }

  // properties.image lo sigue respetando el room editor si alguna vez define un glyph
  // propio; sin esto habria que tocar el buscador cada vez que aparece un icono nuevo.
  const customIcon = String(properties?.image ?? "").trim();
  if (customIcon && customIcon !== "undefined" && customIcon !== "null") {
    return /\.svg$|\.png$/i.test(customIcon) ? customIcon : `${customIcon}.svg`;
  }

  return DEFAULT_RESULT_ICON;
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