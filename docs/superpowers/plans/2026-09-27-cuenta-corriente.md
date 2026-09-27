# Cuenta Corriente (extracto + filtro por vendedor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `pos_reparto_credito` with a read-only screen showing each cliente's full movement history (pedidos a crédito + pagos) with running balance, filterable by vendedor, scoped by the existing role rules (Vendedor sees only their own clients; Administración Operativa and Gerencia see everyone).

**Architecture:** A single SQL-view model (`_auto = False`) `reparto.cuenta.corriente.movimiento` backed by a Postgres `UNION ALL` of `account_move_line` (asset_receivable, posted — one row per pedido a crédito) and `account_payment` (inbound, in_process/paid — one row per pago), wrapped in an outer query that computes a running balance per cliente with a window function. Security reuses the same `partner_id.user_id` criterion the project already uses everywhere else for "my assigned customers" (see `pos_reparto_security/security/reparto_partner_rules.xml`), via a new `ir.rule` scoped to `group_reparto_vendedor`. No changes to `account.move.line`/`account.payment` ACLs — access is isolated to the new model.

**Tech Stack:** Odoo 19 CE, Python, PostgreSQL (window functions), XML views, `TransactionCase` tests.

**Reference spec:** `docs/superpowers/specs/2026-09-27-cuenta-corriente-design.md`

---

## Before you start

Run all `docker compose` commands from this repo's root directory (`C:\Users\Bonan\Desktop\OdooERP_Dist`) — `docker-compose.yml` uses a relative bind mount (`./addons`), so running from anywhere else silently serves a different `addons/` folder with no error. If in doubt, confirm with:

```bash
docker inspect odooerp_dist-odoo-1 --format "{{json .Mounts}}"
```

To run tests for `pos_reparto_credito` after any change in this plan:

```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_credito --test-enable --stop-after-init --log-level=test
```

This both re-applies the module (recreating the SQL view via `init()`) and runs its full test suite. Use this exact command after every task in this plan.

---

### Task 1: SQL view model + data-correctness tests

**Files:**
- Create: `addons/pos_reparto_credito/models/reparto_cuenta_corriente_movimiento.py`
- Modify: `addons/pos_reparto_credito/models/__init__.py`
- Create: `addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py`

- [ ] **Step 1: Write the failing tests**

Create `addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py`:

```python
from datetime import timedelta

from odoo import Command, fields
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoCuentaCorriente(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.receivable_account = cls.env['account.account'].search([
            ('account_type', '=', 'asset_receivable'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        cls.income_account = cls.env['account.account'].search([
            ('account_type', '=', 'income'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        cls.bank_journal = cls.env['account.journal'].search([
            ('type', '=', 'bank'),
            ('company_id', '=', cls.env.company.id),
        ], limit=1)

    def _crear_partner_credito(self, name):
        return self.env['res.partner'].create({
            'name': name,
            'property_account_receivable_id': self.receivable_account.id,
        })

    def _crear_linea_por_cobrar(self, partner, monto, fecha):
        move = self.env['account.move'].create({
            'move_type': 'entry',
            'date': fecha,
            'line_ids': [
                Command.create({
                    'account_id': self.receivable_account.id,
                    'partner_id': partner.id,
                    'debit': monto,
                    'credit': 0.0,
                    'name': 'Pedido a credito de prueba',
                }),
                Command.create({
                    'account_id': self.income_account.id,
                    'debit': 0.0,
                    'credit': monto,
                    'name': 'Contrapartida de prueba',
                }),
            ],
        })
        move.action_post()
        return move.line_ids.filtered(lambda l: l.account_id == self.receivable_account)

    def _crear_pago(self, partner, monto, fecha):
        payment = self.env['account.payment'].create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': monto,
            'date': fecha,
            'journal_id': self.bank_journal.id,
        })
        payment.action_post()
        return payment

    def test_pedido_a_credito_genera_fila_debe(self):
        partner = self._crear_partner_credito('Cliente Extracto Uno')
        self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today())

        movimiento = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner.id),
        ])
        self.assertEqual(len(movimiento), 1)
        self.assertEqual(movimiento.tipo, 'pedido')
        self.assertEqual(movimiento.debe, 1000.0)
        self.assertEqual(movimiento.haber, 0.0)
        self.assertEqual(movimiento.saldo, 1000.0)

    def test_pago_genera_fila_haber(self):
        partner = self._crear_partner_credito('Cliente Extracto Dos')
        self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=1))
        self._crear_pago(partner, 400.0, fields.Date.today())

        movimientos = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner.id),
        ], order='fecha, id')
        self.assertEqual(len(movimientos), 2)
        pago = movimientos.filtered(lambda m: m.tipo == 'pago')
        self.assertEqual(pago.haber, 400.0)
        self.assertEqual(pago.debe, 0.0)

    def test_saldo_acumulado_con_pedidos_y_pagos_intercalados(self):
        partner = self._crear_partner_credito('Cliente Extracto Tres')
        hoy = fields.Date.today()
        self._crear_linea_por_cobrar(partner, 1000.0, hoy - timedelta(days=10))
        self._crear_pago(partner, 300.0, hoy - timedelta(days=5))
        self._crear_linea_por_cobrar(partner, 500.0, hoy)

        movimientos = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner.id),
        ], order='fecha, id')
        saldos = movimientos.mapped('saldo')
        self.assertEqual(saldos, [1000.0, 700.0, 1200.0])

    def test_saldo_no_mezcla_clientes_distintos(self):
        partner_1 = self._crear_partner_credito('Cliente Extracto Cuatro')
        partner_2 = self._crear_partner_credito('Cliente Extracto Cinco')
        self._crear_linea_por_cobrar(partner_1, 1000.0, fields.Date.today())
        self._crear_linea_por_cobrar(partner_2, 200.0, fields.Date.today())

        movimiento_1 = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner_1.id),
        ])
        movimiento_2 = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner_2.id),
        ])
        self.assertEqual(movimiento_1.saldo, 1000.0)
        self.assertEqual(movimiento_2.saldo, 200.0)

    def test_vendedor_id_toma_el_salesperson_del_cliente(self):
        vendedor = self.env['res.users'].create({
            'name': 'Vendedor Extracto',
            'login': 'vendedor_extracto_test',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id])],
        })
        partner = self._crear_partner_credito('Cliente Con Vendedor')
        partner.user_id = vendedor
        self._crear_linea_por_cobrar(partner, 100.0, fields.Date.today())

        movimiento = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner.id),
        ])
        self.assertEqual(movimiento.vendedor_id, vendedor)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_credito --test-enable --stop-after-init --log-level=test
```

Expected: FAIL — `KeyError: 'reparto.cuenta.corriente.movimiento'` (model doesn't exist yet).

- [ ] **Step 3: Implement the SQL view model**

Create `addons/pos_reparto_credito/models/reparto_cuenta_corriente_movimiento.py`:

```python
from odoo import fields, models, tools


class RepartoCuentaCorrienteMovimiento(models.Model):
    _name = 'reparto.cuenta.corriente.movimiento'
    _description = 'Movimiento de cuenta corriente (pedido a crédito o pago)'
    _auto = False
    _order = 'partner_id, fecha, id'

    partner_id = fields.Many2one('res.partner', string='Cliente', readonly=True)
    vendedor_id = fields.Many2one('res.users', string='Vendedor', readonly=True)
    fecha = fields.Date(string='Fecha', readonly=True)
    tipo = fields.Selection(
        [('pedido', 'Pedido'), ('pago', 'Pago')],
        string='Tipo', readonly=True,
    )
    referencia = fields.Char(string='Referencia', readonly=True)
    debe = fields.Monetary(string='Debe', currency_field='currency_id', readonly=True)
    haber = fields.Monetary(string='Haber', currency_field='currency_id', readonly=True)
    saldo = fields.Monetary(string='Saldo', currency_field='currency_id', readonly=True)
    currency_id = fields.Many2one(
        'res.currency', string='Moneda', compute='_compute_currency_id',
    )

    def _compute_currency_id(self):
        currency = self.env.company.currency_id
        for movimiento in self:
            movimiento.currency_id = currency

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        query = """
            CREATE VIEW %s AS (
                SELECT
                    m.id, m.partner_id, m.vendedor_id, m.fecha, m.tipo, m.referencia,
                    m.debe, m.haber,
                    SUM(m.debe - m.haber) OVER (
                        PARTITION BY m.partner_id ORDER BY m.fecha, m.id
                    ) AS saldo
                FROM (
                    SELECT
                        aml.id AS id, aml.partner_id AS partner_id,
                        rp.user_id AS vendedor_id, aml.date AS fecha,
                        'pedido' AS tipo, am.name AS referencia,
                        (aml.debit - aml.credit) AS debe, 0.0 AS haber
                    FROM account_move_line aml
                    JOIN account_move am ON am.id = aml.move_id
                    JOIN res_partner rp ON rp.id = aml.partner_id
                    WHERE aml.account_type = 'asset_receivable'
                      AND am.state = 'posted'
                      AND aml.partner_id IS NOT NULL

                    UNION ALL

                    SELECT
                        -ap.id AS id, ap.partner_id AS partner_id,
                        rp.user_id AS vendedor_id, ap.date AS fecha,
                        'pago' AS tipo, ap.name AS referencia,
                        0.0 AS debe, ap.amount AS haber
                    FROM account_payment ap
                    JOIN res_partner rp ON rp.id = ap.partner_id
                    WHERE ap.payment_type = 'inbound'
                      AND ap.state IN ('in_process', 'paid')
                      AND ap.partner_id IS NOT NULL
                ) m
            )
        """ % self._table
        self.env.cr.execute(query)
```

Modify `addons/pos_reparto_credito/models/__init__.py` — add the import (keep existing imports as-is, just add this line):

```python
from . import reparto_cuenta_corriente_movimiento
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_credito --test-enable --stop-after-init --log-level=test
```

Expected: PASS — all 5 new tests plus the existing `test_reparto_credito.py` suite green.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito/models/reparto_cuenta_corriente_movimiento.py addons/pos_reparto_credito/models/__init__.py addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py
git commit -m "$(cat <<'EOF'
feat(pos_reparto_credito): modelo de extracto de cuenta corriente

SQL view (UNION ALL de account.move.line/account.payment) con saldo
acumulado por cliente via window function. Fase 3 del roadmap
(RF-G05/RF-A04/RF-V04).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Access control (ACL + ir.rule) + security tests

**Files:**
- Create: `addons/pos_reparto_credito/security/ir.model.access.csv`
- Create: `addons/pos_reparto_credito/security/reparto_cuenta_corriente_rules.xml`
- Modify: `addons/pos_reparto_credito/__manifest__.py`
- Modify: `addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py`

- [ ] **Step 1: Write the failing tests**

Add these test methods to the end of the `TestRepartoCuentaCorriente` class in `addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py`:

```python
    def test_vendedor_solo_ve_movimientos_de_sus_clientes(self):
        group_vendedor = self.env.ref('pos_reparto_security.group_reparto_vendedor')
        group_internal = self.env.ref('base.group_user')
        vendedor_1 = self.env['res.users'].create({
            'name': 'Vendedor Extracto Uno',
            'login': 'vendedor_extracto_uno_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        vendedor_2 = self.env['res.users'].create({
            'name': 'Vendedor Extracto Dos',
            'login': 'vendedor_extracto_dos_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        cliente_1 = self._crear_partner_credito('Cliente De Vendedor Extracto 1')
        cliente_1.user_id = vendedor_1
        self._crear_linea_por_cobrar(cliente_1, 100.0, fields.Date.today())
        cliente_2 = self._crear_partner_credito('Cliente De Vendedor Extracto 2')
        cliente_2.user_id = vendedor_2
        self._crear_linea_por_cobrar(cliente_2, 100.0, fields.Date.today())

        vistos_por_vendedor_1 = self.env['reparto.cuenta.corriente.movimiento'].with_user(
            vendedor_1
        ).search([])
        self.assertIn(cliente_1, vistos_por_vendedor_1.mapped('partner_id'))
        self.assertNotIn(cliente_2, vistos_por_vendedor_1.mapped('partner_id'))

    def test_gerencia_ve_movimientos_de_todos_los_clientes(self):
        group_gerencia = self.env.ref('pos_reparto_security.group_reparto_gerencia')
        group_internal = self.env.ref('base.group_user')
        gerente = self.env['res.users'].create({
            'name': 'Gerente Extracto',
            'login': 'gerente_extracto_test',
            'group_ids': [(6, 0, [group_internal.id, group_gerencia.id])],
        })
        vendedor = self.env['res.users'].create({
            'name': 'Vendedor Extracto Tres',
            'login': 'vendedor_extracto_tres_test',
            'group_ids': [(6, 0, [group_internal.id])],
        })
        cliente_1 = self._crear_partner_credito('Cliente Extracto Seis')
        cliente_1.user_id = vendedor
        self._crear_linea_por_cobrar(cliente_1, 100.0, fields.Date.today())
        cliente_2 = self._crear_partner_credito('Cliente Extracto Siete')
        self._crear_linea_por_cobrar(cliente_2, 100.0, fields.Date.today())

        vistos_por_gerencia = self.env['reparto.cuenta.corriente.movimiento'].with_user(
            gerente
        ).search([])
        self.assertIn(cliente_1, vistos_por_gerencia.mapped('partner_id'))
        self.assertIn(cliente_2, vistos_por_gerencia.mapped('partner_id'))

    def test_filtro_por_vendedor_devuelve_solo_sus_clientes(self):
        vendedor_1 = self.env['res.users'].create({
            'name': 'Vendedor Extracto Cuatro',
            'login': 'vendedor_extracto_cuatro_test',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id])],
        })
        vendedor_2 = self.env['res.users'].create({
            'name': 'Vendedor Extracto Cinco',
            'login': 'vendedor_extracto_cinco_test',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id])],
        })
        cliente_1 = self._crear_partner_credito('Cliente Extracto Ocho')
        cliente_1.user_id = vendedor_1
        self._crear_linea_por_cobrar(cliente_1, 100.0, fields.Date.today())
        cliente_2 = self._crear_partner_credito('Cliente Extracto Nueve')
        cliente_2.user_id = vendedor_2
        self._crear_linea_por_cobrar(cliente_2, 100.0, fields.Date.today())

        filtrado = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('vendedor_id', '=', vendedor_1.id),
        ])
        self.assertEqual(filtrado.mapped('partner_id'), cliente_1)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_credito --test-enable --stop-after-init --log-level=test
```

Expected: FAIL on `test_vendedor_solo_ve_movimientos_de_sus_clientes` and `test_gerencia_ve_movimientos_de_todos_los_clientes` with `AccessError: You are not allowed to access 'Movimiento de cuenta corriente...' (reparto.cuenta.corriente.movimiento) records.` — no `ir.model.access` row exists yet, so any non-superuser (including a Gerencia user) gets denied entirely.

- [ ] **Step 3: Add the ACL and the ir.rule**

Create `addons/pos_reparto_credito/security/ir.model.access.csv`:

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_reparto_cuenta_corriente_vendedor,reparto.cuenta.corriente.movimiento vendedor,model_reparto_cuenta_corriente_movimiento,pos_reparto_security.group_reparto_vendedor,1,0,0,0
access_reparto_cuenta_corriente_adminop,reparto.cuenta.corriente.movimiento adminop,model_reparto_cuenta_corriente_movimiento,pos_reparto_security.group_reparto_adminop,1,0,0,0
access_reparto_cuenta_corriente_gerencia,reparto.cuenta.corriente.movimiento gerencia,model_reparto_cuenta_corriente_movimiento,pos_reparto_security.group_reparto_gerencia,1,0,0,0
```

Create `addons/pos_reparto_credito/security/reparto_cuenta_corriente_rules.xml`:

```xml
<odoo>
    <record id="rule_reparto_cuenta_corriente_vendedor" model="ir.rule">
        <field name="name">Vendedor Reparto: cuenta corriente solo de sus clientes</field>
        <field name="model_id" ref="model_reparto_cuenta_corriente_movimiento"/>
        <field name="domain_force">[('partner_id.user_id', '=', user.id)]</field>
        <field name="groups" eval="[(4, ref('pos_reparto_security.group_reparto_vendedor'))]"/>
        <field name="perm_read">1</field>
        <field name="perm_write">0</field>
        <field name="perm_create">0</field>
        <field name="perm_unlink">0</field>
    </record>
</odoo>
```

Modify `addons/pos_reparto_credito/__manifest__.py` — change the `data` list from:

```python
    'data': [
        'views/res_partner_deudores_views.xml',
    ],
```

to:

```python
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_cuenta_corriente_rules.xml',
        'views/res_partner_deudores_views.xml',
    ],
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_credito --test-enable --stop-after-init --log-level=test
```

Expected: PASS — all tests green, including the 3 new security tests and the 5 from Task 1.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito/security/ir.model.access.csv addons/pos_reparto_credito/security/reparto_cuenta_corriente_rules.xml addons/pos_reparto_credito/__manifest__.py addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py
git commit -m "$(cat <<'EOF'
feat(pos_reparto_credito): seguridad del extracto de cuenta corriente

ACL de lectura para Vendedor/Admin.Operativa/Gerencia + ir.rule que
limita Vendedor a partner_id.user_id = user.id, mismo criterio que ya
usa res.partner en pos_reparto_security.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: List view, search filters, action and menu

**Files:**
- Create: `addons/pos_reparto_credito/views/reparto_cuenta_corriente_views.xml`
- Modify: `addons/pos_reparto_credito/__manifest__.py`
- Modify: `addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py`

- [ ] **Step 1: Write the failing test**

Add this test method to the end of the `TestRepartoCuentaCorriente` class in `addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py`:

```python
    def test_accion_cuenta_corriente_existe_y_apunta_al_modelo_correcto(self):
        action = self.env.ref('pos_reparto_credito.action_reparto_cuenta_corriente')
        self.assertEqual(action.res_model, 'reparto.cuenta.corriente.movimiento')
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_credito --test-enable --stop-after-init --log-level=test
```

Expected: FAIL — `ValueError: External ID not found in the system: pos_reparto_credito.action_reparto_cuenta_corriente`.

- [ ] **Step 3: Create the view, action and menu**

Create `addons/pos_reparto_credito/views/reparto_cuenta_corriente_views.xml`:

```xml
<odoo>
    <record id="view_reparto_cuenta_corriente_list" model="ir.ui.view">
        <field name="name">reparto.cuenta.corriente.movimiento.list</field>
        <field name="model">reparto.cuenta.corriente.movimiento</field>
        <field name="arch" type="xml">
            <list string="Cuenta Corriente"
                  default_order="partner_id, fecha, id"
                  create="false" edit="false" delete="false"
                  decoration-danger="saldo &gt; 0">
                <field name="partner_id" string="Cliente"/>
                <field name="vendedor_id" string="Vendedor"/>
                <field name="fecha" string="Fecha"/>
                <field name="tipo" string="Tipo"/>
                <field name="referencia" string="Referencia"/>
                <field name="debe" string="Debe"/>
                <field name="haber" string="Haber"/>
                <field name="saldo" string="Saldo"/>
            </list>
        </field>
    </record>

    <record id="view_reparto_cuenta_corriente_search" model="ir.ui.view">
        <field name="name">reparto.cuenta.corriente.movimiento.search</field>
        <field name="model">reparto.cuenta.corriente.movimiento</field>
        <field name="arch" type="xml">
            <search string="Cuenta Corriente">
                <field name="partner_id" string="Cliente"/>
                <field name="vendedor_id" string="Vendedor"/>
                <field name="fecha" string="Fecha"/>
                <filter name="filtro_fecha" string="Fecha" date="fecha"/>
                <group expand="0" string="Agrupar por">
                    <filter name="agrupar_cliente" string="Cliente" context="{'group_by': 'partner_id'}"/>
                    <filter name="agrupar_vendedor" string="Vendedor" context="{'group_by': 'vendedor_id'}"/>
                </group>
            </search>
        </field>
    </record>

    <record id="action_reparto_cuenta_corriente" model="ir.actions.act_window">
        <field name="name">Cuenta Corriente</field>
        <field name="res_model">reparto.cuenta.corriente.movimiento</field>
        <field name="view_mode">list</field>
        <field name="view_id" ref="view_reparto_cuenta_corriente_list"/>
        <field name="search_view_id" ref="view_reparto_cuenta_corriente_search"/>
        <field name="context">{'search_default_agrupar_cliente': 1}</field>
    </record>

    <menuitem id="menu_reparto_cuenta_corriente"
        name="Cuenta Corriente"
        parent="point_of_sale.menu_point_root"
        action="action_reparto_cuenta_corriente"
        groups="pos_reparto_security.group_reparto_vendedor,pos_reparto_security.group_reparto_adminop,pos_reparto_security.group_reparto_gerencia"
        sequence="16"/>
</odoo>
```

Modify `addons/pos_reparto_credito/__manifest__.py` — change the `data` list from:

```python
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_cuenta_corriente_rules.xml',
        'views/res_partner_deudores_views.xml',
    ],
```

to:

```python
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_cuenta_corriente_rules.xml',
        'views/res_partner_deudores_views.xml',
        'views/reparto_cuenta_corriente_views.xml',
    ],
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_credito --test-enable --stop-after-init --log-level=test
```

Expected: PASS — all tests green (9 new tests total across the 3 tasks, plus the pre-existing suite).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito/views/reparto_cuenta_corriente_views.xml addons/pos_reparto_credito/__manifest__.py addons/pos_reparto_credito/tests/test_reparto_cuenta_corriente.py
git commit -m "$(cat <<'EOF'
feat(pos_reparto_credito): pantalla de Cuenta Corriente

Lista de solo lectura con filtro/agrupado por Vendedor y Cliente, menu
bajo Punto de Venta junto a Deudores. Cierra la fase 3 del roadmap
(RF-G05/RF-A04/RF-V04).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual verification via `odoo shell`

This is a read-only sanity check against real data in the running dev container — not a code change, no commit. Do this against the running `odooerp_dist-odoo-1` container (not the ephemeral `run --rm` used for tests), after Task 3 passes.

**Files:** none.

- [ ] **Step 1: Confirm Docker is up and serving this checkout**

Run: `docker compose -p odooerp_dist up -d`
Run: `docker inspect odooerp_dist-odoo-1 --format "{{json .Mounts}}"`
Expected: the `addons` mount's `Source` ends in this repo's `addons` folder.

- [ ] **Step 2: Spot-check the view against a real deudor**

```bash
MSYS_NO_PATHCONV=1 docker exec -i odooerp_dist-odoo-1 odoo shell -d odoo --db_host db --db_port 5432 --db_user odoo --db_password odoo --no-http <<'EOF'
import json
deudor = env['res.partner'].search([('credito_monto_adeudado', '>', 0)], limit=1)
movimientos = env['reparto.cuenta.corriente.movimiento'].search([('partner_id', '=', deudor.id)], order='fecha, id')
print(json.dumps({
    'cliente': deudor.name,
    'saldo_segun_credito': deudor.credito_monto_adeudado,
    'saldo_segun_extracto': movimientos[-1].saldo if movimientos else None,
    'filas': [(m.fecha.isoformat(), m.tipo, m.debe, m.haber, m.saldo) for m in movimientos],
}, indent=2, default=str))
EOF
```

Expected: `saldo_segun_extracto` matches `saldo_segun_credito` for that cliente (the extracto's final running balance must agree with the existing debt computation `pos_reparto_credito` already trusts), and `filas` shows a plausible chronological history.

- [ ] **Step 3: No git commit for this task** — verification only.
