# Vendedor externo sin comisión Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un vendedor marcado como externo genera líneas de comisión al 0%, no pasa por Rendición y sus cobros suman directo al saldo de Cajas.

**Architecture:** Un Boolean `reparto_es_externo` en `res.users` (módulo `pos_reparto_comision`) más un helper `_reparto_comision_pct_efectivo()` que usan los dos hooks de líneas; `pos_reparto_caja` excluye a los externos de la rendición y los suma al saldo. Spec: `docs/superpowers/specs/2026-09-28-vendedor-externo-design.md`.

**Tech Stack:** Odoo 19 CE (Python, XML), tests `TransactionCase`.

---

## Comando de referencia (Windows + Git Bash, Docker Desktop levantado)

Desde `C:\Users\franc\OdooERP_Dist`. `MSYS_NO_PATHCONV=1` evita que Git Bash rompa `/modulo`.

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo \
  -u pos_reparto_comision,pos_reparto_caja --test-tags /pos_reparto_comision,/pos_reparto_caja \
  --stop-after-init --http-port=8099 2>&1 | grep -E "post-tests|tests when loading|FAIL:|ERROR: Test"
```
Esperado: `N post-tests ...` y `0 failed, 0 error(s)`. Ignorar Tracebacks INFO de `FileNotFoundError` de filestore.

## File Structure

```
addons/pos_reparto_comision/
├── models/res_users.py            (modificar) reparto_es_externo + _reparto_comision_pct_efectivo
├── models/pos_order.py            (modificar) usar el helper
├── models/account_payment.py      (modificar) usar el helper
├── views/res_users_views.xml      (modificar) mostrar el campo
└── tests/test_reparto_comision.py (modificar) 2 tests nuevos
addons/pos_reparto_caja/
├── models/caja_rendicion.py       (modificar) excluir externos
├── models/caja_dashboard.py       (modificar) sumar cobrado por externos
└── tests/test_reparto_caja.py     (modificar) 4 tests nuevos
deploy/carga_inicial.py            (modificar) alta del Vendedor 04
```

---

### Task 1: Comisión al 0% para un vendedor externo

**Files:**
- Modify: `addons/pos_reparto_comision/models/res_users.py`, `models/pos_order.py`, `models/account_payment.py`, `views/res_users_views.xml`, `tests/test_reparto_comision.py`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de la clase `TestRepartoComision` en `addons/pos_reparto_comision/tests/test_reparto_comision.py` (usan los helpers ya existentes `_crear_vendedor`, `_crear_partner`, `_crear_orden`, `_crear_linea_por_cobrar`, `_crear_y_conciliar_pago`):
```python
    def test_vendedor_externo_venta_directa_genera_linea_al_0_por_ciento(self):
        externo = self._crear_vendedor('Vendedor Externo Venta', pct=10.0)
        externo.sudo().reparto_es_externo = True
        partner = self._crear_partner('Cliente Externo Venta', externo)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)

        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas.vendedor_id, externo)
        self.assertEqual(lineas.monto_cobrado, 500.0)
        self.assertEqual(lineas.comision_pct, 0.0)
        self.assertEqual(lineas.comision_monto, 0.0)

    def test_vendedor_externo_cobro_de_credito_genera_linea_al_0_por_ciento(self):
        externo = self._crear_vendedor('Vendedor Externo Cobro', pct=8.0)
        externo.sudo().reparto_es_externo = True
        partner = self._crear_partner('Cliente Externo Cobro', externo)
        linea_deuda = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=10))

        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 1000.0, fields.Date.today())

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas.comision_pct, 0.0)
        self.assertEqual(lineas.comision_monto, 0.0)
```
(El test existente `test_pedido_efectivo_pagado_genera_linea_venta_directa` ya cubre que un vendedor normal no cambia.)

- [ ] **Step 2: Correr y verificar que fallan**

Run: comando de referencia. Expected: FAIL/ERROR (`reparto_es_externo` no existe en `res.users`).

- [ ] **Step 3: Implementar el campo y el helper**

Reemplazar el contenido de `addons/pos_reparto_comision/models/res_users.py` por:
```python
from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    reparto_comision_pct = fields.Float(
        string='% Comisión (Reparto)',
        groups='pos_reparto_security.group_reparto_gerencia',
        help='Porcentaje fijo de comisión sobre lo que se le cobra a los '
             'clientes asignados a este vendedor.',
    )
    # Sin restricción de grupo: pos_reparto_caja lo usa en dominios que ejecuta Administración.
    reparto_es_externo = fields.Boolean(
        string='Vendedor externo (sin comisión ni rendición)',
        help='Vendedor que no usa camión ni POS propio. Administración carga y cobra por sus '
             'clientes: no genera comisión ni pasa por Rendición, y lo que cobra suma directo '
             'al saldo de Cajas.',
    )

    def _reparto_comision_pct_efectivo(self):
        """% de comisión a congelar en una línea nueva: 0 para un vendedor externo.
        Leer reparto_comision_pct exige sudo (es un campo de Gerencia): llamar como user.sudo()."""
        self.ensure_one()
        return 0.0 if self.reparto_es_externo else self.reparto_comision_pct
```

- [ ] **Step 4: Usar el helper en los dos hooks**

En `addons/pos_reparto_comision/models/pos_order.py` reemplazar la línea
`                'comision_pct': vendedor.sudo().reparto_comision_pct,`
por
`                'comision_pct': vendedor.sudo()._reparto_comision_pct_efectivo(),`

En `addons/pos_reparto_comision/models/account_payment.py` reemplazar la línea
`            'comision_pct': vendedor.sudo().reparto_comision_pct,`
por
`            'comision_pct': vendedor.sudo()._reparto_comision_pct_efectivo(),`

- [ ] **Step 5: Mostrar el campo en el formulario de usuario**

En `addons/pos_reparto_comision/views/res_users_views.xml` reemplazar `<field name="reparto_comision_pct"/>` por:
```xml
                        <field name="reparto_comision_pct" invisible="reparto_es_externo"/>
                        <field name="reparto_es_externo"/>
```

- [ ] **Step 6: Correr y verificar que pasan**

Run: comando de referencia. Expected: `0 failed, 0 error(s)` (incluye los tests viejos de comisión y de caja).

- [ ] **Step 7: Commit**

```bash
git add addons/pos_reparto_comision
git commit -m "feat(pos_reparto_comision): vendedor externo genera comision al 0%

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cajas — el externo no rinde y su cobrado suma directo al saldo

**Files:**
- Modify: `addons/pos_reparto_caja/models/caja_rendicion.py`, `models/caja_dashboard.py`, `tests/test_reparto_caja.py`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de la clase `TestRepartoCaja` en `addons/pos_reparto_caja/tests/test_reparto_caja.py` (usan `_crear_vendedor`, `_crear_partner`, `_crear_orden_pagada`, `_rendir_todo_pendiente`, `metodo_efectivo`, `metodo_debito`):
```python
    def _crear_externo(self, name):
        externo = self._crear_vendedor(name, pct=10.0)
        externo.sudo().reparto_es_externo = True
        return externo

    def test_lineas_de_externo_no_entran_al_esperado_de_la_rendicion(self):
        externo = self._crear_externo('Externo Sin Esperado')
        partner = self._crear_partner('Cliente Externo Sin Esperado', externo)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        self._crear_orden_pagada(partner, self.metodo_debito, 200.0)

        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': externo.id})

        self.assertEqual(rendicion.monto_esperado_efectivo, 0.0)
        self.assertEqual(rendicion.monto_esperado_transferencia, 0.0)

    def test_action_rendir_no_marca_lineas_de_externo(self):
        externo = self._crear_externo('Externo Sin Rendir')
        partner = self._crear_partner('Cliente Externo Sin Rendir', externo)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': externo.id})

        rendicion.action_rendir()

        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertFalse(linea.rendicion_id)

    def test_saldo_caja_suma_lo_cobrado_por_un_externo_sin_rendicion(self):
        dashboard = self.env['reparto.caja.dashboard'].create({})
        saldo_efectivo_inicial = dashboard.saldo_efectivo
        saldo_transferencia_inicial = dashboard.saldo_transferencia

        externo = self._crear_externo('Externo Saldo')
        partner = self._crear_partner('Cliente Externo Saldo', externo)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        self._crear_orden_pagada(partner, self.metodo_debito, 200.0)

        dashboard_2 = self.env['reparto.caja.dashboard'].create({})
        self.assertEqual(dashboard_2.saldo_efectivo, saldo_efectivo_inicial + 300.0)
        self.assertEqual(dashboard_2.saldo_transferencia, saldo_transferencia_inicial + 200.0)

    def test_saldo_caja_de_vendedor_normal_sigue_igual_hasta_rendir(self):
        dashboard = self.env['reparto.caja.dashboard'].create({})
        saldo_inicial = dashboard.saldo_efectivo

        vendedor = self._crear_vendedor('Vendedor Normal Saldo')
        partner = self._crear_partner('Cliente Normal Saldo', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)

        dashboard_2 = self.env['reparto.caja.dashboard'].create({})
        self.assertEqual(dashboard_2.saldo_efectivo, saldo_inicial)
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: comando de referencia. Expected: FAIL en los tests de externo (el esperado no es 0, `action_rendir` marca la línea, el saldo no suma).

- [ ] **Step 3: Excluir a los externos de la rendición**

En `addons/pos_reparto_caja/models/caja_rendicion.py`:

1. En el dominio del campo `vendedor_id`, reemplazar
`        domain=lambda self: [('group_ids', 'in', self.env.ref('pos_reparto_security.group_reparto_vendedor').id)],`
por
```python
        domain=lambda self: [
            ('group_ids', 'in', self.env.ref('pos_reparto_security.group_reparto_vendedor').id),
            ('reparto_es_externo', '=', False),
        ],
```
2. En `create`, dentro de `pendientes = Linea.search([...])`, agregar la condición al dominio:
```python
            pendientes = Linea.search([
                ('vendedor_id', '=', vendedor_id),
                ('vendedor_id.reparto_es_externo', '=', False),
                ('rendicion_id', '=', False),
            ])
```
3. En `action_rendir`, dentro de `pendientes = Linea.search([...])`:
```python
            pendientes = Linea.search([
                ('vendedor_id', '=', rendicion.vendedor_id.id),
                ('vendedor_id.reparto_es_externo', '=', False),
                ('rendicion_id', '=', False),
            ])
```

- [ ] **Step 4: Sumar lo cobrado por externos al saldo**

En `addons/pos_reparto_caja/models/caja_dashboard.py`, reemplazar `_saldo_caja` por:
```python
    @api.model
    def _saldo_caja(self, caja):
        campo_recibido = 'monto_recibido_efectivo' if caja == 'efectivo' else 'monto_recibido_transferencia'
        rendido = self.env['reparto.caja.rendicion'].sudo().search([('state', '=', 'rendido')])
        total_rendido = sum(rendido.mapped(campo_recibido))
        # Lo que cobra Administración por los clientes de un vendedor externo no pasa por Rendición:
        # ya está en la empresa, suma directo al saldo.
        cobrado_externos = self.env['pos.reparto.comision.linea'].sudo().search([
            ('vendedor_id.reparto_es_externo', '=', True),
            ('caja', '=', caja),
        ])
        total_externos = sum(cobrado_externos.mapped('monto_cobrado'))
        gastos = self.env['reparto.caja.gasto'].sudo().search([('caja', '=', caja)])
        total_gasto = sum(gastos.mapped('monto'))
        return total_rendido + total_externos - total_gasto
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: comando de referencia. Expected: `0 failed, 0 error(s)`.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_caja
git commit -m "feat(pos_reparto_caja): el vendedor externo no rinde y su cobrado suma al saldo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Alta del Vendedor 04 y docs

**Files:**
- Modify: `deploy/carga_inicial.py`, `MANUAL_USUARIO.md`, `ESTADO_PROYECTO.md`

- [ ] **Step 1: Alta en la carga inicial.** Leer `deploy/carga_inicial.py` (sección de usuarios, ~líneas 114-150). Agregar, después de crear los usuarios por rol y **sin** tocar `claves`, un bloque idempotente que cree "Vendedor 04 (externo)":
```python
# Vendedor externo sin camión ni POS (RF-U01): sin contraseña ni grupos de Reparto, no inicia sesión.
# Se le asignan clientes a mano desde Clientes; Administración carga y cobra por ellos.
externo = env["res.users"].search([("login", "=", "vendedor04")], limit=1)
if not externo:
    externo = env["res.users"].create({
        "name": "Vendedor 04 (externo)", "login": "vendedor04", "lang": "es_AR",
        "reparto_es_externo": True})
elif not externo.reparto_es_externo:
    externo.reparto_es_externo = True
print("Vendedor externo listo: Vendedor 04 (externo) — sin contraseña, sin camión")
```
Respetar la indentación y las convenciones del archivo (nombres, `env`, prints en español). Verificar con `python -m py_compile deploy/carga_inicial.py`.

- [ ] **Step 2: Manual.** En `MANUAL_USUARIO.md`, dentro de la sección 13 (Comisiones) agregar `### 13.5 Vendedor externo (sin comisión)`: qué es (no usa camión ni POS, Administración carga y cobra por sus clientes), cómo asignarle clientes (campo **Vendedor** del cliente, sección 5.3), que **no genera comisión** (líneas al 0%), que **no se le rinde** y que lo que se cobra de sus clientes **suma solo al saldo de Cajas** (sección 15), y cómo marcar a un usuario como externo (Ajustes → Usuarios → pestaña **Comisión (Reparto)** → tildar **Vendedor externo**; solo Gerencia ve esa pestaña). Aclarar que marcar a alguien como externo **no cambia las líneas que ya tenía**: solo los cobros nuevos. Mantener el estilo y los saltos de línea (CRLF) del archivo.

- [ ] **Step 3: Estado del proyecto.** En `ESTADO_PROYECTO.md`: agregar una sección `## 5undecies. Vendedor externo (RF-U01)` antes de `## 6. Facturación` (qué hace, decisiones del spec, límites: ventas por vendedor agrupa por quien carga; líneas viejas no se reclasifican) y tachar el ítem 7 del roadmap: `7. ~~Vendedor 04 externo sin comisión (RF-U01)~~ — hecho 2026-09-28 (sección 5undecies).`

- [ ] **Step 4: Commit**

```bash
git add deploy/carga_inicial.py MANUAL_USUARIO.md ESTADO_PROYECTO.md
git commit -m "docs: vendedor externo en carga inicial, manual y estado

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

- Spec → tasks: campo + helper + hooks + vista (Task 1); rendición y saldo (Task 2); alta y docs (Task 3). Fuera de alcance queda solo documentado.
- Nombres consistentes: `reparto_es_externo`, `_reparto_comision_pct_efectivo`, `_saldo_caja`.
- Riesgo: el dominio con `vendedor_id.reparto_es_externo` sobre `pos.reparto.comision.linea` sudo-eado; el campo no tiene grupo de lectura, así que también funciona para Administración.
