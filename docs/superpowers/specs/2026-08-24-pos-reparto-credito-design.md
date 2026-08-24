# Diseño: módulo `pos_reparto_credito` (alerta de crédito y pantalla de deudores)

**Fecha:** 2026-08-24
**Contexto:** Bloque 2 del `ADR-001-arquitectura-toma-pedido.md`, pendiente desde que se cerró `pos_reparto_security` (mergeado a `main` el 2026-08-24, PR #1). Cubre RF-PV-07 del relevamiento v2.0: alerta a los 15 días o 2 visitas consecutivas sin cobro (esta primera versión solo implementa el criterio de días — ver "Fuera de alcance").

## Objetivo

Que el vendedor vea, al seleccionar un cliente en el POS, si tiene saldo pendiente y hace cuánto no paga; y que exista una pantalla "Deudores" donde cualquier rol pueda ver la lista completa (o la propia, si es Vendedor) ordenada por urgencia. Es alerta, no bloqueo — nunca impide facturar/vender.

## Decisiones tomadas en el brainstorming

- **Fuente de la deuda: contabilidad estándar de Odoo, sin inventar nada nuevo.** El cliente vende a crédito con el método de pago nativo de POS "Cuenta Corriente" (tipo `pay_later`) — se verificó en el código de `point_of_sale` (`pos_session.py`, función `_create_pay_later_receivable_lines`) que este método genera una línea contable de cuenta por cobrar (`account.move.line`, cuenta `asset_receivable`) al cerrar la sesión, **sin necesitar factura**. Esto confirma que la decisión de ADR-001 de resolver "a crédito" sin forzar facturación es técnicamente viable.
- **"Deudor" = cualquier cliente con saldo pendiente** (no solo los que ya pasaron el límite de 15 días). La pantalla lista a todos los que deben algo, y los ordena para que los más urgentes floten arriba — así no hay que ir a buscarlos.
- **Orden de la lista: solo por días sin pago** (no se combina con el conteo de visitas en esta versión — ver "Fuera de alcance").
- **Pago parcial reinicia el contador de días.** Si un cliente debe $10.000 en pedidos viejos y paga $2.000, `dias_sin_pago` vuelve a 0 aunque sigan pendientes $8.000. La razón de negocio (tal como está en RF-PV-07) es que un pago, aunque sea parcial, es señal de que el cliente sigue activo/de buena fe — se reevalúa desde ese momento.
- **El popup en POS aparece siempre que haya saldo pendiente** (no solo en naranja/rojo) y **nunca bloquea** la venta.
- **Visibilidad de la pantalla Deudores: los 4 roles, por ahora.** Vendedor ve solo lo suyo (reusa la regla ya existente de `pos_reparto_security` sobre `res.partner`). Depósito, Admin Operativa y Gerencia ven todo — se restringe más adelante si en el uso real se decide que no corresponde.
- **Addon nuevo y separado** (`pos_reparto_credito`), según la convención del proyecto de un módulo por feature grande (documentada en `INSTRUCTIVO_SETUP.md`). Depende de `pos_reparto_security` para reusar sus 4 grupos y la regla de visibilidad de clientes.

## Arquitectura

Módulo nuevo `pos_reparto_credito`. Depende de `point_of_sale`, `account` y `pos_reparto_security`.

```
addons/pos_reparto_credito/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   └── res_partner.py          (campos computados de deuda)
├── views/
│   ├── res_partner_deudores_views.xml   (acción + lista "Deudores" + menú)
│   └── pos_config_views.xml (si hace falta cargar campos extra al POS; ver sección offline)
├── static/src/                 (popup del POS, overrides de OWL)
│   ├── js/
│   │   └── client_debt_popup.js
│   └── xml/
│       └── client_debt_popup.xml
├── security/
│   └── ir.model.access.csv     (si aplica; probablemente no hace falta, ver más abajo)
└── tests/
    ├── __init__.py
    └── test_reparto_credito.py
```

## Componentes

### 1. Campos computados sobre `res.partner` (`models/res_partner.py`)

Tres campos `compute`, no almacenados (se recalculan al leer — volumen de clientes es chico, no justifica cron ni campos `store=True`):

- `credito_monto_adeudado` (Monetary): suma de `amount_residual` de las líneas de `account.move.line` de ese partner donde `account_id.account_type = 'asset_receivable'` y `reconciled = False`.
- `credito_fecha_ultimo_pago` (Date): fecha del `account.payment` más reciente conciliado contra alguna línea de ese partner (búsqueda vía las líneas de pago reconciliadas, `payment_id.date` máximo). Si el cliente nunca pagó nada, se usa la fecha de la línea de cuenta por cobrar más vieja sin conciliar (el primer pedido a crédito).
- `credito_dias_sin_pago` (Integer): `hoy - credito_fecha_ultimo_pago`, en días. Si `credito_monto_adeudado` es 0, este campo no es relevante (el cliente no es deudor).

Estos tres campos se calculan con un único método `_compute_credito_fields` que hace las búsquedas necesarias por partner (con `read_group`/agrupado para no hacer N+1 en la lista de deudores).

### 2. Pantalla "Deudores" (`views/res_partner_deudores_views.xml`)

- `ir.actions.act_window` sobre `res.partner`, dominio `[('credito_monto_adeudado', '>', 0)]`, `list` view (no form propio — usa el form estándar de contacto al entrar a un registro).
- Vista lista con `default_order="credito_dias_sin_pago desc"`.
- Columnas: nombre del cliente, `credito_dias_sin_pago`, `credito_monto_adeudado`, `user_id` (vendedor asignado), fecha del pedido más viejo sin pagar, teléfono, dirección.
- Decoraciones de color sobre `credito_dias_sin_pago`: `decoration-danger` si `>= 15`, `decoration-warning` si `>= 10`, sin decoración (color normal/verde implícito) si `< 10`.
- Menú nuevo "Deudores" dentro de la app **Punto de Venta**, visible para los 4 grupos de `Reparto` (sin restricción adicional de `ir.rule` — la regla de visibilidad de clientes por vendedor ya existente en `pos_reparto_security` alcanza para que un Vendedor vea solo los suyos; el resto ve todo por ausencia de regla, mismo patrón que ya está documentado en el spec de `pos_reparto_security`).

### 3. Popup en el POS al seleccionar cliente (`static/src/js/client_debt_popup.js`)

Override del flujo de selección de cliente en el frontend de POS (OWL). Cuando se selecciona/cambia el cliente del pedido:

- Si `credito_monto_adeudado > 0`, se muestra una notificación/diálogo no bloqueante con: nombre del cliente, monto adeudado, días sin pago, y el mismo código de color que la pantalla Deudores (verde/naranja/rojo).
- Nunca impide continuar con la venta — es puramente informativo, el vendedor cierra el aviso y sigue.

**Consideración offline (crítica, dado que el POS es offline-first):** los tres campos de deuda tienen que agregarse a los campos que Odoo POS precarga en el cliente (`_load_pos_data_fields` de `res.partner`, mismo mecanismo que ya usa `point_of_sale` para todo el catálogo). Esto significa que el dato que ve el vendedor en la tablet es el de la última sincronización, no en tiempo real — igual que pasa hoy con stock y precios en el spike ya validado. No es un problema nuevo, es el mismo comportamiento conocido del proyecto; se documenta acá para que no sorprenda en el testing offline.

## Flujo de datos end-to-end

1. Vendedor confirma un pedido en el POS con método de pago "Cuenta Corriente" (`pay_later`) — requiere cliente seleccionado (restricción nativa de Odoo para este tipo de pago).
2. Al cerrar la sesión de POS, Odoo genera la línea contable de cuenta por cobrar a nombre de ese cliente (mecanismo nativo, sin cambios).
3. Los campos computados de `res.partner` reflejan esa deuda la próxima vez que se leen (pantalla Deudores, o próxima sincronización del POS).
4. Cuando el cliente paga (total o parcial), se registra en Contabilidad (Clientes > Pagos, o desde la ficha del partner) y se concilia contra la línea pendiente más vieja.
5. Esa reconciliación actualiza `credito_fecha_ultimo_pago` a la fecha del pago nuevo → `credito_dias_sin_pago` vuelve a 0, aunque `credito_monto_adeudado` no llegue a cero.

## Testing

`TransactionCase` en `tests/test_reparto_credito.py`, con fixtures propios (sin datos demo):

1. Crear un cliente, generar líneas de `account.move.line` de cuenta por cobrar con fechas distintas (simulando pedidos a crédito) sin pasar por todo el flujo de POS/sesión (se puede crear el `account.move` directo para no depender de todo el circuito de POS en el test).
2. Verificar que `credito_monto_adeudado` suma correctamente las líneas sin conciliar.
3. Verificar que `credito_dias_sin_pago` usa la fecha de la línea más vieja cuando no hay pagos.
4. Registrar un `account.payment` parcial, conciliar, y verificar que `credito_dias_sin_pago` se resetea a 0 mientras `credito_monto_adeudado` baja pero no llega a 0.
5. Verificar el orden de la pantalla Deudores (`default_order`) con 3 clientes en distintos estados (verde/naranja/rojo).
6. Verificar visibilidad: un usuario con `group_reparto_vendedor` y clientes propios (`user_id`) solo ve sus deudores en la acción; un usuario con `group_reparto_gerencia` los ve todos.

No se testea el popup del frontend de POS (JS/OWL) con este framework — queda para prueba manual/QA en navegador antes de dar el módulo por terminado, según indica el checklist general de "for UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete".

## Fuera de alcance (explícito)

- **Criterio de "2 visitas consecutivas sin cobro"** de RF-PV-07 no se implementa en esta versión — solo el criterio de días. Requiere trackear visitas (pedidos) por cliente independientemente de si generaron deuda, lo cual es una pieza de datos distinta (secuencia de pedidos, no de pagos). Queda anotado como mejora futura sobre este mismo módulo.
- No se restringe la visibilidad de la pantalla Deudores para Depósito/Admin Operativa todavía — decisión explícita de dejarlo abierto y restringir después si hace falta.
- No se toca el flujo de facturación (sigue 100% fuera de alcance del proyecto).
- No se automatiza el registro del pago (sigue siendo manual, vía Contabilidad estándar de Odoo) — este módulo solo lee y muestra, no escribe pagos.
- La grabación de un walkthrough en video para mostrarle al cliente (vía extensión de Chrome) es un paso posterior, fuera de este módulo — se hace una vez que esté instalado y probado.
