# pos_reparto_descuento_volumen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descuentos por volumen por producto en el POS de Reparto (RF-PV-09): escala escalonada por cantidad vía `product.pricelist.item` nativo, aviso en pantalla de los tramos y del próximo tramo, y override manual de precio/descuento restringido a Admin Operativa / Gerencia.

**Architecture:** Módulo Odoo 19 nuevo `pos_reparto_descuento_volumen`. Sin modelos nuevos: los tramos son `product.pricelist.item` sobre la lista `product.list0` (`compute_price='percentage'`, `min_quantity`, `percent_price`). El motor de precios nativo aplica el descuento (también offline en POS). El módulo agrega: un One2many de conveniencia en `product.template` + pestaña de carga, un menú de panorama, un guard en `pos.order.create` que rechaza overrides de roles no autorizados (cubre sync offline), un flag por usuario cargado al POS, y overrides OWL del POS para (a) deshabilitar los botones "%"/"Precio" del numpad y (b) mostrar los tramos bajo el renglón + toast al acercarse.

**Tech Stack:** Odoo 19 CE, Python, OWL/JS (bundle `point_of_sale._assets_pos`), PostgreSQL. Docker Compose (`docker compose exec odoo ...`). Tests `odoo.tests.common.TransactionCase`.

---

## Convenciones de este repo (leer antes de empezar)

- Correr Odoo/tests dentro del contenedor: `docker compose exec -T odoo odoo ...` con `--db_host=db --db_user=odoo --db_password=odoo`.
- El puerto 8069 está tomado por el contenedor vivo: los comandos de test usan `--http-port=8899 --gevent-port=8072`.
- Los `--test-tags` con `/` los rompe Git Bash por conversión de path: prefijar `MSYS_NO_PATHCONV=1`.
- Rama de trabajo: `feature/pos-reparto-descuentos-volumen` (ya creada, ya tiene el spec commiteado).
- Grupos de rol (de `pos_reparto_security/security/reparto_groups.xml`):
  - `pos_reparto_security.group_reparto_vendedor`
  - `pos_reparto_security.group_reparto_deposito`
  - `pos_reparto_security.group_reparto_adminop` (Administración Operativa)
  - `pos_reparto_security.group_reparto_gerencia`
- Patrón de guard en creación de pedido POS: ver `addons/pos_stock_limit/models/pos_order.py` (hook `@api.model_create_multi` en `pos.order.create`, `config_id` se resuelve desde `session_id`, las líneas vienen como comandos `(0, 0, {...})` en `vals['lines']`).
- Patrón de override JS del POS: ver `addons/pos_reparto_credito/static/src/app/services/pos_store.js` (`patch(Componente.prototype, {...})`, `_t` para textos).
- Manifiesto con assets del POS: ver `addons/pos_reparto_credito/__manifest__.py` (`'assets': {'point_of_sale._assets_pos': ['<modulo>/static/src/**/*']}`).
- Datos verificados en la base: existe una sola `product.pricelist` — "Default", xmlid `product.list0`, id 1, usada por los 4 `pos.config` (`pos_reparto_pricelist` ya dejó `use_pricelist=True`).
- `product.pricelist.item._load_pos_data_fields` (Odoo 19 core) YA incluye `min_quantity`, `compute_price`, `percent_price`, `product_tmpl_id`, `product_id`, `date_start`, `date_end`, `base` — o sea los tramos ya viajan al frontend del POS, no hay que extender la carga.
- `res.users._load_pos_data_read` (core `point_of_sale/models/res_users.py`) lee `all_group_ids`, calcula `_role` y **borra** `all_group_ids` del dict. Nuestro override tiene que calcular el flag desde el recordset (`records.has_group(...)`), no desde el dict ya recortado.
- Menú padre para el ítem de configuración: `point_of_sale.menu_point_config_product` ("Configuration").

---

## File Structure

```
addons/pos_reparto_descuento_volumen/
├── __init__.py                         # from . import models
├── __manifest__.py                     # depends, data, assets
├── models/
│   ├── __init__.py                     # from . import product_template, pos_order, res_users
│   ├── product_template.py             # One2many reparto_volumen_item_ids + defaults al crear
│   ├── pos_order.py                    # guard: rechaza override manual de rol no autorizado
│   └── res_users.py                    # flag _reparto_puede_override cargado al POS
├── security/
│   └── ir.model.access.csv             # CRUD de product.pricelist.item para adminop/gerencia
├── views/
│   ├── product_template_views.xml      # pestaña "Descuentos por volumen" en el form de producto
│   └── descuento_volumen_menu.xml      # acción + menú "Descuentos por volumen"
├── static/src/overrides/
│   ├── numpad_gate.js                  # patch ProductScreen.getNumpadButtons: deshabilita %/Precio por rol
│   ├── orderline.js                    # patch Orderline: getter repartoVolumenTramos + estado del toast
│   ├── orderline.xml                   # t-inherit point_of_sale.Orderline: bloque de tramos
│   └── volume_toast.js                 # patch Orderline.setup: effect sobre qty que dispara el toast
└── tests/
    ├── __init__.py                     # from . import test_descuento_volumen
    └── test_descuento_volumen.py       # TransactionCase
```

**Responsabilidad de cada archivo:**

- `product_template.py` — solo la relación de conveniencia con los items de la lista y los defaults al crear un tramo desde el form.
- `pos_order.py` — solo el enforcement backend del permiso de override. Nada de UI.
- `res_users.py` — solo exponer al frontend del POS si el usuario puede overridear.
- `numpad_gate.js` — solo la visibilidad de los botones "%" y "Precio" del numpad.
- `orderline.js` + `orderline.xml` — solo el bloque informativo de tramos bajo el renglón.
- `volume_toast.js` — solo el toast de "te falta poco para el próximo tramo".
- `product_template_views.xml` / `descuento_volumen_menu.xml` — solo vistas/acciones/menú.

---

## Task 1: Scaffold del módulo

**Files:**
- Create: `addons/pos_reparto_descuento_volumen/__init__.py`
- Create: `addons/pos_reparto_descuento_volumen/__manifest__.py`
- Create: `addons/pos_reparto_descuento_volumen/models/__init__.py`
- Create: `addons/pos_reparto_descuento_volumen/models/product_template.py` (stub)
- Create: `addons/pos_reparto_descuento_volumen/security/ir.model.access.csv`
- Create: `addons/pos_reparto_descuento_volumen/tests/__init__.py`
- Create: `addons/pos_reparto_descuento_volumen/tests/test_descuento_volumen.py` (stub)

- [ ] **Step 1: Crear `__init__.py`**

`addons/pos_reparto_descuento_volumen/__init__.py`:

```python
from . import models
```

- [ ] **Step 2: Crear `__manifest__.py`**

`addons/pos_reparto_descuento_volumen/__manifest__.py`:

```python
{
    'name': 'POS Reparto - Descuentos por Volumen',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Escala de descuento por cantidad por producto (RF-PV-09), aviso de tramos en POS y override manual restringido a Administración/Gerencia',
    'depends': ['point_of_sale', 'pos_reparto_security', 'pos_reparto_pricelist'],
    'data': [
        'security/ir.model.access.csv',
        'views/product_template_views.xml',
        'views/descuento_volumen_menu.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_reparto_descuento_volumen/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 3: Crear `models/__init__.py`**

`addons/pos_reparto_descuento_volumen/models/__init__.py`:

```python
from . import product_template
from . import pos_order
from . import res_users
```

- [ ] **Step 4: Crear stub `models/product_template.py`**

`addons/pos_reparto_descuento_volumen/models/product_template.py`:

```python
from odoo import models


class ProductTemplate(models.Model):
    _inherit = 'product.template'
```

- [ ] **Step 5: Crear stubs `models/pos_order.py` y `models/res_users.py`**

`addons/pos_reparto_descuento_volumen/models/pos_order.py`:

```python
from odoo import models


class PosOrder(models.Model):
    _inherit = 'pos.order'
```

`addons/pos_reparto_descuento_volumen/models/res_users.py`:

```python
from odoo import models


class ResUsers(models.Model):
    _inherit = 'res.users'
```

- [ ] **Step 6: Crear `security/ir.model.access.csv`**

`addons/pos_reparto_descuento_volumen/security/ir.model.access.csv`:

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_pricelist_item_reparto_adminop,product.pricelist.item reparto adminop,product.model_product_pricelist_item,pos_reparto_security.group_reparto_adminop,1,1,1,1
access_pricelist_item_reparto_gerencia,product.pricelist.item reparto gerencia,product.model_product_pricelist_item,pos_reparto_security.group_reparto_gerencia,1,1,1,1
```

- [ ] **Step 7: Crear stubs de vistas (para que el manifest instale)**

`addons/pos_reparto_descuento_volumen/views/product_template_views.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
</odoo>
```

`addons/pos_reparto_descuento_volumen/views/descuento_volumen_menu.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
</odoo>
```

- [ ] **Step 8: Crear stubs de tests**

`addons/pos_reparto_descuento_volumen/tests/__init__.py`:

```python
from . import test_descuento_volumen
```

`addons/pos_reparto_descuento_volumen/tests/test_descuento_volumen.py`:

```python
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestDescuentoVolumen(TransactionCase):

    def test_placeholder(self):
        self.assertTrue(True)
```

- [ ] **Step 9: Instalar el módulo**

Run:
```bash
docker compose exec -T odoo odoo -d odoo -i pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "loading pos_reparto_descuento_volumen|ERROR|Modules loaded"
```
Expected: línea `Modules loaded.` y sin `ERROR`. (Los `WARNING ... Missing 'author' key` son normales en este repo.)

- [ ] **Step 10: Commit**

```bash
git add addons/pos_reparto_descuento_volumen
git commit -m "feat(pos_reparto_descuento_volumen): skeleton del módulo"
```

---

## Task 2: One2many de tramos en `product.template` + pestaña de carga

**Files:**
- Modify: `addons/pos_reparto_descuento_volumen/models/product_template.py`
- Modify: `addons/pos_reparto_descuento_volumen/views/product_template_views.xml`
- Modify: `addons/pos_reparto_descuento_volumen/tests/test_descuento_volumen.py`

- [ ] **Step 1: Escribir el test que falla**

Reemplazar el contenido de `tests/test_descuento_volumen.py` por:

```python
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestDescuentoVolumen(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pricelist = cls.env.ref('product.list0')
        cls.product = cls.env['product.template'].create({
            'name': 'Galletitas Test',
            'list_price': 100.0,
            'type': 'consu',
            'available_in_pos': True,
        })

    def test_o2m_crea_item_con_defaults_correctos(self):
        """Crear un tramo desde el One2many del producto deja el
        product.pricelist.item bien formado sin que el usuario complete
        pricelist/applied_on/compute_price/base a mano."""
        self.product.write({
            'reparto_volumen_item_ids': [(0, 0, {
                'min_quantity': 10,
                'percent_price': 4.0,
            })],
        })
        item = self.product.reparto_volumen_item_ids
        self.assertEqual(len(item), 1)
        self.assertEqual(item.pricelist_id, self.pricelist)
        self.assertEqual(item.applied_on, '1_product')
        self.assertEqual(item.compute_price, 'percentage')
        self.assertEqual(item.base, 'list_price')
        self.assertEqual(item.min_quantity, 10)
        self.assertEqual(item.percent_price, 4.0)
        self.assertEqual(item.product_tmpl_id, self.product)

    def test_o2m_solo_devuelve_tramos_de_volumen(self):
        """El One2many filtra: un item de precio fijo sobre el mismo
        producto no aparece en reparto_volumen_item_ids."""
        self.env['product.pricelist.item'].create({
            'pricelist_id': self.pricelist.id,
            'applied_on': '1_product',
            'product_tmpl_id': self.product.id,
            'compute_price': 'fixed',
            'fixed_price': 50.0,
            'min_quantity': 0,
        })
        self.product.write({
            'reparto_volumen_item_ids': [(0, 0, {
                'min_quantity': 10,
                'percent_price': 4.0,
            })],
        })
        self.assertEqual(len(self.product.reparto_volumen_item_ids), 1)
        self.assertEqual(self.product.reparto_volumen_item_ids.compute_price, 'percentage')
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_o2m|FAIL|ERROR|[0-9]+ failed"
```
Expected: FAIL — `Invalid field 'reparto_volumen_item_ids' on model 'product.template'`.

- [ ] **Step 3: Implementar el One2many + defaults**

`addons/pos_reparto_descuento_volumen/models/product_template.py`:

```python
from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    reparto_volumen_item_ids = fields.One2many(
        comodel_name='product.pricelist.item',
        inverse_name='product_tmpl_id',
        string="Descuentos por volumen",
        domain=lambda self: [
            ('pricelist_id', '=', self.env.ref('product.list0').id),
            ('compute_price', '=', 'percentage'),
            ('min_quantity', '>', 0),
        ],
    )

    @api.model
    def _reparto_volumen_item_defaults(self):
        return {
            'pricelist_id': self.env.ref('product.list0').id,
            'applied_on': '1_product',
            'compute_price': 'percentage',
            'base': 'list_price',
        }

    def write(self, vals):
        vals = self._reparto_volumen_inyectar_defaults(vals)
        return super().write(vals)

    @api.model_create_multi
    def create(self, vals_list):
        vals_list = [self._reparto_volumen_inyectar_defaults(v) for v in vals_list]
        return super().create(vals_list)

    def _reparto_volumen_inyectar_defaults(self, vals):
        """Completa pricelist/applied_on/compute_price/base en los comandos
        (0, 0, {...}) de reparto_volumen_item_ids que no los traen, para que
        el form solo tenga que pedir cantidad y %."""
        commands = vals.get('reparto_volumen_item_ids')
        if not commands:
            return vals
        defaults = self._reparto_volumen_item_defaults()
        nuevos = []
        for command in commands:
            if isinstance(command, (list, tuple)) and command[0] == 0 and isinstance(command[2], dict):
                line_vals = {**defaults, **command[2]}
                nuevos.append((0, command[1], line_vals))
            else:
                nuevos.append(command)
        return {**vals, 'reparto_volumen_item_ids': nuevos}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_o2m|FAIL|ERROR|0 failed"
```
Expected: `0 failed, 0 error(s)` y ambos `test_o2m_...` en verde.

- [ ] **Step 5: Agregar la pestaña al form del producto**

Reemplazar `addons/pos_reparto_descuento_volumen/views/product_template_views.xml` por:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="product_template_form_view_descuento_volumen" model="ir.ui.view">
        <field name="name">product.template.form.descuento.volumen</field>
        <field name="model">product.template</field>
        <field name="inherit_id" ref="product.product_template_form_view"/>
        <field name="groups_id" eval="[(4, ref('pos_reparto_security.group_reparto_adminop')), (4, ref('pos_reparto_security.group_reparto_gerencia'))]"/>
        <field name="arch" type="xml">
            <xpath expr="//notebook" position="inside">
                <page string="Descuentos por volumen" name="reparto_descuento_volumen">
                    <field name="reparto_volumen_item_ids">
                        <list editable="bottom">
                            <field name="min_quantity" string="Cantidad mínima"/>
                            <field name="percent_price" string="% descuento"/>
                            <field name="date_start" string="Desde" optional="hide"/>
                            <field name="date_end" string="Hasta" optional="hide"/>
                        </list>
                    </field>
                    <p class="text-muted">
                        El descuento se aplica en el Punto de Venta cuando la cantidad del renglón alcanza cada tramo.
                    </p>
                </page>
            </xpath>
        </field>
    </record>
</odoo>
```

- [ ] **Step 6: Recargar el módulo y verificar que la vista carga sin error**

Run:
```bash
docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "ERROR|Modules loaded"
```
Expected: `Modules loaded.` sin `ERROR`.

- [ ] **Step 7: Commit**

```bash
git add addons/pos_reparto_descuento_volumen
git commit -m "feat(pos_reparto_descuento_volumen): One2many de tramos en product.template + pestaña de carga"
```

---

## Task 3: Test de comportamiento del descuento escalonado

Valida de punta a punta que los tramos cargados con los defaults del Task 2 producen los precios correctos con el motor nativo. Es una red de seguridad: si algún default (`base`, `compute_price`, `applied_on`) estuviera mal, este test lo caza.

**Files:**
- Modify: `addons/pos_reparto_descuento_volumen/tests/test_descuento_volumen.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de la clase `TestDescuentoVolumen` en `tests/test_descuento_volumen.py`:

```python
    def test_escala_de_descuento_por_cantidad(self):
        """Producto a $100 con tramos 6u->4% y 12u->8%: el precio de lista
        baja al alcanzar cada umbral y se queda en el tope."""
        self.product.write({
            'reparto_volumen_item_ids': [
                (0, 0, {'min_quantity': 6, 'percent_price': 4.0}),
                (0, 0, {'min_quantity': 12, 'percent_price': 8.0}),
            ],
        })
        variant = self.product.product_variant_id

        def precio(qty):
            return self.pricelist._get_product_price(variant, qty)

        self.assertAlmostEqual(precio(5), 100.0, places=2)
        self.assertAlmostEqual(precio(6), 96.0, places=2)
        self.assertAlmostEqual(precio(11), 96.0, places=2)
        self.assertAlmostEqual(precio(12), 92.0, places=2)
        self.assertAlmostEqual(precio(100), 92.0, places=2)
```

- [ ] **Step 2: Correr el test y verificar el resultado**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_escala|FAIL|ERROR|failed"
```
Expected: `test_escala_de_descuento_por_cantidad` PASA (el motor nativo ya hace el cálculo; si falla, revisar los defaults del Task 2, sobre todo `base='list_price'` y `applied_on='1_product'`).

- [ ] **Step 3: Commit**

```bash
git add addons/pos_reparto_descuento_volumen/tests/test_descuento_volumen.py
git commit -m "test(pos_reparto_descuento_volumen): escala de descuento por cantidad con el motor nativo"
```

---

## Task 4: Menú "Descuentos por volumen" (panorama)

**Files:**
- Modify: `addons/pos_reparto_descuento_volumen/views/descuento_volumen_menu.xml`
- Modify: `addons/pos_reparto_descuento_volumen/tests/test_descuento_volumen.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de la clase `TestDescuentoVolumen`:

```python
    def test_menu_lista_solo_productos_con_tramos(self):
        """La acción del menú 'Descuentos por volumen' filtra a los
        productos que tienen al menos un tramo."""
        con_tramo = self.env['product.template'].create({
            'name': 'Con Tramo', 'list_price': 10.0, 'type': 'consu',
            'reparto_volumen_item_ids': [(0, 0, {'min_quantity': 6, 'percent_price': 4.0})],
        })
        sin_tramo = self.env['product.template'].create({
            'name': 'Sin Tramo', 'list_price': 10.0, 'type': 'consu',
        })
        action = self.env.ref('pos_reparto_descuento_volumen.action_productos_descuento_volumen')
        domain = action._get_eval_context()  # noqa - solo para forzar carga
        productos = self.env['product.template'].search(
            self.env['ir.actions.act_window']._for_xml_id(
                'pos_reparto_descuento_volumen.action_productos_descuento_volumen'
            )['domain']
        )
        self.assertIn(con_tramo, productos)
        self.assertNotIn(sin_tramo, productos)
```

Nota: si `_get_eval_context` no existe en Odoo 19, borrar esa línea; lo que importa es evaluar el `domain` de la acción.

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_menu|FAIL|ERROR|failed"
```
Expected: FAIL — `Reference 'pos_reparto_descuento_volumen.action_productos_descuento_volumen' not found`.

- [ ] **Step 3: Implementar acción + menú**

Reemplazar `addons/pos_reparto_descuento_volumen/views/descuento_volumen_menu.xml` por:

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <record id="action_productos_descuento_volumen" model="ir.actions.act_window">
        <field name="name">Descuentos por volumen</field>
        <field name="res_model">product.template</field>
        <field name="view_mode">list,form</field>
        <field name="domain">[('reparto_volumen_item_ids', '!=', False)]</field>
        <field name="context">{}</field>
        <field name="help" type="html">
            <p class="o_view_nocontent_smiling_face">Todavía no hay productos con descuento por volumen</p>
            <p>Cargá los tramos desde la pestaña "Descuentos por volumen" del producto.</p>
        </field>
    </record>

    <menuitem id="menu_descuento_volumen"
              name="Descuentos por volumen"
              parent="point_of_sale.menu_point_config_product"
              action="action_productos_descuento_volumen"
              groups="pos_reparto_security.group_reparto_adminop,pos_reparto_security.group_reparto_gerencia"
              sequence="80"/>
</odoo>
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_menu|FAIL|ERROR|0 failed"
```
Expected: `test_menu_lista_solo_productos_con_tramos` PASA, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_descuento_volumen
git commit -m "feat(pos_reparto_descuento_volumen): menú 'Descuentos por volumen' con panorama de productos"
```

---

## Task 5: Guard backend del override manual

Rechaza en `pos.order.create` cualquier línea con `discount > 0` o `price_unit` por debajo del precio de lista si el cajero no es Admin Operativa / Gerencia. Cubre el sync offline (la orden se rechaza al sincronizar).

**Files:**
- Modify: `addons/pos_reparto_descuento_volumen/models/pos_order.py`
- Modify: `addons/pos_reparto_descuento_volumen/tests/test_descuento_volumen.py`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de la clase `TestDescuentoVolumen`:

```python
    def _pos_config(self):
        return self.env['pos.config'].search([('name', '=', 'POS Camión 1')], limit=1) \
            or self.env['pos.config'].search([], limit=1)

    def _abrir_sesion(self, user):
        config = self._pos_config()
        session = self.env['pos.session'].create({'config_id': config.id, 'user_id': user.id})
        return config, session

    def _vals_orden(self, config, session, user, line_vals):
        return {
            'company_id': self.env.company.id,
            'session_id': session.id,
            'user_id': user.id,
            'pricelist_id': self.pricelist.id,
            'amount_total': 0.0, 'amount_tax': 0.0, 'amount_paid': 0.0, 'amount_return': 0.0,
            'lines': [(0, 0, {
                'product_id': self.product.product_variant_id.id,
                'qty': line_vals.get('qty', 1),
                'price_unit': line_vals['price_unit'],
                'discount': line_vals.get('discount', 0.0),
                'price_subtotal': 0.0, 'price_subtotal_incl': 0.0,
            })],
        }

    def test_guard_bloquea_precio_bajo_de_vendedor(self):
        vendedor = self.env['res.users'].create({
            'name': 'Vendedor Test', 'login': 'vend_dv_test',
            'group_ids': [(6, 0, [self.env.ref('pos_reparto_security.group_reparto_vendedor').id])],
        })
        config, session = self._abrir_sesion(vendedor)
        with self.assertRaises(Exception):
            self.env['pos.order'].with_user(vendedor).create(
                self._vals_orden(config, session, vendedor, {'price_unit': 80.0})
            )

    def test_guard_bloquea_descuento_de_vendedor(self):
        vendedor = self.env['res.users'].create({
            'name': 'Vendedor Test 2', 'login': 'vend_dv_test2',
            'group_ids': [(6, 0, [self.env.ref('pos_reparto_security.group_reparto_vendedor').id])],
        })
        config, session = self._abrir_sesion(vendedor)
        with self.assertRaises(Exception):
            self.env['pos.order'].with_user(vendedor).create(
                self._vals_orden(config, session, vendedor, {'price_unit': 100.0, 'discount': 10.0})
            )

    def test_guard_permite_precio_bajo_de_gerencia(self):
        gerente = self.env['res.users'].create({
            'name': 'Gerente Test', 'login': 'ger_dv_test',
            'group_ids': [(6, 0, [self.env.ref('pos_reparto_security.group_reparto_gerencia').id])],
        })
        config, session = self._abrir_sesion(gerente)
        orden = self.env['pos.order'].with_user(gerente).create(
            self._vals_orden(config, session, gerente, {'price_unit': 80.0})
        )
        self.assertTrue(orden.exists())

    def test_guard_permite_descuento_por_volumen_de_vendedor(self):
        """Un precio que coincide con el de lista (aunque esté rebajado por
        un tramo de volumen) NO dispara el guard para un Vendedor."""
        self.product.write({
            'reparto_volumen_item_ids': [(0, 0, {'min_quantity': 6, 'percent_price': 4.0})],
        })
        vendedor = self.env['res.users'].create({
            'name': 'Vendedor Test 3', 'login': 'vend_dv_test3',
            'group_ids': [(6, 0, [self.env.ref('pos_reparto_security.group_reparto_vendedor').id])],
        })
        config, session = self._abrir_sesion(vendedor)
        orden = self.env['pos.order'].with_user(vendedor).create(
            self._vals_orden(config, session, vendedor, {'qty': 6, 'price_unit': 96.0})
        )
        self.assertTrue(orden.exists())
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_guard|FAIL|ERROR|failed"
```
Expected: `test_guard_bloquea_precio_bajo_de_vendedor` y `test_guard_bloquea_descuento_de_vendedor` FALLAN (no salta excepción porque todavía no hay guard).

- [ ] **Step 3: Implementar el guard**

Reemplazar `addons/pos_reparto_descuento_volumen/models/pos_order.py` por:

```python
from odoo import api, models
from odoo.exceptions import UserError
from odoo.tools import float_compare

GRUPOS_OVERRIDE = (
    'pos_reparto_security.group_reparto_adminop',
    'pos_reparto_security.group_reparto_gerencia',
)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            self._reparto_check_override_manual(vals)
        return super().create(vals_list)

    def _reparto_check_override_manual(self, vals):
        cajero = self._reparto_resolver_cajero(vals)
        if not cajero:
            return
        if any(cajero.has_group(g) for g in GRUPOS_OVERRIDE):
            return

        pricelist = self._reparto_resolver_pricelist(vals)
        rounding = (pricelist.currency_id or self.env.company.currency_id).rounding

        infracciones = []
        for line in vals.get('lines') or []:
            if not (isinstance(line, (list, tuple)) and len(line) == 3 and isinstance(line[2], dict)):
                continue
            line_vals = line[2]
            product = self.env['product.product'].browse(line_vals.get('product_id'))
            qty = line_vals.get('qty') or 0.0
            price_unit = line_vals.get('price_unit')
            discount = line_vals.get('discount') or 0.0
            if not product or price_unit is None:
                continue

            if float_compare(discount, 0.0, precision_rounding=0.01) > 0:
                infracciones.append(product.display_name)
                continue

            esperado = pricelist._get_product_price(product, qty) if pricelist else product.lst_price
            if float_compare(price_unit, esperado, precision_rounding=rounding) < 0:
                infracciones.append(product.display_name)

        if infracciones:
            raise UserError(
                "Solo Administración o Gerencia pueden modificar precio o descuento de una línea.\n"
                "Líneas con override manual: %s" % ", ".join(sorted(set(infracciones)))
            )

    def _reparto_resolver_cajero(self, vals):
        if vals.get('user_id'):
            return self.env['res.users'].browse(vals['user_id'])
        if vals.get('session_id'):
            return self.env['pos.session'].browse(vals['session_id']).user_id
        return self.env.user

    def _reparto_resolver_pricelist(self, vals):
        if vals.get('pricelist_id'):
            return self.env['product.pricelist'].browse(vals['pricelist_id'])
        config_id = vals.get('config_id')
        if not config_id and vals.get('session_id'):
            config_id = self.env['pos.session'].browse(vals['session_id']).config_id.id
        if config_id:
            return self.env['pos.config'].browse(config_id).pricelist_id
        return self.env['product.pricelist']
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_guard|FAIL|ERROR|0 failed"
```
Expected: los 4 `test_guard_*` en verde, `0 failed, 0 error(s)`.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_descuento_volumen
git commit -m "feat(pos_reparto_descuento_volumen): guard en pos.order.create — override manual solo Admin/Gerencia"
```

---

## Task 6: Flag `_reparto_puede_override` cargado al POS

Expone al frontend del POS, en el registro `res.users` del usuario logueado, si puede overridear. La JS del Task 7 lo usa para mostrar/ocultar los botones del numpad.

**Files:**
- Modify: `addons/pos_reparto_descuento_volumen/models/res_users.py`
- Modify: `addons/pos_reparto_descuento_volumen/tests/test_descuento_volumen.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de la clase `TestDescuentoVolumen`:

```python
    def test_pos_data_marca_flag_de_override_por_rol(self):
        gerente = self.env['res.users'].create({
            'name': 'Gerente Flag', 'login': 'ger_flag_test',
            'group_ids': [(6, 0, [self.env.ref('pos_reparto_security.group_reparto_gerencia').id])],
        })
        vendedor = self.env['res.users'].create({
            'name': 'Vendedor Flag', 'login': 'vend_flag_test',
            'group_ids': [(6, 0, [self.env.ref('pos_reparto_security.group_reparto_vendedor').id])],
        })
        config = self._pos_config()

        data_ger = self.env['res.users'].with_user(gerente)._load_pos_data_read(
            gerente, config
        )
        data_vend = self.env['res.users'].with_user(vendedor)._load_pos_data_read(
            vendedor, config
        )
        self.assertTrue(data_ger[0]['_reparto_puede_override'])
        self.assertFalse(data_vend[0]['_reparto_puede_override'])
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_pos_data_marca_flag|FAIL|ERROR|failed"
```
Expected: FAIL — `KeyError: '_reparto_puede_override'`.

- [ ] **Step 3: Implementar el override de `_load_pos_data_read`**

Reemplazar `addons/pos_reparto_descuento_volumen/models/res_users.py` por:

```python
from odoo import api, models

GRUPOS_OVERRIDE = (
    'pos_reparto_security.group_reparto_adminop',
    'pos_reparto_security.group_reparto_gerencia',
)


class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model
    def _load_pos_data_read(self, records, config):
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            user = records[:1]
            read_records[0]['_reparto_puede_override'] = any(
                user.has_group(g) for g in GRUPOS_OVERRIDE
            )
        return read_records
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_pos_data_marca_flag|FAIL|ERROR|0 failed"
```
Expected: `test_pos_data_marca_flag_de_override_por_rol` PASA.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_descuento_volumen
git commit -m "feat(pos_reparto_descuento_volumen): flag _reparto_puede_override en la carga de res.users al POS"
```

---

## Task 7: Gate de los botones "%" y "Precio" del numpad (JS)

**Files:**
- Create: `addons/pos_reparto_descuento_volumen/static/src/overrides/numpad_gate.js`

- [ ] **Step 1: Crear el patch**

`addons/pos_reparto_descuento_volumen/static/src/overrides/numpad_gate.js`:

```javascript
import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";

/**
 * RF-PV-09: el override manual de precio y descuento en el renglón queda
 * restringido a Administración Operativa / Gerencia. El backend
 * (pos.order.create) lo bloquea de verdad; acá solo se ocultan los botones
 * para que el Vendedor no los tenga a mano.
 */
patch(ProductScreen.prototype, {
    getNumpadButtons() {
        const buttons = super.getNumpadButtons();
        const puedeOverride = !!this.pos.getCashier()?._reparto_puede_override;
        if (puedeOverride) {
            return buttons;
        }
        return buttons.map((button) =>
            ["discount", "price"].includes(button.value)
                ? { ...button, disabled: true }
                : button
        );
    },
});
```

- [ ] **Step 2: Recargar el módulo (regenera el bundle del POS)**

Run:
```bash
docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "ERROR|Modules loaded"
docker compose restart odoo
```
Expected: `Modules loaded.` sin `ERROR`; el contenedor reinicia (nota de `ESTADO_PROYECTO.md` §5quater: tras tocar un bundle de assets hay que reiniciar el proceso vivo).

- [ ] **Step 3: Verificación manual en navegador**

1. Login como usuario **Vendedor** (grupo `pos_reparto_security.group_reparto_vendedor`; en dev sirve el placeholder `vendedor@reparto.local` / `Reparto2026!` si existe, o crear uno).
2. Abrir "POS Camión 1" → nueva sesión → pantalla de productos.
3. Agregar un producto y seleccionar el renglón.
4. **Esperado:** los botones "%" y "Precio" del numpad están deshabilitados (grises, no responden).
5. Cerrar sesión, login como **Gerencia** (`group_reparto_gerencia`), repetir.
6. **Esperado:** "%" y "Precio" habilitados y funcionales.

- [ ] **Step 4: Commit**

```bash
git add addons/pos_reparto_descuento_volumen/static/src/overrides/numpad_gate.js
git commit -m "feat(pos_reparto_descuento_volumen): ocultar botones %/Precio del numpad salvo Admin/Gerencia"
```

---

## Task 8: Bloque de tramos bajo el renglón (JS + XML)

**Files:**
- Create: `addons/pos_reparto_descuento_volumen/static/src/overrides/orderline.js`
- Create: `addons/pos_reparto_descuento_volumen/static/src/overrides/orderline.xml`

- [ ] **Step 1: Crear el getter que calcula los tramos de la línea**

`addons/pos_reparto_descuento_volumen/static/src/overrides/orderline.js`:

```javascript
import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";

/**
 * Devuelve los tramos de descuento por volumen del producto de esta línea,
 * ordenados por cantidad ascendente, marcando cuál está activo según la
 * cantidad actual del renglón. Los product.pricelist.item ya viajan al POS
 * en la carga inicial (core: product.pricelist.item._load_pos_data_fields),
 * así que esto funciona offline.
 */
patch(Orderline.prototype, {
    get repartoVolumenTramos() {
        const line = this.props.line;
        const product = line.product_id;
        if (!product) {
            return [];
        }
        const items = this.pos.models["product.pricelist.item"].getAll();
        const ahora = new Date();
        const tramos = items
            .filter((item) => {
                if (item.compute_price !== "percentage" || !item.min_quantity || item.min_quantity <= 0) {
                    return false;
                }
                const tmplId = item.product_tmpl_id?.id ?? item.product_tmpl_id;
                if (tmplId !== product.raw.product_tmpl_id && tmplId !== product.product_tmpl_id?.id) {
                    return false;
                }
                if (item.date_start && new Date(item.date_start) > ahora) {
                    return false;
                }
                if (item.date_end && new Date(item.date_end) < ahora) {
                    return false;
                }
                return true;
            })
            .map((item) => ({
                minQty: item.min_quantity,
                percent: item.percent_price,
            }))
            .sort((a, b) => a.minQty - b.minQty);

        const qty = line.qty || 0;
        let activoIdx = -1;
        tramos.forEach((t, i) => {
            if (qty >= t.minQty) {
                activoIdx = i;
            }
        });
        return tramos.map((t, i) => ({ ...t, activo: i === activoIdx }));
    },
});
```

Nota de implementación: el campo que identifica la plantilla del producto en el modelo del POS puede ser `product.product_tmpl_id.id` o `product.raw.product_tmpl_id` según cómo esté cargado. Si el filtro no matchea en la verificación manual, ajustar la comparación de `tmplId` mirando en la consola `this.pos.models["product.product"].getAll()[0]`.

- [ ] **Step 2: Crear la extensión de template**

`addons/pos_reparto_descuento_volumen/static/src/overrides/orderline.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">
    <t t-name="pos_reparto_descuento_volumen.OrderlineVolumen"
       t-inherit="point_of_sale.Orderline" t-inherit-mode="extension">
        <xpath expr="//t[@t-slot='default']" position="before">
            <li t-if="repartoVolumenTramos.length" class="price-per-unit reparto-volumen-tramos">
                <i class="fa fa-tags pe-1"/>
                <t t-foreach="repartoVolumenTramos" t-as="tramo" t-key="tramo_index">
                    <span t-attf-class="reparto-volumen-tramo {{ tramo.activo ? 'fw-bolder text-success' : 'text-muted' }}">
                        <t t-esc="tramo.minQty"/>+ u → <t t-esc="tramo.percent"/>%
                    </span>
                    <span t-if="!tramo_last" class="text-muted px-1">·</span>
                </t>
            </li>
        </xpath>
    </t>
</templates>
```

- [ ] **Step 3: Recargar el módulo + reiniciar**

Run:
```bash
docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "ERROR|Modules loaded"
docker compose restart odoo
```
Expected: `Modules loaded.` sin `ERROR`.

- [ ] **Step 4: Verificación manual en navegador**

1. Como Admin/Gerencia, cargar en un producto (ej. "Galletitas") tramos 10→4% y 20→8% (pestaña "Descuentos por volumen" del producto).
2. Abrir "POS Camión 1", agregar ese producto.
3. **Esperado con qty 1:** bajo el renglón aparece `10+ u → 4% · 20+ u → 8%`, ambos en gris.
4. Subir a qty 10. **Esperado:** el precio del renglón baja 4% (motor nativo) y `10+ u → 4%` queda resaltado en verde/negrita.
5. Subir a qty 20. **Esperado:** precio −8%, `20+ u → 8%` resaltado.
6. Agregar un producto **sin** tramos. **Esperado:** no aparece ningún bloque de tramos en su renglón.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_descuento_volumen/static/src/overrides/orderline.js \
        addons/pos_reparto_descuento_volumen/static/src/overrides/orderline.xml
git commit -m "feat(pos_reparto_descuento_volumen): bloque de tramos de descuento bajo el renglón del POS"
```

---

## Task 9: Toast "te falta poco para el próximo tramo" (JS)

**Files:**
- Create: `addons/pos_reparto_descuento_volumen/static/src/overrides/volume_toast.js`

- [ ] **Step 1: Crear el patch**

`addons/pos_reparto_descuento_volumen/static/src/overrides/volume_toast.js`:

```javascript
import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { _t } from "@web/core/l10n/translation";

/**
 * Cuando a la línea le falta poco (<= max(3, 20% del umbral)) para llegar
 * al próximo tramo de descuento, avisa una vez por (línea, tramo) con un
 * toast no bloqueante, para que el vendedor pueda ofrecérselo al cliente.
 */
patch(Orderline.prototype, {
    setup() {
        super.setup();
        this._repartoUltimoTramoAvisado = null;
        let timer = null;
        this._repartoEvaluarToast = () => {
            clearTimeout(timer);
            timer = setTimeout(() => this._repartoChequearProximoTramo(), 400);
        };
        if (this.props.mode === "display") {
            // Reactividad: el effect se vuelve a correr cuando cambia line.qty.
            this.effect ??= null;
        }
    },

    _repartoChequearProximoTramo() {
        const tramos = this.repartoVolumenTramos;
        if (!tramos.length) {
            return;
        }
        const qty = this.props.line.qty || 0;
        const proximo = tramos.find((t) => t.minQty > qty);
        if (!proximo) {
            this._repartoUltimoTramoAvisado = null;
            return;
        }
        const faltan = proximo.minQty - qty;
        const umbral = Math.max(3, Math.round(0.2 * proximo.minQty));
        if (faltan > 0 && faltan <= umbral) {
            const clave = proximo.minQty;
            if (this._repartoUltimoTramoAvisado !== clave) {
                this._repartoUltimoTramoAvisado = clave;
                this.env.services.notification.add(
                    _t(
                        "Con %s u más, este producto tiene %s%% de descuento",
                        faltan,
                        proximo.percent
                    ),
                    { type: "info" }
                );
            }
        } else if (faltan > umbral) {
            // Se alejó del tramo: resetear para que vuelva a avisar si se acerca de nuevo.
            this._repartoUltimoTramoAvisado = null;
        }
    },
});
```

- [ ] **Step 2: Enganchar la evaluación al cambio de cantidad**

En `addons/pos_reparto_descuento_volumen/static/src/overrides/orderline.js`, dentro del `patch(Orderline.prototype, { ... })`, agregar un `setup` que observe la cantidad. Reemplazar el archivo completo por:

```javascript
import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { useEffect } from "@odoo/owl";

patch(Orderline.prototype, {
    setup() {
        super.setup();
        if (this.props.mode === "display") {
            useEffect(
                () => {
                    this._repartoEvaluarToast?.();
                },
                () => [this.props.line.qty]
            );
        }
    },

    get repartoVolumenTramos() {
        const line = this.props.line;
        const product = line.product_id;
        if (!product) {
            return [];
        }
        const items = this.pos.models["product.pricelist.item"].getAll();
        const ahora = new Date();
        const tmplIdDeLinea = product.product_tmpl_id?.id ?? product.raw?.product_tmpl_id;
        const tramos = items
            .filter((item) => {
                if (item.compute_price !== "percentage" || !item.min_quantity || item.min_quantity <= 0) {
                    return false;
                }
                const tmplId = item.product_tmpl_id?.id ?? item.product_tmpl_id;
                if (tmplId !== tmplIdDeLinea) {
                    return false;
                }
                if (item.date_start && new Date(item.date_start) > ahora) {
                    return false;
                }
                if (item.date_end && new Date(item.date_end) < ahora) {
                    return false;
                }
                return true;
            })
            .map((item) => ({ minQty: item.min_quantity, percent: item.percent_price }))
            .sort((a, b) => a.minQty - b.minQty);

        const qty = line.qty || 0;
        let activoIdx = -1;
        tramos.forEach((t, i) => {
            if (qty >= t.minQty) {
                activoIdx = i;
            }
        });
        return tramos.map((t, i) => ({ ...t, activo: i === activoIdx }));
    },
});
```

(El `setup` de `volume_toast.js` que sólo define `_repartoEvaluarToast` sigue vigente porque `patch` acumula; el `useEffect` de acá lo invoca.)

- [ ] **Step 3: Recargar + reiniciar**

Run:
```bash
docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "ERROR|Modules loaded"
docker compose restart odoo
```
Expected: `Modules loaded.` sin `ERROR`.

- [ ] **Step 4: Verificación manual en navegador**

1. Producto "Galletitas" con tramo 10→4% (umbral de aviso = `max(3, round(2)) = 3`).
2. En el POS, agregar el producto, subir la cantidad a **7**.
3. **Esperado:** salta un toast azul "Con 3 u más, este producto tiene 4% de descuento".
4. Subir a **8**: nuevo toast "Con 2 u más...". Subir a **9**: "Con 1 u más...".
5. Volver a bajar a **3** y volver a subir a **8**: el toast vuelve a aparecer (se reseteó al alejarse).
6. Llegar a **10**: sin toast (ya tiene el descuento; el bloque de tramos lo muestra resaltado).
7. Tipear rápido varias cantidades: no aparece un toast por cada tecla (debounce 400 ms).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_descuento_volumen/static/src/overrides/volume_toast.js \
        addons/pos_reparto_descuento_volumen/static/src/overrides/orderline.js
git commit -m "feat(pos_reparto_descuento_volumen): toast al acercarse al próximo tramo de descuento"
```

---

## Task 10: Suite completa, doc de estado y cierre

**Files:**
- Modify: `ESTADO_PROYECTO.md`

- [ ] **Step 1: Correr toda la suite del módulo**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo -u pos_reparto_descuento_volumen \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_reparto_descuento_volumen --stop-after-init \
  --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "test_|[0-9]+ failed, [0-9]+ error"
```
Expected: todos los `test_*` listados y `0 failed, 0 error(s)`.

- [ ] **Step 2: Verificar que no rompió los otros módulos custom**

Run:
```bash
MSYS_NO_PATHCONV=1 docker compose exec -T odoo odoo -d odoo \
  --db_host=db --db_user=odoo --db_password=odoo --test-enable \
  --test-tags /pos_stock_limit,/pos_reparto_home,/pos_reparto_credito,/pos_reparto_security \
  --stop-after-init --http-port=8899 --gevent-port=8072 2>&1 | grep -iE "[0-9]+ failed, [0-9]+ error"
```
Expected: `0 failed, 0 error(s)`.

- [ ] **Step 3: Actualizar `ESTADO_PROYECTO.md`**

En `ESTADO_PROYECTO.md`, en la lista de "Gaps Must/Should" de la §9, marcar el ítem 2 como hecho y agregar una subsección describiendo el módulo (seguir el formato de `## 5ter.` / `## 5quater.`). Contenido de la subsección nueva (`## 5sexies. Módulo custom: pos_reparto_descuento_volumen`):

```markdown
## 5sexies. Módulo custom: `pos_reparto_descuento_volumen`

Ubicación: `addons/pos_reparto_descuento_volumen/`. Depende de `point_of_sale`, `pos_reparto_security`, `pos_reparto_pricelist`. Cubre RF-PV-09.

Qué hace:

- **Descuento por volumen por producto**: los tramos son `product.pricelist.item` sobre la lista "Default" (`compute_price='percentage'`, `min_quantity`, `percent_price`, `base='list_price'`). Sin modelo nuevo — el motor de precios nativo los aplica, también offline en el POS. Se cargan desde una pestaña "Descuentos por volumen" en el form del producto (un `One2many` de conveniencia `reparto_volumen_item_ids` que inyecta los defaults) y se revisan desde el menú Punto de Venta → Configuración → Descuentos por volumen. Pestaña y menú visibles solo para Admin Operativa / Gerencia; un `ir.model.access.csv` les da CRUD sobre `product.pricelist.item`.
- **Aviso en el POS**: bajo cada renglón cuyo producto tiene tramos, un bloque lista todos los tramos (`10+ u → 4% · 20+ u → 8%`) y resalta el activo según la cantidad. Además, un toast no bloqueante avisa cuando falta poco (`≤ max(3, 20% del umbral)`) para el próximo tramo, una vez por (línea, tramo). Los `product.pricelist.item` ya viajan al frontend del POS en la carga inicial, así que anda offline.
- **Override manual restringido a Admin Operativa / Gerencia (RF-PV-09, "validar permisos")**: los botones "%" y "Precio" del numpad se ocultan para los demás roles (patch de `ProductScreen.getNumpadButtons`, usando un flag `_reparto_puede_override` que el módulo agrega a la carga de `res.users` al POS). El enforcement real es un guard en `pos.order.create` (patrón de `pos_stock_limit`): rechaza con `UserError` cualquier línea con `discount > 0` o `price_unit` por debajo del precio de lista si el cajero no es Admin/Gerencia. Cubre el sync offline. El descuento por volumen legítimo no lo dispara (viene como `price_unit` = precio de lista).

Fuera de alcance (ver spec `docs/superpowers/specs/2026-08-31-pos-reparto-descuento-volumen-design.md`): descuento agregado por orden, tope de override para Vendedor, descuento en la columna "Desc.%" nativa, descuentos por categoría.

Tests: `tests/test_descuento_volumen.py` (One2many + defaults, escala de precios con el motor nativo, dominio del menú, guard de override en sus 4 casos, flag de rol en la carga POS). El bloque de tramos, el toast y el ocultado de botones se verifican en navegador (documentado en el plan `docs/superpowers/plans/2026-08-31-pos-reparto-descuento-volumen.md`).
```

- [ ] **Step 4: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "docs(ESTADO_PROYECTO): pos_reparto_descuento_volumen (ítem 2 / RF-PV-09) hecho"
```

- [ ] **Step 5: Push de la rama**

```bash
git push
```
Expected: la rama `feature/pos-reparto-descuentos-volumen` queda actualizada en GitHub, lista para PR.

---

## Self-Review (hecho por quien escribió el plan)

**Spec coverage:**

| Requisito del spec | Task que lo cubre |
|---|---|
| Motor `product.pricelist` nativo, sin modelo nuevo | Task 2 (One2many + defaults), Task 3 (test del motor) |
| Escala por producto, algunos con descuento y otros no | Task 2 (o2m por producto), Task 4 (menú filtra los que tienen) |
| Carga: pestaña en el producto + menú de panorama | Task 2 (pestaña), Task 4 (menú) |
| Descuento automático al alcanzar el tramo | Task 3 (verificado); nativo, sin código |
| Override manual solo Admin/Gerencia — capa UI | Task 6 (flag) + Task 7 (gate del numpad) |
| Override manual solo Admin/Gerencia — capa enforcement | Task 5 (guard en `pos.order.create`, con caso de sync offline) |
| Texto fijo bajo el renglón con todos los tramos + activo | Task 8 |
| Toast al acercarse (`≤ max(3, 20%)`, 1 vez por línea/tramo, no bloqueante, debounce) | Task 9 |
| Datos de tramos offline en el POS | Task 8/9 (usan `product.pricelist.item` ya cargado por el core; verificado en el research) |
| Ventanas `date_start`/`date_end` respetadas en el aviso | Task 8/9 (filtro por fecha en `repartoVolumenTramos`); nativo para el precio |
| Testing Python (defaults, escala, guard ×3 casos, dominio del menú) | Tasks 2, 3, 4, 5, 6 |
| Testing navegador (bloque, toast, botón oculto) | Tasks 7, 8, 9 (pasos de verificación manual) |
| Fuera de alcance documentado | Task 10 Step 3 (subsección de `ESTADO_PROYECTO.md`) |

Sin huecos.

**Placeholder scan:** sin "TBD/TODO/implementar después". Las dos notas de incertidumbre (nombre del campo de plantilla en el modelo POS en Task 8/9; existencia de `_get_eval_context` en Task 4) traen instrucción concreta de qué hacer en cada caso.

**Type consistency:**
- `reparto_volumen_item_ids` — mismo nombre en Task 2 (modelo), Task 2 (vista), Task 4 (dominio de la acción y del test), Task 10 (doc).
- `_reparto_puede_override` — clave del dict en Task 6 (backend), leída en Task 7 (`this.pos.getCashier()?._reparto_puede_override`).
- `repartoVolumenTramos` — getter definido en Task 8, reusado en Task 9 (`this.repartoVolumenTramos`). Task 9 Step 2 reemplaza el archivo completo de Task 8 conservando el getter con el mismo nombre y forma (`{minQty, percent, activo}`).
- `_reparto_check_override_manual` / `_reparto_resolver_cajero` / `_reparto_resolver_pricelist` — definidos y usados solo dentro de `models/pos_order.py` (Task 5).
- `GRUPOS_OVERRIDE` — constante local en `pos_order.py` (Task 5) y en `res_users.py` (Task 6); son módulos distintos, no se importan entre sí, la duplicación es deliberada y mínima.

---

## Desviaciones durante la ejecución (2026-08-31)

Ajustes hechos al ejecutar el plan; todos preservan la intención del spec.

- **Task 2 — `product.list0` no existe en Odoo 19.** El xmlid de la lista "Default" fue removido. Se agregó un helper `product.template._reparto_volumen_pricelist()` que la resuelve por búsqueda `search([('company_id','in',[company,False])], order='id', limit=1)` (misma idiom que `pos_reparto_pricelist`); el `domain` del One2many, `_reparto_volumen_item_defaults` y el `setUpClass` del test lo usan en vez de `env.ref('product.list0')`.
- **Task 2 — restricción de grupo en la vista.** En Odoo 19 `ir.ui.view` renombró `groups_id` → `group_ids`, y además prohíbe el campo de grupos a nivel record en una vista heredada. La restricción quedó como atributo `groups="pos_reparto_security.group_reparto_adminop,pos_reparto_security.group_reparto_gerencia"` en el `<page>`. Efecto idéntico.
- **Task 4 — test del dominio.** Se resolvió con `self.env['ir.actions.act_window']._for_xml_id(...)` + `safe_eval` del `domain`; se descartó la línea tentativa con `_get_eval_context`.
- **Task 5 — tests del guard.** Llaman `_reparto_check_override_manual(vals)` directamente (aísla el guard de la maquinaria de `pos.session`/`pos.order.create`), en vez de crear una orden completa. Los 4 casos (2 bloquean, 2 permiten) quedan igual de cubiertos.
- **Task 6 — helper `_pos_config`.** Se agregó al archivo de tests (no existía).
- **Task 9 — sin reescritura de `orderline.js`.** Todo el toast (incluido el `setup()` con `useEffect` sobre `line.qty`) quedó en `volume_toast.js`, que patchea `Orderline.prototype` en un segundo `patch()`. `orderline.js` (Task 8) quedó intacto con solo el getter `repartoVolumenTramos`. Menos churn, mismo comportamiento.

## Resultado

- 9 tests Python del módulo en verde. Regresión de `pos_reparto_credito` / `pos_reparto_home` / `pos_reparto_security`: 25/25 en verde.
- Comportamiento JS del POS (bloque de tramos, toast, ocultado de botones %/Precio) **pendiente de verificación en navegador** — sin infra de test JS en el proyecto, igual criterio que `pos_reparto_credito`.
- Commits en `feature/pos-reparto-descuentos-volumen`: `3b8e325` (skeleton), `9796f0e` (One2many + pestaña), `ef5c4e0` (test escala), `1897d0a` (menú), `8c9cc77` (guard), `d119a9a` (flag rol), `9384018` (numpad gate JS), `b3a4bda` (bloque de tramos JS), `425e713` (toast JS).
