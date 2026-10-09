# Arquitectura del Backend

## Stack

- ASP.NET Core 8
- EF Core + SQLite
- MVC / Razor para el panel de administración
- API REST para el mapa
- Razor Runtime Compilation en desarrollo
- Swagger

## Estructura

Backend/
  Controllers/     MVC y API REST.
  Data/            DbContext, seed e inicializadores de esquema.
  Infrastructure/  Infraestructura transversal.
  Models/          Entidades persistentes y constantes de dominio.
  Services/        Lógica de negocio reutilizable.
  Templates/       Plantillas DOCX.
  ViewModels/      View models de Razor y requests complejos.
  Views/           Vistas Razor (dashboard y auth).
  Program.cs       Bootstrap, DI, middleware, auth y rutas.

## Dirección de Dependencias

Controllers
  -> Services
  -> Models / Data (EF)

## Middleware Clave

- Headers de seguridad (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- CORS restrictivo por origen.
- URL rewrite entre `/dashboard` y `/admin`.
- Auditoría de respuestas 403 autenticadas.

## Reglas

- Mantener los controllers delgados; preferir services para lógica reutilizable o crítica.
- Toda mutación sensible debe ser auditada.
- El archivo de base de datos no se versiona.
