# pos_reparto_comision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New Odoo addon `pos_reparto_comision` that computes each vendedor's commission (fixed %, frozen at the moment of collection) on money actually collected from the customer — immediately for cash/card POS payments, and via `account.payment` for "Cuenta Corriente" (credit) collections — and gives Gerencia a filterable panel of commission earned per vendedor.

**Architecture:** A real (non-SQL-view) model `pos.reparto.comision.linea` stores one row per collection event, with the vendedor's % snapshotted at creation time so later % changes never rewrite history. Two override hooks create rows: `pos.order.write()` (fires on `state in ('paid', 'done')`, one row per non-`pay_later` `pos.payment`) and `account.payment` create/write/unlink (fires on `state in ('in_process', 'paid')`, one row per inbound payment). Both hooks attribute the collection to a vendedor via `partner_id.user_id` (the same field `pos_reparto_security` already uses for "my assigned customers"), and both create rows via `.sudo()` since the triggering user (a Vendedor closing their own sale, or Admin Operativa registering a payment) is not necessarily in `group_reparto_gerencia`, the only group with read access to the model.

**Tech Stack:** Odoo 19 CE, Python, XML views, `TransactionCase` tests (`odoo.tests.common`). Depends on `point_of_sale`, `account`, `pos_reparto_security`.

**Reference spec:** `docs/superpowers/specs/2026-09-02-pos-reparto-comision-design.md`

---

## Before you start

Run everything from the same directory as this repo checkout — `docker-compose.yml` uses a relative bind mount (`./addons`), so running `docker compose` from any other directory silently serves a different `addons/` folder with no error (see `docs/superpowers/specs/2026-08-24-pos-reparto-credito-design.md`'s sibling memory note, and confirm with `docker inspect odooerp_dist-odoo-1 --format "{{json .Mounts}}"` if in doubt).

To run tests for this module once it's installed:

```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -i pos_reparto_comision --test-enable --stop-after-init --log-level=test
```

After the module already exists and you're iterating on tests only, use `-u pos_reparto_comision` instead of `-i` to update rather than reinstall.

---

### Task 1: Module skeleton + `res.users.reparto_comision_pct`

**Files:**
- Create: `addons/pos_reparto_comision/__init__.py`
- Create: `addons/pos_reparto_comision/__manifest__.py`
- Create: `addons/pos_reparto_comision/models/__init__.py`
- Create: `addons/pos_reparto_comision/models/res_users.py`
- Create: `addons/pos_reparto_comision/views/res_users_views.xml`
- Create: `addons/pos_reparto_comision/tests/__init__.py`
- Create: `addons/pos_reparto_comision/tests/test_reparto_comision.py`

- [ ] **Step 1: Create the module skeleton**

`addons/pos_reparto_comision/__init__.py`:
```python
from . import models
```

`addons/pos_reparto_comision/__manifest__.py`:
```python
{
    'name': 'POS Reparto - Comisión de Vendedor',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Comisión de vendedor sobre el cobro al cliente (RF-GV-03) para el proyecto Reparto',
    'depends': ['point_of_sale', 'account', 'pos_reparto_security'],
    'data': [
        'security/ir.model.access.csv',
        'views/res_users_views.xml',
        'views/comision_linea_views.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

`addons/pos_reparto_comision/models/__init__.py`:
```python
from . import res_users
from . import comision_linea
from . import pos_order
from . import account_payment
```

(This `__init__.py` references files created in later tasks — that's fine, `data` files in the manifest work the same way. Python import errors would only surface once we try to install the module, which we do at the end of Task 1.)

- [ ] **Step 2: Add the field to `res.users`**

`addons/pos_reparto_comision/models/res_users.py`:
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
```

- [ ] **Step 3: Add the field to the user form, restricted to Gerencia**

`addons/pos_reparto_comision/views/res_users_views.xml`:
```xml
<odoo>
    <record id="view_users_form_reparto_comision" model="ir.ui.view">
        <field name="name">res.users.form.reparto.comision</field>
        <field name="model">res.users</field>
        <field name="inherit_id" ref="base.view_users_form"/>
        <field name="arch" type="xml">
            <xpath expr="//notebook" position="inside">
                <page string="Comisión (Reparto)" groups="pos_reparto_security.group_reparto_gerencia">
                    <group>
                        <field name="reparto_comision_pct"/>
                    </group>
                </page>
            </xpath>
        </field>
    </record>
</odoo>
```

- [ ] **Step 4: Placeholder access file so the manifest doesn't break install (real rows come in Task 5)**

`addons/pos_reparto_comision/security/ir.model.access.csv`:
```
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
```

(Header only — Task 5 adds the real row once the model exists. An empty CSV with just headers is valid and installs cleanly.)

- [ ] **Step 5: Empty placeholders for files referenced by `models/__init__.py` but not yet written**

Create empty files so the module can install before later tasks fill them in:

`addons/pos_reparto_comision/models/comision_linea.py`:
```python
from odoo import api, fields, models
```

`addons/pos_reparto_comision/models/pos_order.py`:
```python
from odoo import models
```

`addons/pos_reparto_comision/models/account_payment.py`:
```python
from odoo import models
```

`addons/pos_reparto_comision/views/comision_linea_views.xml`:
```xml
<odoo>
</odoo>
```

- [ ] **Step 6: Write the failing tests**

`addons/pos_reparto_comision/tests/__init__.py`:
```python
from . import test_reparto_comision
```

`addons/pos_reparto_comision/tests/test_reparto_comision.py`:
```python
from datetime import timedelta
from unittest.mock import patch

from odoo import Command, fields
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoComision(TransactionCase):

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
        cls.metodo_efectivo = cls.env['pos.payment.method'].create({
            'name': 'Efectivo Test Comisión',
            'type': 'cash',
            'journal_id': cls.bank_journal.id,
            'company_id': cls.env.company.id,
        })
        cls.metodo_cuenta_corriente = cls.env['pos.payment.method'].create({
            'name': 'Cuenta Corriente Test Comisión',
            'type': 'pay_later',
            'company_id': cls.env.company.id,
        })
        cls.pos_config = cls.env['pos.config'].create({'name': 'Camión Test Comisión'})
        cls.pos_session = cls.env['pos.session'].create({
            'config_id': cls.pos_config.id,
        })
        cls.product = cls.env['product.product'].create({
            'name': 'Producto Test Comisión',
            'type': 'consu',
            'list_price': 100.0,
            'available_in_pos': True,
        })

    def _crear_vendedor(self, name, pct=0.0, login=None):
        group_vendedor = self.env.ref('pos_reparto_security.group_reparto_vendedor')
        group_internal = self.env.ref('base.group_user')
        vendedor = self.env['res.users'].create({
            'name': name,
            'login': login or name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        vendedor.sudo().reparto_comision_pct = pct
        return vendedor

    def _crear_gerente(self, name, login=None):
        group_gerencia = self.env.ref('pos_reparto_security.group_reparto_gerencia')
        group_internal = self.env.ref('base.group_user')
        return self.env['res.users'].create({
            'name': name,
            'login': login or name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group_gerencia.id])],
        })

    def _crear_partner(self, name, vendedor=None):
        vals = {'name': name, 'property_account_receivable_id': self.receivable_account.id}
        if vendedor:
            vals['user_id'] = vendedor.id
        return self.env['res.partner'].create(vals)

    def _crear_orden(self, partner, metodo_pago, monto):
        with patch.object(
            self.env['pos.order'].__class__,
            '_check_stock_availability',
            return_value=None,
        ):
            return self.env['pos.order'].create({
                'session_id': self.pos_session.id,
                'partner_id': partner.id if partner else False,
                'lines': [(0, 0, {
                    'product_id': self.product.id,
                    'qty': 1,
                    'price_unit': monto,
                    'price_subtotal': monto,
                    'price_subtotal_incl': monto,
                })],
                'amount_total': monto,
                'amount_tax': 0.0,
                'amount_paid': monto,
                'amount_return': 0.0,
                'payment_ids': [(0, 0, {
                    'payment_method_id': metodo_pago.id,
                    'amount': monto,
                })],
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

    def _crear_y_conciliar_pago(self, partner, receivable_line, monto, fecha):
        payment = self.env['account.payment'].create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': monto,
            'date': fecha,
            'journal_id': self.bank_journal.id,
        })
        payment.action_post()
        payment_line = payment.move_id.line_ids.filtered(
            lambda l: l.account_id == self.receivable_account
        )
        (payment_line + receivable_line).reconcile()
        return payment

    def test_campo_comision_no_visible_para_vendedor(self):
        self._crear_vendedor('Vendedor Sin Acceso Comision')
        vendedor = self.env['res.users'].search([('login', '=', 'vendedor_sin_acceso_comision_test')])
        campos = self.env['res.users'].with_user(vendedor).fields_get()
        self.assertNotIn('reparto_comision_pct', campos)

    def test_campo_comision_visible_para_gerencia(self):
        gerente = self._crear_gerente('Gerente Con Acceso Comision')
        campos = self.env['res.users'].with_user(gerente).fields_get()
        self.assertIn('reparto_comision_pct', campos)
```

- [ ] **Step 7: Run tests to verify they fail**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -i pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: module fails to install, or the two tests fail — `reparto_comision_pct` not recognized as restricted/visible correctly yet is unlikely to fail at this stage since Step 2-3 already add the field; more likely this step actually **passes** once the skeleton installs cleanly, because the field and its view restriction are written in the same task. If so, treat Step 7 as "run to confirm the module installs and both tests pass" instead of "confirm they fail" — note this explicitly when reporting the task, since Task 1 combines scaffolding and its own test (no separate red step for a brand new field).

- [ ] **Step 8: Fix until both tests pass, then commit**

```bash
git add addons/pos_reparto_comision
git commit -m "$(cat <<'EOF'
feat(pos_reparto_comision): esqueleto del módulo y campo de % de comisión

Campo reparto_comision_pct en res.users, restringido a
group_reparto_gerencia vía groups= en la definición del campo (no solo
en la vista) para que fields_get()/read()/write() lo oculten también a
nivel ORM, no solo en la UI.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SuYneRjaP1RhLFMT7evGtu
EOF
)"
```

---

### Task 2: Model `pos.reparto.comision.linea`

**Files:**
- Modify: `addons/pos_reparto_comision/models/comision_linea.py`
- Modify: `addons/pos_reparto_comision/tests/test_reparto_comision.py`

- [ ] **Step 1: Write the failing tests**

Append to `addons/pos_reparto_comision/tests/test_reparto_comision.py`:
```python
    def test_comision_monto_se_calcula_del_monto_y_pct(self):
        vendedor = self._crear_vendedor('Vendedor Comision Compute', pct=5.0)
        partner = self._crear_partner('Cliente Comision Compute', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 1000.0)
        linea = self.env['pos.reparto.comision.linea'].create({
            'vendedor_id': vendedor.id,
            'partner_id': partner.id,
            'fecha': fields.Date.today(),
            'origen': 'venta_directa',
            'monto_cobrado': 1000.0,
            'comision_pct': 5.0,
            'pos_payment_id': orden.payment_ids[0].id,
        })
        self.assertEqual(linea.comision_monto, 50.0)

    def test_linea_requiere_exactamente_un_origen(self):
        vendedor = self._crear_vendedor('Vendedor Comision Origen', pct=5.0)
        partner = self._crear_partner('Cliente Comision Origen', vendedor)
        with self.assertRaises(Exception):
            self.env['pos.reparto.comision.linea'].create({
                'vendedor_id': vendedor.id,
                'partner_id': partner.id,
                'fecha': fields.Date.today(),
                'origen': 'venta_directa',
                'monto_cobrado': 1000.0,
                'comision_pct': 5.0,
            })

    def test_no_se_duplica_linea_para_el_mismo_pago_pos(self):
        vendedor = self._crear_vendedor('Vendedor Comision Dup Pos', pct=5.0)
        partner = self._crear_partner('Cliente Comision Dup Pos', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 1000.0)
        pago = orden.payment_ids[0]
        vals = {
            'vendedor_id': vendedor.id,
            'partner_id': partner.id,
            'fecha': fields.Date.today(),
            'origen': 'venta_directa',
            'monto_cobrado': 1000.0,
            'comision_pct': 5.0,
            'pos_payment_id': pago.id,
        }
        self.env['pos.reparto.comision.linea'].create(vals)
        with self.assertRaises(Exception):
            self.env['pos.reparto.comision.linea'].create(vals)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: FAIL — `pos.reparto.comision.linea` has no fields yet (`comision_linea.py` is still just an import line from Task 1).

- [ ] **Step 3: Implement the model**

`addons/pos_reparto_comision/models/comision_linea.py`:
```python
from odoo import api, fields, models


class PosRepartoComisionLinea(models.Model):
    _name = 'pos.reparto.comision.linea'
    _description = 'Línea de comisión de vendedor (Reparto)'
    _order = 'fecha desc, id desc'

    vendedor_id = fields.Many2one('res.users', required=True, index=True, string='Vendedor')
    partner_id = fields.Many2one('res.partner', required=True, string='Cliente')
    fecha = fields.Date(required=True)
    origen = fields.Selection([
        ('venta_directa', 'Venta directa'),
        ('cobro_credito', 'Cobro de cuenta corriente'),
    ], required=True)
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )
    monto_cobrado = fields.Monetary(required=True, currency_field='currency_id')
    comision_pct = fields.Float(required=True, string='% Comisión')
    comision_monto = fields.Monetary(
        string='Comisión',
        compute='_compute_comision_monto',
        store=True,
        currency_field='currency_id',
    )
    pos_payment_id = fields.Many2one('pos.payment', string='Pago POS')
    account_payment_id = fields.Many2one('account.payment', string='Pago de cuenta corriente')

    _sql_constraints = [
        (
            'pos_payment_unique',
            'unique(pos_payment_id)',
            'Ya existe una línea de comisión para este pago de POS.',
        ),
        (
            'account_payment_unique',
            'unique(account_payment_id)',
            'Ya existe una línea de comisión para este pago de cuenta corriente.',
        ),
        (
            'origen_exclusivo',
            'CHECK ((pos_payment_id IS NOT NULL) <> (account_payment_id IS NOT NULL))',
            'La línea de comisión debe tener exactamente un origen: un pago de POS o un pago de cuenta corriente, no ambos ni ninguno.',
        ),
    ]

    @api.depends('monto_cobrado', 'comision_pct')
    def _compute_comision_monto(self):
        for linea in self:
            linea.comision_monto = linea.monto_cobrado * linea.comision_pct / 100
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: PASS (all tests so far, including Task 1's).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_comision
git commit -m "$(cat <<'EOF'
feat(pos_reparto_comision): modelo pos.reparto.comision.linea

Tabla real (no vista SQL) para que el % de comisión quede congelado
al momento del cobro -- cambiar el % de un vendedor después no debe
recalcular comisiones ya devengadas. Constraint SQL exige exactamente
un origen (pago de POS o pago de cuenta corriente) por línea, y cada
pago genera a lo sumo una línea (evita duplicados si un hook se
dispara dos veces sobre el mismo pago).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SuYneRjaP1RhLFMT7evGtu
EOF
)"
```

---

### Task 3: Hook en `pos.order` — venta directa

**Files:**
- Modify: `addons/pos_reparto_comision/models/pos_order.py`
- Modify: `addons/pos_reparto_comision/tests/test_reparto_comision.py`

- [ ] **Step 1: Write the failing tests**

Append to `addons/pos_reparto_comision/tests/test_reparto_comision.py`:
```python
    def test_pedido_efectivo_pagado_genera_linea_venta_directa(self):
        vendedor = self._crear_vendedor('Vendedor Comision Cash', pct=10.0)
        partner = self._crear_partner('Cliente Comision Cash', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)

        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas.vendedor_id, vendedor)
        self.assertEqual(lineas.origen, 'venta_directa')
        self.assertEqual(lineas.monto_cobrado, 500.0)
        self.assertEqual(lineas.comision_pct, 10.0)
        self.assertEqual(lineas.comision_monto, 50.0)

    def test_pedido_a_credito_no_genera_linea_al_pagar(self):
        vendedor = self._crear_vendedor('Vendedor Comision Credito Pedido', pct=10.0)
        partner = self._crear_partner('Cliente Comision Credito Pedido', vendedor)
        orden = self._crear_orden(partner, self.metodo_cuenta_corriente, 500.0)

        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 0)

    def test_pedido_sin_vendedor_asignado_no_genera_linea(self):
        partner = self._crear_partner('Cliente Comision Sin Vendedor')
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)

        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 0)

    def test_pedido_pagado_dos_veces_no_duplica_linea(self):
        vendedor = self._crear_vendedor('Vendedor Comision Idempotente', pct=10.0)
        partner = self._crear_partner('Cliente Comision Idempotente', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)

        orden.write({'state': 'paid'})
        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: FAIL — no hook exists yet, `pos.order.write` doesn't create any lines.

- [ ] **Step 3: Implement the hook**

`addons/pos_reparto_comision/models/pos_order.py`:
```python
import logging

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def write(self, vals):
        result = super().write(vals)
        if vals.get('state') in ('paid', 'done'):
            for order in self:
                try:
                    order._crear_lineas_comision_venta_directa()
                except Exception:
                    _logger.exception(
                        "Failed to create comision lines for order %s", order.name
                    )
        return result

    def _crear_lineas_comision_venta_directa(self):
        self.ensure_one()
        vendedor = self.partner_id.user_id if self.partner_id else False
        if not vendedor:
            return
        Linea = self.env['pos.reparto.comision.linea'].sudo()
        fecha = self.date_order.date() if self.date_order else fields.Date.context_today(self)
        for payment in self.payment_ids:
            if payment.payment_method_id.type == 'pay_later':
                continue
            if Linea.search_count([('pos_payment_id', '=', payment.id)]):
                continue
            Linea.create({
                'vendedor_id': vendedor.id,
                'partner_id': self.partner_id.id,
                'fecha': fecha,
                'origen': 'venta_directa',
                'monto_cobrado': payment.amount,
                'comision_pct': vendedor.sudo().reparto_comision_pct,
                'pos_payment_id': payment.id,
            })
```

Note the `vendedor.sudo().reparto_comision_pct` read: the field is group-restricted to Gerencia (Task 1), and the user closing the order (a Vendedor) is not in that group — without `.sudo()` here the read would come back empty/blocked.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_comision
git commit -m "$(cat <<'EOF'
feat(pos_reparto_comision): comisión inmediata al pagar en POS

Al pasar un pedido a paid/done, cada pago que NO sea de tipo pay_later
(Cuenta Corriente) genera su línea de comisión de inmediato -- la
porción a crédito de un pedido con tender mixto queda afuera acá y se
cubre cuando se cobre de verdad (hook de account.payment, Task 4).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SuYneRjaP1RhLFMT7evGtu
EOF
)"
```

---

### Task 4: Hook en `account.payment` — cobro de cuenta corriente

**Files:**
- Modify: `addons/pos_reparto_comision/models/account_payment.py`
- Modify: `addons/pos_reparto_comision/tests/test_reparto_comision.py`

- [ ] **Step 1: Write the failing tests**

Append to `addons/pos_reparto_comision/tests/test_reparto_comision.py`:
```python
    def test_pago_de_credito_genera_linea_cobro_credito(self):
        vendedor = self._crear_vendedor('Vendedor Comision Cobro', pct=8.0)
        partner = self._crear_partner('Cliente Comision Cobro', vendedor)
        linea_deuda = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=10))

        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 1000.0, fields.Date.today())

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas.vendedor_id, vendedor)
        self.assertEqual(lineas.origen, 'cobro_credito')
        self.assertEqual(lineas.monto_cobrado, 1000.0)
        self.assertEqual(lineas.comision_pct, 8.0)
        self.assertEqual(lineas.comision_monto, 80.0)

    def test_pago_parcial_genera_linea_proporcional(self):
        vendedor = self._crear_vendedor('Vendedor Comision Parcial', pct=10.0)
        partner = self._crear_partner('Cliente Comision Parcial', vendedor)
        linea_deuda = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=10))

        pago_1 = self._crear_y_conciliar_pago(partner, linea_deuda, 300.0, fields.Date.today() - timedelta(days=5))
        pago_2 = self._crear_y_conciliar_pago(partner, linea_deuda, 700.0, fields.Date.today())

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', 'in', (pago_1 | pago_2).ids),
        ], order='fecha asc')
        self.assertEqual(len(lineas), 2)
        self.assertEqual(lineas[0].monto_cobrado, 300.0)
        self.assertEqual(lineas[0].comision_monto, 30.0)
        self.assertEqual(lineas[1].monto_cobrado, 700.0)
        self.assertEqual(lineas[1].comision_monto, 70.0)

    def test_pago_sin_vendedor_asignado_no_genera_linea(self):
        partner = self._crear_partner('Cliente Comision Cobro Sin Vendedor')
        linea_deuda = self._crear_linea_por_cobrar(partner, 500.0, fields.Date.today() - timedelta(days=3))

        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 500.0, fields.Date.today())

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(len(lineas), 0)

    def test_cambiar_pct_no_afecta_lineas_ya_creadas(self):
        vendedor = self._crear_vendedor('Vendedor Comision Cambio Pct', pct=5.0)
        partner = self._crear_partner('Cliente Comision Cambio Pct', vendedor)
        linea_deuda = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=10))
        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 1000.0, fields.Date.today())

        vendedor.sudo().reparto_comision_pct = 20.0

        linea = self.env['pos.reparto.comision.linea'].search([('account_payment_id', '=', pago.id)])
        self.assertEqual(linea.comision_pct, 5.0)
        self.assertEqual(linea.comision_monto, 50.0)

    def test_anular_pago_borra_su_linea_de_comision(self):
        vendedor = self._crear_vendedor('Vendedor Comision Anular', pct=10.0)
        partner = self._crear_partner('Cliente Comision Anular', vendedor)
        linea_deuda = self._crear_linea_por_cobrar(partner, 500.0, fields.Date.today() - timedelta(days=3))
        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 500.0, fields.Date.today())

        self.assertEqual(
            len(self.env['pos.reparto.comision.linea'].search([('account_payment_id', '=', pago.id)])), 1
        )

        pago.action_draft()

        self.assertEqual(
            len(self.env['pos.reparto.comision.linea'].search([('account_payment_id', '=', pago.id)])), 0
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: FAIL — no hook exists yet on `account.payment`.

- [ ] **Step 3: Implement the hook**

`addons/pos_reparto_comision/models/account_payment.py`:
```python
from odoo import api, models

ESTADOS_COBRADOS = ('in_process', 'paid')


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _crear_linea_comision_cobro_credito(self):
        self.ensure_one()
        if self.payment_type != 'inbound' or not self.partner_id:
            return
        vendedor = self.partner_id.user_id
        if not vendedor:
            return
        Linea = self.env['pos.reparto.comision.linea'].sudo()
        if Linea.search_count([('account_payment_id', '=', self.id)]):
            return
        Linea.create({
            'vendedor_id': vendedor.id,
            'partner_id': self.partner_id.id,
            'fecha': self.date,
            'origen': 'cobro_credito',
            'monto_cobrado': self.amount,
            'comision_pct': vendedor.sudo().reparto_comision_pct,
            'account_payment_id': self.id,
        })

    def _sincronizar_lineas_comision(self):
        for payment in self:
            if payment.state in ESTADOS_COBRADOS:
                payment._crear_linea_comision_cobro_credito()
            else:
                self.env['pos.reparto.comision.linea'].sudo().search([
                    ('account_payment_id', '=', payment.id),
                ]).unlink()

    @api.model_create_multi
    def create(self, vals_list):
        payments = super().create(vals_list)
        payments._sincronizar_lineas_comision()
        return payments

    def write(self, vals):
        result = super().write(vals)
        if {'state', 'amount', 'partner_id'} & vals.keys():
            self._sincronizar_lineas_comision()
        return result

    def unlink(self):
        self.env['pos.reparto.comision.linea'].sudo().search([
            ('account_payment_id', 'in', self.ids),
        ]).unlink()
        return super().unlink()
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_comision
git commit -m "$(cat <<'EOF'
feat(pos_reparto_comision): comisión al cobrar cuentas corrientes

Cada account.payment inbound que llega a in_process/paid genera su
propia línea de comisión (mismo filtro de estados que ya usa
pos_reparto_credito para "último pago"), proporcional al monto de ese
pago -- cubre pagos parciales sin esperar a que el cliente salde todo
el pedido. Anular o borrar el pago borra su línea de comisión.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SuYneRjaP1RhLFMT7evGtu
EOF
)"
```

---

### Task 5: Seguridad de acceso al modelo

**Files:**
- Modify: `addons/pos_reparto_comision/security/ir.model.access.csv`
- Modify: `addons/pos_reparto_comision/tests/test_reparto_comision.py`

- [ ] **Step 1: Write the failing tests**

Append to `addons/pos_reparto_comision/tests/test_reparto_comision.py`:
```python
    def test_vendedor_no_puede_leer_lineas_de_comision(self):
        vendedor = self._crear_vendedor('Vendedor Comision Sin Acceso Modelo', pct=10.0)
        partner = self._crear_partner('Cliente Comision Sin Acceso Modelo', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)
        orden.write({'state': 'paid'})

        with self.assertRaises(Exception):
            self.env['pos.reparto.comision.linea'].with_user(vendedor).search([])

    def test_gerencia_puede_leer_lineas_de_comision(self):
        vendedor = self._crear_vendedor('Vendedor Comision Con Acceso Modelo', pct=10.0)
        gerente = self._crear_gerente('Gerente Comision Con Acceso Modelo')
        partner = self._crear_partner('Cliente Comision Con Acceso Modelo', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)
        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].with_user(gerente).search([
            ('partner_id', '=', partner.id),
        ])
        self.assertEqual(len(lineas), 1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: FAIL — with no access rows at all, even Gerencia gets an `AccessError`, so `test_gerencia_puede_leer_lineas_de_comision` fails too.

- [ ] **Step 3: Add the access row**

`addons/pos_reparto_comision/security/ir.model.access.csv`:
```
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_reparto_comision_linea_gerencia,reparto.comision.linea.gerencia,model_pos_reparto_comision_linea,pos_reparto_security.group_reparto_gerencia,1,0,0,0
```

Read-only even for Gerencia — rows are only ever created by the two hooks (via `.sudo()`, which bypasses this ACL), never by hand from the UI, matching the "sin vistas de edición manual" decision in the spec.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_comision
git commit -m "$(cat <<'EOF'
feat(pos_reparto_comision): acceso de solo lectura para Gerencia

pos.reparto.comision.linea solo es legible por group_reparto_gerencia
y de solo lectura (perm_write/create/unlink en 0) -- las líneas se
crean exclusivamente vía los hooks en modo sudo, nunca a mano desde
la UI.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SuYneRjaP1RhLFMT7evGtu
EOF
)"
```

---

### Task 6: Panel para Gerencia (vistas + menú)

**Files:**
- Modify: `addons/pos_reparto_comision/views/comision_linea_views.xml`
- Modify: `addons/pos_reparto_comision/tests/test_reparto_comision.py`

- [ ] **Step 1: Write the failing test**

Append to `addons/pos_reparto_comision/tests/test_reparto_comision.py`:
```python
    def test_accion_comisiones_existe_y_apunta_al_modelo(self):
        action = self.env.ref('pos_reparto_comision.action_reparto_comision_lineas')
        self.assertEqual(action.res_model, 'pos.reparto.comision.linea')
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: FAIL — `ValueError: External ID not found` (`comision_linea_views.xml` is still empty from Task 1).

- [ ] **Step 3: Write the views and menu**

`addons/pos_reparto_comision/views/comision_linea_views.xml`:
```xml
<odoo>
    <record id="view_reparto_comision_linea_list" model="ir.ui.view">
        <field name="name">pos.reparto.comision.linea.list</field>
        <field name="model">pos.reparto.comision.linea</field>
        <field name="arch" type="xml">
            <list string="Comisiones" default_order="fecha desc" create="false" edit="false" delete="false">
                <field name="fecha"/>
                <field name="vendedor_id"/>
                <field name="partner_id" string="Cliente"/>
                <field name="origen"/>
                <field name="monto_cobrado"/>
                <field name="comision_pct" string="%"/>
                <field name="comision_monto" string="Comisión"/>
            </list>
        </field>
    </record>

    <record id="view_reparto_comision_linea_pivot" model="ir.ui.view">
        <field name="name">pos.reparto.comision.linea.pivot</field>
        <field name="model">pos.reparto.comision.linea</field>
        <field name="arch" type="xml">
            <pivot string="Comisiones">
                <field name="vendedor_id" type="row"/>
                <field name="fecha" interval="month" type="col"/>
                <field name="comision_monto" type="measure"/>
                <field name="monto_cobrado" type="measure"/>
            </pivot>
        </field>
    </record>

    <record id="action_reparto_comision_lineas" model="ir.actions.act_window">
        <field name="name">Comisiones</field>
        <field name="res_model">pos.reparto.comision.linea</field>
        <field name="view_mode">pivot,list</field>
    </record>

    <menuitem id="menu_reparto_comision"
        name="Comisiones"
        parent="point_of_sale.menu_point_root"
        action="action_reparto_comision_lineas"
        groups="pos_reparto_security.group_reparto_gerencia"
        sequence="16"/>
</odoo>
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_comision --test-enable --stop-after-init --log-level=test
```
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_comision
git commit -m "$(cat <<'EOF'
feat(pos_reparto_comision): panel de comisiones para Gerencia

Vista pivot (vendedor x mes) + lista de detalle, menú "Comisiones"
dentro de Punto de Venta, visible solo para group_reparto_gerencia.
Filtro de rango de fechas nativo del search view del pivot.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SuYneRjaP1RhLFMT7evGtu
EOF
)"
```

- [ ] **Step 6: Manual browser verification**

Start the stack from this directory, log in as a `group_reparto_gerencia` user, confirm:
- "Comisiones" menu appears under Punto de Venta; a Vendedor-only login does **not** see it.
- The user form's "Comisión (Reparto)" tab appears only for Gerencia.
- Complete one cash sale as a Vendedor whose customer has a % set → a line shows up in the pivot immediately.
- Register a payment against a credit customer's balance in Accounting → a `cobro_credito` line shows up.

This module has no POS frontend (OWL) changes, so there's no `static/src` asset step to verify beyond the two backend views above.

---

### Task 7: Documentar en `ESTADO_PROYECTO.md`

**Files:**
- Modify: `ESTADO_PROYECTO.md`

- [ ] **Step 1: Update the pendientes/gap table and división de trabajo sections**

Mirror the pattern used for `pos_reparto_viaje` (commit `18f3d27`): mark gap item 3 (comisiones) as done, note the correction to RF-GV-03 (comisión sobre el cobro, no sobre el pedido generado — contradicts the earlier-documented resolution from 2026-08-24), and update "próximos pasos" to whichever gap item comes next (item 5, criterio de 2 visitas sin cobro, per the priority order already in the file).

- [ ] **Step 2: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "$(cat <<'EOF'
pos_reparto_comision: documentar módulo completo y corrección RF-GV-03

Módulo comisiones terminado y testeado. Se corrige lo documentado
sobre RF-GV-03: el cliente aclaró en el brainstorming del 2026-09-02
que la comisión se devenga al cobrarle al cliente, no al generar el
pedido -- al revés de lo que se había resuelto el 2026-08-24.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SuYneRjaP1RhLFMT7evGtu
EOF
)"
```

---

## Self-review notes (for whoever executes this)

- **Spec coverage:** every component in `docs/superpowers/specs/2026-09-02-pos-reparto-comision-design.md` maps to a task — config field (Task 1), model (Task 2), both hooks (Tasks 3-4), security (Task 5), panel (Task 6), the RF-GV-03 documentation correction (Task 7). The spec's "Fuera de alcance" items are intentionally not tasked.
- **Known risk to watch during execution:** `pos.payment.method` field requirements for `type='pay_later'` (Task 1's `setUpClass`) are written from documented Odoo 19 `point_of_sale` behavior, not verified against a running instance in this session (Docker Desktop wasn't running when this plan was written). If Step 7 of Task 1 fails on payment-method creation specifically (not on the two comisión-visibility tests), the fix is almost certainly a missing/wrong field on `metodo_cuenta_corriente` or `metodo_efectivo` — check the actual Odoo traceback for the missing field name and add it using `cls.bank_journal` / `cls.env.company` already in scope, not a new fixture.
- **Type consistency check:** `vendedor_id`, `partner_id`, `origen`, `monto_cobrado`, `comision_pct`, `comision_monto`, `pos_payment_id`, `account_payment_id` are used identically (same names) across Task 2 (model definition), Task 3 (`pos_order.py`), Task 4 (`account_payment.py`), and all test assertions — verified by re-reading each task's code block against Task 2's field list before finalizing this plan.
