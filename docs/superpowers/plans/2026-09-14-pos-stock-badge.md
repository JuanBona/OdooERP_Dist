# Badge de Stock Disponible en POS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar, en cada tile de la grilla del POS y en cada renglón del carrito, cuánto stock del camión queda disponible de ese producto — para que el vendedor sepa hasta cuánto puede ofrecer sin preguntarle a Depósito.

**Architecture:** Extiende el módulo existente `pos_stock_limit` (ya resuelve "ubicación del camión de este POS" para el filtro de catálogo). Backend: un campo computado no-almacenado en `product.template` que lee `qty_available` con el contexto de ubicación del `pos.config`, expuesto en la carga inicial del POS. Frontend: dos patches OWL (grilla y carrito), mismo patrón ya usado en `pos_reparto_descuento_volumen`.

**Tech Stack:** Odoo 19 (Python ORM + OWL 2 / QWeb), mismo patrón de patch que los módulos `pos_reparto_*` existentes.

---

Referencia del spec: `docs/superpowers/specs/2026-09-14-pos-ux-pass-design.md`, Ítem A.

### Task 1: Campo `reparto_stock_disponible` en `product.template`

**Files:**
- Modify: `addons/pos_stock_limit/models/product_template.py`
- Test: `addons/pos_stock_limit/tests/test_product_stock_display.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `addons/pos_stock_limit/tests/test_product_stock_display.py`:

```python
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestProductStockDisplay(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pricelist = cls.env['product.pricelist'].search([
            ('company_id', 'in', [cls.env.company.id, False]),
            ('currency_id', '=', cls.env.company.currency_id.id),
        ], limit=1)
        cls.warehouse = cls.env.ref('stock.warehouse0')

        cls.camion_1_location = cls.env['stock.location'].create({
            'name': 'Test Camion 1 Location Badge',
            'location_id': cls.warehouse.lot_stock_id.id,
            'usage': 'internal',
        })
        cls.camion_1_picking_type = cls.env['stock.picking.type'].create({
            'name': 'Test Carga Camion 1 Badge',
            'code': 'outgoing',
            'sequence_code': 'TCB1',
            'warehouse_id': cls.warehouse.id,
            'default_location_src_id': cls.camion_1_location.id,
            'default_location_dest_id': cls.env.ref('stock.stock_location_customers').id,
        })
        cls.camion_1 = cls.env['pos.config'].create({
            'name': 'Test Camion 1 POS Badge',
            'picking_type_id': cls.camion_1_picking_type.id,
            'pricelist_id': cls.pricelist.id,
            'available_pricelist_ids': [(6, 0, cls.pricelist.ids)],
        })

        cls.camion_2_location = cls.env['stock.location'].create({
            'name': 'Test Camion 2 Location Badge',
            'location_id': cls.warehouse.lot_stock_id.id,
            'usage': 'internal',
        })
        cls.camion_2_picking_type = cls.env['stock.picking.type'].create({
            'name': 'Test Carga Camion 2 Badge',
            'code': 'outgoing',
            'sequence_code': 'TCB2',
            'warehouse_id': cls.warehouse.id,
            'default_location_src_id': cls.camion_2_location.id,
            'default_location_dest_id': cls.env.ref('stock.stock_location_customers').id,
        })
        cls.camion_2 = cls.env['pos.config'].create({
            'name': 'Test Camion 2 POS Badge',
            'picking_type_id': cls.camion_2_picking_type.id,
            'pricelist_id': cls.pricelist.id,
            'available_pricelist_ids': [(6, 0, cls.pricelist.ids)],
        })

        cls.producto = cls.env['product.product'].create({
            'name': 'Test Producto Badge',
            'is_storable': True,
            'available_in_pos': True,
        })
        cls.env['stock.quant']._update_available_quantity(
            cls.producto, cls.camion_1_location, 45,
        )

        cls.producto_servicio = cls.env['product.product'].create({
            'name': 'Test Servicio Badge',
            'is_storable': False,
            'available_in_pos': True,
        })

    def _leer(self, product_tmpl, config):
        records = self.env['product.template'].browse(product_tmpl.id)
        return self.env['product.template']._load_pos_data_read(records, config)[0]

    def test_campo_viaja_en_load_pos_data_fields(self):
        fields = self.env['product.template']._load_pos_data_fields(self.camion_1)
        self.assertIn('reparto_stock_disponible', fields)

    def test_stock_disponible_refleja_la_ubicacion_del_camion(self):
        self.assertEqual(
            self._leer(self.producto.product_tmpl_id, self.camion_1)['reparto_stock_disponible'], 45,
        )

    def test_stock_disponible_es_cero_en_otro_camion_sin_esas_unidades(self):
        self.assertEqual(
            self._leer(self.producto.product_tmpl_id, self.camion_2)['reparto_stock_disponible'], 0,
        )

    def test_producto_no_rastreado_es_cero(self):
        self.assertEqual(
            self._leer(self.producto_servicio.product_tmpl_id, self.camion_1)['reparto_stock_disponible'], 0,
        )
```

- [ ] **Step 2: Crear `__init__.py` de tests si hace falta**

Verificar que `addons/pos_stock_limit/tests/__init__.py` ya importa los módulos de test existentes; agregar la línea nueva:

```python
from . import test_product_defaults
from . import test_product_stock_filter
from . import test_product_stock_display
```

- [ ] **Step 3: Correr el test y verificar que falla**

Con el contenedor `db` arriba y el servicio `odoo` **detenido** (libera el puerto 8069 — ver nota de la sesión: `docker compose stop odoo` antes, `docker compose start odoo` después de terminar el módulo):

```bash
docker compose stop odoo
docker compose run --rm --no-deps -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http --test-enable --stop-after-init -u pos_stock_limit --test-tags TestProductStockDisplay --log-level=test
```

Esperado: `ERROR` en `test_campo_viaja_en_load_pos_data_fields` (el campo no existe todavía) y en los demás tests de esta clase.

- [ ] **Step 4: Implementar el campo y los overrides**

Reemplazar el contenido completo de `addons/pos_stock_limit/models/product_template.py`:

```python
from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    reparto_stock_disponible = fields.Float(
        string="Stock disponible (camión)",
        compute='_compute_reparto_stock_disponible',
        help="Foto de qty_available en la ubicación de origen del POS que "
             "está cargando los datos — se recalcula con el contexto de "
             "ubicación que setea _load_pos_data_read de este módulo.",
    )

    def _compute_reparto_stock_disponible(self):
        for product in self:
            product.reparto_stock_disponible = product.qty_available if product.is_storable else 0.0

    @api.model
    def _load_pos_data_domain(self, data, config):
        # Esto es lo que arma la grilla real del POS (product.product tiene
        # su propio _load_pos_data_domain pero ese solo resuelve variantes
        # de los templates que ya pasaron este filtro - filtrar ahi solo no
        # alcanza, la grilla se sigue armando con el catalogo completo).
        #
        # El bloqueo de sobreventa (pos_order.py) ya evita cobrar mas de lo
        # que hay en el camion, pero eso solo avisa recien al pagar. Ademas
        # hay que evitar que el vendedor vea/toque en la grilla productos que
        # ese camion puntual ni siquiera tiene cargados - misma ubicacion de
        # origen que usa el bloqueo (picking_type_id.default_location_src_id).
        domain = super()._load_pos_data_domain(data, config)
        location = config.picking_type_id.default_location_src_id
        if not location or location.usage != 'internal':
            return domain
        in_stock = self.env['product.template'].sudo().with_context(location=location.id).search([
            ('available_in_pos', '=', True),
            '|', ('is_storable', '=', False), ('qty_available', '>', 0),
        ])
        return domain + [('id', 'in', in_stock.ids)]

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)
        return fields_list + ['reparto_stock_disponible']

    @api.model
    def _load_pos_data_read(self, records, config):
        # Mismo criterio de ubicación que _load_pos_data_domain: sin esto,
        # reparto_stock_disponible se computaria con qty_available sin
        # contexto de ubicacion (suma todas las ubicaciones, no solo el
        # camion de esta sesion de POS).
        location = config.picking_type_id.default_location_src_id
        if location and location.usage == 'internal':
            records = records.with_context(location=location.id)
        return super()._load_pos_data_read(records, config)
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
docker compose run --rm --no-deps -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http --test-enable --stop-after-init -u pos_stock_limit --test-tags TestProductStockDisplay --log-level=test
```

Esperado: `0 failed, 0 error(s)`, 4 tests corridos.

- [ ] **Step 6: Levantar el servicio real de nuevo**

```bash
docker compose start odoo
```

- [ ] **Step 7: Commit**

```bash
git add addons/pos_stock_limit/models/product_template.py addons/pos_stock_limit/tests/test_product_stock_display.py addons/pos_stock_limit/tests/__init__.py
git commit -m "feat(pos_stock_limit): campo reparto_stock_disponible en la carga del POS"
```

**Nota post-implementación (revisión de código, commits `fc93f07` y `34c46eb`):** el campo necesitó `@api.depends('qty_available', 'is_storable')` + `@api.depends_context('location')` (faltaban en la Step 4 de arriba) y, además, un `records.invalidate_recordset(['qty_available'])` explícito en `_load_pos_data_read` — el `_compute_quantities` de Odoo core que calcula `qty_available` solo declara `@api.depends_context('warehouse_id')`, no `'location'`, así que dos camiones del mismo depósito comparten cache de `qty_available` dentro de la misma transacción sin el invalidate manual. Se agregó un 5º test (`test_cache_no_se_reutiliza_entre_camiones_en_la_misma_transaccion`) que reproduce el bug y lo cubre. Detalle completo en el diff de esos dos commits, no repetido acá.

---

### Task 2: Badge en la grilla del catálogo

**Files:**
- Modify: `addons/pos_stock_limit/__manifest__.py`
- Create: `addons/pos_stock_limit/static/src/overrides/product_card.js`
- Create: `addons/pos_stock_limit/static/src/overrides/product_card.xml`

- [ ] **Step 1: Declarar el bundle de assets del POS en el manifest**

En `addons/pos_stock_limit/__manifest__.py`, agregar la clave `assets` (el resto del archivo queda igual):

```python
{
    'name': 'POS Stock Limit',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Blocks POS orders that request more quantity than is available at the order source location',
    'depends': ['point_of_sale', 'stock'],
    'data': [
        'data/product_defaults.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_stock_limit/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 2: Crear el patch de `ProductCard`**

Crear `addons/pos_stock_limit/static/src/overrides/product_card.js`:

```javascript
import { patch } from "@web/core/utils/patch";
import { ProductCard } from "@point_of_sale/app/components/product_card/product_card";

const UMBRAL_STOCK_BAJO = 10;

/**
 * Badge chico con el stock disponible del camión en cada tile de la
 * grilla — foto de la sesión (ver pos_stock_limit/models/product_template.py
 * ::_load_pos_data_read), no se sincroniza en vivo entre tablets. Solo
 * para productos con seguimiento de inventario (is_storable).
 */
patch(ProductCard.prototype, {
    get repartoMostrarStock() {
        return Boolean(this.props.product.is_storable);
    },
    get repartoStockDisponible() {
        return this.props.product.reparto_stock_disponible ?? 0;
    },
    get repartoStockClass() {
        return this.repartoStockDisponible <= UMBRAL_STOCK_BAJO ? "text-bg-warning" : "text-bg-secondary";
    },
});
```

- [ ] **Step 3: Crear el template inherit**

Crear `addons/pos_stock_limit/static/src/overrides/product_card.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">
    <t t-name="pos_stock_limit.ProductCardStock"
       t-inherit="point_of_sale.ProductCard" t-inherit-mode="extension">
        <xpath expr="//t[@t-slot='quantityButtons']" position="before">
            <span t-if="repartoMostrarStock"
                  t-attf-class="reparto-stock-disponible position-absolute top-0 start-0 m-1 px-2 rounded fs-6 {{ repartoStockClass }}">
                <t t-esc="repartoStockDisponible"/>u
            </span>
        </xpath>
    </t>
</templates>
```

(`t-slot="quantityButtons"` es un nodo único y estable del `ProductCard` nativo — mismo criterio de anclaje que ya usa `pos_reparto_descuento_volumen` con `t-slot="default"` en `Orderline`. El `<article>` raíz del card ya tiene `position-relative`, así que el badge se posiciona respecto al card, no a la página.)

- [ ] **Step 4: Actualizar el módulo y verificar que no hay errores**

```bash
docker compose stop odoo
docker compose run --rm --no-deps -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http --stop-after-init -u pos_stock_limit
docker compose start odoo
```

Esperado: sin tracebacks en la salida. Revisar en particular que no haya error de parseo del XML (`assert_valid_codeowners`/`ParseError` si el xpath no matchea).

- [ ] **Step 5: Verificar visualmente en el navegador**

Abrir una sesión de "POS Camion 1" logueado como `vendedor@reparto.local`, confirmar que los productos con stock rastreado muestran el número en la esquina superior izquierda del tile, en naranja si es ≤10 y gris si es mayor. Productos no rastreados no muestran nada.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_stock_limit/__manifest__.py addons/pos_stock_limit/static/src/overrides/product_card.js addons/pos_stock_limit/static/src/overrides/product_card.xml
git commit -m "feat(pos_stock_limit): badge de stock disponible en la grilla del POS"
```

---

### Task 3: Badge en el renglón del carrito

**Files:**
- Create: `addons/pos_stock_limit/static/src/overrides/orderline.js`
- Create: `addons/pos_stock_limit/static/src/overrides/orderline.xml`

- [ ] **Step 1: Crear el patch de `Orderline`**

Crear `addons/pos_stock_limit/static/src/overrides/orderline.js`:

```javascript
import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";

const UMBRAL_STOCK_BAJO = 10;

/**
 * Cuánto queda del stock del camión (foto de la sesión, ver
 * pos_stock_limit/models/product_template.py) después de restar lo que ya
 * está cargado de este mismo producto en el pedido actual. Puramente
 * informativo — el bloqueo real de sobreventa sigue siendo el guard de
 * pos_order.py al cobrar, esto no lo reemplaza.
 */
patch(Orderline.prototype, {
    get repartoStockRestante() {
        const line = this.props.line;
        const template = line.product_id?.product_tmpl_id;
        if (!template?.is_storable) {
            return null;
        }
        const tmplId = template.id;
        const enElPedido = (line.order_id?.lines || [])
            .filter((l) => l.product_id?.product_tmpl_id?.id === tmplId)
            .reduce((sum, l) => sum + (l.qty || 0), 0);
        return (template.reparto_stock_disponible ?? 0) - enElPedido;
    },
    get repartoStockRestanteClass() {
        const restante = this.repartoStockRestante;
        if (restante === null) {
            return "";
        }
        if (restante <= 0) {
            return "text-danger fw-bolder";
        }
        return restante <= UMBRAL_STOCK_BAJO ? "text-warning" : "text-muted";
    },
});
```

- [ ] **Step 2: Crear el template inherit**

Crear `addons/pos_stock_limit/static/src/overrides/orderline.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<templates id="template" xml:space="preserve">
    <t t-name="pos_stock_limit.OrderlineStock"
       t-inherit="point_of_sale.Orderline" t-inherit-mode="extension">
        <xpath expr="//t[@t-slot='default']" position="before">
            <li t-if="repartoStockRestante !== null" class="price-per-unit reparto-stock-restante">
                <i class="fa fa-truck pe-1"/>
                <span t-attf-class="{{ repartoStockRestanteClass }}">
                    <t t-esc="repartoStockRestante"/> disponibles
                </span>
            </li>
        </xpath>
    </t>
</templates>
```

(Mismo punto de anclaje que usa `pos_reparto_descuento_volumen` en su propio `orderline.xml` — los dos módulos inheritan el mismo template de forma independiente, Odoo aplica ambos patches en cadena sin conflicto. El orden vertical entre los dos bloques puede variar según orden de carga de módulos; se verifica en el paso siguiente que no se superponen.)

- [ ] **Step 3: Actualizar el módulo**

```bash
docker compose stop odoo
docker compose run --rm --no-deps -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http --stop-after-init -u pos_stock_limit
docker compose start odoo
```

Esperado: sin tracebacks.

- [ ] **Step 4: Verificar visualmente en el navegador**

En la misma sesión de POS Camión 1, agregar al carrito un producto con stock (ej. 45 disponibles) y otro con descuento por volumen configurado (para confirmar que los dos bloques de texto conviven sin superponerse). Subir/bajar la cantidad y verificar que el número de "disponibles" baja/sube en vivo, se pone naranja al acercarse al umbral y rojo si se pasa. Confirmar que el número de la **grilla** (Task 2) no cambia al mover la cantidad del carrito — es la foto fija de la sesión, solo el renglón del carrito resta en vivo.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_stock_limit/static/src/overrides/orderline.js addons/pos_stock_limit/static/src/overrides/orderline.xml
git commit -m "feat(pos_stock_limit): badge de stock restante en el renglón del carrito"
```

---

### Task 4: Documentación

**Files:**
- Modify: `ESTADO_PROYECTO.md:94` (sección "## 5. Módulo custom: `pos_stock_limit`", bullet de "Limitación conocida")
- Modify: `MANUAL_USUARIO.md:302` (sección "## 10. Control de stock por camión")

- [ ] **Step 1: Actualizar `ESTADO_PROYECTO.md`**

En la sección `## 5. Módulo custom: pos_stock_limit`, después del bullet "Limitación conocida (a propósito, YAGNI): valida al cobrar/cerrar la orden, no en tiempo real mientras se arma el carrito en pantalla.", agregar:

```markdown

Además, desde el 2026-09-14: cada tile de la grilla y cada renglón del carrito muestran un badge chico con el stock disponible del camión — foto de la sesión (no se sincroniza en vivo entre tablets), naranja si queda poco (≤10u). El renglón del carrito resta en vivo lo que ya se cargó de ese producto en el pedido actual. Puramente informativo, no reemplaza el bloqueo real al cobrar (arriba).
```

- [ ] **Step 2: Actualizar `MANUAL_USUARIO.md`**

En la sección `## 10. Control de stock por camión`, agregar un bullet nuevo después de "El mensaje de error indica exactamente qué producto, cuánto se pidió y cuánto hay disponible.":

```markdown
- Para no tener que llegar a cobrar para enterarse: cada producto de la grilla muestra un numerito chico con el stock del camión (ej. "45u"), y al agregarlo al carrito el número baja en vivo mostrando cuánto queda según lo que ya cargaste en ese pedido. Se pone naranja cuando queda poco. Es una foto del momento en que se abrió la sesión de POS — si otra tablet vendió el mismo producto mientras tanto, no se actualiza solo (para eso está el bloqueo real al cobrar, que sí es exacto).
```

- [ ] **Step 3: Commit**

```bash
git add ESTADO_PROYECTO.md MANUAL_USUARIO.md
git commit -m "docs: documentar el badge de stock disponible en catálogo y carrito"
```

---

### Task 5: Regresión completa

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Correr toda la suite de módulos custom**

```bash
docker compose stop odoo
docker compose run --rm --no-deps -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http --test-enable --stop-after-init -u pos_reparto_security,pos_reparto_credito,pos_reparto_branding,pos_reparto_home,pos_reparto_remito,pos_reparto_viaje,pos_reparto_descuento_volumen,pos_reparto_comision,pos_stock_limit,pos_reparto_pricelist --log-level=test
```

Esperado: `0 failed, 0 error(s)` en el total (95 tests: los 91 previos + 4 nuevos de este plan).

- [ ] **Step 2: Levantar el servicio real**

```bash
docker compose start odoo
```

- [ ] **Step 3: Redumpear `backup.sql` y commitear**

```bash
docker compose exec -T db pg_dump -U odoo odoo > backup.sql
git add backup.sql
git commit -m "data: redumpear backup.sql con el badge de stock instalado"
```
