# Diseño: módulo `pos_reparto_comision` (comisión de vendedor sobre el cobro)

**Fecha:** 2026-09-02
**Contexto:** Ítem 3 de los gaps Must/Should del relevamiento v2.0 (RF-GV-03). Cubre "comisión sobre pedidos generados" del docx original, corregido en este brainstorming: el cliente aclaró que la comisión se devenga cuando se le cobra al **cliente**, no cuando se carga el pedido — ver "Corrección respecto al relevamiento" abajo.

## Objetivo

Cada vendedor tiene un % de comisión fijo. Ese % se aplica sobre lo que efectivamente se le cobra al cliente (no sobre el total del pedido al momento de cargarlo). Gerencia (`group_reparto_gerencia`) necesita un panel simple: comisión devengada por vendedor, agregada, filtrable por rango de fechas.

## Corrección respecto al relevamiento

`ESTADO_PROYECTO.md` y la memoria de requerimientos v2.0 tenían anotado "RF-GV-03: comisión se calcula sobre pedidos generados, NO sobre el cobro" como ambigüedad ya resuelta con el cliente el 2026-08-24. En este brainstorming (2026-09-02) el cliente aclaró en vivo que es al revés: la comisión se cobra "al momento de cobrarle al cliente", no al vender. Se prioriza esta aclaración por ser la más reciente y explícita. Queda pendiente actualizar `ESTADO_PROYECTO.md` y la memoria correspondiente una vez mergeado este módulo, dejando constancia del cambio.

## Decisiones tomadas en el brainstorming

- **% fijo por vendedor**, no variable por producto/categoría — un solo campo.
- **Se guarda en `res.users`** (el vendedor es quien hace login al POS), no en `res.partner`.
- **Pago parcial de un cliente a crédito devenga comisión proporcional** — no hay que esperar a que el pedido quede 100% saldado.
- **El % se congela en el momento del cobro** (no una vista recalculada en vivo). Si Gerencia cambia el % de un vendedor, los cobros ya registrados no se recalculan — mismo espíritu que RNF-07 (historial inmutable). Esto obliga a usar una tabla real con lógica de creación en el momento del evento, no una vista SQL de solo lectura.
- **Atribución del cobro al vendedor: vía `partner_id.user_id`** (el mismo campo que ya usa `pos_reparto_security` para "mis clientes asignados"), no vía el cajero que atendió la sesión de POS. Como un cliente tiene un solo vendedor asignado, no hace falta prorratear un pago entre varios vendedores.
- **No hay atribución pedido-por-pedido en cobros de cuenta corriente.** Cuando un cliente con varios pedidos sin pagar hace un pago (total o parcial), la línea de comisión se genera por el pago en sí (monto y fecha del `account.payment`), no repartida entre los pedidos pendientes de ese cliente. Alcanza para el panel agregado que pidió Gerencia; ver "Fuera de alcance".
- **Addon nuevo y separado** (`pos_reparto_comision`), convención del proyecto. Depende de `point_of_sale`, `account` y `pos_reparto_security` (reusa sus 4 grupos).

## Arquitectura

```
addons/pos_reparto_comision/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── res_users.py           (campo reparto_comision_pct)
│   ├── comision_linea.py      (modelo pos.reparto.comision.linea)
│   ├── pos_order.py           (hook: cobro inmediato en POS)
│   └── account_payment.py     (hook: cobro de cuenta corriente)
├── views/
│   ├── res_users_views.xml        (campo % en el form de usuario, restringido a Gerencia)
│   └── comision_linea_views.xml   (panel lista/pivot + menú, restringido a Gerencia)
├── security/
│   └── ir.model.access.csv
└── tests/
    ├── __init__.py
    └── test_reparto_comision.py
```

## Componentes

### 1. Campo de configuración (`models/res_users.py`)

`reparto_comision_pct` (Float, default 0.0) en `res.users`. En la vista de usuario, el campo va envuelto en `groups="pos_reparto_security.group_reparto_gerencia"` — solo Gerencia lo ve/edita, igual criterio que el comment ya existente en `group_reparto_gerencia` ("acceso protegido a... comisiones").

### 2. Modelo `pos.reparto.comision.linea` (`models/comision_linea.py`)

Tabla real (no vista SQL, ver "% congelado" arriba). Campos:

- `vendedor_id` (Many2one `res.users`, requerido)
- `partner_id` (Many2one `res.partner`, requerido)
- `fecha` (Date, requerido) — fecha del pedido (venta directa) o del pago (cobro a crédito)
- `origen` (Selection: `venta_directa` / `cobro_credito`, requerido)
- `monto_cobrado` (Monetary, requerido)
- `comision_pct` (Float, requerido) — snapshot del % del vendedor al momento de crear la línea
- `comision_monto` (Monetary, compute `store=True`, `monto_cobrado * comision_pct / 100`)
- `pos_payment_id` (Many2one `pos.payment`, nullable) — origen si `origen=venta_directa`
- `account_payment_id` (Many2one `account.payment`, nullable) — origen si `origen=cobro_credito`
- Constraint SQL: exactamente uno de `pos_payment_id` / `account_payment_id` debe estar seteado (chk o validación Python), y cada uno es único en la tabla (evita duplicar la línea si el hook se dispara dos veces sobre el mismo pago).

Sin vistas de edición manual — se crea solo desde los hooks. Acceso de lectura restringido a `group_reparto_gerencia` vía `ir.model.access.csv` (Vendedor/Depósito/Admin Operativa no tienen acceso al modelo).

### 3. Hook — cobro inmediato en POS (`models/pos_order.py`)

Override de `pos.order` (`write`/método que marca el pedido pagado, según el hook que ya usa `pos_reparto_remito` como referencia — mismo punto de enganche que "al pagar").

Cuando el pedido llega a estado pagado (`paid`/`done`/`invoiced`):

- Por cada `pos.payment` del pedido cuyo `payment_method_id.type != 'pay_later'`, crear (si no existe ya una línea con ese `pos_payment_id`) una `pos.reparto.comision.linea`:
  - `vendedor_id = partner_id.user_id`
  - `fecha = date_order`
  - `origen = 'venta_directa'`
  - `monto_cobrado = pos_payment.amount`
  - `comision_pct = vendedor_id.reparto_comision_pct`
- Si `partner_id.user_id` está vacío, no se crea línea (sin vendedor asignado, no hay a quién atribuir — no es un error).
- Los `pos.payment` de tipo `pay_later` del mismo pedido **no** generan línea acá — se cubren en el hook de `account.payment` cuando se cobren de verdad.

### 4. Hook — cobro de cuenta corriente (`models/account_payment.py`)

Override de `create`/`write` de `account.payment`, mismo patrón defensivo que ya usa `pos_reparto_credito/models/account_payment.py` (recalcular en create/write/unlink).

Cuando un `account.payment` queda en estado `in_process` o `paid` (mismo filtro que usa `pos_reparto_credito` para "último pago"), `payment_type = 'inbound'`, y tiene `partner_id`:

- Si `partner_id.user_id` existe, crear (si no existe ya línea con ese `account_payment_id`) una `pos.reparto.comision.linea`:
  - `vendedor_id = partner_id.user_id`
  - `fecha = payment.date`
  - `origen = 'cobro_credito'`
  - `monto_cobrado = payment.amount`
  - `comision_pct = vendedor_id.reparto_comision_pct`
- Si el pago se anula/vuelve a borrador o se borra (`unlink`), se borra la línea de comisión asociada.

### 5. Panel para Gerencia (`views/comision_linea_views.xml`)

- `ir.actions.act_window` sobre `pos.reparto.comision.linea`, vista lista + pivot.
- Vista lista: columnas vendedor, cliente, fecha, origen, monto cobrado, %, comisión. `default_order="fecha desc"`.
- Vista pivot: filas = vendedor, columnas = fecha (mes), medida = `comision_monto`. Filtro de fecha nativo del search view (rango + agrupado por vendedor).
- Menú nuevo "Comisiones" dentro de la app Punto de Venta, visible solo para `group_reparto_gerencia` (`groups` en el `<menuitem>`, mismo patrón que el resto del proyecto).

## Flujo de datos end-to-end

1. Vendedor confirma pedido en POS. Si paga en efectivo/tarjeta → al pasar a `paid`, se crea línea `venta_directa` de inmediato con el % vigente del vendedor en ese momento.
2. Si paga con "Cuenta Corriente" → no se crea línea todavía; el pedido genera la línea contable de cuenta por cobrar (mecanismo ya validado en `pos_reparto_credito`).
3. Cuando alguien (oficina) registra el pago del cliente en Contabilidad (total o parcial) → se crea un `account.payment` inbound → se crea línea `cobro_credito` por ese monto, con el % vigente del vendedor en ese momento.
4. Gerencia entra al panel "Comisiones", filtra por rango de fechas y ve el total devengado por vendedor en ese período — sin importar si vino de venta directa o de cobro de cuenta corriente.

## Testing

`TransactionCase` en `tests/test_reparto_comision.py`, con fixtures propios:

1. Pedido pagado 100% en efectivo → se crea 1 línea `venta_directa` con el monto y % correctos.
2. Pedido a crédito (payment method `pay_later`) → no se crea ninguna línea al pagar el pedido.
3. Ese mismo cliente recibe 2 `account.payment` parciales después → se crean 2 líneas `cobro_credito`, cada una con su monto y fecha.
4. Pedido con tender mixto (parte efectivo + parte cuenta corriente) → solo se crea la línea de la porción en efectivo al pagar; la porción a crédito se cubre después vía el punto 3.
5. Cambiar `reparto_comision_pct` del vendedor después de creada una línea → la línea vieja conserva su `comision_pct` original (no se recalcula).
6. Cliente sin `user_id` asignado → ningún cobro suyo genera línea.
7. Anular/borrar un `account.payment` que ya generó línea → la línea se borra.
8. Acceso: usuario `group_reparto_vendedor` no puede leer `pos.reparto.comision.linea` ni ve el menú "Comisiones"; `group_reparto_gerencia` sí.

No se testea el panel pivot en sí (vista nativa de Odoo) con este framework — verificación visual en navegador antes de dar el módulo por terminado, según el checklist general del proyecto.

## Fuera de alcance (explícito)

- Sin atribución pedido-por-pedido en cobros de cuenta corriente cuando el cliente tiene varios pedidos pendientes (ver "Decisiones" arriba) — el panel es agregado por vendedor/período, no hay drill-down a "esta comisión corresponde a este pedido puntual".
- Sin reversión automática de comisión ante una devolución de un pedido ya cobrado — deuda técnica, se resuelve manualmente por Gerencia si aparece el caso.
- Sin integración con el módulo OCA `commission` (evaluado en el gap table original; se descarta porque está pensado para `sale.order`/facturación, y este proyecto corre sobre `pos.order` sin facturación, según ADR-001).
- Sin liquidación/pago de la comisión al vendedor (ej. generar un asiento o una orden de pago) — este módulo solo calcula y muestra cuánto se devengó, el pago real al vendedor sigue siendo un proceso externo/manual de Gerencia.
