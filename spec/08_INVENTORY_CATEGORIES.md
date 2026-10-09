# Categorías de Inventario Configurables

## Propósito

Hacer configurables las categorías de inventario inferidas y eliminar la dependencia del acrónimo del cliente.

## Estado Actual

- `Services/InventoryCategoriesConfig.cs`: parsea `InventoryCategories:Categories` e `InventoryCategories:Statuses` (Name + Label + Tokens) con fallbacks genéricos (`other`/`active`).
- `ExcelInventoryImportService.cs`: `InferCategory`/`InferStatus` delegan en `InventoryCategoriesConfig` (listas de tokens hardcodeadas eliminadas).
- `AdminController.cs`: las listas de opciones de categoría/estado de inventario vienen de configuración.
- `frontend/src/config/appConfig.js` + `frontend/src/views/featureDisplay.js`: orden y etiquetas de categorías dirigidos por configuración.
- El stripping de `\bHSR\b` fue eliminado (verificado: sin coincidencias en el código).

## Cambios Requeridos

- Modelar categorías y estados como una lista configurable (configuración o gestionada por admin).
- Mantener los campos `InferredCategory` e `InferredStatus` y las reglas de alias genéricas.
- Eliminar el stripping de `\bHSR\b`.

## Reglas

- Las categorías deben poder agregarse y editarse sin cambios de código.
- El mapeo de importación debe seguir funcionando con una lista de categorías genérica.

## Criterios de Aceptación

- Agregar una categoría a la configuración la hace usable en la importación y el filtrado.
- No queda lógica de acrónimos del cliente.

## Decisiones de implementación

- Las categorías se definen en configuración con un default genérico razonable; la importación las valida contra esa lista.
- El stripping de `HSR` se elimina; la normalización de texto queda genérica.
