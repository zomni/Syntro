# Instrucciones para el agente (AGENTS.md)

## Restart y rebuild

- Siempre que se hagan cambios en el backend (`backend/Syntro.API`), el frontend
  (`frontend/`) o las tools (`tools/`), el agente DEBE encargarse él mismo de
  detener, rebuildear y levantar de nuevo los servicios afectados para que el
  usuario pueda probar los cambios sin pasos manuales.
- El backend corre en `http://localhost:5001` y el frontend en `http://localhost:8081`
  (puerto definido por `FrontendAppUrl` en `appsettings.json` / `FRONTEND_APP_URL` en
  `.env` / `docker-compose.yml`).
- Preferir `docker compose up -d --build` cuando el stack esté en Docker; de lo
  contrario `dotnet build` + `dotnet run` (backend) y el dev server de webpack
  (frontend).
- Antes de entregar una tarea, verificar con un smoke check que los servicios
  respondan (p. ej. `GET /api/health/integrity` en el backend).

## Git

- **NO hacer `git push` sin autorización explícita del usuario.**
  El agente puede commitear localmente, pero el push solo se ejecuta cuando el
  usuario lo autoriza verbalmente (p. ej. "dale push", "sube", "push").
  Si el usuario no autoriza, dejar el commit local listo y avisar.
