# Arquitectura del Frontend

## Stack

- Vanilla JavaScript
- Leaflet (mapa)
- Leaflet.draw y editores personalizados (geometría)
- Fuse + scoring personalizado (búsqueda)
- Webpack (bundler)
- Build estático portable (`create_dist.js`)

## Estructura

src/
  assets/     Iconos, favicon, SVGs de edificios.
  components/ Componentes de UI y herramientas de mapa.
  data/       Config de campus, GeoJSON, índice de búsqueda, respaldos estáticos.
  lib/        Dependencias vendorizadas (Leaflet, Leaflet.draw, Fuse, jQuery).
  styles/     CSS para mapa, búsqueda, botones y layout.
  utils/      Carga de datos, navegación, cookies, respaldos estáticos.
  views/      Inicialización de Leaflet, popups, renderizado de features.

## Modos

- Con backend: prioriza datos actualizados desde la API.
- Sin backend: usa JSON local y respaldos estáticos para que el mapa no quede vacío.

## Config de Campus

`src/data/campuses.js` es la configuración canónica de la plantilla (SPEC 03). Las rutas de datos, el índice de búsqueda y el catálogo derivan de ella.

## Módulos Clave

- `views/map.js` — instancia de Leaflet, bounds, tile layer, seguimiento de ubicación.
- `views/featureDisplay.js` — experiencia de popup de edificios.
- `components/autocompleteSearchBox.js` — búsqueda.
- `components/routePlanner.js` — ruta entre edificios.
- `components/sessionModeBadge.js` — estado de sesión y visibilidad de admin.

## Reglas

- Mantener el backend como fuente de datos prioritaria cuando esté disponible.
- Mantener el fallback local/estático para uso sin API.
- No duplicar controles sueltos; reutilizar los paneles existentes.
- Solo una herramienta admin activa a la vez.
