# pos_reparto_credito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el módulo `pos_reparto_credito`: campos de deuda en `res.partner` calculados desde contabilidad estándar de Odoo, una pantalla "Deudores" dentro de Punto de Venta, y un popup no bloqueante en el POS al seleccionar un cliente con saldo pendiente.

**Architecture:** Addon nuevo `pos_reparto_credito`, depende de `point_of_sale`, `account` y `pos_reparto_security`. Tres/cuatro campos `compute` (no `store`) en `res.partner` que leen `account.move.line` (cuenta por cobrar) y `account.payment` vía `_read_group` — sin cron, sin campos nuevos en otros modelos. Backend: acción + vista lista + menú dentro de Punto de Venta. Frontend: patch de `PosStore.setPartnerToCurrentOrder` (punto de extensión nativo ya provisto por Odoo) para mostrar un `AlertDialog` informativo.

**Tech Stack:** Odoo 19 CE (Python/ORM, OWL/JS para el frontend de POS), Docker Compose (`db` + `odoo`), tests con `TransactionCase`.

**Spec de referencia:** `docs/superpowers/specs/2026-08-24-pos-reparto-credito-design.md`

**Cómo correr los tests de este módulo (mismo procedimiento documentado en memoria del proyecto, no cambia entre tasks):**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -i pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Usar `-i pos_reparto_credito` **solo la primera vez** (Task 1, el módulo todavía no existe en la base). En todas las tasks siguientes, cambiar `-i` por `-u` (si no, Odoo no vuelve a ejecutar los tests porque el módulo ya está instalado — ver nota de memoria del proyecto).

---

## Pre-flight: crear la rama de feature

- [ ] **Step 1: Crear y pasar a la rama de feature**

```bash
git checkout main
git pull
git checkout -b feature/pos-reparto-credito
```

Expected: rama nueva creada desde `main` actualizado, siguiendo la convención del proyecto ("una rama por feature", `INSTRUCTIVO_SETUP.md`).

---

### Task 1: Scaffold del módulo

**Files:**
- Create: `addons/pos_reparto_credito/__init__.py`
- Create: `addons/pos_reparto_credito/__manifest__.py`
- Create: `addons/pos_reparto_credito/models/__init__.py`
- Create: `addons/pos_reparto_credito/models/res_partner.py`
- Create: `addons/pos_reparto_credito/tests/__init__.py`
- Create: `addons/pos_reparto_credito/tests/test_reparto_credito.py`

- [ ] **Step 1: Crear `__init__.py` raíz**

```python
from . import models
```

- [ ] **Step 2: Crear `__manifest__.py`**

```python
{
    'name': 'POS Reparto - Alerta de Crédito',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Alerta de crédito por cliente (RF-PV-07) y pantalla de deudores para el proyecto Reparto',
    'depends': ['point_of_sale', 'account', 'pos_reparto_security'],
    'data': [],
    'assets': {},
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 3: Crear `models/__init__.py`**

```python
from . import res_partner
```

- [ ] **Step 4: Crear `models/res_partner.py` (esqueleto, sin campos todavía)**

```python
from odoo import models


class ResPartner(models.Model):
    _inherit = 'res.partner'
```

- [ ] **Step 5: Crear `tests/__init__.py`**

```python
from . import test_reparto_credito
```

- [ ] **Step 6: Crear `tests/test_reparto_credito.py` (esqueleto con fixtures contables compartidas)**

Estas fixtures (cuenta por cobrar, cuenta de ingresos, diario de banco) las va a reusar cada task siguiente — se buscan por `account_type`, no se crean, porque la base de datos del proyecto (`backup.sql`) ya trae el plan de cuentas de la localización AR cargado.

```python
from datetime import timedelta

from odoo import Command, fields
from odoo.tests.common import TransactionCase, tagged
from odoo.tools.safe_eval import safe_eval


@tagged('post_install', '-at_install')
class TestRepartoCredito(TransactionCase):

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
```

- [ ] **Step 7: Correr el test suite (todavía sin tests reales, solo confirma que el módulo instala)**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -i pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: el log muestra `Module pos_reparto_credito loaded` y `0 failed, 0 error(s) of 0 tests` (no hay tests todavía, solo confirma que el scaffold instala sin errores).

- [ ] **Step 8: Commit**

```bash
git add addons/pos_reparto_credito
git commit -m "Agregar scaffold de pos_reparto_credito"
```

---

### Task 2: Campo `credito_monto_adeudado`

**Files:**
- Modify: `addons/pos_reparto_credito/models/res_partner.py`
- Modify: `addons/pos_reparto_credito/tests/test_reparto_credito.py`

- [ ] **Step 1: Agregar el test (falla porque el campo no existe todavía)**

Agregar al final de la clase `TestRepartoCredito`:

```python
    def test_monto_adeudado_suma_lineas_sin_conciliar(self):
        partner = self._crear_partner_credito('Cliente Deudor')
        self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=20))
        self._crear_linea_por_cobrar(partner, 500.0, fields.Date.today() - timedelta(days=5))
        self.assertEqual(partner.credito_monto_adeudado, 1500.0)

    def test_sin_deuda_monto_adeudado_es_cero(self):
        partner = self._crear_partner_credito('Cliente Al Dia')
        self.assertEqual(partner.credito_monto_adeudado, 0.0)
```

- [ ] **Step 2: Correr los tests, confirmar que fallan**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `FAIL` o `ERROR` — `credito_monto_adeudado` no existe en `res.partner`.

- [ ] **Step 3: Implementar el campo**

Reemplazar el contenido de `models/res_partner.py`:

```python
from odoo import fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    credito_monto_adeudado = fields.Monetary(
        string='Monto adeudado',
        compute='_compute_credito_fields',
        currency_field='currency_id',
    )

    def _compute_credito_fields(self):
        deuda_domain = [
            ('partner_id', 'in', self.ids),
            ('account_type', '=', 'asset_receivable'),
            ('reconciled', '=', False),
            ('parent_state', '=', 'posted'),
        ]
        monto_por_partner = {
            partner.id: monto
            for partner, monto in self.env['account.move.line']._read_group(
                deuda_domain, groupby=['partner_id'], aggregates=['amount_residual:sum'],
            )
        }
        for partner in self:
            partner.credito_monto_adeudado = monto_por_partner.get(partner.id, 0.0)
```

- [ ] **Step 4: Correr los tests, confirmar que pasan**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `0 failed, 0 error(s) of 2 tests`.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito
git commit -m "Agregar campo credito_monto_adeudado sobre res.partner"
```

---

### Task 3: Campos `credito_fecha_pedido_mas_viejo`, `credito_fecha_ultimo_pago` y `credito_dias_sin_pago` (sin pagos todavía)

**Files:**
- Modify: `addons/pos_reparto_credito/models/res_partner.py`
- Modify: `addons/pos_reparto_credito/tests/test_reparto_credito.py`

- [ ] **Step 1: Agregar los tests**

```python
    def test_dias_sin_pago_usa_fecha_de_pedido_mas_viejo_si_nunca_pago(self):
        partner = self._crear_partner_credito('Cliente Sin Pagos')
        fecha_vieja = fields.Date.today() - timedelta(days=20)
        self._crear_linea_por_cobrar(partner, 1000.0, fecha_vieja)
        self._crear_linea_por_cobrar(partner, 500.0, fields.Date.today() - timedelta(days=5))
        self.assertEqual(partner.credito_fecha_pedido_mas_viejo, fecha_vieja)
        self.assertEqual(partner.credito_fecha_ultimo_pago, fecha_vieja)
        self.assertEqual(partner.credito_dias_sin_pago, 20)

    def test_sin_deuda_dias_y_fechas_son_neutros(self):
        partner = self._crear_partner_credito('Cliente Al Dia')
        self.assertEqual(partner.credito_dias_sin_pago, 0)
        self.assertFalse(partner.credito_fecha_ultimo_pago)
        self.assertFalse(partner.credito_fecha_pedido_mas_viejo)
```

- [ ] **Step 2: Correr los tests, confirmar que fallan**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `ERROR` — `credito_fecha_pedido_mas_viejo` / `credito_fecha_ultimo_pago` / `credito_dias_sin_pago` no existen.

- [ ] **Step 3: Implementar los campos**

Reemplazar el contenido de `models/res_partner.py`:

```python
from odoo import fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    credito_monto_adeudado = fields.Monetary(
        string='Monto adeudado',
        compute='_compute_credito_fields',
        currency_field='currency_id',
    )
    credito_fecha_pedido_mas_viejo = fields.Date(
        string='Pedido más viejo sin pagar',
        compute='_compute_credito_fields',
    )
    credito_fecha_ultimo_pago = fields.Date(
        string='Último pago',
        compute='_compute_credito_fields',
    )
    credito_dias_sin_pago = fields.Integer(
        string='Días sin pago',
        compute='_compute_credito_fields',
    )

    def _compute_credito_fields(self):
        today = fields.Date.context_today(self)
        deuda_domain = [
            ('partner_id', 'in', self.ids),
            ('account_type', '=', 'asset_receivable'),
            ('reconciled', '=', False),
            ('parent_state', '=', 'posted'),
        ]
        monto_por_partner = {
            partner.id: monto
            for partner, monto in self.env['account.move.line']._read_group(
                deuda_domain, groupby=['partner_id'], aggregates=['amount_residual:sum'],
            )
        }
        fecha_vieja_por_partner = {
            partner.id: fecha
            for partner, fecha in self.env['account.move.line']._read_group(
                deuda_domain, groupby=['partner_id'], aggregates=['date:min'],
            )
        }

        for partner in self:
            monto = monto_por_partner.get(partner.id, 0.0)
            partner.credito_monto_adeudado = monto
            fecha_vieja = fecha_vieja_por_partner.get(partner.id, False)
            partner.credito_fecha_pedido_mas_viejo = fecha_vieja
            if not monto:
                partner.credito_fecha_ultimo_pago = False
                partner.credito_dias_sin_pago = 0
                continue
            partner.credito_fecha_ultimo_pago = fecha_vieja
            partner.credito_dias_sin_pago = (today - fecha_vieja).days if fecha_vieja else 0
```

- [ ] **Step 4: Correr los tests, confirmar que pasan**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `0 failed, 0 error(s) of 4 tests`.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito
git commit -m "Agregar dias_sin_pago y fechas de deuda sobre res.partner"
```

---

### Task 4: Pago (parcial o total) reinicia `credito_dias_sin_pago`

**Files:**
- Modify: `addons/pos_reparto_credito/models/res_partner.py`
- Modify: `addons/pos_reparto_credito/tests/test_reparto_credito.py`

- [ ] **Step 1: Agregar los tests**

```python
    def test_pago_parcial_reinicia_contador_de_dias_pero_no_borra_la_deuda(self):
        partner = self._crear_partner_credito('Cliente Pago Parcial')
        linea = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=20))
        self._crear_y_conciliar_pago(partner, linea, 200.0, fields.Date.today() - timedelta(days=1))

        self.assertEqual(partner.credito_dias_sin_pago, 1)
        self.assertEqual(partner.credito_monto_adeudado, 800.0)
        self.assertEqual(
            partner.credito_fecha_pedido_mas_viejo,
            fields.Date.today() - timedelta(days=20),
        )

    def test_pago_total_deja_al_cliente_sin_deuda(self):
        partner = self._crear_partner_credito('Cliente Pago Total')
        linea = self._crear_linea_por_cobrar(partner, 300.0, fields.Date.today() - timedelta(days=20))
        self._crear_y_conciliar_pago(partner, linea, 300.0, fields.Date.today())

        self.assertEqual(partner.credito_monto_adeudado, 0.0)
        self.assertEqual(partner.credito_dias_sin_pago, 0)
```

- [ ] **Step 2: Correr los tests, confirmar que `test_pago_parcial_reinicia_contador_de_dias_pero_no_borra_la_deuda` falla**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `test_pago_parcial_reinicia_contador_de_dias_pero_no_borra_la_deuda` falla (`credito_dias_sin_pago` da 20, no 1, porque el compute todavía no mira los pagos). `test_pago_total_deja_al_cliente_sin_deuda` puede pasar de casualidad (ya cubierto por la lógica de `monto == 0`) — igual seguir al Step 3.

- [ ] **Step 3: Extender el compute para considerar los pagos**

Reemplazar el método `_compute_credito_fields` en `models/res_partner.py` (el resto del archivo, los 4 campos declarados arriba, no cambia):

Notas sobre esta versión (ya reflejan 2 fixes de code review posteriores, no la version original del plan — partir de esta, ya commiteada en la rama):
- Task 3: se unificaron los dos `_read_group` sobre `account.move.line` en uno solo (mismo domain, dos aggregates), y las 4 columnas quedan neutras juntas cuando `monto` es 0.
- Task 4: el domain de pagos filtra por `state` (`in_process`/`paid`), no por `move_id.state = 'posted'` — `action_reject()` en `account.payment` no cancela el `move_id`, así que un pago rechazado/rebotado hubiera seguido teniendo `move_id.state = 'posted'` y reseteado el contador de crédito para un pago que en realidad nunca se cobró.

```python
    def _compute_credito_fields(self):
        today = fields.Date.context_today(self)
        deuda_domain = [
            ('partner_id', 'in', self.ids),
            ('account_type', '=', 'asset_receivable'),
            ('reconciled', '=', False),
            ('parent_state', '=', 'posted'),
        ]
        deuda_por_partner = {
            partner.id: (monto, fecha)
            for partner, monto, fecha in self.env['account.move.line']._read_group(
                deuda_domain, groupby=['partner_id'],
                aggregates=['amount_residual:sum', 'date:min'],
            )
        }
        ultimo_pago_por_partner = {
            partner.id: fecha
            for partner, fecha in self.env['account.payment']._read_group(
                [
                    ('partner_id', 'in', self.ids),
                    ('payment_type', '=', 'inbound'),
                    ('state', 'in', ('in_process', 'paid')),
                ],
                groupby=['partner_id'], aggregates=['date:max'],
            )
        }

        for partner in self:
            monto, fecha_vieja = deuda_por_partner.get(partner.id, (0.0, False))
            partner.credito_monto_adeudado = monto
            if not monto:
                partner.credito_fecha_pedido_mas_viejo = False
                partner.credito_fecha_ultimo_pago = False
                partner.credito_dias_sin_pago = 0
                continue
            partner.credito_fecha_pedido_mas_viejo = fecha_vieja
            fecha_referencia = ultimo_pago_por_partner.get(partner.id) or fecha_vieja
            partner.credito_fecha_ultimo_pago = fecha_referencia
            partner.credito_dias_sin_pago = (today - fecha_referencia).days if fecha_referencia else 0
```

- [ ] **Step 4: Correr los tests, confirmar que pasan todos**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `0 failed, 0 error(s) of 6 tests`.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito
git commit -m "Cualquier pago (parcial o total) reinicia dias_sin_pago"
```

---

### Task 5: Pantalla "Deudores" (acción + vista + menú)

**Bloqueado y corregido durante la ejecución (importante, leer antes de tocar este task):** el intento original de este task falló — Odoo no permite `default_order`/`ORDER BY` sobre un campo `compute` sin `store=True`, ni siquiera agregando un método `search=` (eso solo arregla el filtro del dominio, no el ordenamiento; verificado directo contra `odoo/orm/models.py::_order_field_to_sql`, que llama a `field.to_sql()` para cualquier campo no-relacional en el `ORDER BY`, y ese método explota si el campo no es `store`). Se confirmó el mismo patrón en el propio Odoo core (`res.partner.credit`/`debit`, en `account/models/partner.py`): son `compute` + `search=` pero **nunca** `store=True`, y por eso core nunca los usa en un `default_order` de ninguna vista — evitaron el problema en vez de resolverlo.

Se decidió (con el usuario) resolverlo de verdad: los 4 campos de crédito pasan a `store=True`, y se agregan triggers explícitos de recálculo (`env.add_to_compute`, la misma API interna que usa `account/models/account_move.py` en el core para casos idénticos de "campo store que depende de otro modelo sin relación directa expresable en `@api.depends`") en `account.move.line` y `account.payment`, para que la pantalla Deudores nunca muestre datos viejos.

**Files:**
- Create: `addons/pos_reparto_credito/views/res_partner_deudores_views.xml`
- Create: `addons/pos_reparto_credito/models/account_move_line.py`
- Create: `addons/pos_reparto_credito/models/account_payment.py`
- Modify: `addons/pos_reparto_credito/models/res_partner.py` (agregar `store=True` + `@api.depends()` vacío a los 4 campos)
- Modify: `addons/pos_reparto_credito/models/__init__.py`
- Modify: `addons/pos_reparto_credito/__manifest__.py`
- Modify: `addons/pos_reparto_credito/tests/test_reparto_credito.py`

- [ ] **Step 0 (nuevo): marcar los 4 campos como `store=True` y agregar los triggers de recálculo**

En `models/res_partner.py`, agregar `store=True` a los 4 `fields.Monetary`/`fields.Date`/`fields.Integer` (sin tocar el cuerpo de `_compute_credito_fields`, que sigue igual), y agregar `@api.depends()` (vacío, sin argumentos) justo arriba de `def _compute_credito_fields(self):` — silencia la advertencia de Odoo por un compute `store=True` sin dependencias declaradas; las dependencias reales (otro modelo) se resuelven a mano con los triggers de abajo, no con `@api.depends`.

```python
from odoo import api, fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    credito_monto_adeudado = fields.Monetary(
        string='Monto adeudado',
        compute='_compute_credito_fields',
        currency_field='currency_id',
        store=True,
    )
    credito_fecha_pedido_mas_viejo = fields.Date(
        string='Pedido más viejo sin pagar',
        compute='_compute_credito_fields',
        store=True,
    )
    credito_fecha_ultimo_pago = fields.Date(
        string='Último pago',
        compute='_compute_credito_fields',
        store=True,
    )
    credito_dias_sin_pago = fields.Integer(
        string='Días sin pago',
        compute='_compute_credito_fields',
        store=True,
    )

    @api.depends()
    def _compute_credito_fields(self):
        # (cuerpo sin cambios respecto a la version actual del archivo)
        ...
```

**Nota técnica (versión final, post 2 rondas de review):**
- Marcar un solo campo con `env.add_to_compute` NO alcanza para recalcular los 4 — es estrictamente por campo (`self.transaction.tocompute[field]`), no agrupa por método `compute=` como sí hace `modified()`. Verificado leyendo `odoo/orm/environments.py::add_to_compute` y reproducido a mano (los 3 campos no marcados quedaban en su valor default para siempre). Hay que marcar los 4 campos explícitamente, uno por uno.
- `write()`/`unlink()` tienen que capturar los partners **antes** de llamar a `super()`, no después — si no, reasignar `partner_id` (o sacar una línea de la cuenta `asset_receivable`) deja al partner viejo con el monto viejo para siempre (nada lo vuelve a tocar, `@api.depends()` está vacío a propósito). Reproducido a mano: sin este fix, reasignar una línea a otro cliente deja al cliente original con la deuda vieja en la base para siempre.
- Falta `unlink()` en los dos modelos — borrar un asiento posteado (`button_draft()` + `unlink()`, corrección contable normal, el propio `account.payment.unlink()` del core hace exactamente esto y también llama a `add_to_compute` después) deja al partner con el monto congelado. Reproducido a mano: borrar el `account.move` completo no bajaba el monto adeudado.

Crear `models/account_move_line.py`:

```python
from odoo import api, models

CAMPOS_CREDITO_REPARTO = [
    'credito_monto_adeudado',
    'credito_fecha_pedido_mas_viejo',
    'credito_fecha_ultimo_pago',
    'credito_dias_sin_pago',
]


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _partners_credito_reparto(self):
        # No filtramos por parent_state/posted: cuando el asiento pasa de
        # borrador a posteado, ese cambio de estado llega via el related
        # field parent_state (compute del propio ORM, no un write() sobre
        # esta linea), asi que este metodo nunca lo veria igual. Alcanza
        # con marcar el partner en cualquier alta/baja/edicion de linea de
        # cuenta por cobrar: el compute de res.partner ya filtra por
        # parent_state='posted' al leer, asi que una linea todavia en
        # borrador simplemente no suma deuda hasta que se postee de verdad.
        return self.filtered(
            lambda l: l.partner_id and l.account_type == 'asset_receivable'
        ).partner_id

    def _marcar_partners_credito_a_recalcular(self, partners):
        if not partners:
            return
        for nombre in CAMPOS_CREDITO_REPARTO:
            self.env.add_to_compute(partners._fields[nombre], partners)

    @api.model_create_multi
    def create(self, vals_list):
        lines = super().create(vals_list)
        lines._marcar_partners_credito_a_recalcular(lines._partners_credito_reparto())
        return lines

    def write(self, vals):
        partners_antes = self._partners_credito_reparto()
        res = super().write(vals)
        partners_despues = self._partners_credito_reparto()
        self._marcar_partners_credito_a_recalcular(partners_antes | partners_despues)
        return res

    def unlink(self):
        partners = self._partners_credito_reparto()
        res = super().unlink()
        self._marcar_partners_credito_a_recalcular(partners)
        return res
```

Crear `models/account_payment.py`:

```python
from odoo import api, models

from .account_move_line import CAMPOS_CREDITO_REPARTO


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _marcar_partners_credito_a_recalcular(self, partners):
        if not partners:
            return
        for nombre in CAMPOS_CREDITO_REPARTO:
            self.env.add_to_compute(partners._fields[nombre], partners)

    @api.model_create_multi
    def create(self, vals_list):
        payments = super().create(vals_list)
        payments._marcar_partners_credito_a_recalcular(payments.partner_id)
        return payments

    def write(self, vals):
        partners_antes = self.partner_id
        res = super().write(vals)
        partners_despues = self.partner_id
        self._marcar_partners_credito_a_recalcular(partners_antes | partners_despues)
        return res

    def unlink(self):
        partners = self.partner_id
        res = super().unlink()
        self._marcar_partners_credito_a_recalcular(partners)
        return res
```

Actualizar `models/__init__.py`:

```python
from . import res_partner
from . import account_move_line
from . import account_payment
```

- [ ] **Step 0b: correr los tests existentes (Tasks 2-4), confirmar que siguen los 6 en verde con `store=True`**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `0 failed, 0 error(s) of 6 tests` (los mismos de antes, ahora corriendo sobre campos `store=True` con los triggers activos — si alguno falla, es señal de que el trigger no está disparando el recálculo a tiempo dentro del test, no un problema de los tests en sí).

- [ ] **Step 0c: Commit de este bloque, separado del resto del task**

```bash
git add addons/pos_reparto_credito
git commit -m "Volver store=True los campos de credito, con triggers de recalculo"
```

**A partir de acá sigue el resto del Task 5 tal como estaba planeado (acción/vista/menú), sin cambios respecto al plan original:**

- [ ] **Step 1: Agregar los tests**

```python
    def test_accion_deudores_solo_lista_clientes_con_saldo(self):
        deudor = self._crear_partner_credito('Cliente Con Saldo')
        self._crear_linea_por_cobrar(deudor, 500.0, fields.Date.today() - timedelta(days=3))
        al_dia = self._crear_partner_credito('Cliente Al Dia')

        action = self.env.ref('pos_reparto_credito.action_reparto_deudores')
        domain = safe_eval(action.domain)
        encontrados = self.env['res.partner'].search(domain, order='credito_dias_sin_pago desc')
        self.assertIn(deudor, encontrados)
        self.assertNotIn(al_dia, encontrados)

    def test_vendedor_en_pantalla_deudores_ve_solo_lo_suyo(self):
        group_vendedor = self.env.ref('pos_reparto_security.group_reparto_vendedor')
        group_internal = self.env.ref('base.group_user')
        vendedor_1 = self.env['res.users'].create({
            'name': 'Vendedor Deudores Uno',
            'login': 'vendedor_deudores_uno_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        vendedor_2 = self.env['res.users'].create({
            'name': 'Vendedor Deudores Dos',
            'login': 'vendedor_deudores_dos_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        deudor_1 = self._crear_partner_credito('Deudor De Vendedor 1')
        deudor_1.user_id = vendedor_1
        self._crear_linea_por_cobrar(deudor_1, 100.0, fields.Date.today())
        deudor_2 = self._crear_partner_credito('Deudor De Vendedor 2')
        deudor_2.user_id = vendedor_2
        self._crear_linea_por_cobrar(deudor_2, 100.0, fields.Date.today())

        action = self.env.ref('pos_reparto_credito.action_reparto_deudores')
        domain = safe_eval(action.domain)
        encontrados = self.env['res.partner'].with_user(vendedor_1).search(domain)
        self.assertIn(deudor_1, encontrados)
        self.assertNotIn(deudor_2, encontrados)
```

- [ ] **Step 2: Correr los tests, confirmar que fallan**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `ERROR` — no existe la acción `pos_reparto_credito.action_reparto_deudores`.

- [ ] **Step 3: Crear la vista/acción/menú**

Crear `views/res_partner_deudores_views.xml`:

```xml
<odoo>
    <record id="view_reparto_deudores_list" model="ir.ui.view">
        <field name="name">res.partner.reparto.deudores.list</field>
        <field name="model">res.partner</field>
        <field name="arch" type="xml">
            <list string="Deudores"
                  default_order="credito_dias_sin_pago desc"
                  create="false"
                  decoration-danger="credito_dias_sin_pago &gt;= 15"
                  decoration-warning="credito_dias_sin_pago &gt;= 10 and credito_dias_sin_pago &lt; 15">
                <field name="name" string="Cliente"/>
                <field name="credito_dias_sin_pago" string="Días sin pago"/>
                <field name="credito_monto_adeudado" string="Monto adeudado"/>
                <field name="user_id" string="Vendedor"/>
                <field name="credito_fecha_pedido_mas_viejo" string="Pedido más viejo sin pagar"/>
                <field name="phone" string="Teléfono"/>
                <field name="street" string="Dirección"/>
            </list>
        </field>
    </record>

    <record id="action_reparto_deudores" model="ir.actions.act_window">
        <field name="name">Deudores</field>
        <field name="res_model">res.partner</field>
        <field name="view_mode">list,form</field>
        <field name="view_id" ref="view_reparto_deudores_list"/>
        <field name="domain">[('credito_monto_adeudado', '&gt;', 0)]</field>
    </record>

    <menuitem id="menu_reparto_deudores"
        name="Deudores"
        parent="point_of_sale.menu_point_root"
        action="action_reparto_deudores"
        groups="pos_reparto_security.group_reparto_vendedor,pos_reparto_security.group_reparto_deposito,pos_reparto_security.group_reparto_adminop,pos_reparto_security.group_reparto_gerencia"
        sequence="15"/>
</odoo>
```

Actualizar `__manifest__.py` (agregar el archivo a `data`):

```python
{
    'name': 'POS Reparto - Alerta de Crédito',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Alerta de crédito por cliente (RF-PV-07) y pantalla de deudores para el proyecto Reparto',
    'depends': ['point_of_sale', 'account', 'pos_reparto_security'],
    'data': [
        'views/res_partner_deudores_views.xml',
    ],
    'assets': {},
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 4: Correr los tests, confirmar que pasan**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `0 failed, 0 error(s) of 8 tests`.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito
git commit -m "Agregar pantalla Deudores (accion, vista y menu en Punto de Venta)"
```

---

### Task 6: Cargar los campos de crédito al POS (soporte offline)

**Files:**
- Modify: `addons/pos_reparto_credito/models/res_partner.py`
- Modify: `addons/pos_reparto_credito/tests/test_reparto_credito.py`

- [ ] **Step 1: Agregar el test**

```python
    def test_campos_de_credito_se_cargan_en_pos_offline(self):
        campos = self.env['res.partner']._load_pos_data_fields(self.env['pos.config'])
        self.assertIn('credito_monto_adeudado', campos)
        self.assertIn('credito_dias_sin_pago', campos)
```

- [ ] **Step 2: Correr los tests, confirmar que falla**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `FAIL` — los campos de crédito todavía no están en la lista que carga el POS.

- [ ] **Step 3: Agregar el override de `_load_pos_data_fields`**

Agregar este método a la clase `ResPartner` en `models/res_partner.py` (después de `_compute_credito_fields`, mismo archivo/clase):

```python
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        return fields_list + [
            'credito_monto_adeudado',
            'credito_fecha_ultimo_pago',
            'credito_dias_sin_pago',
        ]
```

- [ ] **Step 4: Correr los tests, confirmar que pasan**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `0 failed, 0 error(s) of 9 tests`.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito
git commit -m "Cargar campos de credito en los datos offline del POS"
```

---

### Task 7: Popup en el POS al seleccionar cliente con saldo pendiente

**Files:**
- Create: `addons/pos_reparto_credito/static/src/app/services/pos_store.js`
- Modify: `addons/pos_reparto_credito/__manifest__.py`

No hay test automatizado para este paso (frontend OWL del POS, fuera del framework de `TransactionCase` — ver spec, sección Testing). Se verifica manualmente en el navegador al final del task.

- [ ] **Step 1: Crear `static/src/app/services/pos_store.js`**

```javascript
import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    setPartnerToCurrentOrder(partner) {
        if (partner && partner.credito_monto_adeudado > 0) {
            const dias = partner.credito_dias_sin_pago;
            let titulo = _t("Aviso de cuenta corriente");
            if (dias >= 15) {
                titulo = _t("¡Cliente con deuda vencida!");
            } else if (dias >= 10) {
                titulo = _t("Cliente cerca del límite de crédito");
            }
            this.dialog.add(AlertDialog, {
                title: `${titulo} - ${partner.name}`,
                body: _t(
                    "Debe $%s desde hace %s día(s). Esto no impide la venta, es solo informativo.",
                    partner.credito_monto_adeudado.toFixed(2),
                    dias
                ),
            });
        }
        return super.setPartnerToCurrentOrder(...arguments);
    },
});
```

- [ ] **Step 2: Registrar el bundle de assets del POS en el manifest**

Actualizar `__manifest__.py`:

```python
{
    'name': 'POS Reparto - Alerta de Crédito',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Alerta de crédito por cliente (RF-PV-07) y pantalla de deudores para el proyecto Reparto',
    'depends': ['point_of_sale', 'account', 'pos_reparto_security'],
    'data': [
        'views/res_partner_deudores_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_reparto_credito/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 3: Actualizar el módulo para que levante el asset nuevo**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: el log no muestra errores de carga de módulo. Odoo 19 recompila los assets de JS al entrar a la app de POS en el navegador — no hace falta ningún paso extra para que el bundle nuevo se sirva.

- [ ] **Step 4: Verificación manual en navegador (obligatoria, siguiendo la política del proyecto de probar cambios de UI antes de darlos por terminados)**

1. Abrir `http://localhost:8069`, entrar como `admin`/`admin`.
2. Ir a Punto de Venta → abrir la sesión de "Reparto" (o "Camión 1") → "Nueva Sesión".
3. En la pantalla de venta, tocar el botón de cliente y seleccionar uno que tenga `credito_monto_adeudado > 0` (usar uno de los clientes de prueba creados por los tests, o cargar un pedido a crédito manual desde Contabilidad primero si no hay ninguno con deuda en la base de datos real).
4. Confirmar que aparece el popup con el monto y los días, con el color/título correcto según el umbral (verde/sin popup si no debe nada, aviso si está entre 10-14 días, "vencida" si son 15+).
5. Confirmar que tocar "Ok" en el popup no bloquea nada — se puede seguir armando el pedido y cobrando normalmente.
6. Ir a Punto de Venta → menú "Deudores" (nuevo, dentro del menú raíz de Punto de Venta) y confirmar que la lista aparece ordenada por días sin pago, con los colores de fila esperados.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_credito
git commit -m "Agregar popup de aviso de cuenta corriente al seleccionar cliente en POS"
```

---

### Task 8: Documentación y regresión final

**Files:**
- Modify: `ESTADO_PROYECTO.md`

- [ ] **Step 1: Correr el test suite completo del módulo una vez más (regresión final)**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_credito --test-enable --test-tags /pos_reparto_credito --stop-after-init
docker compose up -d odoo
```

Expected: `0 failed, 0 error(s) of 9 tests`.

- [ ] **Step 2: Correr también los tests de `pos_reparto_security` (confirmar que no se rompió nada por la nueva dependencia)**

```bash
docker compose stop odoo
MSYS_NO_PATHCONV=1 docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_security --test-enable --test-tags /pos_reparto_security --stop-after-init
docker compose up -d odoo
```

Expected: `0 failed, 0 error(s) of 7 tests` (los mismos 7 tests que ya pasaban en `main`).

- [ ] **Step 3: Actualizar `ESTADO_PROYECTO.md`**

Agregar una entrada nueva describiendo el módulo `pos_reparto_credito` (campos de deuda, pantalla Deudores, popup en POS), siguiendo el mismo formato que ya usa el documento para `pos_reparto_security`. Leer el archivo primero para copiar el estilo/sección exactos antes de editar.

- [ ] **Step 4: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "Documentar pos_reparto_credito en ESTADO_PROYECTO.md"
```

---

## Fuera de alcance de este plan (ya documentado en el spec)

- Criterio de "2 visitas consecutivas sin cobro" de RF-PV-07 (solo se implementa el criterio de días).
- Restricción de la pantalla Deudores a menos de los 4 roles.
- Automatización del registro de pagos (sigue siendo manual vía Contabilidad).
- Grabación del walkthrough en video para el cliente (paso posterior, vía navegador, fuera de este módulo).

## Siguiente paso después de este plan

Una vez terminado Task 8, usar `superpowers:finishing-a-development-branch` para decidir cómo integrar `feature/pos-reparto-credito` a `main` — mismo patrón que se usó con `pos_reparto_security` (PR, no push directo, según `INSTRUCTIVO_SETUP.md`).
