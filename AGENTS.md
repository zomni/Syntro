# Instrucciones para el agente (AGENTS.md)

## Repositorio

- Único repo de trabajo: `C:\Users\paolo.vilches\Documents\repos\Syntro`
  (remoto `https://github.com/zomni/Syntro.git`). Ignorar y NO usar
  `repos\Pireon` (copia obsoleta pendiente de eliminar).
- Stack único de desarrollo: API en `http://localhost:5001` y frontend en
  `http://localhost:8081` (definido en `docker-compose.yml` y `.env`).

## Restart y rebuild

- Siempre que se hagan cambios en el backend (`backend/Syntro.API`), el frontend
  (`frontend/`) o las tools (`tools/`), el agente DEBE encargarse él mismo de
  detener, rebuildear y levantar de nuevo los servicios afectados para que el
  usuario pueda probar los cambios sin pasos manuales.
- El backend corre en `http://localhost:5001` (servicio Docker `api`, contenedor `syntro-api-1`) y el
  frontend en `http://localhost:8081` (servicio `frontend`, bundle webpack horneado en la imagen = nginx;
  `docker compose build --no-cache frontend` + `docker compose up -d frontend`). El backend usa
  `dotnet watch` en dev (añade/detener API con `docker compose up -d --no-deps api`).
- Preferir `docker compose up -d --build` cuando el stack esté en Docker; de lo
  contrario `dotnet build` + `dotnet run` (backend) y el dev server de webpack
  (frontend).

## Verificación antes de entregar

- Frontend: `npx jest` (64 tests) y `npx webpack` deben pasar; verificar el bundle servido
  en `http://localhost:8081/index.js?t=<timestamp>` cuando el cambio toque `roomEditor.js` o `addData.js`.
- Backend: `dotnet build` de `Syntro.API` y `dotnet test backend/Syntro.API.Tests` (79 tests) deben pasar.
- Smoke check: `GET /api/health/integrity` en el backend.

## Git

- **NO hacer `git push` sin autorización explícita del usuario.**
  El agente puede commitear localmente, pero el push solo se ejecuta cuando el
  usuario lo autoriza verbalmente (p. ej. "dale push", "sube", "push").
  Si el usuario no autoriza, dejar el commit local listo y avisar.
