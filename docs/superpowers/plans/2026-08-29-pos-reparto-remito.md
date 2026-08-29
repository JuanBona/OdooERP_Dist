# pos_reparto_remito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo `pos_reparto_remito` que genera automáticamente un remito interno en PDF al confirmar cada venta de camión, lo adjunta al pedido en Odoo, y lo envía por email al cliente si tiene dirección registrada.

**Architecture:** Hook server-side en `pos.order._process_order` — cuando el pedido llega al servidor (con o sin delay offline), se asigna un número correlativo global (`R-{año}-{seq}`), se renderiza el QWeb a PDF, se crea un `ir.attachment` en el pedido, y si `partner.email` existe se manda un `mail.mail` con el PDF adjunto. Sin JS, sin parches de POS client-side.

**Tech Stack:** Odoo 19 CE, Python, QWeb (PDF), `ir.sequence`, `ir.actions.report`, `mail.mail`, `unittest.mock.patch`

**Spec:** `docs/superpowers/specs/2026-08-29-pos-reparto-remito-design.md`

---

## Estructura de archivos

```
addons/pos_reparto_remito/
├── __manifest__.py
├── __init__.py
├── models/
│   ├── __init__.py
│   └── pos_order.py          # campo remito_number + _generate_remito + _send_remito_email + _process_order override
├── data/
│   └── remito_sequence.xml   # ir.sequence global
├── report/
│   ├── remito_report.xml     # ir.actions.report
│   └── remito_template.xml   # plantilla QWeb A4
└── tests/
    ├── __init__.py
    └── test_reparto_remito.py
```

---

## Task 1: Skeleton del módulo

**Files:**
- Create: `addons/pos_reparto_remito/__manifest__.py`
- Create: `addons/pos_reparto_remito/__init__.py`
- Create: `addons/pos_reparto_remito/models/__init__.py`
- Create: `addons/pos_reparto_remito/models/pos_order.py`
- Create: `addons/pos_reparto_remito/tests/__init__.py`
- Create: `addons/pos_reparto_remito/tests/test_reparto_remito.py`
- Create: `addons/pos_reparto_remito/data/remito_sequence.xml`
- Create: `addons/pos_reparto_remito/report/remito_report.xml`
- Create: `addons/pos_reparto_remito/report/remito_template.xml`

- [ ] **Crear `__manifest__.py`**

```python
{
    'name': 'POS Reparto - Remito Interno',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Genera y envía automáticamente el remito interno al confirmar cada venta de camión',
    'depends': ['point_of_sale', 'pos_reparto_security'],
    'data': [
        'data/remito_sequence.xml',
        'report/remito_report.xml',
        'report/remito_template.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Crear `__init__.py`**

```python
from . import models
```

- [ ] **Crear `models/__init__.py`**

```python
from . import pos_order
```

- [ ] **Crear `models/pos_order.py` (esqueleto vacío)**

```python
import logging
import base64

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'
```

- [ ] **Crear `tests/__init__.py`**

```python
from . import test_reparto_remito
```

- [ ] **Crear `tests/test_reparto_remito.py` (esqueleto vacío)**

```python
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoRemito(TransactionCase):
    pass
```

- [ ] **Crear `data/remito_sequence.xml` (placeholder — se completa en Task 2)**

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <data noupdate="1">
    </data>
</odoo>
```

- [ ] **Crear `report/remito_report.xml` (placeholder — se completa en Task 6)**

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
</odoo>
```

- [ ] **Crear `report/remito_template.xml` (placeholder — se completa en Task 6)**

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
</odoo>
```

- [ ] **Instalar el módulo**

```powershell
Set-Location C:\Users\franc\OdooERP_Dist
docker compose stop odoo
docker compose run --rm odoo odoo -d odoo -i pos_reparto_remito --stop-after-init 2>&1 | Select-Object -Last 10
docker compose up -d odoo
```

Salida esperada: `94 modules loaded` → `95 modules loaded`. Sin `ERROR`.

- [ ] **Commit**

```bash
git add addons/pos_reparto_remito/
git commit -m "feat(pos_reparto_remito): skeleton del módulo"
```

---

## Task 2: TDD — campo remito_number + secuencia

**Files:**
- Modify: `addons/pos_reparto_remito/models/pos_order.py`
- Modify: `addons/pos_reparto_remito/data/remito_sequence.xml`
- Modify: `addons/pos_reparto_remito/tests/test_reparto_remito.py`

- [ ] **Escribir el test (primero, antes de implementar)**

Reemplazar el contenido de `tests/test_reparto_remito.py`:

```python
from unittest.mock import patch

from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoRemito(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pos_config = cls.env['pos.config'].create({'name': 'Camión Test'})
        cls.pos_session = cls.env['pos.session'].create({
            'config_id': cls.pos_config.id,
        })
        cls.product = cls.env['product.product'].create({
            'name': 'Producto Test',
            'type': 'consu',
            'list_price': 100.0,
            'available_in_pos': True,
        })
        cls.partner_con_email = cls.env['res.partner'].create({
            'name': 'Cliente Con Email',
            'email': 'cliente@test.com',
        })
        cls.partner_sin_email = cls.env['res.partner'].create({
            'name': 'Cliente Sin Email',
        })

    def _make_order(self, partner=None):
        return self.env['pos.order'].create({
            'session_id': self.pos_session.id,
            'partner_id': partner.id if partner else False,
            'lines': [(0, 0, {
                'product_id': self.product.id,
                'qty': 2,
                'price_unit': 100.0,
                'price_subtotal': 200.0,
                'price_subtotal_incl': 200.0,
            })],
            'amount_total': 200.0,
            'amount_tax': 0.0,
            'amount_paid': 200.0,
            'amount_return': 0.0,
        })

    def test_remito_number_asignado(self):
        order = self._make_order()
        with patch.object(type(order), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order._generate_remito()
        self.assertTrue(order.remito_number)
        self.assertTrue(order.remito_number.startswith('R-'))

    def test_secuencia_correlativa(self):
        order1 = self._make_order()
        order2 = self._make_order()
        with patch.object(type(order1), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order1._generate_remito()
        with patch.object(type(order2), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order2._generate_remito()
        num1 = int(order1.remito_number.split('-')[-1])
        num2 = int(order2.remito_number.split('-')[-1])
        self.assertEqual(num2, num1 + 1)
```

- [ ] **Correr el test — debe FALLAR**

```powershell
Set-Location C:\Users\franc\OdooERP_Dist
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|test_remito|test_secuencia"
```

Salida esperada: `FAIL` o `AttributeError: '_generate_remito'`.

- [ ] **Implementar: secuencia en `data/remito_sequence.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <data noupdate="1">
        <record id="sequence_remito_reparto" model="ir.sequence">
            <field name="name">Remito Reparto</field>
            <field name="code">pos.remito.reparto</field>
            <field name="prefix">R-%(year)s-</field>
            <field name="padding">5</field>
            <field name="number_next">1</field>
            <field name="number_increment">1</field>
        </record>
    </data>
</odoo>
```

- [ ] **Implementar: campo y método en `models/pos_order.py`**

```python
import logging
import base64

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    remito_number = fields.Char(string="Nº Remito", readonly=True, copy=False)

    def _render_remito_pdf(self):
        pdf_content, _ = self.env['ir.actions.report']._render_qweb_pdf(
            'pos_reparto_remito.action_report_remito', self.ids
        )
        return pdf_content

    def _generate_remito(self):
        self.remito_number = self.env['ir.sequence'].next_by_code('pos.remito.reparto')
```

- [ ] **Actualizar el módulo para cargar la nueva secuencia**

```powershell
Set-Location C:\Users\franc\OdooERP_Dist
docker compose stop odoo
docker compose run --rm odoo odoo -d odoo -u pos_reparto_remito --stop-after-init 2>&1 | Select-Object -Last 5
```

- [ ] **Correr los tests — deben PASAR**

```powershell
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran"
```

Salida esperada: `Ran 2 tests ... OK`

- [ ] **Commit**

```bash
git add addons/pos_reparto_remito/models/pos_order.py \
        addons/pos_reparto_remito/data/remito_sequence.xml \
        addons/pos_reparto_remito/tests/test_reparto_remito.py
git commit -m "feat(pos_reparto_remito): campo remito_number y secuencia correlativa"
```

---

## Task 3: TDD — PDF y adjunto

**Files:**
- Modify: `addons/pos_reparto_remito/models/pos_order.py`
- Modify: `addons/pos_reparto_remito/tests/test_reparto_remito.py`

- [ ] **Agregar test de adjunto en `tests/test_reparto_remito.py`**

Agregar este método a la clase (después de `test_secuencia_correlativa`):

```python
    def test_adjunto_creado(self):
        order = self._make_order()
        with patch.object(type(order), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order._generate_remito()
        attachment = self.env['ir.attachment'].search([
            ('res_model', '=', 'pos.order'),
            ('res_id', '=', order.id),
            ('mimetype', '=', 'application/pdf'),
        ])
        self.assertEqual(len(attachment), 1)
        self.assertIn('R-', attachment.name)
```

- [ ] **Correr — debe FALLAR**

```powershell
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran|test_adjunto"
```

Salida esperada: `FAIL: test_adjunto_creado` (adjunto no creado aún).

- [ ] **Implementar creación de adjunto en `_generate_remito`**

Reemplazar el método `_generate_remito` en `models/pos_order.py`:

```python
    def _generate_remito(self):
        self.remito_number = self.env['ir.sequence'].next_by_code('pos.remito.reparto')
        try:
            pdf_content = self._render_remito_pdf()
        except Exception:
            _logger.warning(
                'pos_reparto_remito: error al renderizar PDF para orden %s', self.id,
                exc_info=True,
            )
            return
        filename = f'Remito-{self.remito_number}.pdf'
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(pdf_content),
            'res_model': 'pos.order',
            'res_id': self.id,
            'mimetype': 'application/pdf',
        })
        if self.partner_id and self.partner_id.email:
            self._send_remito_email(attachment)

    def _send_remito_email(self, attachment):
        pass  # se implementa en Task 4
```

- [ ] **Correr tests — deben PASAR (3 tests)**

```powershell
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran"
```

Salida esperada: `Ran 3 tests ... OK`

- [ ] **Commit**

```bash
git add addons/pos_reparto_remito/models/pos_order.py \
        addons/pos_reparto_remito/tests/test_reparto_remito.py
git commit -m "feat(pos_reparto_remito): generación de PDF y adjunto al pedido"
```

---

## Task 4: TDD — Envío de email

**Files:**
- Modify: `addons/pos_reparto_remito/models/pos_order.py`
- Modify: `addons/pos_reparto_remito/tests/test_reparto_remito.py`

- [ ] **Agregar tests de email en `tests/test_reparto_remito.py`**

Agregar estos métodos a la clase:

```python
    def test_email_enviado_con_email(self):
        order = self._make_order(partner=self.partner_con_email)
        with patch.object(type(order), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order._generate_remito()
        mails = self.env['mail.mail'].search([
            ('email_to', '=', self.partner_con_email.email),
        ])
        self.assertEqual(len(mails), 1)
        self.assertIn(order.remito_number, mails.subject)
        self.assertTrue(mails.attachment_ids)

    def test_sin_email_no_falla(self):
        order = self._make_order(partner=self.partner_sin_email)
        with patch.object(type(order), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order._generate_remito()
        self.assertTrue(order.remito_number)
        mails = self.env['mail.mail'].search([
            ('email_to', '=', self.partner_sin_email.email or 'NOEMAIL'),
        ])
        self.assertEqual(len(mails), 0)
```

- [ ] **Correr — `test_email_enviado_con_email` debe FALLAR**

```powershell
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran|test_email"
```

- [ ] **Implementar `_send_remito_email` en `models/pos_order.py`**

Reemplazar el método `_send_remito_email`:

```python
    def _send_remito_email(self, attachment):
        company = self.env.company
        fecha = self.date_order.strftime('%d/%m/%Y') if self.date_order else ''
        try:
            self.env['mail.mail'].sudo().create({
                'subject': f'Remito {self.remito_number} — {company.name}',
                'email_from': company.email or '',
                'email_to': self.partner_id.email,
                'body_html': (
                    f'<p>Estimado/a {self.partner_id.name},</p>'
                    f'<p>Adjunto encontrará su remito de compra del {fecha}.</p>'
                    f'<p>Ante cualquier consulta no dude en comunicarse con nosotros.</p>'
                ),
                'attachment_ids': [(4, attachment.id)],
            }).send()
        except Exception:
            _logger.warning(
                'pos_reparto_remito: error al enviar email de remito %s a %s',
                self.remito_number, self.partner_id.email, exc_info=True,
            )
```

- [ ] **Correr todos los tests — deben PASAR (5 tests)**

```powershell
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran"
```

Salida esperada: `Ran 5 tests ... OK`

- [ ] **Commit**

```bash
git add addons/pos_reparto_remito/models/pos_order.py \
        addons/pos_reparto_remito/tests/test_reparto_remito.py
git commit -m "feat(pos_reparto_remito): envío de email con PDF adjunto"
```

---

## Task 5: TDD — Edge cases

**Files:**
- Modify: `addons/pos_reparto_remito/models/pos_order.py`
- Modify: `addons/pos_reparto_remito/tests/test_reparto_remito.py`

- [ ] **Agregar tests de edge cases**

Agregar estos métodos a la clase en `tests/test_reparto_remito.py`:

```python
    def test_remito_idempotente(self):
        order = self._make_order()
        with patch.object(type(order), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order._generate_remito()
            primer_numero = order.remito_number
            order._generate_remito()  # segunda llamada
        self.assertEqual(order.remito_number, primer_numero)
        attachments = self.env['ir.attachment'].search([
            ('res_model', '=', 'pos.order'),
            ('res_id', '=', order.id),
        ])
        self.assertEqual(len(attachments), 1)

    def test_sin_partner_no_falla(self):
        order = self._make_order(partner=None)
        with patch.object(type(order), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order._generate_remito()
        self.assertTrue(order.remito_number)
        attachment = self.env['ir.attachment'].search([
            ('res_model', '=', 'pos.order'),
            ('res_id', '=', order.id),
        ])
        self.assertEqual(len(attachment), 1)
```

- [ ] **Correr — `test_remito_idempotente` debe FALLAR** (actualmente genera dos remitos)

```powershell
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran|test_remito_idempotente"
```

- [ ] **Implementar idempotencia en `_generate_remito`**

Agregar guard al inicio de `_generate_remito`:

```python
    def _generate_remito(self):
        if self.remito_number:  # idempotencia: ya fue generado
            return
        self.remito_number = self.env['ir.sequence'].next_by_code('pos.remito.reparto')
        try:
            pdf_content = self._render_remito_pdf()
        except Exception:
            _logger.warning(
                'pos_reparto_remito: error al renderizar PDF para orden %s', self.id,
                exc_info=True,
            )
            return
        filename = f'Remito-{self.remito_number}.pdf'
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(pdf_content),
            'res_model': 'pos.order',
            'res_id': self.id,
            'mimetype': 'application/pdf',
        })
        if self.partner_id and self.partner_id.email:
            self._send_remito_email(attachment)
```

- [ ] **Correr todos los tests — deben PASAR (7 tests)**

```powershell
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran"
```

Salida esperada: `Ran 7 tests ... OK`

- [ ] **Commit**

```bash
git add addons/pos_reparto_remito/models/pos_order.py \
        addons/pos_reparto_remito/tests/test_reparto_remito.py
git commit -m "feat(pos_reparto_remito): idempotencia y manejo de pedido sin partner"
```

---

## Task 6: Plantilla QWeb A4 y acción de reporte

**Files:**
- Modify: `addons/pos_reparto_remito/report/remito_report.xml`
- Modify: `addons/pos_reparto_remito/report/remito_template.xml`

- [ ] **Escribir `report/remito_report.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="action_report_remito" model="ir.actions.report">
        <field name="name">Remito Interno</field>
        <field name="model">pos.order</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">pos_reparto_remito.remito_document</field>
        <field name="report_file">pos_reparto_remito.remito_document</field>
        <field name="binding_model_id" ref="point_of_sale.model_pos_order"/>
        <field name="binding_type">report</field>
    </record>
</odoo>
```

- [ ] **Escribir `report/remito_template.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <template id="remito_document">
        <t t-call="web.html_container">
            <t t-foreach="docs" t-as="o">
                <t t-call="web.external_layout">
                    <div class="page">

                        <!-- Encabezado: empresa + número de remito -->
                        <div class="row mb-4">
                            <div class="col-8">
                                <t t-if="o.company_id.logo">
                                    <img t-att-src="image_data_uri(o.company_id.logo)"
                                         style="max-height:60px; margin-bottom:8px;"/>
                                </t>
                                <h4 t-field="o.company_id.name"/>
                                <p style="margin:0;">
                                    CUIT: <span t-field="o.company_id.vat"/>
                                </p>
                                <p style="margin:0;">
                                    <span t-field="o.company_id.street"/>
                                    <t t-if="o.company_id.city">,
                                        <span t-field="o.company_id.city"/>
                                    </t>
                                </p>
                            </div>
                            <div class="col-4 text-right">
                                <h4>REMITO INTERNO</h4>
                                <p style="margin:0;">
                                    <strong>Nº:</strong>
                                    <span t-field="o.remito_number"/>
                                </p>
                                <p style="margin:0;">
                                    <strong>Fecha:</strong>
                                    <span t-field="o.date_order"
                                          t-options='{"widget": "date"}'/>
                                </p>
                                <p style="margin:0;">
                                    <strong>Hora:</strong>
                                    <span t-field="o.date_order"
                                          t-options='{"widget": "datetime", "format": "HH:mm"}'/>
                                </p>
                            </div>
                        </div>

                        <hr/>

                        <!-- Cliente y Vendedor -->
                        <div class="row mb-4">
                            <div class="col-6">
                                <h5>CLIENTE</h5>
                                <t t-if="o.partner_id">
                                    <p style="margin:0;">
                                        <strong t-field="o.partner_id.name"/>
                                    </p>
                                    <p style="margin:0;">
                                        <t t-if="o.partner_id.l10n_latam_identification_type_id">
                                            <span t-field="o.partner_id.l10n_latam_identification_type_id.name"/>:
                                        </t>
                                        <t t-else="">CUIT/DNI:</t>
                                        <span t-field="o.partner_id.vat"/>
                                    </p>
                                    <p style="margin:0;">
                                        <span t-field="o.partner_id.street"/>
                                        <t t-if="o.partner_id.city">,
                                            <span t-field="o.partner_id.city"/>
                                        </t>
                                    </p>
                                </t>
                                <t t-else="">
                                    <p>Consumidor Final</p>
                                </t>
                            </div>
                            <div class="col-6">
                                <h5>VENDEDOR</h5>
                                <p style="margin:0;">
                                    <strong t-field="o.user_id.name"/>
                                </p>
                                <p style="margin:0;">
                                    Camión: <span t-field="o.config_id.name"/>
                                </p>
                            </div>
                        </div>

                        <!-- Líneas de productos -->
                        <table class="table table-sm table-bordered">
                            <thead class="thead-light">
                                <tr>
                                    <th>Producto</th>
                                    <th class="text-right">Cant.</th>
                                    <th class="text-right">P. Unit.</th>
                                    <th class="text-right">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                <t t-foreach="o.lines" t-as="line">
                                    <tr>
                                        <td t-field="line.product_id.name"/>
                                        <td class="text-right" t-field="line.qty"/>
                                        <td class="text-right"
                                            t-field="line.price_unit"
                                            t-options='{"widget": "monetary", "display_currency": o.currency_id}'/>
                                        <td class="text-right"
                                            t-field="line.price_subtotal_incl"
                                            t-options='{"widget": "monetary", "display_currency": o.currency_id}'/>
                                    </tr>
                                </t>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="3" class="text-right">
                                        <strong>TOTAL</strong>
                                    </td>
                                    <td class="text-right">
                                        <strong t-field="o.amount_total"
                                                t-options='{"widget": "monetary", "display_currency": o.currency_id}'/>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        <!-- Condición de pago -->
                        <div class="row mt-3">
                            <div class="col-12">
                                <strong>Condición de pago:</strong>
                                <span t-esc="', '.join(o.payment_ids.mapped('payment_method_id.name')) or 'Sin especificar'"/>
                            </div>
                        </div>

                    </div>
                </t>
            </t>
        </t>
    </template>
</odoo>
```

- [ ] **Actualizar el módulo**

```powershell
Set-Location C:\Users\franc\OdooERP_Dist
docker compose stop odoo
docker compose run --rm odoo odoo -d odoo -u pos_reparto_remito --stop-after-init 2>&1 | Select-Object -Last 5
```

Sin `ERROR`. Si hay error de XML, revisar sintaxis en los archivos de reporte.

- [ ] **Verificar que el reporte aparece en el backend**

```powershell
docker compose up -d odoo
```

Entrar a `http://localhost:8069`, ir a Punto de Venta → Pedidos, abrir cualquier pedido → menú **Imprimir** → debe aparecer **"Remito Interno"**.

- [ ] **Correr todos los tests para confirmar nada se rompió**

```powershell
docker compose stop odoo
docker compose run --rm odoo odoo -d odoo --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran"
```

Salida esperada: `Ran 7 tests ... OK`

- [ ] **Commit**

```bash
git add addons/pos_reparto_remito/report/
git commit -m "feat(pos_reparto_remito): plantilla QWeb A4 y acción de reporte"
```

---

## Task 7: Hook en _process_order (wire into POS)

**Files:**
- Modify: `addons/pos_reparto_remito/models/pos_order.py`

- [ ] **Agregar override de `_process_order` al final de la clase en `models/pos_order.py`**

```python
    @classmethod
    def _process_order(cls, order, draft, existing_order):
        pos_order = super()._process_order(order, draft, existing_order)
        if pos_order and pos_order.state in ('paid', 'done') and not pos_order.remito_number:
            pos_order._generate_remito()
        return pos_order
```

El archivo completo final de `models/pos_order.py` queda así:

```python
import logging
import base64

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    remito_number = fields.Char(string="Nº Remito", readonly=True, copy=False)

    def _render_remito_pdf(self):
        pdf_content, _ = self.env['ir.actions.report']._render_qweb_pdf(
            'pos_reparto_remito.action_report_remito', self.ids
        )
        return pdf_content

    def _generate_remito(self):
        if self.remito_number:
            return
        self.remito_number = self.env['ir.sequence'].next_by_code('pos.remito.reparto')
        try:
            pdf_content = self._render_remito_pdf()
        except Exception:
            _logger.warning(
                'pos_reparto_remito: error al renderizar PDF para orden %s', self.id,
                exc_info=True,
            )
            return
        filename = f'Remito-{self.remito_number}.pdf'
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(pdf_content),
            'res_model': 'pos.order',
            'res_id': self.id,
            'mimetype': 'application/pdf',
        })
        if self.partner_id and self.partner_id.email:
            self._send_remito_email(attachment)

    def _send_remito_email(self, attachment):
        company = self.env.company
        fecha = self.date_order.strftime('%d/%m/%Y') if self.date_order else ''
        try:
            self.env['mail.mail'].sudo().create({
                'subject': f'Remito {self.remito_number} — {company.name}',
                'email_from': company.email or '',
                'email_to': self.partner_id.email,
                'body_html': (
                    f'<p>Estimado/a {self.partner_id.name},</p>'
                    f'<p>Adjunto encontrará su remito de compra del {fecha}.</p>'
                    f'<p>Ante cualquier consulta no dude en comunicarse con nosotros.</p>'
                ),
                'attachment_ids': [(4, attachment.id)],
            }).send()
        except Exception:
            _logger.warning(
                'pos_reparto_remito: error al enviar email de remito %s a %s',
                self.remito_number, self.partner_id.email, exc_info=True,
            )

    @classmethod
    def _process_order(cls, order, draft, existing_order):
        pos_order = super()._process_order(order, draft, existing_order)
        if pos_order and pos_order.state in ('paid', 'done') and not pos_order.remito_number:
            pos_order._generate_remito()
        return pos_order
```

- [ ] **Actualizar módulo y correr todos los tests**

```powershell
Set-Location C:\Users\franc\OdooERP_Dist
docker compose stop odoo
docker compose run --rm odoo odoo -d odoo -u pos_reparto_remito --test-enable --test-tags /pos_reparto_remito --stop-after-init 2>&1 | Select-String -Pattern "FAIL|ERROR|OK|Ran"
```

Salida esperada: `Ran 7 tests ... OK`

- [ ] **Commit**

```bash
git add addons/pos_reparto_remito/models/pos_order.py
git commit -m "feat(pos_reparto_remito): hook en _process_order — remito se genera al sincronizar"
```

---

## Task 8: Verificación manual

- [ ] **Levantar Odoo**

```powershell
Set-Location C:\Users\franc\OdooERP_Dist
docker compose up -d odoo
```

- [ ] **Abrir una sesión de POS Camión 1**

En `http://localhost:8069` → Punto de Venta → abrir sesión "POS Camión 1".

- [ ] **Hacer una venta con cliente que tenga email**

1. Seleccionar cliente con email (o crear uno en Contactos primero con un email real tuyo para probar)
2. Agregar un producto
3. Cobrar (cualquier método de pago)
4. Cerrar la orden

- [ ] **Verificar adjunto en el pedido**

Ir a Punto de Venta → Pedidos → abrir el pedido recién creado.  
En el panel derecho debe aparecer el ícono de adjunto con `Remito-R-2026-XXXXX.pdf`.  
Abrir el PDF y verificar que se ven: logo, nombre empresa, CUIT, datos del cliente, líneas, total, condición de pago.

- [ ] **Verificar email**

Si el cliente tenía email, debe haber llegado el correo con el PDF adjunto.  
Si no llega: revisar `docker compose logs --tail=30 odoo` buscando `pos_reparto_remito` o `WARNING`.

- [ ] **Commit de rama y PR**

```bash
git checkout -b feature/pos-reparto-remito
git push origin feature/pos-reparto-remito
```

Crear PR en GitHub hacia `main`.
