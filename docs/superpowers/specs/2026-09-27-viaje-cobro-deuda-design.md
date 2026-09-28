# Viajes: mostrar deuda y cobrar tocando el importe

**Fecha:** 2026-09-27
**Fase:** 4 del roadmap v3 ([[project_reparto_v3_roadmap_2026-09-26]]), RF-V05.
**Módulo:** extiende `pos_reparto_viaje` (nuevas dependencias: `account`, `pos_reparto_credito`).

## Contexto

Hoy `viaje_screen.js` solo tilda la parada cuando el chofer carga un pedido nuevo (`_reparto_viaje_marcar_parada_visitada` en `pos_reparto_viaje/models/pos_order.py`). No muestra deuda ni permite cobrarla — para cobrar una deuda vieja hay que ir a `Facturación → Clientes → Pagos → Nuevo`, algo que **solo Gerencia** puede hacer y que no tiene sentido pedirle a un chofer parado en la puerta de un cliente. Esta fase agrega un cobro rápido directo en la pantalla Viaje.

Depende del fix de conciliación automática ya mergeado ([[project_pago_reconciliacion_fix_2026-09-27]]) — sin eso, un cobro nuevo no bajaría la deuda visible.

## Backend

### `reparto.viaje.get_mi_viaje_hoy()`
Cada parada del diccionario devuelto suma un campo `deuda_monto` = `partner.credito_monto_adeudado` (0 si no debe nada).

### `reparto.viaje.parada.action_cobrar_deuda(self, monto, medio)`
Nuevo método, callable por RPC desde el Vendedor dueño del viaje.

1. `self.ensure_one()`.
2. Si `self.viaje_id.chofer_id.id != self.env.uid`: `UserError` — no puede cobrar una parada de otro chofer, aunque intente llamar el método directo sin pasar por la UI.
3. `partner = self.partner_id`. Si `monto <= 0` o `monto > partner.credito_monto_adeudado`: `UserError` (mensaje claro: "El monto no puede ser mayor a la deuda actual ($X)").
4. `medio` es `'efectivo'` o `'transferencia'`. Se resuelve el `account.journal` a usar por `type` (`'cash'` para efectivo, `'bank'` para transferencia) — mismo criterio de clasificación que ya usa `pos_reparto_caja` (`comision_linea._compute_caja_medio`), no se acopla a un journal por nombre.
5. Con `.sudo()` (el Vendedor no tiene acceso directo a `account.payment`): crea el `account.payment` (`payment_type='inbound'`, `partner_type='customer'`, `partner_id=partner.id`, `amount=monto`, `journal_id=<resuelto>`) y `action_post()`. Esto ya dispara solo, sin código nuevo:
   - Conciliación automática contra la deuda (fix de `pos_reparto_credito`).
   - Línea de comisión `cobro_credito` (hook existente de `pos_reparto_comision`).
   - Clasificación en Caja Efectivo/Transferencia (hook existente de `pos_reparto_caja`).
6. `self.write({'visitado': True})` — cobrar cuenta como visita, aunque no haya pedido nuevo ese día.
7. Devuelve el nuevo `credito_monto_adeudado` del cliente (para refrescar la UI sin otro roundtrip).

## Frontend (`viaje_screen.js` / `.xml`)

- Cada parada con `deuda_monto > 0` muestra el monto en rojo debajo del nombre del cliente.
- Tocar el monto (no el resto de la fila, que sigue abriendo el POS) abre un diálogo: input numérico precargado con `deuda_monto`, selector Efectivo/Transferencia, botones Cancelar/Continuar.
- Al tocar **Continuar**, se muestra un **segundo diálogo de confirmación** ("¿Confirmás cobrar $X a <cliente> por <medio>? No se puede deshacer desde acá.") con Cancelar/Confirmar — recién ahí se llama `action_cobrar_deuda`. Doble confirmación a propósito: es plata real y no hay deshacer en esta pantalla.
- Al confirmar el cobro: se actualiza `deuda_monto` y `visitado` de esa parada en el estado local, sin recargar toda la pantalla.
- Si el RPC devuelve error (`UserError`), se muestra con el mismo mecanismo de diálogo de alerta que ya usa `pos_reparto_credito` (`AlertDialog`).

## Seguridad

- Sin ACL nueva sobre `account.payment` para `group_reparto_vendedor` — la creación pasa por `.sudo()` dentro del método controlado (mismo patrón que los hooks de `pos_reparto_comision`).
- Único control nuevo: la validación `chofer_id == env.uid` dentro de `action_cobrar_deuda`, más el tope `monto <= credito_monto_adeudado`. Ninguno de los dos es un `ir.rule` — son validaciones de negocio dentro del método, porque dependen del monto/partner de la llamada, no solo de a qué registros se puede leer.
- Gerencia/Administración no ganan ni pierden acceso — siguen usando `Facturación → Pagos` para lo que no sea "cobro rápido en la calle" (sobrepago, corrección de un cobro mal cargado, etc.).

## Testing

- `action_cobrar_deuda` crea y postea el `account.payment` correcto (monto, partner, journal según `medio`).
- El cobro reduce `credito_monto_adeudado` del cliente (usa el fix de conciliación).
- El cobro genera una línea de comisión `cobro_credito` (verificar que el hook existente de `pos_reparto_comision` se dispara).
- El cobro clasifica en la Caja correcta según `medio` (verificar que el hook existente de `pos_reparto_caja` se dispara).
- `action_cobrar_deuda` marca `visitado=True` en la parada.
- Rechaza `monto <= 0`.
- Rechaza `monto > credito_monto_adeudado` (sin sobrepago desde esta pantalla).
- Rechaza cobrar una parada de **otro** chofer (`UserError`), llamando el método directo con `with_user()`.
- `get_mi_viaje_hoy()` incluye `deuda_monto` por parada, en `0.0` para clientes al día.

## Fuera de alcance (esta fase)

- Sin sobrepago desde esta pantalla — se sigue usando `Facturación → Pagos` para eso.
- Sin deshacer un cobro rápido desde Viaje — un error se corrige como cualquier `account.payment` desde Contabilidad, como hasta ahora.
- Sin elegir manualmente qué línea de deuda conciliar — sigue siendo FIFO automático (mismo criterio que toda la cuenta corriente, fase 3).
- Gerencia/Administración no tienen esta pantalla de cobro rápido — es específica de Vendedor en Viaje.
