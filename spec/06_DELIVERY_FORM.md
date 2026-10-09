# Generalización del Formulario de Entrega

## Propósito

Mantener el formulario de entrega de equipos y la generación de PDF como una funcionalidad de producto sin contenido institucional.

## Estado Actual

- `Views/Admin/DeliveryForm.cshtml`: el checklist de aplicaciones institucional ahora se renderiza desde configuración (`DeliveryForm:ApplicationChecklist:Sections`), reemplazando el HTML fijo.
- `Services/DeliveryFormChecklistConfig.cs`: parsea secciones/ítems desde configuración con defaults genéricos; cada ítem mapea a un checkbox enlazado por nombre a una propiedad bool `Validation*`/`App*`/`Admin*` en `EquipmentDeliveryFormViewModel`.
- `Services/DeliveryFormTemplateBuilder.cs`: genera una plantilla DOCX genérica y parametrizable en memoria cuando no hay una plantilla configurada.
- `Services/EquipmentDeliveryDocumentService.cs`: resuelve la plantilla (`DeliveryForm:TemplatePath` configurado → default `Templates/FormularioEntregaEquipo.docx` → plantilla genérica generada); llena la tabla de aplicaciones desde el checklist configurado; convierte a PDF vía LibreOffice (`DeliveryForm:SofficePath`, default `soffice`).
- El nombre de la institución se lee desde configuración (`DeliveryForm:Institution`, `AdminController.cs`), no es una constante.
- Conversión a PDF vía LibreOffice (`EquipmentDeliveryDocumentService.cs`); LibreOffice instalado en `Dockerfile` (prod) y `Dockerfile.dev`.

## Cambios Requeridos

- Leer el nombre de la institución desde configuración o datos del equipo, no una constante.
- Hacer configurable el checklist de aplicaciones.
- Reemplazar la plantilla DOCX del cliente por una plantilla genérica y parametrizable.
- Conservar la conversión por LibreOffice y el manejo de PDF.

## Reglas

- El layout del PDF debe seguir siendo testeable por el usuario tras cambios de plantilla.
- Ningún nombre institucional puede estar hardcodeado.

## Criterios de Aceptación

- Cambiar la institución configurada se refleja en el formulario y el PDF generados.
- El checklist se renderiza desde configuración.
- El flujo del formulario de entrega funciona con una plantilla genérica.

## Decisiones de implementación

- El nombre de la institución sale de `appsettings` (`Institution`), con default genérico.
- El checklist de aplicaciones se modela como configuración (lista de secciones e ítems), reemplazando el HTML fijo.
- La plantilla DOCX genérica se genera en memoria (`DeliveryFormTemplateBuilder`); si se configura `TemplatePath` y el archivo existe, se usa esa plantilla en su lugar.
- El template envía el checklist **vacío** (`ApplicationChecklist.Sections = []` en `appsettings` y `GetDefaultSections()` retorna lista vacía): el contenido de aplicaciones lo define cada instancia. El formulario, el PDF y la tabla de aplicaciones del DOCX se renderizan correctamente sin secciones. El usuario decidirá el contenido final del checklist.
