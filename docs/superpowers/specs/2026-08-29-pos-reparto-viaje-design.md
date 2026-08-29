# Diseño: `pos_reparto_viaje` — hoja de ruta ("Viaje")

**Fecha:** 2026-08-29
**Estado:** Aprobado, listo para plan de implementación.

## Contexto

Requisito surgido el 2026-08-24 preparando la demo al cliente (relevamiento v2.0, `Relevamiento_Requerimientos_Odoo_Reparto.docx`), documentado en memoria `project-reparto-v2-requirements`: antes de que el fletero/vendedor salga a repartir, alguien en oficina (Administración Operativa o Gerencia) arma la hoja de ruta del día — la lista de clientes que debe visitar — para que no se olvide de pasar por ninguno.

Es una pieza distinta de la "agrupación de pedidos por ruta" que ya estaba en el gap table del relevamiento (esa es post-hoc, para reportes/despacho, sobre pedidos ya cargados). Esto es planificación **previa** a la salida: una checklist de visitas del día, sin pedidos todavía.

Se apoya en la arquitectura decidida en `ADR-001-arquitectura-toma-pedido.md` (todo sobre POS, no `sale.order`) y reutiliza patrones ya construidos en `pos_reparto_security` (roles/reglas de acceso), `pos_reparto_home` (tile genérico por menú/acceso) y `pos_reparto_credito` (patch de `PosStore`, override de `create()` server-side para cubrir sync offline).

## Alcance

Un "viaje" = un chofer (rol Vendedor) + una fecha, con una lista de clientes a visitar ese día, armada a mano por Admin Operativa/Gerencia. Sin filtrado automático por zona ni día habitual (Google Maps y "productos habituales por cliente" quedan fuera, ya están en el gap table del relevamiento como ítems separados). Sin orden/secuencia entre paradas — es checklist, no ruta optimizada.

Fuera de alcance explícito (YAGNI para v1):
- Reordenar paradas (drag and drop).
- Motivo de "no vendió" al no generar pedido.
- Ver viajes futuros/pasados desde la pantalla del chofer (solo ve el de hoy).
- Bloquear que un mismo cliente esté en 2 viajes de choferes distintos el mismo día (ver deuda técnica).

## Modelo de datos

Módulo nuevo `pos_reparto_viaje`, depende de `point_of_sale` y `pos_reparto_security`.

### `reparto.viaje`

| Campo | Tipo | Notas |
|---|---|---|
| `fecha` | Date | Default hoy. Editable — Admin puede armar viajes para el día siguiente con anticipación. |
| `chofer_id` | Many2one `res.users` | Dominio: grupo Vendedor de `pos_reparto_security`. |
| `pos_config_id` | Many2one `pos.config` | Qué POS/camión usa ese viaje; lo elige Admin al crear. Todas las paradas del viaje comparten el mismo config. |
| `parada_ids` | One2many `reparto.viaje.parada` | |
| `paradas_totales` | Integer, compute | `len(parada_ids)`. |
| `paradas_completadas` | Integer, compute | Cuenta de `parada_ids` con `visitado=True`. |
| `progreso` | Float, compute | `paradas_completadas / paradas_totales * 100`, 0 si no hay paradas. Para widget `progressbar` en kanban/list. |

Constraint SQL: `UNIQUE(chofer_id, fecha)` — un chofer no puede tener 2 viajes el mismo día (evita ambigüedad en el auto-tick y en "el viaje de hoy" del chofer).

### `reparto.viaje.parada`

| Campo | Tipo | Notas |
|---|---|---|
| `viaje_id` | Many2one `reparto.viaje` | `ondelete=cascade`. |
| `partner_id` | Many2one `res.partner` | Requerido. |
| `visitado` | Boolean | Default `False`. Se marca sola (ver mecanismo de auto-tick), no editable a mano en v1. |
| `pedido_id` | Many2one `pos.order` | Readonly, se completa junto con `visitado`. |

Sin campo de secuencia/orden (decidido: lista sin orden).

## Reglas de acceso

Reutiliza los 4 grupos de `pos_reparto_security`, mismo patrón de `ir.rule` con domain imposible para bloqueo duro (no depender solo de `perm_*`):

- **Admin Operativa y Gerencia**: crear/leer/editar/borrar cualquier `reparto.viaje` y sus paradas.
- **Vendedor (chofer)**: solo lectura, dominio `chofer_id = uid AND fecha = today()`. Sin crear/editar/borrar — bloqueo duro con domain imposible, mismo patrón que `res.partner`/`pos.order` en `pos_reparto_security`.
- **Depósito**: sin acceso — no participa de este flujo.

## UX

### Chofer — tile "Viaje" en pantalla de Inicio

Aparece automáticamente en la grilla de `pos_reparto_home` (mecanismo genérico existente por visibilidad de menú — no requiere tocar ese módulo) para cualquier usuario con acceso de lectura a `reparto.viaje`.

Pantalla OWL táctil nueva (mismo estilo visual que la grilla de Inicio, ver `pos_reparto_home/static/src/home_screen.*` como referencia de patrón): lista de tarjetas grandes, una por parada del viaje de hoy del chofer logueado. Cada tarjeta muestra nombre del cliente y estado (pendiente / visitado con check verde). Tocar una parada pendiente abre una sesión de POS **nueva** con ese cliente ya seleccionado (ver mecanismo técnico abajo). Si el chofer no tiene viaje asignado hoy: mensaje "No tenés viaje asignado hoy", sin error.

### Admin Operativa / Gerencia — panel de progreso

Vista Kanban nativa de Odoo (sin OWL custom — no es pantalla táctil para estos roles) bajo menú "Reparto" → "Viajes", filtrada a hoy por defecto: una tarjeta por chofer con barra de progreso (`progreso`, widget `progressbar`). Click entra al formulario del viaje para editar la lista de paradas.

Alta de viaje: formulario estándar Odoo con `fecha`, `chofer_id`, `pos_config_id`, y `parada_ids` como lista editable (agregar cliente con buscador estándar de `res.partner`).

## Mecanismo técnico: deep-link a POS con cliente preseleccionado

Odoo no trae esto nativo — verificado contra el código fuente de `point_of_sale` (no hay soporte de query params ni contexto de acción para preseleccionar partner al abrir una sesión nueva).

Solución (mismo patrón ya usado en `pos_reparto_credito` para su patch de `PosStore`):

1. Al tocar una parada pendiente en la pantalla OWL del chofer, en vez de usar la acción estándar de abrir POS, navegar a `/pos/ui/<pos_config_id>?reparto_partner_id=<partner_id>`.
2. Patch JS chico en `pos_reparto_viaje/static/src/` sobre el arranque de `PosStore`: si `reparto_partner_id` está presente en la URL (`URLSearchParams` sobre `window.location.search`), crear una orden nueva y asignarle ese cliente automáticamente antes de mostrar la pantalla de venta.

## Mecanismo técnico: auto-tick de la parada

Override de `create()` en `pos.order` (server-side — cubre tanto venta online como sync offline posterior, mismo caso ya resuelto en `pos_reparto_credito` con `account.move.line`/`account.payment`).

Al crear un `pos.order` con `partner_id=X` y `user_id=<chofer>`:
1. Buscar `reparto.viaje.parada` con `viaje_id.chofer_id = <chofer>`, `viaje_id.fecha = today()`, `partner_id = X`, `visitado = False`.
2. Si hay match: marcar `visitado=True`, `pedido_id=<pedido nuevo>`.
3. Si no hay match (cliente fuera del viaje del día, o parada ya visitada): no hacer nada — no es un error, es el caso normal de una venta fuera de la hoja de ruta.

## Deuda técnica aceptada (v1)

Un mismo cliente en 2 viajes de choferes distintos el mismo día no está bloqueado por ningún constraint — es una carga manual de Admin, caso raro. Si ocurre, el primer pedido que se genere para ese cliente ese día tilda la primera parada que matchee (por antigüedad de creación de la parada), aunque corresponda al otro chofer. Aceptado porque requiere que Admin cargue el mismo cliente dos veces por error; si se vuelve un problema real, agregar validación cruzada entre viajes de la misma fecha.

## Testing

Tests Python (`tests/test_reparto_viaje.py`, mismo patrón que los módulos anteriores):

- Constraint única `(chofer_id, fecha)` — falla al crear un segundo viaje para el mismo chofer el mismo día.
- Auto-tick al crear `pos.order`: caso match (parada se marca visitada y queda linkeado el pedido), caso sin match (cliente no está en el viaje, no pasa nada), caso ya visitada (no se pisa `pedido_id` con un segundo pedido al mismo cliente).
- Acceso: chofer ve su viaje de hoy; no ve el viaje de otro chofer; no ve el viaje de otra fecha (ni pasado ni futuro); Admin Operativa y Gerencia ven todos; Depósito no tiene acceso.
- Cómputo de `paradas_totales`, `paradas_completadas`, `progreso` (incluyendo el caso 0 paradas → progreso 0, no división por cero).

Verificación manual en navegador: tocar tile "Viaje" → abre POS con el cliente correcto ya seleccionado; generar el pedido → la parada se tilda sola sin recargar nada raro; probar también el caso offline (cortar conexión, cobrar, reconectar/reabrir sesión) para confirmar que el auto-tick corre igual al sincronizar, como ya se validó en `pos_reparto_credito`.
