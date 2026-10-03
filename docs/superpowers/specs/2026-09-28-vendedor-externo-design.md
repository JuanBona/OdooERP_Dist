# Diseño: vendedor externo sin comisión (RF-U01, fase 7)

**Fecha:** 2026-09-28
**Contexto:** Fase 7 del roadmap acordado el 2026-09-26 (ver `2026-09-26-pos-reparto-caja-design.md`). Toca `pos_reparto_comision` y `pos_reparto_caja`.

## Objetivo

Poder tener un **"Vendedor 04" externo**: un vendedor que **no usa camión ni POS propio** y al que **no se le paga comisión**. Se le asignan clientes (campo Vendedor del cliente) pero **Administración** carga y cobra por esos clientes.

## Decisiones tomadas en el brainstorming (2026-09-28)

- **Es externo, sin camión ni POS propio** (no usa `reparto_camion_asignado_id`, no abre sesión de POS, no tiene Viaje).
- **Administración cobra y no hay Rendición:** la plata ya está en la empresa. No genera comisión y no pasa por Rendición.
- **"Sin rendición" no es "sin registro".** El saldo de Cajas es `Σ rendiciones confirmadas − gastos`; si los cobros del externo no se sumaran de otra forma, nunca entrarían a la caja. Por eso las líneas de comisión **se siguen creando** (trazabilidad de qué se cobró de sus clientes) pero al 0%, y el saldo de Cajas las suma directo.
- **El usuario no puede iniciar sesión:** se crea sin contraseña ni grupos de Reparto.

## Diseño

Un campo nuevo en `res.users`: `reparto_es_externo` (Boolean, "Vendedor externo (sin comisión ni rendición)"). Sin restricción de lectura por grupo: `pos_reparto_caja` lo usa en dominios ejecutados por Administración, que no es Gerencia. Solo se edita desde el formulario de usuario, dentro de la pestaña "Comisión (Reparto)" que ya es exclusiva de Gerencia.

**`pos_reparto_comision`**
- `res.users._reparto_comision_pct_efectivo()`: devuelve `0.0` si el usuario es externo, si no `reparto_comision_pct`. Lo usan los dos hooks que crean líneas (venta directa en `pos_order.py` y cobro de cuenta corriente en `account_payment.py`), en lugar de leer `reparto_comision_pct` directo.
- El campo aparece en la pestaña "Comisión (Reparto)" del usuario.

**`pos_reparto_caja`**
- `reparto.caja.rendicion`: las líneas de un vendedor externo no cuentan como pendientes de rendir (ni para el monto esperado al crear, ni al ejecutar `action_rendir`). El campo `vendedor_id` excluye a los externos de su dominio.
- `reparto.caja.dashboard._saldo_caja`: suma, además de lo rendido, lo cobrado (`monto_cobrado`) por líneas de vendedores externos de esa caja (Efectivo o Transferencia).

**`deploy/carga_inicial.py`**: crea "Vendedor 04 (externo)" (login `vendedor04`) con `reparto_es_externo = True`, sin contraseña, sin grupos de Reparto, sin camión.

## Fuera de alcance

- **Ventas por vendedor (fase 5):** agrupa por el cajero del pedido (`pos.order.user_id`), así que las ventas de los clientes del Vendedor 04 aparecen a nombre de quien las cargó (Administración). Decisión aparte.
- No se agrega un POS nuevo para Administración: carga con "Punto de Venta Reparto".
- Marcar como externo a un usuario que ya tiene líneas históricas no reclasifica esas líneas: solo afecta cobros nuevos (las líneas viejas quedan con su porcentaje congelado y sin rendir).

## Tests

- Comisión: un externo con `reparto_comision_pct = 10` genera línea de venta directa y de cobro de crédito con `comision_pct = 0` y `comision_monto = 0`; un vendedor normal no cambia.
- Caja: las líneas de un externo no entran al monto esperado de una rendición ni las marca `action_rendir`; el saldo de Cajas suma lo cobrado por un externo en Efectivo y en Transferencia; un vendedor normal sigue igual.
