# Cuenta corriente: extracto con filtro por vendedor

**Fecha:** 2026-09-27
**Fase:** 3 del roadmap v3 ([[project_reparto_v3_roadmap_2026-09-26]]), RF-G05 / RF-A04 / RF-V04.
**Módulo:** extiende `pos_reparto_credito` (no se crea módulo nuevo).

## Contexto

`pos_reparto_credito` ya calcula deuda actual por cliente (`credito_monto_adeudado`, etc.) contra `account.move.line` (`account_type='asset_receivable'`, `reconciled=False`, `parent_state='posted'`) y `account.payment` (inbound). Falta una pantalla tipo **extracto**: historial completo de movimientos (pedidos a crédito + pagos) con saldo acumulado, no solo el saldo actual.

Nota: el docx original de los RF-G05/RF-A04/RF-V04 (reunión con cliente 2026-09-26) no quedó guardado en el repo — este spec se basa en el resumen de memoria de esa reunión (`project_reparto_v3_roadmap_2026-09-26`) y en las decisiones tomadas con el usuario en esta sesión de brainstorming.

**Modelo de roles ya existente y reusado sin cambios:**
- `res.partner` tiene `ir.rule` (`pos_reparto_security/security/reparto_partner_rules.xml`) que restringe `group_reparto_vendedor` a `partner_id.user_id = user.id` (+ su propio contacto). El campo `user_id` de `res.partner` (Vendedor/Salesperson) es el criterio de "filtro por vendedor" en todo el proyecto — este spec no inventa un campo nuevo, lo reusa.
- `group_reparto_adminop` y `group_reparto_gerencia` no tienen esa restricción — ven todos los clientes.

## Modelo de datos

Nuevo modelo SQL view (`auto=False`, sin tabla propia) `reparto.cuenta.corriente.movimiento`, definido con `init()` sobre una query `UNION ALL`:

**Debe (pedidos a crédito):**
```sql
SELECT aml.id AS move_line_id, NULL AS payment_id,
       aml.partner_id, aml.date AS fecha, 'pedido' AS tipo,
       am.name AS referencia,
       (aml.debit - aml.credit) AS debe, 0 AS haber
FROM account_move_line aml
JOIN account_move am ON am.id = aml.move_id
WHERE aml.account_type = 'asset_receivable' AND am.state = 'posted' AND aml.partner_id IS NOT NULL
```

**Haber (pagos):**
```sql
SELECT NULL AS move_line_id, ap.id AS payment_id,
       ap.partner_id, ap.date AS fecha, 'pago' AS tipo,
       ap.name AS referencia,
       0 AS debe, ap.amount AS haber
FROM account_payment ap
WHERE ap.payment_type = 'inbound' AND ap.state IN ('in_process', 'paid') AND ap.partner_id IS NOT NULL
```

Ambas partes se combinan con `UNION ALL`, y sobre el resultado se calcula:
- `vendedor_id`: join a `res_partner` para traer `user_id` del cliente (denormalizado en la vista, para poder filtrar/agrupar sin join adicional en cada búsqueda del usuario).
- `saldo`: `SUM(debe - haber) OVER (PARTITION BY partner_id ORDER BY fecha, id)` — saldo acumulado por cliente, en su propio orden cronológico.

Campos del modelo: `partner_id` (Many2one), `vendedor_id` (Many2one, related denormalizado, solo lectura), `fecha` (Date), `tipo` (Selection: pedido/pago), `referencia` (Char), `debe` (Monetary), `haber` (Monetary), `saldo` (Monetary).

Sin `move_id`/`payment_id` expuestos como campos navegables (confirmado: sin drill-in en esta fase). Se guardan internamente en la query solo si hacen falta para debug, pero no se declaran como Many2one en el modelo Python para no abrir la puerta a abrir el comprobante desde la vista.

## Vista y menú

- Vista `list` (sin `form`), orden por defecto `partner_id, fecha, id`.
- Columnas: Cliente, Vendedor, Fecha, Tipo, Referencia, Debe, Haber, Saldo.
- Decoración `decoration-danger="saldo > 0"` en la fila (mismo lenguaje visual que la lista de Deudores existente).
- Search view: filtros por Cliente, por Vendedor (`vendedor_id`), por rango de fecha (filtros nativos). `groupby` por defecto: Cliente.
- 1 menú "Cuenta Corriente" bajo Punto de Venta, junto al menú "Deudores" ya existente. El mismo menú/acción sirve para los 3 roles — no hay pantallas separadas por rol.

## Seguridad

- `ir.model.access.csv`: `perm_read=1` para `group_reparto_vendedor`, `group_reparto_adminop`, `group_reparto_gerencia` sobre `reparto.cuenta.corriente.movimiento`. Sin write/create/unlink (SQL view, no aplica).
- `ir.rule` nueva, mismo criterio que la de `res.partner`: para `group_reparto_vendedor`, dominio `[('partner_id.user_id', '=', user.id)]`. Sin rule para Admin/Gerencia (ven todo).
- Al ser modelo separado (SQL view), **no se otorga acceso nuevo** a `account.move.line` ni `account.payment` — Vendedor y Administración Operativa siguen sin poder entrar a Contabilidad/Facturación por esta vía. Evita expandir el alcance de permisos más allá de lo pedido.

## Testing

- Movimiento de debe se genera correctamente al crear una línea de cuenta por cobrar (reusar helper `_crear_linea_por_cobrar` existente en los tests de `pos_reparto_credito`).
- Movimiento de haber se genera correctamente al registrar un pago inbound.
- Saldo acumulado correcto con 2+ movimientos en fechas distintas para el mismo cliente (secuencia debe/haber/debe → verificar cada saldo intermedio, no solo el final).
- Dos clientes distintos no mezclan su saldo acumulado (partición por `partner_id` funciona).
- Seguridad: Vendedor (`with_user`) no ve movimientos de un cliente que no es suyo (`user_id` distinto), igual patrón que el test ya existente `test_reasignar_partner_de_linea_actualiza_ambos_clientes` / los tests de la acción de Deudores.
- Admin/Gerencia ven movimientos de todos los clientes sin restricción.
- Filtrar por `vendedor_id` devuelve solo los movimientos de los clientes de ese vendedor.

## Fuera de alcance (esta fase)

- Drill-in al comprobante original (`account.move` / `account.payment`) desde una fila del extracto.
- Edición o corrección de movimientos desde esta pantalla (es de solo lectura).
- Exportación a PDF/Excel — queda para la fase 6 (listado de despacho).
- Reporte histórico con filtro de fecha persistido/guardado — se usa el buscador nativo de Odoo, transitorio por sesión, no guardado como preferencia.
