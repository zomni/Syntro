// Configuración de la instancia (SPEC 01).
// Valores por defecto genéricos; sobrescribibles por instancia vía window.SYNTRO_CONFIG
// o en tiempo de build vía la variable de entorno API_BASE_URL (webpack DefinePlugin).

const runtime =
  (typeof window !== "undefined" && window.SYNTRO_CONFIG) || {};

export const appConfig = {
  apiBaseUrl:
    runtime.apiBaseUrl ||
    (typeof __API_BASE_URL__ !== "undefined" ? __API_BASE_URL__ : "http://localhost:5000"),
  prefix: runtime.prefix || "syntro",
  branding: {
    appName: runtime.appName || "Syntro",
    theme: {
      primary: runtime.themePrimary || "#003366",
      secondary: runtime.themeSecondary || "#1D4E89",
    },
  },
  display: {
    locale: runtime.displayLocale || "es-CL",
    timeZone: runtime.displayTimeZone || "UTC",
  },
  inventoryCategories: {
    order: runtime.inventoryCategoryOrder || ["pc", "printer", "scanner", "other"],
    labels: runtime.inventoryCategoryLabels || {
      pc: "PC",
      printer: "Impresoras",
      scanner: "Escaneres",
      other: "Otros",
    },
  },
};

export function applyBrandingTheme() {
  const root = document.documentElement;
  if (!root) {
    return;
  }

  const { primary, secondary } = appConfig.branding.theme;
  if (primary) {
    root.style.setProperty("--pi-primary", primary);
    root.style.setProperty("--pi-primary-rgb", hexToRgbChannels(primary));
  }
  if (secondary) {
    root.style.setProperty("--pi-accent", secondary);
  }
}

function hexToRgbChannels(hex) {
  const cleaned = String(hex).replace("#", "");
  if (cleaned.length !== 6) {
    return "";
  }

  const value = Number.parseInt(cleaned, 16);
  if (Number.isNaN(value)) {
    return "";
  }

  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `${r}, ${g}, ${b}`;
}
