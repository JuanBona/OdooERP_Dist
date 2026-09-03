# Diseño: módulo `pos_reparto_descuento_volumen` (descuentos por volumen + aviso de próximo tramo)

**Fecha:** 2026-08-31
**Contexto:** Ítem 2 de los gaps del relevamiento v2.0 (`ESTADO_PROYECTO.md` §9), turno del compañero después de cerrar el remito interno (ítem 1). Cubre **RF-PV-09**: "el sistema debe aplicar descuentos automáticos por volumen, parametrizables por producto (por ejemplo 4%/8%/12% según cantidad), y permitir la sobreescritura manual del precio unitario y descuento en el renglón del pedido". El cliente confirmó además: listas de precios base + escala automática por volumen por producto + override manual en la línea, y "validar permisos de quién puede sobreescribir".

Rama: `feature/pos-reparto-descuentos-volumen`.

## Objetivo

1. Que ciertos productos (no todos) tengan una escala de descuento por cantidad, configurable por producto.
2. Que el descuento se aplique **solo** en el POS cuando la cantidad de la línea alcanza cada tramo.
3. Que el vendedor/camionero vea en pantalla, para cada renglón con descuento, **todos los tramos** del producto y cuál está activo — más un aviso (toast) cuando le falta poco para el próximo tramo, para que pueda ofrecérselo al cliente (ej: el cliente pidió 9 y a partir de 10 hay descuento).
4. Que el override manual de precio/descuento en la línea quede restringido a Admin Operativa / Gerencia; el Vendedor no puede.

## Decisiones tomadas en el brainstorming

- **Motor: `product.pricelist` nativo, reglas por cantidad. Sin modelo nuevo.** Los tramos son registros `product.pricelist.item` sobre la lista "Default" (`product.list0`). La escala escalonada por cantidad y por producto es exactamente para lo que sirven las reglas de pricelist; el cálculo de precio nativo ya viaja al frontend del POS y funciona offline, así que no se reimplementa nada de motor de precios.
- **Escala por producto, no global.** La realidad es que algunos productos tendrán descuento y otros no. No hay escala por defecto: cada producto que la necesite carga sus propios tramos.
- **Una sola lista de precios.** Verificado en la base: existe solo "Default" (id 1), usada por los 4 POS, sin listas por cliente. Los tramos van como items de esa lista; no hay problema de "stacking" con listas por cliente.
- **Override manual: solo Admin Operativa / Gerencia (decisión A).** El Vendedor vende al precio de lista + descuento por volumen automático, nada más. Se implementa en dos capas: ocultar los botones en la UI del POS por rol, y un guard en backend que rechaza la orden (incluido el sync offline) si una línea trae override y el cajero no es Admin/Gerencia. El tope de override para Vendedor (decisión B) queda descartado para v1 y documentado como extensión.
- **Aviso de próximo tramo: texto fijo bajo el renglón + toast al acercarse (decisión C).** "Que no haya forma de pasarlo por alto." El texto fijo lista todos los tramos y resalta el activo; el toast salta cuando falta poco para el próximo tramo (`≤ max(3, 20% del umbral)`), una sola vez por (línea, tramo), no bloqueante. Ambos visibles para todos los roles.
- **Carga de tramos: sección en el form del producto + entrada de menú (decisión C).** Se cargan desde el producto; el menú "Descuentos por volumen" lista los productos que tienen tramos, para revisar el panorama. Ambas escriben los mismos `product.pricelist.item`.
- **Addon nuevo y separado** (`pos_reparto_descuento_volumen`), según la convención del proyecto de un módulo por feature grande.

## Arquitectura

Módulo nuevo `pos_reparto_descuento_volumen`. Depende de:

- `point_of_sale` — el terreno de la feature.
- `pos_reparto_security` — grupos de rol (`group_admin_operativa`, `group_gerencia`, `group_vendedor`) para el gate de override y la visibilidad de la pestaña de carga.
- `pos_reparto_pricelist` — ya deja `use_pricelist=True` y la lista "Default" seleccionada + disponible en los 4 `pos.config`, condición necesaria para que el descuento por volumen se aplique en el POS.

No agrega modelos nuevos. Los tramos son `product.pricelist.item` sobre `product.list0` con:

- `applied_on = '1_product'` (por producto / plantilla)
- `min_quantity = N` — umbral del tramo
- `compute_price = 'percentage'`, `percent_price = X` — el % de descuento
- `base = 'list_price'` — el % se calcula sobre el precio de venta del producto

Odoo ordena `product.pricelist.item` por `min_quantity desc` de fábrica (parte de su `_order`), así que con varios tramos del mismo producto, al evaluar una cantidad se aplica el tramo correcto (el de mayor `min_quantity` que la cantidad satisface) sin configurar `sequence`.

```
addons/pos_reparto_descuento_volumen/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   ├── product_template.py     # One2many reparto_volumen_item_ids (tramos del producto)
│   └── pos_order.py            # guard en create: enforcement del override por rol
├── views/
│   ├── product_template_views.xml      # pestaña "Descuentos por volumen" en el form
│   └── descuento_volumen_menu.xml      # acción + menú "Descuentos por volumen"
├── static/src/overrides/
│   ├── orderline.js            # getter de tramos del producto de la línea
│   ├── orderline.xml           # t-inherit: bloque de tramos bajo el renglón
│   ├── volume_toast.js         # effect que dispara el toast al acercarse al tramo
│   └── control_buttons.js      # oculta Desc.% / edición de precio si no es Admin/Gerencia
├── security/                   # (sin ACL nuevo; reusa grupos de pos_reparto_security)
└── tests/
    ├── __init__.py
    └── test_descuento_volumen.py
```

## Componentes

### 1. `product.template` — carga de tramos (`models/product_template.py` + `views/product_template_views.xml`)

Campo nuevo:

```python
reparto_volumen_item_ids = fields.One2many(
    'product.pricelist.item', 'product_tmpl_id',
    string="Descuentos por volumen",
    domain=lambda self: [
        ('pricelist_id', '=', self.env.ref('product.list0').id),
        ('compute_price', '=', 'percentage'),
        ('min_quantity', '>', 0),
    ],
)
```

- **Pestaña en el form del producto** "Descuentos por volumen", visible solo para `pos_reparto_security.group_admin_operativa` y `group_gerencia`. Lista editable inline con columnas **Cantidad mínima** (`min_quantity`) y **% descuento** (`percent_price`), opcionalmente **Desde/Hasta** (`date_start` / `date_end`).
- El `context` del campo fija los defaults para que el usuario solo tipee cantidad y %:
  `{'default_pricelist_id': ref('product.list0'), 'default_applied_on': '1_product', 'default_compute_price': 'percentage', 'default_base': 'list_price'}`.
  El `product_tmpl_id` lo completa el One2many.
- **Menú** "Punto de Venta → Configuración → Descuentos por volumen": `ir.actions.act_window` sobre `product.template`, dominio `[('reparto_volumen_item_ids', '!=', False)]`, abre el form del producto en esa pestaña. Es el panorama "qué productos tienen descuento por volumen".

### 2. Descuento automático en POS

Nada que construir. `pos_reparto_pricelist` ya dejó `use_pricelist=True` + "Default" en los 4 `pos.config`. Cuando el vendedor carga una cantidad `>= min_quantity` de un tramo, el POS recalcula el precio del renglón desde la lista de precios (motor nativo, ya cargado en el frontend y offline-first). Se ve como **precio unitario reducido**, no como valor en la columna "Desc.%" (esa columna queda reservada para el override manual). El texto del aviso (componente 4) muestra el % explícito para que el descuento sea legible.

### 3. Gate de override manual (`static/src/overrides/control_buttons.js` + `models/pos_order.py`)

**Capa UI:** patch a los botones "Desc.%" y de edición de precio unitario del POS para que estén ocultos salvo que el usuario actual esté en `pos_reparto_security.group_admin_operativa` o `group_gerencia`. El Vendedor no ve el botón.

**Capa enforcement (backend):** guard en `pos.order.create` (mismo patrón que `pos_stock_limit`, que hookea `pos.order.create` y lee la configuración dinámicamente). Para cada `pos.order.line`:

- Se calcula el precio esperado con `order.pricelist_id._get_product_price(line.product_id, line.qty, ...)` (o el equivalente vigente en Odoo 19).
- Si `line.discount > 0` **o** `float_compare(line.price_unit, precio_esperado, precision_rounding=order.currency_id.rounding) < 0` (precio por debajo del de lista, con tolerancia de redondeo) **y** `order.user_id` (el cajero) **no** está en `group_admin_operativa` ni `group_gerencia` → `UserError` con mensaje claro ("Solo Administración o Gerencia pueden modificar precio o descuento de una línea").
- El descuento por volumen legítimo **no** dispara el guard: viene como `price_unit` igual al precio que da la lista para esa cantidad, y `discount = 0`.
- Cubre el sync offline: una orden armada sin conexión con override de un Vendedor se rechaza al sincronizar.

### 4. Aviso de próximo tramo en POS (`static/src/overrides/orderline.*` + `volume_toast.js`)

**Datos:** los `product.pricelist.item` ya viajan al frontend del POS para el cálculo nativo de precios, así que los tramos están en memoria del navegador y funcionan offline. La JS los obtiene de `this.pos.models['product.pricelist.item']`, filtra por `product_tmpl_id` del producto de la línea + `compute_price === 'percentage'` + `min_quantity > 0` + ventana de fechas vigente, y ordena por `min_quantity` ascendente. Si en la implementación se detecta que el POS no carga algún campo necesario del item, se agrega vía `_load_pos_data_fields` (fallback chico y localizado).

**Texto fijo bajo el renglón** (`orderline.xml` con `t-inherit` del componente `Orderline` de `point_of_sale`, + getter en `orderline.js` que patchea el componente):

- Solo se renderiza para líneas cuyo producto tiene al menos un tramo.
- Lista **todos** los tramos: `6+ u → 4%  ·  12+ u → 8%  ·  24+ u → 12%`.
- Resalta visualmente el tramo **activo** según `line.qty`. Si ninguno está activo todavía, se muestran en gris con una pista tipo "cargá 6+ para 4%".
- Reactivo: OWL re-renderiza al cambiar `line.qty`.

**Toast al acercarse** (`volume_toast.js`, patch al `setup` del `Orderline` con un `effect` sobre `() => this.props.line.qty`):

- Cuando `0 < proximo_umbral - qty <= max(3, round(0.2 * proximo_umbral))`, dispara `this.env.services.notification.add("Con N u más, este producto tiene X% de descuento", {type: 'info'})`.
- No bloquea. Debounce ~400 ms para no spamear mientras se tipea.
- Se dispara **una sola vez por (línea, tramo)**: se guarda en la línea el último tramo avisado; si la cantidad baja y vuelve a subir hacia ese tramo, vuelve a avisar.
- Solo "hacia arriba" (te falta poco para más descuento). Bajar la cantidad no dispara toast.

El texto fijo y el toast se muestran para **todos los roles** (cualquiera que venda los ve).

## Data flow

1. Admin Operativa / Gerencia carga tramos en la pestaña "Descuentos por volumen" del producto (o los revisa desde el menú) → se crean `product.pricelist.item` en la lista "Default".
2. Arranca la sesión de POS → carga `product.pricelist` + `product.pricelist.item` (nativo) → los tramos quedan en el navegador.
3. El vendedor agrega un producto y ajusta la cantidad:
   - `qty >= min_quantity` de un tramo → el precio del renglón baja solo (pricelist nativo).
   - La JS muestra el bloque de tramos bajo el renglón y resalta el activo.
   - Si `qty` está cerca del próximo umbral → toast informativo.
   - El botón "Desc.%" / edición de precio está oculto (el usuario no es Admin/Gerencia).
4. Cobra y sincroniza → guard en `pos.order.create`: si alguna línea tiene `discount > 0` o `price_unit` por debajo del de lista, y el cajero no es Admin/Gerencia → `UserError`. Una orden armada offline con override se rechaza en ese momento.

## Edge cases

- **Producto sin tramos:** no cambia nada — sin texto, sin toast, sin gate extra.
- **`qty` justo en el umbral:** tramo activo, precio ya reducido, sin toast (ya lo tiene).
- **Bajar `qty` por debajo de un tramo:** el precio vuelve solo (nativo), el resaltado se actualiza, sin toast.
- **Cantidad muy alta:** aplica el tramo más alto (Odoo ordena `min_quantity desc`).
- **El descuento es por cantidad de la LÍNEA, no por el total del producto en la orden.** Es el comportamiento nativo del pricelist. Si el POS parte el producto en dos líneas, cada una evalúa su propia cantidad. El descuento agregado por orden queda fuera de alcance (ver abajo).
- **Falsos positivos del guard por redondeo:** la comparación usa `float_compare` con el redondeo de la moneda como tolerancia. El precio con descuento por volumen coincide exactamente con el de la lista → nunca se marca.
- **Admin/Gerencia en un POS de camión:** el botón está oculto por rol, así que igual no pueden overridear desde ahí. Si necesitan, usan el POS de administración (id 1) o el backend. Limitación conocida de la decisión A.
- **Ventanas de promo (`date_start` / `date_end` en el item):** el motor nativo ya las respeta para el precio; la JS del aviso también filtra por fecha vigente para no mostrar tramos que no aplican hoy.

## Testing

**Python** (`TransactionCase`, con creación de `pos.order`):

- Crear un tramo vía el One2many `reparto_volumen_item_ids` del producto → el item queda con los defaults correctos (`pricelist_id = product.list0`, `applied_on = '1_product'`, `compute_price = 'percentage'`, `base = 'list_price'`).
- Cálculo escalonado: producto con tramos 6 → 4% y 12 → 8%; precio a `qty=5` = pleno, `qty=6` = −4%, `qty=12` = −8%, `qty=100` = −8% (tope).
- Guard: `pos.order.line` con `price_unit` por debajo del de lista y cajero Vendedor → `UserError`; el mismo caso con cajero Gerencia → OK; línea con precio de descuento por volumen (igual al de lista) y cajero Vendedor → OK (no se marca).
- Guard: `discount > 0` y cajero Vendedor → `UserError`.
- Dominio del menú: la acción devuelve solo productos que tienen tramos.

**Navegador (manual, documentado en este spec)** — igual criterio que la verificación del popup de `pos_reparto_credito`:

- El bloque de tramos aparece bajo el renglón y el resaltado del tramo activo cambia al variar la cantidad.
- El toast salta al acercarse al próximo tramo y no se repite para el mismo (línea, tramo).
- El botón "Desc.%" está oculto para un usuario Vendedor y visible para uno Gerencia.

## Fuera de alcance (YAGNI)

- Descuento por cantidad **agregada por orden** (los tramos son por cantidad de línea — comportamiento nativo del pricelist).
- **Tope de override para Vendedor** (decisión B descartada para v1; queda como extensión si el taller de detalle lo pide).
- Mostrar el descuento por volumen en la **columna "Desc.%"** nativa del POS (queda como precio unitario reducido + texto del aviso).
- Descuentos por **categoría** de producto (RF-PV-09 dice "por producto").
- **Escala global** por defecto (decisión B: todo por producto).
- Reporte / auditoría de overrides manuales.
