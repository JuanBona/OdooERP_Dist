# Listado de despacho (`pos_reparto_despacho`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Depósito/Administración genere por fecha un listado de despacho (PDF + Excel, por camión y por cliente) y que el stock de los pedidos de camión se descuente solo al confirmarlo, una sola vez, con listados complementarios para pedidos posteriores.

**Architecture:** Módulo nuevo `pos_reparto_despacho`. Los pickings de los pedidos de camión se siguen creando al vender pero **no se validan** (override de `stock.picking._create_picking_from_pos_order_lines` por flag en `pos.config`). El modelo `reparto.despacho` toma los pedidos con picking pendiente hasta su fecha, valida los pickings al confirmar (bajo un advisory lock) y los marca con `despacho_id`. `pos_stock_limit` pasa a restar lo comprometido por pedidos aún no despachados.

**Tech Stack:** Odoo 19 CE (Python, QWeb, XML), `xlsxwriter` (ya incluido), tests `TransactionCase`. Spec: `docs/superpowers/specs/2026-09-28-pos-reparto-despacho-design.md`.

**Desvío consciente del spec:** el spec dice "pedidos de esa fecha". Acá la selección es "pendientes **hasta** esa fecha" (`<=`): un pedido que no se despachó su día no puede quedar huérfano para siempre. Se actualiza el spec en la Task 9.

## Comandos de referencia (Windows + Git Bash)

Correr desde `C:\Users\franc\OdooERP_Dist` con Docker Desktop levantado. `MSYS_NO_PATHCONV=1` evita que Git Bash rompa el `/modulo` del filtro de tests.

```bash
# primera instalación / actualización + tests del módulo
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo \
  -i pos_reparto_despacho --test-tags /pos_reparto_despacho --stop-after-init --http-port=8099 2>&1 \
  | grep -E "ERROR|FAIL|post-tests|Traceback"
# (usar -u en vez de -i cuando el módulo ya está instalado)
```
Resultado esperado: una línea `N post-tests in ...` y **ninguna** línea `ERROR`/`FAIL`/`Traceback`.

Antes de correr, confirmar que el bind mount apunta a este directorio: `docker inspect odooerp_dist-odoo-1 --format "{{json .Mounts}}"` debe mostrar `Source` = `C:\Users\franc\OdooERP_Dist\addons`.

## File Structure

```
addons/pos_reparto_despacho/
├── __init__.py                     importa models y controllers
├── __manifest__.py                 depends: point_of_sale, stock, pos_reparto_security, pos_reparto_viaje
├── models/
│   ├── __init__.py
│   ├── pos_config.py               flag reparto_despacho_diferido
│   ├── stock_picking.py            no validar el picking al vender si la config es diferida
│   ├── pos_order.py                despacho_id + fecha de despacho del pedido
│   └── despacho.py                 reparto.despacho (selección, confirmar, datos, xlsx, resumen html)
├── controllers/
│   ├── __init__.py
│   └── xlsx.py                     GET /pos_reparto_despacho/xlsx/<id>
├── data/despacho_sequence.xml      secuencia DESP/%(year)s/
├── report/
│   ├── despacho_report.xml         ir.actions.report (PDF)
│   └── despacho_template.xml       tablas reutilizables + documento PDF
├── security/ir.model.access.csv    Depósito / Adm. Operativa / Gerencia
├── views/despacho_views.xml        form + list + acción + menú (Inventario → Operaciones)
└── tests/
    ├── __init__.py
    ├── common.py                   DespachoCase con helpers
    ├── test_picking_diferido.py
    ├── test_despacho.py
    ├── test_listado.py
    └── test_seguridad.py
addons/pos_stock_limit/
├── models/product_product.py       (crear) _reparto_comprometido
├── models/__init__.py              (modificar)
├── models/pos_order.py             (modificar) guard resta comprometido
├── models/product_template.py      (modificar) badge resta comprometido
└── tests/test_comprometido.py      (crear) + tests/__init__.py (modificar)
```

El `data` del manifest se arma **de forma incremental**: cada task agrega solo los archivos que ya existen (un archivo referenciado y no creado rompe la instalación).

---

### Task 1: Scaffold + flag en `pos.config` + picking sin validar

**Files:**
- Create: `addons/pos_reparto_despacho/__init__.py`, `__manifest__.py`
- Create: `addons/pos_reparto_despacho/models/__init__.py`, `pos_config.py`, `stock_picking.py`
- Create: `addons/pos_reparto_despacho/tests/__init__.py`, `common.py`, `test_picking_diferido.py`

- [ ] **Step 1: Crear el scaffold vacío (manifest sin `data`)**

`addons/pos_reparto_despacho/__init__.py`:
```python
from . import models
```

`addons/pos_reparto_despacho/__manifest__.py`:
```python
{
    'name': 'POS Reparto - Listado de Despacho',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Listado de despacho por fecha (por camión y por cliente) con descuento de stock al confirmar (RF-A03)',
    'depends': ['point_of_sale', 'stock', 'pos_reparto_security', 'pos_reparto_viaje'],
    'data': [],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

`addons/pos_reparto_despacho/models/__init__.py`:
```python
from . import pos_config
from . import stock_picking
```

`addons/pos_reparto_despacho/tests/__init__.py`:
```python
from . import test_picking_diferido
```

- [ ] **Step 2: Helper de tests compartido**

`addons/pos_reparto_despacho/tests/common.py`:
```python
from unittest.mock import patch

from odoo import fields
from odoo.tests.common import TransactionCase


class DespachoCase(TransactionCase):
    """Base con 2 POS de camión, productos con stock y un helper para armar pedidos con su picking."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        journal = cls.env['account.journal'].search([
            ('type', '=', 'bank'), ('company_id', '=', cls.env.company.id)], limit=1)
        cls.metodo = cls.env['pos.payment.method'].create({
            'name': 'Efectivo Test Despacho',
            'type': 'cash',
            'journal_id': journal.id,
            'company_id': cls.env.company.id,
        })
        cls.config1 = cls.env['pos.config'].create({'name': 'Camión Test Despacho 1'})
        cls.config2 = cls.env['pos.config'].create({'name': 'Camión Test Despacho 2'})
        cls.session1 = cls.env['pos.session'].create({'config_id': cls.config1.id})
        cls.session2 = cls.env['pos.session'].create({'config_id': cls.config2.id})
        cls.location = cls.config1.picking_type_id.default_location_src_id
        cls.producto_a = cls._crear_producto('Producto A Despacho')
        cls.producto_b = cls._crear_producto('Producto B Despacho')
        cls.cliente1 = cls.env['res.partner'].create({'name': 'Cliente 1 Despacho'})
        cls.cliente2 = cls.env['res.partner'].create({'name': 'Cliente 2 Despacho'})

    @classmethod
    def _crear_producto(cls, nombre, stock=50.0):
        producto = cls.env['product.product'].create({
            'name': nombre,
            'type': 'consu',
            'is_storable': True,
            'list_price': 100.0,
            'available_in_pos': True,
        })
        cls.env['stock.quant']._update_available_quantity(producto, cls.location, stock)
        return producto

    def _stock(self, producto):
        return producto.with_context(location=self.location.id).qty_available

    def _crear_pedido(self, config, session, partner, lineas, date_order=None):
        """lineas: [(producto, qty, precio_unitario)]. Crea el pedido y su picking como al sincronizar desde el POS."""
        total = sum(qty * precio for _p, qty, precio in lineas)
        with patch.object(
            self.env['pos.order'].__class__, '_check_stock_availability',
            return_value=None, create=True,
        ):
            pedido = self.env['pos.order'].create({
                'session_id': session.id,
                'partner_id': partner.id,
                'date_order': date_order or fields.Datetime.now(),
                'lines': [(0, 0, {
                    'product_id': producto.id,
                    'qty': qty,
                    'price_unit': precio,
                    'price_subtotal': qty * precio,
                    'price_subtotal_incl': qty * precio,
                }) for producto, qty, precio in lineas],
                'amount_total': total,
                'amount_tax': 0.0,
                'amount_paid': total,
                'amount_return': 0.0,
                'payment_ids': [(0, 0, {'payment_method_id': self.metodo.id, 'amount': total})],
            })
        pedido._create_order_picking()
        return pedido
```

- [ ] **Step 3: Escribir los tests que fallan**

`addons/pos_reparto_despacho/tests/test_picking_diferido.py`:
```python
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestPickingDiferido(DespachoCase):

    def test_camion_diferido_no_descuenta_stock_al_vender(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        self.assertTrue(pedido.picking_ids, "El pedido debe tener su picking (stock comprometido)")
        self.assertNotIn(pedido.picking_ids.state, ('done', 'cancel'))
        self.assertEqual(self._stock(self.producto_a), 50.0)

    def test_config_no_diferida_descuenta_como_siempre(self):
        self.config1.reparto_despacho_diferido = False
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        self.assertEqual(pedido.picking_ids.state, 'done')
        self.assertEqual(self._stock(self.producto_a), 47.0)
```

- [ ] **Step 4: Correr y verificar que fallan**

Run: el comando de referencia con `-i`. Expected: FAIL/ERROR (`reparto_despacho_diferido` no existe en `pos.config` y el picking queda `done`).

- [ ] **Step 5: Implementar el flag y el override**

`addons/pos_reparto_despacho/models/pos_config.py`:
```python
from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    reparto_despacho_diferido = fields.Boolean(
        string="Descontar stock al despachar",
        default=True,
        help="Si está activo, los pedidos de este POS dejan su picking pendiente (stock comprometido) y el "
             "stock se descuenta recién al confirmar el listado de despacho.",
    )
```

`addons/pos_reparto_despacho/models/stock_picking.py`:
```python
from odoo import api, models


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    @api.model
    def _create_picking_from_pos_order_lines(self, location_dest_id, lines, picking_type, partner=False):
        # Solo se difiere la venta (qty > 0). Las devoluciones (qty < 0) siguen el flujo nativo.
        configs = lines.order_id.config_id
        diferir = bool(configs) and all(configs.mapped('reparto_despacho_diferido')) \
            and all(line.qty > 0 for line in lines)
        return super(StockPicking, self.with_context(reparto_despacho_diferido=diferir)) \
            ._create_picking_from_pos_order_lines(location_dest_id, lines, picking_type, partner=partner)

    def _action_done(self):
        # El core valida el picking al vender; con despacho diferido queda armado (movimientos con
        # cantidades) pero sin validar. Lo valida reparto.despacho.action_confirmar.
        if self.env.context.get('reparto_despacho_diferido'):
            return True
        return super()._action_done()
```

- [ ] **Step 6: Correr y verificar que pasan**

Run: comando de referencia con `-i`. Expected: `2 post-tests`, sin ERROR/FAIL. Si el primer test falla porque el picking queda en un estado inesperado, imprimir `pedido.picking_ids.state` y ajustar la aserción solo si el estado sigue siendo no-`done` (la clave es que el stock no baje).

- [ ] **Step 7: Commit**

```bash
git add addons/pos_reparto_despacho
git commit -m "feat(pos_reparto_despacho): picking de camion queda sin validar al vender

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `pos_stock_limit` resta el stock comprometido

Con despacho diferido, `qty_available` no baja al vender: sin esto dos vendedores pueden vender la misma unidad.

**Files:**
- Create: `addons/pos_stock_limit/models/product_product.py`
- Modify: `addons/pos_stock_limit/models/__init__.py`, `models/pos_order.py`, `models/product_template.py`
- Create: `addons/pos_stock_limit/tests/test_comprometido.py`; Modify: `addons/pos_stock_limit/tests/__init__.py`

- [ ] **Step 1: Escribir el test que falla**

`addons/pos_stock_limit/tests/test_comprometido.py`:
```python
from unittest.mock import patch  # noqa: F401  (el guard real se ejercita sin parchear)

from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestComprometido(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.config = cls.env['pos.config'].create({'name': 'Camión Test Comprometido'})
        cls.session = cls.env['pos.session'].create({'config_id': cls.config.id})
        cls.location = cls.config.picking_type_id.default_location_src_id
        cls.producto = cls.env['product.product'].create({
            'name': 'Producto Test Comprometido', 'type': 'consu',
            'is_storable': True, 'available_in_pos': True, 'list_price': 100.0,
        })
        cls.env['stock.quant']._update_available_quantity(cls.producto, cls.location, 10.0)
        cls.pedido_previo = cls.env['pos.order'].create({
            'session_id': cls.session.id,
            'lines': [(0, 0, {'product_id': cls.producto.id, 'qty': 1, 'price_unit': 1.0,
                              'price_subtotal': 1.0, 'price_subtotal_incl': 1.0})],
            'amount_total': 1.0, 'amount_tax': 0.0, 'amount_paid': 0.0, 'amount_return': 0.0,
        })
        picking = cls.env['stock.picking'].create({
            'picking_type_id': cls.config.picking_type_id.id,
            'location_id': cls.location.id,
            'location_dest_id': cls.env.ref('stock.stock_location_customers').id,
            'pos_order_id': cls.pedido_previo.id,
        })
        move = cls.env['stock.move'].create({
            'product_id': cls.producto.id, 'product_uom_qty': 4.0,
            'product_uom': cls.producto.uom_id.id,
            'location_id': cls.location.id,
            'location_dest_id': picking.location_dest_id.id,
            'picking_id': picking.id,
        })
        move._action_confirm()

    def _payload(self, qty):
        return {
            'session_id': self.session.id,
            'lines': [(0, 0, {'product_id': self.producto.id, 'qty': qty, 'price_unit': 1.0})],
        }

    def test_comprometido_suma_pickings_pendientes_de_pedidos_pos(self):
        res = self.producto._reparto_comprometido(self.location)
        self.assertEqual(res.get(self.producto.id), 4.0)

    def test_guard_bloquea_si_lo_comprometido_deja_sin_stock(self):
        # 10 fisicos - 4 comprometidos = 6 libres: pedir 7 debe bloquear
        with self.assertRaises(UserError):
            self.env['pos.order']._check_stock_availability(self._payload(7.0))

    def test_guard_permite_hasta_el_stock_libre(self):
        self.env['pos.order']._check_stock_availability(self._payload(6.0))
```

Agregar a `addons/pos_stock_limit/tests/__init__.py` (al final): `from . import test_comprometido`

- [ ] **Step 2: Correr y verificar que fallan**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo \
  -u pos_stock_limit --test-tags /pos_stock_limit:TestComprometido --stop-after-init --http-port=8099 2>&1 \
  | grep -E "ERROR|FAIL|post-tests|Traceback"
```
Expected: FAIL (`_reparto_comprometido` no existe; el guard con 7 no bloquea).

- [ ] **Step 3: Implementar el helper**

`addons/pos_stock_limit/models/product_product.py`:
```python
from odoo import models

PICKING_PENDIENTE = ('confirmed', 'waiting', 'assigned', 'partially_available')


class ProductProduct(models.Model):
    _inherit = 'product.product'

    def _reparto_comprometido(self, location):
        """{product_id: cantidad} de pedidos POS con picking todavía sin validar que salen de `location`
        (o de sus hijas). qty_available no lo descuenta hasta que el picking se valida."""
        grupos = self.env['stock.move'].sudo()._read_group(
            [
                ('product_id', 'in', self.ids),
                ('location_id', 'child_of', location.id),
                ('state', 'in', PICKING_PENDIENTE),
                ('picking_id.pos_order_id', '!=', False),
            ],
            ['product_id'],
            ['product_uom_qty:sum'],
        )
        return {producto.id: qty for producto, qty in grupos}
```

`addons/pos_stock_limit/models/__init__.py`: agregar `from . import product_product` (mantener las líneas existentes).

- [ ] **Step 4: Usarlo en el guard**

En `addons/pos_stock_limit/models/pos_order.py`, dentro de `_check_stock_availability`, reemplazar el cálculo de `available`:
```python
        comprometido = self.env['product.product'].browse(list(needed)).sudo()._reparto_comprometido(location)
        errors = []
        for product_id, qty in needed.items():
            product = self.env['product.product'].browse(product_id)
            available = product.with_context(location=location.id).qty_available \
                - comprometido.get(product_id, 0.0)
            if qty > available:
```
(el resto del bloque —mensaje y `raise UserError`— queda igual; solo se agrega la línea de `comprometido` antes del `for` y `- comprometido...` a `available`).

- [ ] **Step 5: Usarlo en el badge**

En `addons/pos_stock_limit/models/product_template.py` reemplazar `_compute_reparto_stock_disponible`:
```python
    @api.depends('qty_available', 'is_storable')
    @api.depends_context('location')
    def _compute_reparto_stock_disponible(self):
        location_id = self.env.context.get('location')
        comprometido = {}
        if location_id and not isinstance(location_id, (list, tuple)):
            location = self.env['stock.location'].browse(location_id)
            comprometido = self.product_variant_ids._reparto_comprometido(location)
        for product in self:
            if not product.is_storable:
                product.reparto_stock_disponible = 0.0
                continue
            reservado = sum(comprometido.get(v.id, 0.0) for v in product.product_variant_ids)
            product.reparto_stock_disponible = max(product.qty_available - reservado, 0.0)
```
La grilla (`_load_pos_data_domain`, filtra `qty_available > 0`) no cambia: un producto con todo comprometido sigue apareciendo con badge 0, y el guard bloquea el cobro. Es aceptable.

- [ ] **Step 6: Correr todos los tests de `pos_stock_limit`**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo \
  -u pos_stock_limit --test-tags /pos_stock_limit --stop-after-init --http-port=8099 2>&1 \
  | grep -E "ERROR|FAIL|post-tests|Traceback"
```
Expected: `post-tests` sin ERROR/FAIL (los tests viejos del badge y del filtro siguen verdes: sin pickings pendientes, comprometido = 0).

- [ ] **Step 7: Commit**

```bash
git add addons/pos_stock_limit
git commit -m "feat(pos_stock_limit): descontar del stock libre lo comprometido por pedidos sin despachar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Modelo `reparto.despacho`, secuencia, seguridad y selección de pedidos

**Files:**
- Create: `models/pos_order.py`, `models/despacho.py`, `data/despacho_sequence.xml`, `security/ir.model.access.csv`, `tests/test_despacho.py`, `tests/test_seguridad.py`
- Modify: `models/__init__.py`, `__manifest__.py`, `tests/__init__.py`

- [ ] **Step 1: Tests que fallan**

`addons/pos_reparto_despacho/tests/test_despacho.py`:
```python
from datetime import timedelta

from odoo import fields
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestSeleccionPedidos(DespachoCase):

    def _despacho(self, fecha=None):
        return self.env['reparto.despacho'].create({'fecha': fecha or fields.Date.context_today(self.env.user)})

    def test_numero_secuencial(self):
        despacho = self._despacho()
        self.assertTrue(despacho.name.startswith('DESP/'))
        self.assertEqual(despacho.state, 'borrador')

    def test_pendientes_incluye_pedidos_con_picking_sin_despachar(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 1.0, 100.0)])
        despacho = self._despacho()
        self.assertIn(pedido, despacho._pedidos_pendientes())

    def test_pendientes_excluye_pedidos_de_fecha_posterior(self):
        manana = fields.Datetime.now() + timedelta(days=2)
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1,
                                    [(self.producto_a, 1.0, 100.0)], date_order=manana)
        despacho = self._despacho()
        self.assertNotIn(pedido, despacho._pedidos_pendientes())

    def test_pendientes_incluye_atrasados(self):
        ayer = fields.Datetime.now() - timedelta(days=3)
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1,
                                    [(self.producto_a, 1.0, 100.0)], date_order=ayer)
        despacho = self._despacho()
        self.assertIn(pedido, despacho._pedidos_pendientes())

    def test_pendientes_excluye_pedidos_ya_despachados(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 1.0, 100.0)])
        otro = self._despacho()
        pedido.sudo().despacho_id = otro
        self.assertNotIn(pedido, self._despacho()._pedidos_pendientes())
```

`addons/pos_reparto_despacho/tests/test_seguridad.py`:
```python
from odoo.exceptions import AccessError
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestSeguridadDespacho(DespachoCase):

    def _usuario(self, nombre, grupo_xmlid):
        return self.env['res.users'].create({
            'name': nombre,
            'login': nombre.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id, self.env.ref(grupo_xmlid).id])],
        })

    def test_vendedor_no_puede_leer_despachos(self):
        vendedor = self._usuario('Vendedor Despacho', 'pos_reparto_security.group_reparto_vendedor')
        despacho = self.env['reparto.despacho'].create({})
        with self.assertRaises(AccessError):
            despacho.with_user(vendedor).check_access('read')

    def test_deposito_puede_crear_despachos(self):
        deposito = self._usuario('Deposito Despacho', 'pos_reparto_security.group_reparto_deposito')
        despacho = self.env['reparto.despacho'].with_user(deposito).create({})
        self.assertEqual(despacho.state, 'borrador')

    def test_gerencia_y_adminop_pueden_crear_despachos(self):
        for grupo in ('group_reparto_gerencia', 'group_reparto_adminop'):
            usuario = self._usuario('Usuario ' + grupo, 'pos_reparto_security.' + grupo)
            self.env['reparto.despacho'].with_user(usuario).create({})
```

`addons/pos_reparto_despacho/tests/__init__.py`:
```python
from . import test_picking_diferido
from . import test_despacho
from . import test_seguridad
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: comando de referencia con `-u`. Expected: ERROR (modelo `reparto.despacho` inexistente).

- [ ] **Step 3: Implementar**

`addons/pos_reparto_despacho/models/pos_order.py`:
```python
from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    despacho_id = fields.Many2one('reparto.despacho', string='Despacho', copy=False, index=True, readonly=True)

    def _reparto_fecha_despacho(self):
        """Día en que el pedido debe salir: la fecha de entrega si es ship-later, si no el día de la venta."""
        self.ensure_one()
        return self.shipping_date or fields.Date.context_today(self, self.date_order)
```

`addons/pos_reparto_despacho/models/despacho.py`:
```python
from odoo import _, api, fields, models

PICKING_PENDIENTE = ('confirmed', 'waiting', 'assigned', 'partially_available')


class RepartoDespacho(models.Model):
    _name = 'reparto.despacho'
    _description = 'Listado de despacho'
    _order = 'fecha desc, id desc'

    name = fields.Char(string='Número', readonly=True, copy=False, default=lambda self: _('Nuevo'))
    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    state = fields.Selection(
        [('borrador', 'Borrador'), ('confirmado', 'Confirmado')],
        string='Estado', default='borrador', required=True, readonly=True, copy=False)
    pedido_ids = fields.One2many('pos.order', 'despacho_id', string='Pedidos despachados', readonly=True)
    numero_del_dia = fields.Integer(string='Nº del día', readonly=True, copy=False)
    es_complementario = fields.Boolean(string='Complementario', compute='_compute_es_complementario', store=True)
    confirmado_por = fields.Many2one('res.users', string='Confirmado por', readonly=True, copy=False)
    confirmado_el = fields.Datetime(string='Confirmado el', readonly=True, copy=False)

    @api.depends('numero_del_dia')
    def _compute_es_complementario(self):
        for despacho in self:
            despacho.es_complementario = despacho.numero_del_dia > 1

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('name') or vals['name'] == _('Nuevo'):
                vals['name'] = self.env['ir.sequence'].next_by_code('reparto.despacho') or _('Nuevo')
        return super().create(vals_list)

    def _pedidos_pendientes(self):
        """Pedidos con picking sin validar, sin despacho, cuya fecha de salida es <= a la del listado.
        Usa sudo: Depósito no tiene acceso de lectura a pos.order."""
        self.ensure_one()
        pedidos = self.env['pos.order'].sudo().search([
            ('despacho_id', '=', False),
            ('picking_ids.state', 'in', PICKING_PENDIENTE),
        ], order='date_order, id')
        return pedidos.filtered(lambda p: p._reparto_fecha_despacho() <= self.fecha)
```

`addons/pos_reparto_despacho/models/__init__.py`:
```python
from . import pos_config
from . import stock_picking
from . import pos_order
from . import despacho
```

`addons/pos_reparto_despacho/data/despacho_sequence.xml`:
```xml
<odoo noupdate="1">
    <record id="seq_reparto_despacho" model="ir.sequence">
        <field name="name">Despacho Reparto</field>
        <field name="code">reparto.despacho</field>
        <field name="prefix">DESP/%(year)s/</field>
        <field name="padding">4</field>
        <field name="company_id" eval="False"/>
    </record>
</odoo>
```

`addons/pos_reparto_despacho/security/ir.model.access.csv`:
```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_reparto_despacho_deposito,reparto.despacho.deposito,model_reparto_despacho,pos_reparto_security.group_reparto_deposito,1,1,1,1
access_reparto_despacho_adminop,reparto.despacho.adminop,model_reparto_despacho,pos_reparto_security.group_reparto_adminop,1,1,1,1
access_reparto_despacho_gerencia,reparto.despacho.gerencia,model_reparto_despacho,pos_reparto_security.group_reparto_gerencia,1,1,1,1
```

Manifest: `'data': ['security/ir.model.access.csv', 'data/despacho_sequence.xml'],`

**Aislar los tests de los datos de dev.** La base `odoo` de desarrollo ya tiene pedidos `ship_later` con picking pendiente; sin esto entrarían en todos los listados y romperían las aserciones exactas. Agregar al **final** de `setUpClass` en `tests/common.py` (el rollback de la clase lo deshace):
```python
        if 'reparto.despacho' in cls.env:
            previos = cls.env['pos.order'].sudo().search([
                ('picking_ids.state', 'in', ('confirmed', 'waiting', 'assigned', 'partially_available'))])
            if previos:
                previos.write({'despacho_id': cls.env['reparto.despacho'].create({}).id})
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: comando de referencia con `-u`. Expected: `post-tests` sin ERROR/FAIL.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_despacho
git commit -m "feat(pos_reparto_despacho): modelo reparto.despacho y seleccion de pedidos pendientes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Confirmar el despacho (descuento de stock una sola vez + complementario)

**Files:**
- Modify: `models/despacho.py`; Create: `tests/test_confirmar.py`; Modify: `tests/__init__.py`

- [ ] **Step 1: Tests que fallan**

`addons/pos_reparto_despacho/tests/test_confirmar.py`:
```python
from odoo import fields
from odoo.exceptions import UserError
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestConfirmarDespacho(DespachoCase):

    def _despacho(self):
        return self.env['reparto.despacho'].create({'fecha': fields.Date.context_today(self.env.user)})

    def test_confirmar_descuenta_stock_y_marca_pedidos(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        despacho = self._despacho()
        despacho.action_confirmar()
        self.assertEqual(despacho.state, 'confirmado')
        self.assertEqual(pedido.despacho_id, despacho)
        self.assertEqual(pedido.picking_ids.state, 'done')
        self.assertEqual(self._stock(self.producto_a), 47.0)

    def test_confirmar_dos_veces_no_descuenta_dos_veces(self):
        self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        despacho = self._despacho()
        despacho.action_confirmar()
        despacho.action_confirmar()
        self.assertEqual(self._stock(self.producto_a), 47.0)

    def test_confirmar_sin_pedidos_pendientes_falla(self):
        with self.assertRaises(UserError):
            self._despacho().action_confirmar()

    def test_complementario_toma_solo_pedidos_nuevos(self):
        primero = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 2.0, 100.0)])
        d1 = self._despacho()
        d1.action_confirmar()
        segundo = self._crear_pedido(self.config2, self.session2, self.cliente2, [(self.producto_b, 4.0, 100.0)])
        d2 = self._despacho()
        d2.action_confirmar()
        self.assertEqual(d1.pedido_ids, primero)
        self.assertEqual(d2.pedido_ids, segundo)
        self.assertFalse(d1.es_complementario)
        self.assertTrue(d2.es_complementario)
        self.assertEqual(d2.numero_del_dia, 2)
        self.assertEqual(self._stock(self.producto_a), 48.0)
        self.assertEqual(self._stock(self.producto_b), 46.0)

    def test_no_se_puede_borrar_un_despacho_confirmado(self):
        self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 1.0, 100.0)])
        despacho = self._despacho()
        despacho.action_confirmar()
        with self.assertRaises(UserError):
            despacho.unlink()
```

Agregar `from . import test_confirmar` a `tests/__init__.py`.

- [ ] **Step 2: Correr y verificar que fallan**

Run: comando de referencia con `-u`. Expected: FAIL (`action_confirmar` no existe).

- [ ] **Step 3: Implementar**

Agregar a `RepartoDespacho` en `models/despacho.py` (y `from odoo.exceptions import UserError` arriba):
```python
    def action_confirmar(self):
        """Valida los pickings de los pedidos pendientes (descuenta el stock) y cierra el listado.
        Idempotente: sobre un despacho ya confirmado solo devuelve el reporte."""
        self.ensure_one()
        # Un solo confirmador a la vez: evita que dos listados validen los mismos pickings.
        self.env.cr.execute("SELECT pg_advisory_xact_lock(hashtext('reparto_despacho_confirmar'))")
        self.env.invalidate_all()
        if self.state == 'confirmado':
            return self.action_imprimir()
        pedidos = self._pedidos_pendientes()
        if not pedidos:
            raise UserError(_("No hay pedidos pendientes de despachar hasta el %s.", self.fecha))
        pickings = pedidos.picking_ids.filtered(lambda p: p.state in PICKING_PENDIENTE)
        pickings.with_context(
            skip_immediate=True, skip_backorder=True, skip_sms=True, skip_expired=True,
        ).button_validate()
        sin_validar = pickings.filtered(lambda p: p.state != 'done')
        if sin_validar:
            raise UserError(_(
                "No se pudo validar el picking de: %s. Revisá el stock y volvé a intentar.",
                ', '.join(sin_validar.mapped('origin')),
            ))
        pedidos.write({'despacho_id': self.id})
        numero = self.search_count([
            ('fecha', '=', self.fecha), ('state', '=', 'confirmado'), ('id', '!=', self.id),
        ]) + 1
        self.write({
            'state': 'confirmado',
            'numero_del_dia': numero,
            'confirmado_por': self.env.uid,
            'confirmado_el': fields.Datetime.now(),
        })
        return self.action_imprimir()

    def unlink(self):
        if any(despacho.state == 'confirmado' for despacho in self):
            raise UserError(_("Un despacho confirmado no se puede borrar: ya movió stock."))
        return super().unlink()
```
**`action_imprimir` en esta task:** el reporte recién se crea en la Task 5. Por eso en esta task `action_imprimir` se escribe **provisoria**:
```python
    def action_imprimir(self):
        self.ensure_one()
        return True
```
y en la Task 5 (Step 4) se reemplaza por la definitiva (`return self.env.ref('pos_reparto_despacho.action_report_despacho').report_action(self)`). No incluyas la versión con `report_action` hasta la Task 5.

- [ ] **Step 4: Correr y verificar que pasan**

Run: comando de referencia con `-u`. Expected: `post-tests` sin ERROR/FAIL. Riesgo a vigilar: si `button_validate` devuelve un wizard o el test de descuento falla, imprimir `pickings.mapped('state')` y `pickings.move_ids.mapped('picked')`; los movimientos de los pickings de camión ya vienen `picked` con cantidades desde el POS.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_despacho
git commit -m "feat(pos_reparto_despacho): confirmar despacho descuenta stock una sola vez

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Consolidados por camión y por cliente + PDF

**Files:**
- Modify: `models/despacho.py`, `__manifest__.py`
- Create: `report/despacho_report.xml`, `report/despacho_template.xml`, `tests/test_listado.py`; Modify: `tests/__init__.py`

- [ ] **Step 1: Tests que fallan**

`addons/pos_reparto_despacho/tests/test_listado.py`:
```python
from odoo import fields
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestListado(DespachoCase):

    def setUp(self):
        super().setUp()
        self._crear_pedido(self.config1, self.session1, self.cliente1,
                           [(self.producto_a, 3.0, 100.0), (self.producto_b, 1.0, 100.0)])
        self._crear_pedido(self.config2, self.session2, self.cliente1, [(self.producto_a, 2.0, 100.0)])
        self._crear_pedido(self.config2, self.session2, self.cliente2, [(self.producto_b, 5.0, 100.0)])
        self.despacho = self.env['reparto.despacho'].create({'fecha': fields.Date.context_today(self.env.user)})

    def test_consolidado_por_camion(self):
        datos = self.despacho._datos_listado()
        camiones = {c['nombre']: dict(c['productos']) for c in datos['por_camion']}
        self.assertEqual(camiones['Camión Test Despacho 1'],
                         {'Producto A Despacho': 3.0, 'Producto B Despacho': 1.0})
        self.assertEqual(camiones['Camión Test Despacho 2'],
                         {'Producto A Despacho': 2.0, 'Producto B Despacho': 5.0})

    def test_consolidado_por_cliente(self):
        datos = self.despacho._datos_listado()
        clientes = {c['nombre']: dict(c['productos']) for c in datos['por_cliente']}
        self.assertEqual(clientes['Cliente 1 Despacho'],
                         {'Producto A Despacho': 5.0, 'Producto B Despacho': 1.0})
        self.assertEqual(clientes['Cliente 2 Despacho'], {'Producto B Despacho': 5.0})
        cliente1 = next(c for c in datos['por_cliente'] if c['nombre'] == 'Cliente 1 Despacho')
        self.assertEqual(cliente1['camiones'], 'Camión Test Despacho 1, Camión Test Despacho 2')

    def test_chofer_del_viaje_aparece_en_el_camion(self):
        chofer = self.env['res.users'].create({'name': 'Chofer Test Despacho', 'login': 'chofer_despacho_test'})
        self.env['reparto.viaje'].create({
            'fecha': self.despacho.fecha, 'chofer_id': chofer.id, 'pos_config_id': self.config1.id,
        })
        datos = self.despacho._datos_listado()
        camion1 = next(c for c in datos['por_camion'] if c['nombre'] == 'Camión Test Despacho 1')
        self.assertEqual(camion1['chofer'], 'Chofer Test Despacho')

    def test_reporte_html_contiene_ambas_secciones(self):
        html, _tipo = self.env['ir.actions.report']._render_qweb_html(
            'pos_reparto_despacho.action_report_despacho', self.despacho.ids)
        texto = html.decode()
        self.assertIn('Por camión', texto)
        self.assertIn('Por cliente', texto)
        self.assertIn('Producto A Despacho', texto)
        self.assertIn('Cliente 2 Despacho', texto)

    def test_despacho_confirmado_lista_solo_sus_pedidos(self):
        self.despacho.action_confirmar()
        self._crear_pedido(self.config1, self.session1, self.cliente2, [(self.producto_a, 9.0, 100.0)])
        datos = self.despacho._datos_listado()
        total = sum(c['total'] for c in datos['por_camion'])
        self.assertEqual(total, 11.0)  # 3+1+2+5, sin el pedido nuevo de 9
```

Agregar `from . import test_listado` a `tests/__init__.py`.

- [ ] **Step 2: Correr y verificar que fallan**

Run: comando de referencia con `-u`. Expected: ERROR (`_datos_listado` y el reporte no existen).

- [ ] **Step 3: Implementar `_datos_listado`**

Agregar a `RepartoDespacho`:
```python
    def _pedidos_listado(self):
        """Confirmado: los pedidos que despachó. Borrador: los que despacharía hoy."""
        self.ensure_one()
        pedidos = self.pedido_ids if self.state == 'confirmado' else self._pedidos_pendientes()
        return pedidos.sudo()

    def _datos_listado(self):
        """Estructura común para el PDF, el Excel y el resumen de pantalla."""
        self.ensure_one()
        pedidos = self._pedidos_listado()
        viajes = self.env['reparto.viaje'].sudo().search([('fecha', '=', self.fecha)])
        chofer_por_config = {v.pos_config_id.id: v.chofer_id.name for v in viajes}
        por_camion, por_cliente = {}, {}
        for pedido in pedidos:
            config = pedido.config_id
            camion = por_camion.setdefault(
                config.id, {'nombre': config.name, 'chofer': chofer_por_config.get(config.id, ''), 'productos': {}})
            partner = pedido.partner_id
            cliente = por_cliente.setdefault(
                partner.id, {'nombre': partner.name or _('Sin cliente'), 'camiones': set(), 'productos': {}})
            cliente['camiones'].add(config.name)
            for linea in pedido.lines:
                nombre = linea.product_id.display_name
                camion['productos'][nombre] = camion['productos'].get(nombre, 0.0) + linea.qty
                cliente['productos'][nombre] = cliente['productos'].get(nombre, 0.0) + linea.qty
        return {
            'por_camion': [
                {'nombre': c['nombre'], 'chofer': c['chofer'],
                 'productos': sorted(c['productos'].items()), 'total': sum(c['productos'].values())}
                for c in sorted(por_camion.values(), key=lambda c: c['nombre'])
            ],
            'por_cliente': [
                {'nombre': c['nombre'], 'camiones': ', '.join(sorted(c['camiones'])),
                 'productos': sorted(c['productos'].items()), 'total': sum(c['productos'].values())}
                for c in sorted(por_cliente.values(), key=lambda c: c['nombre'])
            ],
        }
```

- [ ] **Step 4: Reporte PDF**

`addons/pos_reparto_despacho/report/despacho_report.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="action_report_despacho" model="ir.actions.report">
        <field name="name">Listado de despacho</field>
        <field name="model">reparto.despacho</field>
        <field name="report_type">qweb-pdf</field>
        <field name="report_name">pos_reparto_despacho.despacho_document</field>
        <field name="report_file">pos_reparto_despacho.despacho_document</field>
    </record>
</odoo>
```

`addons/pos_reparto_despacho/report/despacho_template.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <!-- Tablas reutilizadas por el PDF y por el resumen de pantalla -->
    <template id="despacho_tablas">
        <h5 class="mt-3">Por camión</h5>
        <t t-if="not datos['por_camion']"><p class="text-muted">No hay pedidos para despachar.</p></t>
        <t t-foreach="datos['por_camion']" t-as="camion">
            <table class="table table-sm mt-2">
                <thead>
                    <tr>
                        <th>
                            <t t-esc="camion['nombre']"/>
                            <span t-if="camion['chofer']"> — Chofer: <t t-esc="camion['chofer']"/></span>
                        </th>
                        <th class="text-end">Cantidad</th>
                    </tr>
                </thead>
                <tbody>
                    <tr t-foreach="camion['productos']" t-as="fila">
                        <td><t t-esc="fila[0]"/></td>
                        <td class="text-end"><t t-esc="'%g' % fila[1]"/></td>
                    </tr>
                    <tr>
                        <td><strong>Total unidades</strong></td>
                        <td class="text-end"><strong><t t-esc="'%g' % camion['total']"/></strong></td>
                    </tr>
                </tbody>
            </table>
        </t>

        <h5 class="mt-4">Por cliente</h5>
        <t t-foreach="datos['por_cliente']" t-as="cliente">
            <table class="table table-sm mt-2">
                <thead>
                    <tr>
                        <th>
                            <t t-esc="cliente['nombre']"/>
                            <small class="text-muted"> (<t t-esc="cliente['camiones']"/>)</small>
                        </th>
                        <th class="text-end">Cantidad</th>
                    </tr>
                </thead>
                <tbody>
                    <tr t-foreach="cliente['productos']" t-as="fila">
                        <td><t t-esc="fila[0]"/></td>
                        <td class="text-end"><t t-esc="'%g' % fila[1]"/></td>
                    </tr>
                </tbody>
            </table>
        </t>
    </template>

    <template id="despacho_document">
        <t t-call="web.html_container">
            <t t-foreach="docs" t-as="o">
                <t t-call="web.external_layout">
                    <div class="page">
                        <t t-set="datos" t-value="o._datos_listado()"/>
                        <h4>
                            Listado de despacho <t t-esc="o.name"/>
                            <span t-if="o.es_complementario" class="badge text-bg-warning">Complementario</span>
                        </h4>
                        <div>
                            <strong>Fecha: </strong><span t-field="o.fecha"/>
                            <t t-if="o.state == 'borrador'"> — <em>BORRADOR (todavía no descontó stock)</em></t>
                        </div>
                        <t t-call="pos_reparto_despacho.despacho_tablas"/>
                    </div>
                </t>
            </t>
        </t>
    </template>
</odoo>
```

Manifest: `'data'` pasa a `['security/ir.model.access.csv', 'data/despacho_sequence.xml', 'report/despacho_report.xml', 'report/despacho_template.xml']`. En `models/despacho.py`, reemplazar el `action_imprimir` provisorio de la Task 4 por la versión definitiva:
```python
    def action_imprimir(self):
        self.ensure_one()
        return self.env.ref('pos_reparto_despacho.action_report_despacho').report_action(self)
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: comando de referencia con `-u`. Expected: `post-tests` sin ERROR/FAIL. Si `test_reporte_html_contiene_ambas_secciones` falla por el acento de "camión", verificar que los archivos XML/py se guardaron en UTF-8.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_despacho
git commit -m "feat(pos_reparto_despacho): listado por camion y por cliente con reporte PDF

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Excel

**Files:**
- Modify: `models/despacho.py`, `__init__.py`; Create: `controllers/__init__.py`, `controllers/xlsx.py`, `tests/test_xlsx.py`; Modify: `tests/__init__.py`

- [ ] **Step 1: Test que falla**

`addons/pos_reparto_despacho/tests/test_xlsx.py`:
```python
import io
import zipfile

from odoo import fields
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestXlsx(DespachoCase):

    def test_xlsx_contiene_productos_y_clientes(self):
        self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        despacho = self.env['reparto.despacho'].create({'fecha': fields.Date.context_today(self.env.user)})
        contenido = despacho._generar_xlsx()
        self.assertEqual(contenido[:2], b'PK')  # un .xlsx es un zip
        textos = zipfile.ZipFile(io.BytesIO(contenido)).read('xl/sharedStrings.xml').decode()
        self.assertIn('Producto A Despacho', textos)
        self.assertIn('Cliente 1 Despacho', textos)
```
Agregar `from . import test_xlsx` a `tests/__init__.py`.

- [ ] **Step 2: Correr y verificar que falla**

Expected: ERROR (`_generar_xlsx` no existe).

- [ ] **Step 3: Implementar**

En `models/despacho.py` agregar `import io` y `import xlsxwriter` arriba, y el método:
```python
    def _generar_xlsx(self):
        self.ensure_one()
        datos = self._datos_listado()
        salida = io.BytesIO()
        libro = xlsxwriter.Workbook(salida, {'in_memory': True})
        negrita = libro.add_format({'bold': True})

        hoja = libro.add_worksheet('Por camión')
        fila = 0
        for camion in datos['por_camion']:
            titulo = camion['nombre'] + (' — Chofer: %s' % camion['chofer'] if camion['chofer'] else '')
            hoja.write(fila, 0, titulo, negrita)
            hoja.write(fila, 1, 'Cantidad', negrita)
            fila += 1
            for producto, qty in camion['productos']:
                hoja.write(fila, 0, producto)
                hoja.write(fila, 1, qty)
                fila += 1
            hoja.write(fila, 0, 'Total unidades', negrita)
            hoja.write(fila, 1, camion['total'], negrita)
            fila += 2
        hoja.set_column(0, 0, 45)

        hoja = libro.add_worksheet('Por cliente')
        fila = 0
        for cliente in datos['por_cliente']:
            hoja.write(fila, 0, '%s (%s)' % (cliente['nombre'], cliente['camiones']), negrita)
            hoja.write(fila, 1, 'Cantidad', negrita)
            fila += 1
            for producto, qty in cliente['productos']:
                hoja.write(fila, 0, producto)
                hoja.write(fila, 1, qty)
                fila += 1
            fila += 1
        hoja.set_column(0, 0, 45)

        libro.close()
        return salida.getvalue()

    def action_descargar_xlsx(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_url', 'url': '/pos_reparto_despacho/xlsx/%d' % self.id, 'target': 'self'}
```

`controllers/__init__.py`: `from . import xlsx`

`controllers/xlsx.py`:
```python
from odoo import http
from odoo.http import content_disposition, request


class DespachoXlsx(http.Controller):

    @http.route('/pos_reparto_despacho/xlsx/<int:despacho_id>', type='http', auth='user')
    def descargar(self, despacho_id, **kwargs):
        despacho = request.env['reparto.despacho'].browse(despacho_id).exists()
        if not despacho:
            return request.not_found()
        despacho.check_access('read')  # ACL del modelo: solo Depósito / Adm. Operativa / Gerencia
        nombre = '%s.xlsx' % despacho.name.replace('/', '-')
        return request.make_response(despacho._generar_xlsx(), headers=[
            ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            ('Content-Disposition', content_disposition(nombre)),
        ])
```

`__init__.py` del módulo: agregar `from . import controllers` debajo de `from . import models`.

- [ ] **Step 4: Correr y verificar que pasa**

Run: comando de referencia con `-u`. Expected: `post-tests` sin ERROR/FAIL.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_despacho
git commit -m "feat(pos_reparto_despacho): exportar el listado a Excel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Vistas y menú

Depósito no tiene lectura sobre `pos.order`, así que la pantalla **no** muestra `pedido_ids` ni el listado de pedidos: muestra un resumen HTML calculado con `sudo` desde `_datos_listado()`.

**Files:**
- Modify: `models/despacho.py`, `__manifest__.py`; Create: `views/despacho_views.xml`, `tests/test_resumen.py`; Modify: `tests/__init__.py`

- [ ] **Step 1: Test que falla**

`addons/pos_reparto_despacho/tests/test_resumen.py`:
```python
from odoo import fields
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestResumen(DespachoCase):

    def test_resumen_html_muestra_lo_que_se_despacharia(self):
        self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        despacho = self.env['reparto.despacho'].create({'fecha': fields.Date.context_today(self.env.user)})
        self.assertIn('Producto A Despacho', str(despacho.resumen_html))
        self.assertIn('Cliente 1 Despacho', str(despacho.resumen_html))
```
Agregar `from . import test_resumen` a `tests/__init__.py`.

- [ ] **Step 2: Correr y verificar que falla**

Expected: ERROR (`resumen_html` no existe).

- [ ] **Step 3: Implementar el resumen**

En `models/despacho.py` agregar el campo (junto a los otros) y su compute:
```python
    resumen_html = fields.Html(string='Resumen', compute='_compute_resumen_html', sanitize=False)

    @api.depends('fecha', 'state')
    def _compute_resumen_html(self):
        for despacho in self:
            despacho.resumen_html = self.env['ir.qweb']._render(
                'pos_reparto_despacho.despacho_tablas', {'datos': despacho._datos_listado()})
```

- [ ] **Step 4: Vistas**

`addons/pos_reparto_despacho/views/despacho_views.xml`:
```xml
<odoo>
    <record id="view_reparto_despacho_form" model="ir.ui.view">
        <field name="name">reparto.despacho.form</field>
        <field name="model">reparto.despacho</field>
        <field name="arch" type="xml">
            <form string="Listado de despacho">
                <header>
                    <button name="action_confirmar" type="object" string="Confirmar e imprimir"
                            class="btn-primary" invisible="state != 'borrador'"
                            confirm="Se va a descontar el stock de todos los pedidos listados. Esto no se puede deshacer. ¿Continuar?"/>
                    <button name="action_imprimir" type="object" string="Imprimir PDF" invisible="state != 'confirmado'"/>
                    <button name="action_descargar_xlsx" type="object" string="Descargar Excel" invisible="state != 'confirmado'"/>
                    <field name="state" widget="statusbar"/>
                </header>
                <sheet>
                    <div class="oe_title"><h1><field name="name"/></h1></div>
                    <group>
                        <group>
                            <field name="fecha" readonly="state != 'borrador'"/>
                            <field name="es_complementario" invisible="state != 'confirmado'"/>
                        </group>
                        <group>
                            <field name="confirmado_por" invisible="state != 'confirmado'"/>
                            <field name="confirmado_el" invisible="state != 'confirmado'"/>
                        </group>
                    </group>
                    <field name="resumen_html" nolabel="1"/>
                </sheet>
            </form>
        </field>
    </record>

    <record id="view_reparto_despacho_list" model="ir.ui.view">
        <field name="name">reparto.despacho.list</field>
        <field name="model">reparto.despacho</field>
        <field name="arch" type="xml">
            <list string="Despachos" decoration-muted="state == 'borrador'">
                <field name="name"/>
                <field name="fecha"/>
                <field name="es_complementario" string="Complementario"/>
                <field name="state"/>
                <field name="confirmado_por"/>
            </list>
        </field>
    </record>

    <record id="action_reparto_despacho" model="ir.actions.act_window">
        <field name="name">Despacho</field>
        <field name="res_model">reparto.despacho</field>
        <field name="view_mode">list,form</field>
    </record>

    <menuitem id="menu_reparto_despacho"
        name="Listado de despacho"
        parent="stock.menu_stock_transfers"
        action="action_reparto_despacho"
        groups="pos_reparto_security.group_reparto_deposito,pos_reparto_security.group_reparto_adminop,pos_reparto_security.group_reparto_gerencia"
        sequence="30"/>
</odoo>
```
Manifest: agregar `'views/despacho_views.xml'` al final de `data`.

- [ ] **Step 5: Correr y verificar que pasa**

Run: comando de referencia con `-u`. Expected: `post-tests` sin ERROR/FAIL y sin errores de carga de vista.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_despacho
git commit -m "feat(pos_reparto_despacho): pantalla de despacho y menu en Inventario

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Regresión en los módulos relacionados

- [ ] **Step 1: Correr los tests de todos los módulos que tocan el circuito de venta y stock**

```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo \
  -u pos_reparto_despacho,pos_stock_limit,pos_reparto_comision,pos_reparto_viaje,pos_reparto_remito,pos_reparto_caja,pos_reparto_credito,pos_reparto_descuento_volumen \
  --test-tags /pos_reparto_despacho,/pos_stock_limit,/pos_reparto_comision,/pos_reparto_viaje,/pos_reparto_remito,/pos_reparto_caja,/pos_reparto_credito,/pos_reparto_descuento_volumen \
  --stop-after-init --http-port=8099 2>&1 | grep -E "ERROR|FAIL|post-tests|Traceback"
```
Expected: solo la línea `N post-tests` (sin ERROR/FAIL). Si un test de otro módulo falla porque ahora el picking de camión queda sin validar (p. ej. asume stock descontado tras `_create_order_picking` o pagar), **no** tocar la lógica del despacho: ajustar ese test para que valide el picking (`pedido.picking_ids.button_validate()` o `_action_done()`), o poner `config.reparto_despacho_diferido = False` en su setUp, y anotarlo en el commit.

- [ ] **Step 2: Commit de ajustes de tests, si hubo**

```bash
git add -A addons
git commit -m "test: ajustar tests de otros modulos al despacho diferido

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación en navegador, docs y deploy

- [ ] **Step 1: Reiniciar Odoo (caché de menús/assets) y verificar en Chrome**

`docker compose restart odoo`. Con Chrome (`localhost:8069`, sesión de admin):
1. **Venta sin descontar:** en POS Camión 1 vender 1 unidad de un producto con stock y cerrar la orden. En Inventario, el stock a mano **no** baja. Cerrar la sesión de POS: debe cerrar sin error (vigilar el riesgo de contabilidad de cierre del spec).
2. **Despacho:** Inventario → Operaciones → **Listado de despacho** → Nuevo (fecha de hoy). El resumen muestra la venta por camión y por cliente. **Confirmar e imprimir** → aparece el PDF y el stock a mano baja 1.
3. **Una sola vez:** volver al despacho → **Imprimir PDF** y **Descargar Excel**: el stock no cambia; el Excel se descarga y abre.
4. **Complementario:** vender otra unidad, crear otro despacho el mismo día → confirmar: el listado trae solo el pedido nuevo y figura "Complementario".
5. **Sobreventa:** con stock 5 y 4 unidades ya vendidas y sin despachar, intentar vender 2 desde otro camión: debe bloquear al cobrar.
6. **Roles:** con un usuario Vendedor el menú no aparece; con Depósito sí y puede confirmar.
Tomar nota de cualquier discrepancia y corregirla con su test antes de seguir.

- [ ] **Step 2: Actualizar docs**

- `docs/superpowers/specs/2026-09-28-pos-reparto-despacho-design.md`: en "Selección de pedidos" cambiar "de la fecha" por "hasta la fecha (<=), para no dejar pedidos atrasados huérfanos", y en "Impacto en pos_stock_limit" reemplazar `free_qty` por "se resta el stock comprometido (movimientos pendientes de pedidos POS), porque las cantidades de los movimientos de POS no reservan stock".
- `MANUAL_USUARIO.md`: agregar una sección nueva **"Listado de despacho"** (después de la sección 14 "Remito interno", sin renumerar: usar `14.1`) que explique: cuándo se descuenta el stock ahora (al confirmar el despacho, no al vender), cómo generar/confirmar/reimprimir, qué es un complementario, quién puede.
- Sección 7 del manual: aclarar que el stock a mano baja **al confirmar el despacho**, no al vender, y que el stock que ve el vendedor en el POS ya descuenta lo vendido sin despachar.
- `ESTADO_PROYECTO.md`: agregar sección `5decies. pos_reparto_despacho` (qué hace, decisiones, riesgo de contabilidad de cierre y su resultado) y tachar el ítem 6 del roadmap.
- `deploy/init_db.sh`: agregar `pos_reparto_despacho` a la lista `MODULES`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: despacho en manual, estado del proyecto y deploy

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Mostrar el diff al usuario y esperar su OK antes de `git push`.** No pushear sin que lo haya revisado.

---

## Self-Review (spec vs plan)

- Stock diferido, reserva al vender / descuento al confirmar → Tasks 1, 4. Sin sobreventa → Task 2.
- Por fecha y por camión/cliente → Tasks 3, 5. Chofer del viaje → Task 5.
- Una sola vez (advisory lock + idempotencia) y complementario → Task 4.
- PDF y Excel → Tasks 5, 6. Menú/roles/Depósito sin acceso a `pos.order` → Tasks 3, 7.
- Riesgo de contabilidad al cerrar sesión y devoluciones → Task 9 Step 1 (verificación manual).
- Tipos y nombres consistentes: `reparto_despacho_diferido`, `despacho_id`, `_pedidos_pendientes`, `_datos_listado`, `_generar_xlsx`, `resumen_html`, `action_confirmar`/`action_imprimir`/`action_descargar_xlsx`, `PICKING_PENDIENTE`.
- Desvío del spec (`<=`, comprometido en vez de `free_qty`) declarado y con task para actualizar el spec.
