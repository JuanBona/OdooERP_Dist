# Precio manual del vendedor con aprobación de administración

Fecha: 2026-11-22. Estado: diseño acordado con el usuario, sin implementar.

## 1. Qué se pide

- El vendedor puede poner a mano el precio unitario de un producto al cargar un pedido.
- Ese cambio vale **solo para esa línea de ese pedido**. El precio del catálogo no se toca, así que los vendedores no se pisan entre sí.
- Cuando administración revisa el pedido para autorizarlo (y mandarlo a depósito), ve una advertencia llamativa: qué producto cambió de precio, de cuánto a cuánto, qué vendedor lo hizo y cuándo, con historial.
- Administración debe resolver cada cambio antes de poder autorizar el pedido.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Qué cambia el vendedor | Solo el precio unitario. El descuento por tramos sigue automático. |
| Qué hace administración por línea | Aprobar, volver a precio de lista, o corregir a un tercer precio. |
| Pedidos de administración o gerencia | Entran autorizados como hoy, sin aprobación de precio. |
| "Autorizar todos" del camión | Deja afuera los pedidos con cambios pendientes y avisa cuántos quedaron. |
| Autorizar con cambios pendientes | Imposible. Se valida en la base, no solo en la pantalla. |
| Precio por debajo del costo | La fila se marca en rojo para administración y gerencia. |
| Alcance del cambio | Solo la línea del pedido. El costo de la línea no cambia: el profit sale del precio realmente vendido. |

## 3. Datos (base)

Cambios sobre `pedido_lineas`:

- `precio_lista numeric(12,2)`: precio del catálogo al momento de cargar el pedido.
- `precio_estado text`: `null` (sin cambio de precio), `pendiente`, `aprobado`, `repuesto` o `corregido`.
- `precio_cambiado_por uuid` (perfil del vendedor) y `precio_cambiado_en timestamptz`.

Tabla nueva `pedido_linea_precio_log` (historial, una fila por paso):

- `id`, `linea_id`, `pedido_id`, `usuario_id`, `accion` (`propuesto`, `aprobado`, `repuesto`, `corregido`), `precio_antes`, `precio_despues`, `creado_en`.
- Solo la leen administración y gerencia. Nadie escribe directo: solo las funciones de abajo.

Funciones:

- `crear_pedido` (la actual): deja de rechazar `precio_manual` a vendedores. Si el que carga es vendedor y el precio manual difiere del de lista, guarda la línea con `precio_estado = 'pendiente'` y crea la fila `propuesto` del log. Si el que carga es admin o gerencia, sigue como hoy (sin estado de precio). El descuento manual (`desc_manual`) sigue reservado a admin y gerencia.
- `resolver_precio_linea(p_linea, p_accion, p_precio)`: solo admin y gerencia, solo sobre líneas `pendiente`. Acciones: aprobar (deja el precio), reponer (vuelve a `precio_lista`), corregir (usa `p_precio`). Recalcula el total de la línea y del pedido y registra el log.
- Autorización (hoy `autorizarPedidos` en la API y el botón "Autorizar" del detalle): la base nunca autoriza un pedido con alguna línea `pendiente`. Autorizar un pedido suelto con cambios pendientes da error ("Resolvé los cambios de precio primero"). "Autorizar todos" no da error: autoriza los demás, salta esos pedidos y devuelve cuántos quedaron pendientes, para mostrar el aviso.
- Marca "por debajo del costo": se calcula en la base con el costo que ya guardan las tablas de costo (solo visibles para admin y gerencia). El vendedor no recibe esa información.

## 4. Pantalla de administración

- En la lista de camiones, el pedido con cambios muestra la etiqueta "⚠ Precio cambiado". El contador pasa a "N por autorizar · M con precio cambiado".
- En el detalle del pedido, recuadro de color arriba con una fila por línea cambiada: `Coca 1.5L · lista $1.200 → Nico puso $1.000 (−17%) · 14:32`.
- Cada fila: **Aprobar**, **Volver a lista**, **Corregir precio** (campo para escribir otro precio) y **Ver historial**.
- Atajo "Aprobar todos los cambios de este pedido".
- El botón **Autorizar** queda deshabilitado mientras haya filas pendientes.
- Fila en rojo con "por debajo del costo" cuando el precio queda bajo el costo.

## 5. Vendedor y otros roles

- El vendedor ve el ✎ en la línea del carrito, pero el cuadro solo ofrece el precio unitario.
- Mientras está pendiente, su pedido muestra "precio a confirmar por administración". Al resolverse ve el precio final y si fue repuesto o corregido.
- Depósito no ve nada de esto: solo recibe pedidos ya autorizados.
- Sin conexión: el pedido cargado sin señal viaja con el precio manual igual que hoy y entra como pendiente al sincronizar.
- La demo (`api/demo.js`) replica la misma regla que la base.

## 6. Pruebas

Tests SQL de permisos y circuito (`app/supabase/test`):

- El vendedor puede crear un pedido con precio manual; queda `pendiente` con `precio_lista` y log.
- El vendedor no puede resolver, ni cambiar el descuento, ni leer el log.
- Depósito no ve líneas pendientes.
- No se autoriza un pedido con líneas pendientes, ni directo ni con "Autorizar todos".
- Aprobar, reponer y corregir recalculan totales y escriben el log.
- Pedido cargado por admin o gerencia no genera estado de precio.
- Marca "por debajo del costo" solo visible para admin y gerencia.

## 7. Documentación

Actualizar el manual de usuario y las guías de vendedor y administración junto con el código.
