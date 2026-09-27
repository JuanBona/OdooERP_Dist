# pos_reparto_caja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `pos_reparto_caja` module so Gerencia can see how much money the company actually has available (Caja Efectivo / Caja Transferencia), Administración can confirm each vendedor's daily rendición (with a real-received-amount vs. expected-amount diff), and both Gerencia/Administración can log Gastos against a caja.

**Architecture:** New Odoo 19 addon depending on `point_of_sale`, `account`, `pos_reparto_security` (4 role groups) and `pos_reparto_comision` (reuses `pos.reparto.comision.linea` as the single source of truth for "what did this vendedor collect"). Adds 2 new persisted models (`reparto.caja.rendicion`, `reparto.caja.gasto`) and 1 transient dashboard model (`reparto.caja.dashboard`) whose fields are computed fresh on every open — no stored balance to keep in sync. Full design rationale in `docs/superpowers/specs/2026-09-26-pos-reparto-caja-design.md` — read it before touching this plan if anything here seems to contradict it.

**Tech Stack:** Odoo 19 ORM (Python), XML views, `odoo.tests.common.TransactionCase`. Runs in Docker (`odooerp_dist`); tests execute via `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -i/-u pos_reparto_caja --test-enable --stop-after-init --log-level=test`. Run everything from the repo root (`C:\Users\Bonan\Desktop\OdooERP_Dist`) — the compose file's bind mount is a relative path (`./addons`) and resolves against the directory you run `docker compose` from, not the `-p` project name (see `[[project_pos_reparto_home_navbar_fix]]` memory / prior plans for the gotcha).

---

## File Structure

```
addons/pos_reparto_caja/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── comision_linea.py      # extends pos.reparto.comision.linea: caja, medio_pago, rendicion_id
│   ├── caja_rendicion.py      # reparto.caja.rendicion
│   ├── caja_gasto.py          # reparto.caja.gasto
│   └── caja_dashboard.py      # reparto.caja.dashboard (TransientModel)
├── views/
│   ├── caja_rendicion_views.xml
│   ├── caja_gasto_views.xml
│   └── caja_dashboard_views.xml
├── security/
│   └── ir.model.access.csv
└── tests/
    ├── __init__.py
    └── test_reparto_caja.py
```

No `security/*_rules.xml` (record rules) — same pattern as `pos_reparto_comision`: ACL rows alone are enough, because access is all-or-nothing per role for these models (no per-row visibility needed within a role).

---

### Task 1: Module skeleton

**Files:**
- Create: `addons/pos_reparto_caja/__init__.py`
- Create: `addons/pos_reparto_caja/__manifest__.py`
- Create: `addons/pos_reparto_caja/models/__init__.py`
- Create: `addons/pos_reparto_caja/security/ir.model.access.csv`
- Create: `addons/pos_reparto_caja/tests/__init__.py`

- [ ] **Step 1: Create `__init__.py` (root)**

```python
from . import models
```

- [ ] **Step 2: Create `__manifest__.py`**

```python
{
    'name': 'POS Reparto - Cajas, Rendición y Gastos',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Saldo de caja de empresa (Efectivo/Transferencia), rendición diaria de vendedores y gastos (RF-G01, RF-G03, RF-A05)',
    'depends': ['point_of_sale', 'account', 'pos_reparto_security', 'pos_reparto_comision'],
    'data': [
        'security/ir.model.access.csv',
        'views/caja_rendicion_views.xml',
        'views/caja_gasto_views.xml',
        'views/caja_dashboard_views.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 3: Create `models/__init__.py` (empty for now)**

```python
```

- [ ] **Step 4: Create `security/ir.model.access.csv` (header only for now)**

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
```

- [ ] **Step 5: Create `tests/__init__.py` (empty for now)**

```python
```

- [ ] **Step 6: Install the empty module to confirm the skeleton loads**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -i pos_reparto_caja --stop-after-init --log-level=info`
Expected: log ends with `Modules loaded.` and no traceback (an addon with no models/views is a valid no-op install).

- [ ] **Step 7: Commit**

```bash
git add addons/pos_reparto_caja
git commit -m "$(cat <<'EOF'
feat(pos_reparto_caja): scaffold empty module

EOF
)"
```

---

### Task 2: Extend `pos.reparto.comision.linea` with `caja`, `medio_pago`, `rendicion_id`

**Files:**
- Create: `addons/pos_reparto_caja/models/comision_linea.py`
- Modify: `addons/pos_reparto_caja/models/__init__.py`
- Test: `addons/pos_reparto_caja/tests/test_reparto_caja.py`

- [ ] **Step 1: Write the failing tests**

Create `addons/pos_reparto_caja/tests/test_reparto_caja.py`:

```python
from odoo import Command, fields
from odoo.exceptions import AccessError, UserError
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoCaja(TransactionCase):

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

        cls.journal_efectivo = cls.env['account.journal'].create({
            'name': 'Caja Efectivo Test',
            'type': 'cash',
            'code': 'CEFT',
        })
        cls.journal_transferencia = cls.env['account.journal'].create({
            'name': 'Caja Transferencia Test',
            'type': 'bank',
            'code': 'CTRT',
        })
        cls.metodo_efectivo = cls.env['pos.payment.method'].create({
            'name': 'Efectivo Test Caja',
            'type': 'cash',
            'journal_id': cls.journal_efectivo.id,
            'company_id': cls.env.company.id,
        })
        cls.metodo_debito = cls.env['pos.payment.method'].create({
            'name': 'Débito Test Caja',
            'type': 'bank',
            'journal_id': cls.journal_transferencia.id,
            'company_id': cls.env.company.id,
        })
        cls.pos_config = cls.env['pos.config'].create({'name': 'Camión Test Caja'})
        cls.pos_session = cls.env['pos.session'].create({'config_id': cls.pos_config.id})
        cls.product = cls.env['product.product'].create({
            'name': 'Producto Test Caja',
            'type': 'consu',
            'list_price': 100.0,
            'available_in_pos': True,
        })

    def _crear_vendedor(self, name, pct=10.0):
        group_vendedor = self.env.ref('pos_reparto_security.group_reparto_vendedor')
        group_internal = self.env.ref('base.group_user')
        vendedor = self.env['res.users'].create({
            'name': name,
            'login': name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        vendedor.sudo().reparto_comision_pct = pct
        return vendedor

    def _crear_administracion(self, name):
        group = self.env.ref('pos_reparto_security.group_reparto_adminop')
        group_internal = self.env.ref('base.group_user')
        return self.env['res.users'].create({
            'name': name,
            'login': name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group.id])],
        })

    def _crear_gerente(self, name):
        group = self.env.ref('pos_reparto_security.group_reparto_gerencia')
        group_internal = self.env.ref('base.group_user')
        return self.env['res.users'].create({
            'name': name,
            'login': name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group.id])],
        })

    def _crear_partner(self, name, vendedor=None):
        vals = {'name': name, 'property_account_receivable_id': self.receivable_account.id}
        if vendedor:
            vals['user_id'] = vendedor.id
        return self.env['res.partner'].create(vals)

    def _crear_orden_pagada(self, partner, metodo_pago, monto):
        orden = self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'partner_id': partner.id,
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
        orden.write({'state': 'paid'})
        return orden

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

    def _crear_y_conciliar_pago(self, partner, receivable_line, monto, journal):
        payment = self.env['account.payment'].create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': monto,
            'date': fields.Date.today(),
            'journal_id': journal.id,
        })
        payment.action_post()
        payment_line = payment.move_id.line_ids.filtered(
            lambda l: l.account_id == self.receivable_account
        )
        (payment_line + receivable_line).reconcile()
        return payment

    def test_linea_venta_directa_efectivo_se_clasifica_como_caja_efectivo(self):
        vendedor = self._crear_vendedor('Vendedor Caja Efectivo')
        partner = self._crear_partner('Cliente Caja Efectivo', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 500.0)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(linea.caja, 'efectivo')
        self.assertEqual(linea.medio_pago, 'Efectivo Test Caja')

    def test_linea_venta_directa_debito_se_clasifica_como_caja_transferencia(self):
        vendedor = self._crear_vendedor('Vendedor Caja Transferencia')
        partner = self._crear_partner('Cliente Caja Transferencia', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_debito, 500.0)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(linea.caja, 'transferencia')
        self.assertEqual(linea.medio_pago, 'Débito Test Caja')

    def test_linea_cobro_credito_efectivo_se_clasifica_como_caja_efectivo(self):
        vendedor = self._crear_vendedor('Vendedor Cobro Efectivo')
        partner = self._crear_partner('Cliente Cobro Efectivo', vendedor)
        receivable = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today())
        pago = self._crear_y_conciliar_pago(partner, receivable, 1000.0, self.journal_efectivo)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(linea.caja, 'efectivo')
        self.assertEqual(linea.medio_pago, 'Caja Efectivo Test')

    def test_linea_cobro_credito_transferencia_se_clasifica_como_caja_transferencia(self):
        vendedor = self._crear_vendedor('Vendedor Cobro Transferencia')
        partner = self._crear_partner('Cliente Cobro Transferencia', vendedor)
        receivable = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today())
        pago = self._crear_y_conciliar_pago(partner, receivable, 1000.0, self.journal_transferencia)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(linea.caja, 'transferencia')
        self.assertEqual(linea.medio_pago, 'Caja Transferencia Test')

    def test_linea_recien_creada_no_tiene_rendicion(self):
        vendedor = self._crear_vendedor('Vendedor Sin Rendir')
        partner = self._crear_partner('Cliente Sin Rendir', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 500.0)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertFalse(linea.rendicion_id)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -i pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: FAIL — `AttributeError` or similar, `caja`/`medio_pago`/`rendicion_id` don't exist on `pos.reparto.comision.linea` yet.

- [ ] **Step 3: Write `models/comision_linea.py`**

```python
from odoo import api, fields, models


class PosRepartoComisionLinea(models.Model):
    _inherit = 'pos.reparto.comision.linea'

    caja = fields.Selection(
        [('efectivo', 'Efectivo'), ('transferencia', 'Transferencia')],
        string='Caja', compute='_compute_caja_medio', store=True,
    )
    medio_pago = fields.Char(string='Medio de pago', compute='_compute_caja_medio', store=True)
    rendicion_id = fields.Many2one(
        'reparto.caja.rendicion', string='Rendición', ondelete='set null',
        help='Vacío = todavía pendiente de rendir.',
    )

    @api.depends(
        'pos_payment_id.payment_method_id.journal_id.type',
        'pos_payment_id.payment_method_id.name',
        'account_payment_id.journal_id.type',
        'account_payment_id.journal_id.name',
    )
    def _compute_caja_medio(self):
        for linea in self:
            if linea.pos_payment_id:
                journal = linea.pos_payment_id.payment_method_id.journal_id
                medio = linea.pos_payment_id.payment_method_id.name
            elif linea.account_payment_id:
                journal = linea.account_payment_id.journal_id
                medio = linea.account_payment_id.journal_id.name
            else:
                journal = False
                medio = False
            linea.caja = 'efectivo' if journal and journal.type == 'cash' else 'transferencia'
            linea.medio_pago = medio
```

- [ ] **Step 4: Wire it into `models/__init__.py`**

```python
from . import comision_linea
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: the 5 tests from Step 1 PASS (other tests in the file will still fail — later tasks implement them; check the log for these 5 specific test names).

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_caja/models/comision_linea.py addons/pos_reparto_caja/models/__init__.py addons/pos_reparto_caja/tests/test_reparto_caja.py
git commit -m "$(cat <<'EOF'
feat(pos_reparto_caja): clasificar comision_linea por caja y medio de pago

EOF
)"
```

---

### Task 3: `reparto.caja.rendicion` model

**Files:**
- Create: `addons/pos_reparto_caja/models/caja_rendicion.py`
- Modify: `addons/pos_reparto_caja/models/__init__.py`
- Modify: `addons/pos_reparto_caja/tests/test_reparto_caja.py`

- [ ] **Step 1: Write the failing tests**

Append to `test_reparto_caja.py`:

```python
    def test_rendicion_calcula_monto_esperado_por_caja_al_crear(self):
        vendedor = self._crear_vendedor('Vendedor Rendicion Esperado')
        partner = self._crear_partner('Cliente Rendicion Esperado', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        self._crear_orden_pagada(partner, self.metodo_debito, 200.0)

        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})

        self.assertEqual(rendicion.monto_esperado_efectivo, 300.0)
        self.assertEqual(rendicion.monto_esperado_transferencia, 200.0)

    def test_action_rendir_marca_lineas_pendientes_del_vendedor(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Marca')
        partner = self._crear_partner('Cliente Rendir Marca', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})

        rendicion.write({'monto_recibido_efectivo': 300.0, 'monto_recibido_transferencia': 0.0})
        rendicion.action_rendir()

        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(linea.rendicion_id, rendicion)
        self.assertEqual(rendicion.state, 'rendido')
        self.assertTrue(rendicion.rendido_uid)
        self.assertTrue(rendicion.rendido_fecha)

    def test_action_rendir_no_toca_lineas_de_otro_vendedor(self):
        vendedor_1 = self._crear_vendedor('Vendedor Rendir Uno')
        vendedor_2 = self._crear_vendedor('Vendedor Rendir Dos')
        partner_1 = self._crear_partner('Cliente Rendir Uno', vendedor_1)
        partner_2 = self._crear_partner('Cliente Rendir Dos', vendedor_2)
        self._crear_orden_pagada(partner_1, self.metodo_efectivo, 100.0)
        orden_2 = self._crear_orden_pagada(partner_2, self.metodo_efectivo, 150.0)

        rendicion_1 = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor_1.id})
        rendicion_1.write({'monto_recibido_efectivo': 100.0, 'monto_recibido_transferencia': 0.0})
        rendicion_1.action_rendir()

        linea_2 = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden_2.payment_ids[0].id),
        ])
        self.assertFalse(linea_2.rendicion_id)

    def test_action_rendir_incluye_lineas_nuevas_hasta_el_momento_de_ejecutar(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Tardio')
        partner = self._crear_partner('Cliente Rendir Tardio', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 100.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})
        # Cobra algo más después de crear el borrador, antes de apretar Rendir.
        orden_tardia = self._crear_orden_pagada(partner, self.metodo_efectivo, 50.0)

        rendicion.write({'monto_recibido_efectivo': 150.0, 'monto_recibido_transferencia': 0.0})
        rendicion.action_rendir()

        linea_tardia = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden_tardia.payment_ids[0].id),
        ])
        self.assertEqual(linea_tardia.rendicion_id, rendicion)

    def test_action_rendir_falla_si_ya_esta_rendida(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Doble')
        partner = self._crear_partner('Cliente Rendir Doble', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 100.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})
        rendicion.write({'monto_recibido_efectivo': 100.0, 'monto_recibido_transferencia': 0.0})
        rendicion.action_rendir()

        with self.assertRaises(UserError):
            rendicion.action_rendir()

    def test_diferencia_efectivo_y_transferencia_se_calculan(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Diferencia')
        partner = self._crear_partner('Cliente Rendir Diferencia', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})

        rendicion.write({'monto_recibido_efectivo': 280.0, 'monto_recibido_transferencia': 0.0})

        self.assertEqual(rendicion.diferencia_efectivo, -20.0)
        self.assertEqual(rendicion.diferencia_transferencia, 0.0)

    def test_vendedor_no_puede_leer_rendiciones(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Sin Acceso')
        with self.assertRaises(AccessError):
            self.env['reparto.caja.rendicion'].with_user(vendedor).search([])

    def test_administracion_puede_crear_y_rendir(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Admin')
        partner = self._crear_partner('Cliente Rendir Admin', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 100.0)
        admin = self._crear_administracion('Admin Rendir')

        rendicion = self.env['reparto.caja.rendicion'].with_user(admin).create({
            'vendedor_id': vendedor.id,
        })
        rendicion.with_user(admin).write({
            'monto_recibido_efectivo': 100.0, 'monto_recibido_transferencia': 0.0,
        })
        rendicion.with_user(admin).action_rendir()
        self.assertEqual(rendicion.state, 'rendido')

    def test_gerencia_puede_leer_pero_no_escribir_rendicion(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Gerencia')
        gerente = self._crear_gerente('Gerente Rendir Lectura')
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})

        leida = self.env['reparto.caja.rendicion'].with_user(gerente).browse(rendicion.id)
        self.assertEqual(leida.vendedor_id, vendedor)
        with self.assertRaises(AccessError):
            leida.write({'monto_recibido_efectivo': 10.0})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: FAIL — `reparto.caja.rendicion` model doesn't exist yet (`KeyError` / `ValueError: Invalid model name`).

- [ ] **Step 3: Write `models/caja_rendicion.py`**

```python
from odoo import api, fields, models
from odoo.exceptions import UserError


class RepartoCajaRendicion(models.Model):
    _name = 'reparto.caja.rendicion'
    _description = 'Rendición de caja de un vendedor (Reparto)'
    _order = 'fecha desc, id desc'

    vendedor_id = fields.Many2one('res.users', string='Vendedor', required=True)
    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )

    monto_esperado_efectivo = fields.Monetary(
        string='Esperado Efectivo', currency_field='currency_id', readonly=True,
    )
    monto_esperado_transferencia = fields.Monetary(
        string='Esperado Transferencia', currency_field='currency_id', readonly=True,
    )
    monto_recibido_efectivo = fields.Monetary(string='Recibido Efectivo', currency_field='currency_id')
    monto_recibido_transferencia = fields.Monetary(
        string='Recibido Transferencia', currency_field='currency_id',
    )
    diferencia_efectivo = fields.Monetary(
        string='Diferencia Efectivo', currency_field='currency_id',
        compute='_compute_diferencias', store=True,
    )
    diferencia_transferencia = fields.Monetary(
        string='Diferencia Transferencia', currency_field='currency_id',
        compute='_compute_diferencias', store=True,
    )

    state = fields.Selection(
        [('borrador', 'Borrador'), ('rendido', 'Rendido')],
        string='Estado', default='borrador', required=True,
    )
    rendido_uid = fields.Many2one('res.users', string='Rendido por', readonly=True)
    rendido_fecha = fields.Datetime(string='Fecha de rendición', readonly=True)

    @api.depends(
        'monto_recibido_efectivo', 'monto_esperado_efectivo',
        'monto_recibido_transferencia', 'monto_esperado_transferencia',
    )
    def _compute_diferencias(self):
        for rendicion in self:
            rendicion.diferencia_efectivo = (
                rendicion.monto_recibido_efectivo - rendicion.monto_esperado_efectivo
            )
            rendicion.diferencia_transferencia = (
                rendicion.monto_recibido_transferencia - rendicion.monto_esperado_transferencia
            )

    @api.model_create_multi
    def create(self, vals_list):
        Linea = self.env['pos.reparto.comision.linea'].sudo()
        for vals in vals_list:
            vendedor_id = vals.get('vendedor_id')
            if not vendedor_id:
                continue
            pendientes = Linea.search([
                ('vendedor_id', '=', vendedor_id),
                ('rendicion_id', '=', False),
            ])
            vals.setdefault(
                'monto_esperado_efectivo',
                sum(pendientes.filtered(lambda l: l.caja == 'efectivo').mapped('monto_cobrado')),
            )
            vals.setdefault(
                'monto_esperado_transferencia',
                sum(pendientes.filtered(lambda l: l.caja == 'transferencia').mapped('monto_cobrado')),
            )
        return super().create(vals_list)

    def action_rendir(self):
        Linea = self.env['pos.reparto.comision.linea'].sudo()
        for rendicion in self:
            if rendicion.state != 'borrador':
                raise UserError('Esta rendición ya fue confirmada.')
            pendientes = Linea.search([
                ('vendedor_id', '=', rendicion.vendedor_id.id),
                ('rendicion_id', '=', False),
            ])
            pendientes.write({'rendicion_id': rendicion.id})
            rendicion.write({
                'state': 'rendido',
                'rendido_uid': self.env.user.id,
                'rendido_fecha': fields.Datetime.now(),
            })
```

- [ ] **Step 4: Wire it into `models/__init__.py`**

```python
from . import comision_linea
from . import caja_rendicion
```

- [ ] **Step 5: Add ACL rows to `security/ir.model.access.csv`**

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_reparto_caja_rendicion_adminop,reparto.caja.rendicion.adminop,model_reparto_caja_rendicion,pos_reparto_security.group_reparto_adminop,1,1,1,0
access_reparto_caja_rendicion_gerencia,reparto.caja.rendicion.gerencia,model_reparto_caja_rendicion,pos_reparto_security.group_reparto_gerencia,1,0,0,0
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: all tests added in Step 1 of this task PASS.

- [ ] **Step 7: Commit**

```bash
git add addons/pos_reparto_caja/models/caja_rendicion.py addons/pos_reparto_caja/models/__init__.py addons/pos_reparto_caja/security/ir.model.access.csv addons/pos_reparto_caja/tests/test_reparto_caja.py
git commit -m "$(cat <<'EOF'
feat(pos_reparto_caja): modelo de rendicion con monto esperado/recibido y boton Rendir

EOF
)"
```

---

### Task 4: `reparto.caja.gasto` model

**Files:**
- Create: `addons/pos_reparto_caja/models/caja_gasto.py`
- Modify: `addons/pos_reparto_caja/models/__init__.py`
- Modify: `addons/pos_reparto_caja/security/ir.model.access.csv`
- Modify: `addons/pos_reparto_caja/tests/test_reparto_caja.py`

- [ ] **Step 1: Write the failing tests**

Append to `test_reparto_caja.py`:

```python
    def test_gasto_requiere_monto_positivo(self):
        vendedor = self._crear_vendedor('Vendedor Gasto Invalido')
        with self.assertRaises(Exception):
            self.env['reparto.caja.gasto'].create({
                'caja': 'efectivo',
                'monto': -50.0,
                'vendedor_id': vendedor.id,
                'motivo': 'Prueba monto invalido',
            })

    def test_gasto_se_crea_con_motivo_y_vendedor(self):
        vendedor = self._crear_vendedor('Vendedor Gasto Valido')
        gasto = self.env['reparto.caja.gasto'].create({
            'caja': 'efectivo',
            'monto': 100.0,
            'vendedor_id': vendedor.id,
            'motivo': 'Compra personal en la calle',
        })
        self.assertEqual(gasto.registrado_uid, self.env.user)

    def test_vendedor_no_puede_crear_gasto(self):
        vendedor = self._crear_vendedor('Vendedor Gasto Sin Acceso')
        with self.assertRaises(AccessError):
            self.env['reparto.caja.gasto'].with_user(vendedor).create({
                'caja': 'efectivo',
                'monto': 100.0,
                'vendedor_id': vendedor.id,
                'motivo': 'Intento no autorizado',
            })

    def test_gerencia_puede_crear_gasto(self):
        vendedor = self._crear_vendedor('Vendedor Gasto Gerencia')
        gerente = self._crear_gerente('Gerente Gasto Crea')
        gasto = self.env['reparto.caja.gasto'].with_user(gerente).create({
            'caja': 'transferencia',
            'monto': 250.0,
            'vendedor_id': vendedor.id,
            'motivo': 'Adelanto de gerencia',
        })
        self.assertEqual(gasto.caja, 'transferencia')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: FAIL — `reparto.caja.gasto` model doesn't exist yet.

- [ ] **Step 3: Write `models/caja_gasto.py`**

```python
from odoo import fields, models


class RepartoCajaGasto(models.Model):
    _name = 'reparto.caja.gasto'
    _description = 'Gasto / egreso de caja (Reparto)'
    _order = 'fecha desc, id desc'

    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    caja = fields.Selection(
        [('efectivo', 'Efectivo'), ('transferencia', 'Transferencia')],
        string='Caja', required=True,
    )
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )
    monto = fields.Monetary(string='Monto', currency_field='currency_id', required=True)
    vendedor_id = fields.Many2one('res.users', string='Vendedor responsable', required=True)
    motivo = fields.Char(string='Motivo', required=True)
    registrado_uid = fields.Many2one(
        'res.users', string='Registrado por', default=lambda self: self.env.user, readonly=True,
    )

    _monto_positivo = models.Constraint('CHECK(monto > 0)', 'El monto del gasto tiene que ser mayor a cero.')
```

- [ ] **Step 4: Wire it into `models/__init__.py`**

```python
from . import comision_linea
from . import caja_rendicion
from . import caja_gasto
```

- [ ] **Step 5: Add ACL rows to `security/ir.model.access.csv`**

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_reparto_caja_rendicion_adminop,reparto.caja.rendicion.adminop,model_reparto_caja_rendicion,pos_reparto_security.group_reparto_adminop,1,1,1,0
access_reparto_caja_rendicion_gerencia,reparto.caja.rendicion.gerencia,model_reparto_caja_rendicion,pos_reparto_security.group_reparto_gerencia,1,0,0,0
access_reparto_caja_gasto_adminop,reparto.caja.gasto.adminop,model_reparto_caja_gasto,pos_reparto_security.group_reparto_adminop,1,1,1,0
access_reparto_caja_gasto_gerencia,reparto.caja.gasto.gerencia,model_reparto_caja_gasto,pos_reparto_security.group_reparto_gerencia,1,0,1,0
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: all tests added in Step 1 of this task PASS.

- [ ] **Step 7: Commit**

```bash
git add addons/pos_reparto_caja/models/caja_gasto.py addons/pos_reparto_caja/models/__init__.py addons/pos_reparto_caja/security/ir.model.access.csv addons/pos_reparto_caja/tests/test_reparto_caja.py
git commit -m "$(cat <<'EOF'
feat(pos_reparto_caja): modelo de gasto con vendedor responsable y motivo

EOF
)"
```

---

### Task 5: Saldo de Cajas (dashboard transitorio)

**Files:**
- Create: `addons/pos_reparto_caja/models/caja_dashboard.py`
- Modify: `addons/pos_reparto_caja/models/__init__.py`
- Modify: `addons/pos_reparto_caja/security/ir.model.access.csv`
- Modify: `addons/pos_reparto_caja/tests/test_reparto_caja.py`

- [ ] **Step 1: Write the failing tests**

Append to `test_reparto_caja.py`:

```python
    def _rendir_todo_pendiente(self, vendedor, monto_efectivo, monto_transferencia):
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})
        rendicion.write({
            'monto_recibido_efectivo': monto_efectivo,
            'monto_recibido_transferencia': monto_transferencia,
        })
        rendicion.action_rendir()
        return rendicion

    def test_saldo_caja_suma_rendiciones_confirmadas_menos_gastos(self):
        dashboard = self.env['reparto.caja.dashboard'].create({})
        saldo_efectivo_inicial = dashboard.saldo_efectivo
        saldo_transferencia_inicial = dashboard.saldo_transferencia

        vendedor = self._crear_vendedor('Vendedor Saldo Dashboard')
        partner = self._crear_partner('Cliente Saldo Dashboard', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        self._crear_orden_pagada(partner, self.metodo_debito, 200.0)
        self._rendir_todo_pendiente(vendedor, 300.0, 200.0)

        self.env['reparto.caja.gasto'].create({
            'caja': 'efectivo', 'monto': 50.0,
            'vendedor_id': vendedor.id, 'motivo': 'Gasto de prueba dashboard',
        })

        dashboard_2 = self.env['reparto.caja.dashboard'].create({})
        self.assertEqual(dashboard_2.saldo_efectivo, saldo_efectivo_inicial + 300.0 - 50.0)
        self.assertEqual(dashboard_2.saldo_transferencia, saldo_transferencia_inicial + 200.0)

    def test_saldo_caja_ignora_rendicion_en_borrador(self):
        dashboard = self.env['reparto.caja.dashboard'].create({})
        saldo_inicial = dashboard.saldo_efectivo

        vendedor = self._crear_vendedor('Vendedor Saldo Borrador')
        partner = self._crear_partner('Cliente Saldo Borrador', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 400.0)
        self.env['reparto.caja.rendicion'].create({
            'vendedor_id': vendedor.id, 'monto_recibido_efectivo': 400.0,
        })  # no se llama action_rendir: sigue en borrador

        dashboard_2 = self.env['reparto.caja.dashboard'].create({})
        self.assertEqual(dashboard_2.saldo_efectivo, saldo_inicial)

    def test_dashboard_accion_existe(self):
        action = self.env.ref('pos_reparto_caja.action_reparto_caja_dashboard')
        self.assertEqual(action.res_model, 'reparto.caja.dashboard')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: FAIL — `reparto.caja.dashboard` model / `action_reparto_caja_dashboard` don't exist yet.

- [ ] **Step 3: Write `models/caja_dashboard.py`**

```python
from odoo import api, fields, models


class RepartoCajaDashboard(models.TransientModel):
    _name = 'reparto.caja.dashboard'
    _description = 'Panel de saldo de Cajas (Reparto)'

    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )
    saldo_efectivo = fields.Monetary(
        string='Saldo Caja Efectivo', currency_field='currency_id', compute='_compute_saldos',
    )
    saldo_transferencia = fields.Monetary(
        string='Saldo Caja Transferencia', currency_field='currency_id', compute='_compute_saldos',
    )

    def _compute_saldos(self):
        for rec in self:
            rec.saldo_efectivo = rec._saldo_caja('efectivo')
            rec.saldo_transferencia = rec._saldo_caja('transferencia')

    @api.model
    def _saldo_caja(self, caja):
        campo_recibido = 'monto_recibido_efectivo' if caja == 'efectivo' else 'monto_recibido_transferencia'
        rendido = self.env['reparto.caja.rendicion'].sudo().search([('state', '=', 'rendido')])
        total_rendido = sum(rendido.mapped(campo_recibido))
        gastos = self.env['reparto.caja.gasto'].sudo().search([('caja', '=', caja)])
        total_gasto = sum(gastos.mapped('monto'))
        return total_rendido - total_gasto
```

- [ ] **Step 4: Wire it into `models/__init__.py`**

```python
from . import comision_linea
from . import caja_rendicion
from . import caja_gasto
from . import caja_dashboard
```

- [ ] **Step 5: Add ACL row to `security/ir.model.access.csv`**

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_reparto_caja_rendicion_adminop,reparto.caja.rendicion.adminop,model_reparto_caja_rendicion,pos_reparto_security.group_reparto_adminop,1,1,1,0
access_reparto_caja_rendicion_gerencia,reparto.caja.rendicion.gerencia,model_reparto_caja_rendicion,pos_reparto_security.group_reparto_gerencia,1,0,0,0
access_reparto_caja_gasto_adminop,reparto.caja.gasto.adminop,model_reparto_caja_gasto,pos_reparto_security.group_reparto_adminop,1,1,1,0
access_reparto_caja_gasto_gerencia,reparto.caja.gasto.gerencia,model_reparto_caja_gasto,pos_reparto_security.group_reparto_gerencia,1,0,1,0
access_reparto_caja_dashboard_adminop,reparto.caja.dashboard.adminop,model_reparto_caja_dashboard,pos_reparto_security.group_reparto_adminop,1,1,1,1
access_reparto_caja_dashboard_gerencia,reparto.caja.dashboard.gerencia,model_reparto_caja_dashboard,pos_reparto_security.group_reparto_gerencia,1,1,1,1
```

(The dashboard is a `TransientModel` the user creates just by opening the action — it needs `perm_create`/`perm_write` for both roles, unlike the persisted models above.)

- [ ] **Step 6: Create `views/caja_dashboard_views.xml`**

```xml
<odoo>
    <record id="view_reparto_caja_dashboard_form" model="ir.ui.view">
        <field name="name">reparto.caja.dashboard.form</field>
        <field name="model">reparto.caja.dashboard</field>
        <field name="arch" type="xml">
            <form string="Cajas">
                <sheet>
                    <group>
                        <field name="saldo_efectivo" readonly="1"/>
                        <field name="saldo_transferencia" readonly="1"/>
                    </group>
                </sheet>
            </form>
        </field>
    </record>

    <record id="action_reparto_caja_dashboard" model="ir.actions.act_window">
        <field name="name">Cajas</field>
        <field name="res_model">reparto.caja.dashboard</field>
        <field name="view_mode">form</field>
        <field name="target">current</field>
    </record>

    <menuitem id="menu_reparto_caja_dashboard"
        name="Cajas"
        parent="point_of_sale.menu_point_root"
        action="action_reparto_caja_dashboard"
        groups="pos_reparto_security.group_reparto_gerencia,pos_reparto_security.group_reparto_adminop"
        sequence="15"/>
</odoo>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: all tests added in Step 1 of this task PASS, including `test_dashboard_accion_existe`.

- [ ] **Step 8: Commit**

```bash
git add addons/pos_reparto_caja/models/caja_dashboard.py addons/pos_reparto_caja/models/__init__.py addons/pos_reparto_caja/security/ir.model.access.csv addons/pos_reparto_caja/views/caja_dashboard_views.xml addons/pos_reparto_caja/tests/test_reparto_caja.py
git commit -m "$(cat <<'EOF'
feat(pos_reparto_caja): dashboard de saldo Efectivo/Transferencia para Gerencia

EOF
)"
```

---

### Task 6: List/form views + menus for Rendición and Gasto

**Files:**
- Create: `addons/pos_reparto_caja/views/caja_rendicion_views.xml`
- Create: `addons/pos_reparto_caja/views/caja_gasto_views.xml`

No new tests in this task — `test_administracion_puede_crear_y_rendir` (Task 3) and `test_gerencia_puede_crear_gasto` (Task 4) already exercise the underlying model+ACL through `env[...]`, which is what actually matters. This task is pure XML wiring so the roles can reach these actions from the UI menu, verified manually per Step 3 below (Odoo view XML has no meaningful unit-test story beyond "does it load", which the `-u` install already checks).

- [ ] **Step 1: Create `views/caja_rendicion_views.xml`**

```xml
<odoo>
    <record id="view_reparto_caja_rendicion_list" model="ir.ui.view">
        <field name="name">reparto.caja.rendicion.list</field>
        <field name="model">reparto.caja.rendicion</field>
        <field name="arch" type="xml">
            <list string="Rendiciones" default_order="fecha desc">
                <field name="fecha"/>
                <field name="vendedor_id"/>
                <field name="monto_esperado_efectivo"/>
                <field name="monto_recibido_efectivo"/>
                <field name="diferencia_efectivo"/>
                <field name="monto_esperado_transferencia"/>
                <field name="monto_recibido_transferencia"/>
                <field name="diferencia_transferencia"/>
                <field name="state"/>
            </list>
        </field>
    </record>

    <record id="view_reparto_caja_rendicion_form" model="ir.ui.view">
        <field name="name">reparto.caja.rendicion.form</field>
        <field name="model">reparto.caja.rendicion</field>
        <field name="arch" type="xml">
            <form string="Rendición">
                <header>
                    <button name="action_rendir" type="object" string="Rendir"
                        class="oe_highlight" invisible="state == 'rendido'"/>
                    <field name="state" widget="statusbar"/>
                </header>
                <sheet>
                    <group>
                        <group>
                            <field name="vendedor_id" readonly="state == 'rendido'"/>
                            <field name="fecha" readonly="state == 'rendido'"/>
                        </group>
                    </group>
                    <group string="Efectivo">
                        <field name="monto_esperado_efectivo"/>
                        <field name="monto_recibido_efectivo" readonly="state == 'rendido'"/>
                        <field name="diferencia_efectivo"/>
                    </group>
                    <group string="Transferencia">
                        <field name="monto_esperado_transferencia"/>
                        <field name="monto_recibido_transferencia" readonly="state == 'rendido'"/>
                        <field name="diferencia_transferencia"/>
                    </group>
                    <group string="Confirmación" invisible="state != 'rendido'">
                        <field name="rendido_uid"/>
                        <field name="rendido_fecha"/>
                    </group>
                </sheet>
            </form>
        </field>
    </record>

    <record id="action_reparto_caja_rendicion" model="ir.actions.act_window">
        <field name="name">Rendiciones</field>
        <field name="res_model">reparto.caja.rendicion</field>
        <field name="view_mode">list,form</field>
    </record>

    <menuitem id="menu_reparto_caja_rendicion"
        name="Rendiciones"
        parent="point_of_sale.menu_point_root"
        action="action_reparto_caja_rendicion"
        groups="pos_reparto_security.group_reparto_gerencia,pos_reparto_security.group_reparto_adminop"
        sequence="16"/>
</odoo>
```

- [ ] **Step 2: Create `views/caja_gasto_views.xml`**

```xml
<odoo>
    <record id="view_reparto_caja_gasto_list" model="ir.ui.view">
        <field name="name">reparto.caja.gasto.list</field>
        <field name="model">reparto.caja.gasto</field>
        <field name="arch" type="xml">
            <list string="Gastos" default_order="fecha desc" editable="bottom">
                <field name="fecha"/>
                <field name="caja"/>
                <field name="monto"/>
                <field name="vendedor_id"/>
                <field name="motivo"/>
                <field name="registrado_uid" readonly="1"/>
            </list>
        </field>
    </record>

    <record id="action_reparto_caja_gasto" model="ir.actions.act_window">
        <field name="name">Gastos</field>
        <field name="res_model">reparto.caja.gasto</field>
        <field name="view_mode">list</field>
    </record>

    <menuitem id="menu_reparto_caja_gasto"
        name="Gastos"
        parent="point_of_sale.menu_point_root"
        action="action_reparto_caja_gasto"
        groups="pos_reparto_security.group_reparto_gerencia,pos_reparto_security.group_reparto_adminop"
        sequence="17"/>
</odoo>
```

- [ ] **Step 3: Install/verify the full module including views**

Run: `docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_caja --test-enable --stop-after-init --log-level=test`
Expected: `Modules loaded.`, no traceback, and every test in `test_reparto_caja.py` PASSes (full suite from Tasks 2-5 plus this task's view wiring).

- [ ] **Step 4: Commit**

```bash
git add addons/pos_reparto_caja/views/caja_rendicion_views.xml addons/pos_reparto_caja/views/caja_gasto_views.xml
git commit -m "$(cat <<'EOF'
feat(pos_reparto_caja): vistas y menus de Rendiciones y Gastos

EOF
)"
```

---

### Task 7: Consolidate camión payment methods into shared Efectivo/Débito/Crédito

This is the data-migration counterpart to what was already done for stock in Fase 1 (see `[[project_stock_camion_a_general_2026-09-26]]`) — it's config/data in the dev DB, not code, so it's a shell script step, not a Python task. Do this **after** Task 6 passes, against the running `odooerp_dist-odoo-1` container (not the ephemeral `run --rm` used for tests).

- [ ] **Step 1: Confirm Docker is up and the bind mount matches this checkout**

Run: `docker compose -p odooerp_dist up -d`
Run: `docker inspect odooerp_dist-odoo-1 --format "{{json .Mounts}}"`
Expected: the `addons` mount's `Source` ends in this repo's `addons` folder (see gotcha note in the plan header).

- [ ] **Step 2: Inspect current payment methods/journals**

```bash
MSYS_NO_PATHCONV=1 docker exec -i odooerp_dist-odoo-1 odoo shell -d odoo --db_host db --db_port 5432 --db_user odoo --db_password odoo --no-http <<'EOF'
import json
pms = env['pos.payment.method'].search([])
print(json.dumps([{'id': p.id, 'name': p.name, 'journal': p.journal_id.name if p.journal_id else None} for p in pms], indent=2))
EOF
```

Expected output includes `Efectivo Camion 1/2/3` (journals `Caja Camion 1/2/3`) and `Card` (journal `Bank`) — confirm before changing anything, since exact IDs will differ if data has changed since 2026-09-26.

- [ ] **Step 3: Create the 2 company-wide journals if they don't already exist, and repoint payment methods**

```bash
MSYS_NO_PATHCONV=1 docker exec -i odooerp_dist-odoo-1 odoo shell -d odoo --db_host db --db_port 5432 --db_user odoo --db_password odoo --no-http <<'EOF'
journal_efectivo = env['account.journal'].search([('name', '=', 'Caja Efectivo')], limit=1)
if not journal_efectivo:
    journal_efectivo = env['account.journal'].create({'name': 'Caja Efectivo', 'type': 'cash', 'code': 'CEFT'})

journal_transferencia = env['account.journal'].search([('name', '=', 'Caja Transferencia')], limit=1)
if not journal_transferencia:
    journal_transferencia = env['account.journal'].create({'name': 'Caja Transferencia', 'type': 'bank', 'code': 'CTRA'})

pm_efectivo = env['pos.payment.method'].search([('name', 'in', ['Efectivo Camion 1', 'Efectivo Camion 2', 'Efectivo Camion 3'])])
pm_efectivo.write({'name': 'Efectivo', 'journal_id': journal_efectivo.id})

pm_card = env['pos.payment.method'].search([('name', '=', 'Card')])
pm_card.write({'name': 'Débito', 'journal_id': journal_transferencia.id})

configs = env['pos.config'].search([('name', 'like', 'POS Camion%')])
for cfg in configs:
    cfg.payment_method_ids = [(4, pm.id) for pm in (pm_efectivo | pm_card)]

env.cr.commit()
print("DONE")
EOF
```

Note: consolidating "Efectivo Camion 1/2/3" into 1 record only works if the 3 `pos.payment.method` records can be merged safely — if they have historical `pos.payment` rows pointing at each individually, **do not** delete 2 of them and keep only 1 id; the snippet above deliberately **renames all 3 in place** (`write` on the whole recordset) rather than merging into one, so existing payment history keeps its original `payment_method_id` FK intact while all 3 now share the same display name and journal. Verify this reads correctly before running — if it turns out old payments must all point at literally the same `id`, that's a bigger data migration and should go back to the user as a question, not be guessed here.

- [ ] **Step 4: Verify**

```bash
MSYS_NO_PATHCONV=1 docker exec -i odooerp_dist-odoo-1 odoo shell -d odoo --db_host db --db_port 5432 --db_user odoo --db_password odoo --no-http <<'EOF'
import json
configs = env['pos.config'].search([('name', 'like', 'POS Camion%')])
print(json.dumps([{'name': c.name, 'metodos': c.payment_method_ids.mapped('name')} for c in configs], indent=2))
EOF
```

Expected: all 3 camión configs show the same 2 payment method names (Efectivo, Débito), pointing at the 2 shared journals.

- [ ] **Step 5: No git commit for this task** (DB-only change, nothing to version — same as Task 1 of the stock migration).

---

## Self-Review Notes

- **Spec coverage:** RF-G01 saldo (Task 5), rendición con monto recibido/esperado/diferencia (Task 3), botón Rendir exclusivo Administración (ACL in Task 3), Gastos informativos por vendedor restando del saldo (Task 4 + Task 5), medio de pago consolidado Efectivo/Débito/Crédito→2 cajas (Task 2 classification logic + Task 7 data migration). All spec sections have a task.
- **Deliberately deferred to Phase 4 (Viajes cobro UI, not this plan):** nothing in this module creates the actual `account.payment` when a vendedor collects a debt in Viajes — that UI doesn't exist yet (see roadmap memory). This module only classifies/aggregates whatever payments already exist. Don't be surprised the dashboard reads 0 until Phase 4 ships and vendedores start actually collecting through it.
- **Known simplification vs. spec wording:** the spec says rendición should "no permitir vacío" for received amounts — Monetary fields can't represent "empty" distinctly from `0.0` in Odoo without extra UI machinery (a checkbox, a required-with-placeholder trick). This plan does not attempt that; `action_rendir` only blocks a second rendir on an already-`rendido` record. If the client pushes back on this in testing, it's a small follow-up (add a boolean "conté la plata" gate), not a redesign.
- **Intentional, not a bug:** `monto_esperado_*` freezes at creation, but `action_rendir` sweeps up *every* still-pending línea at execution time — including ones that arrived after the rendición was created as a draft (see `test_action_rendir_incluye_lineas_nuevas_hasta_el_momento_de_ejecutar`). This means `monto_recibido` can legitimately exceed the frozen `monto_esperado` without that being a real faltante/sobrante — it just means new cobros came in while the draft sat open. Don't "fix" this by recomputing `monto_esperado` at rendir time — that would silently swallow the exact race condition this design avoids (a cobro that happens between draft-creation and the Rendir click never getting attached to any rendición).
