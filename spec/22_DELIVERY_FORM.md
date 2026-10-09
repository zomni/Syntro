# Formulario de Entrega

## Propósito

Generar un documento de entrega de equipos con salida en PDF para una institución configurable.

## Entidades

- Datos de formulario de entrega capturados por equipo.
- Archivo PDF opcional asociado al ítem de inventario.

## Configuración

- Nombre de la institución (`DeliveryForm:Institution`, SPEC 06).
- Checklist de aplicaciones (`DeliveryForm:ApplicationChecklist:Sections`) — secciones e ítems renderizados en el formulario y el documento generado.
- Plantilla DOCX genérica (`DeliveryForm:TemplatePath`, opcional; generada en memoria por `DeliveryFormTemplateBuilder` cuando está ausente).
- Ejecutable de LibreOffice (`DeliveryForm:SofficePath`, default `soffice`).

## Flujo

- Completar el formulario de entrega.
- Generar el documento desde la plantilla.
- Convertir a PDF vía LibreOffice.
- Previsualizar.
- Opcionalmente crear el equipo en inventario con el PDF adjunto.

## Reglas

- Ningún nombre institucional puede estar hardcodeado (SPEC 06).
- El layout del PDF es testeable por el usuario tras cambios de plantilla.
- Los PDFs subidos se validan por extensión, MIME y tamaño.

## Estado

- Institución, checklist, resolución de plantilla y ruta de soffice son todos dirigidos por configuración.
- Verificado end-to-end (login → formulario → preview de PDF) en el stack de Docker.
