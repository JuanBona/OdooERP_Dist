# Diseño: pasada de UX del POS — stock visible, responsive, auditoría de intuitividad

**Fecha:** 2026-09-14
**Contexto:** pedido del usuario de cara a la beta ("quiero que sea lo más intuitiva posible", visibilidad de stock por producto, responsive para tablet + desktop). Tres ítems de naturaleza distinta, brainstormeados juntos por compartir tema (UX del POS) pero con ciclos de entrega separados.

## Objetivo

1. Que el vendedor vea, sin salir de la grilla ni del carrito, cuánto stock del camión le queda de cada producto — para poder ofrecer cantidad sin adivinar ni tener que ir a preguntar a Depósito.
2. Que las 5 pantallas custom (no las nativas de Odoo) se vean y usen bien tanto en la tablet de reparto (apaisada) como en la PC de oficina.
3. Tener una lista concreta de fricciones de uso, recorrida en el navegador real como cada uno de los 4 roles, para decidir qué vale la pena pulir antes de la beta.

## Decisiones tomadas en el brainstorming

- **Ubicación del badge de stock: los dos lugares** — tile de la grilla (antes de agregar) y renglón del carrito (después de agregado).
- **Qué número mostrar en el carrito: lo que queda restando lo ya agregado en ESE pedido**, no el stock total fijo del camión — responde directo "hasta cuánto puedo seguir agregando". No sincroniza contra ventas de otras tablets en simultáneo; el bloqueo real de sobreventa al cobrar (`pos_stock_limit`, ya existente) sigue siendo la única fuente de verdad para impedir vender de más.
- **Semáforo de color igual al de Deudores** (gris normal, naranja si queda poco) — mantiene el mismo lenguaje visual que ya conoce el usuario del sistema, en vez de inventar uno nuevo.
- **Tablets en horizontal (apaisada)** — el riesgo real para responsive no es "muy angosto" sino **poca altura** comparado con una PC.
- **Alcance del responsive: las 5 pantallas custom** (Inicio, Viaje del chofer, Deudores, popup de crédito, panel de Comisiones). El POS nativo de Odoo (grilla de productos, pantalla de pago, etc.) ya es responsive de fábrica y queda fuera de alcance.
- **"Intuitiva" sin caso puntual todavía** → en vez de adivinar cambios, se hace un recorrido real en navegador como cada uno de los 4 roles, siguiendo los flujos ya documentados en `MANUAL_USUARIO.md`, y se entrega una lista priorizada de fricciones. **Este ítem no incluye implementar ningún cambio** — es insumo para decidir qué se especifica después.

## Ítem A — Badge de stock disponible

Extiende `pos_stock_limit`, que ya calcula stock por ubicación/camión para el filtro de catálogo (`product_template.py::_load_pos_data_domain`) — se reutiliza esa misma resolución de ubicación, no se duplica lógica.

### Backend

Nuevo método en `product.template` (mismo archivo, `pos_stock_limit/models/product_template.py`), override de `_load_pos_data` (no solo el domain) para inyectar un campo no-persistido en el payload que ya viaja al POS:

```python
@api.model
def _load_pos_data(self, data, config):
    result = super()._load_pos_data(data, config)
    location = config.picking_type_id.default_location_src_id
    if location and location.usage == 'internal':
        products = self.browse(r['id'] for r in result['data']).with_context(location=location.id)
        qty_by_id = {p.id: p.qty_available for p in products}
        for row in result['data']:
            row['reparto_stock_disponible'] = qty_by_id.get(row['id'], 0) if row.get('is_storable') else None
    return result
```

- `reparto_stock_disponible = None` para productos no rastreados (`is_storable=False`) → el frontend no dibuja badge para esos.
- Es una **foto del momento de carga de la sesión** (o del último "Volver a cargar datos → Completo"), igual que ya funciona el resto de la carga inicial del POS — no se sincroniza en vivo entre tablets. Se documenta esta limitación en el badge mismo si hace falta (ver Componentes).

### Frontend

Dos componentes, mismo patrón de patch OWL que ya usa `pos_reparto_descuento_volumen`:

1. **Badge en el tile de la grilla** (`static/src/overrides/product_card.js` + `.xml`, `t-inherit` del `ProductCard` de `point_of_sale`): número chico en una esquina del tile, formato `"45u"`. Oculto si `reparto_stock_disponible` es `None`. Color gris por defecto, naranja si `<= 10` (umbral configurable como constante, no parametrizable por producto — YAGNI, no hay pedido de eso).

2. **Badge en el renglón del carrito** (`static/src/overrides/orderline.js` + `.xml`, mismo componente `Orderline` que ya patchea `pos_reparto_descuento_volumen` — se agrega al bloque existente, no se crea uno paralelo): texto chico bajo el renglón, `"{disponible} disponibles"` donde `disponible = reparto_stock_disponible_del_producto - suma(qty de renglones de ese mismo producto en el pedido actual)`. Reactivo a `line.qty` (mismo mecanismo `effect` que ya usa el toast de tramos). Incluye la sugerencia de arriba en Ítem A del semáforo: naranja si `disponible <= 10`, texto en rojo si `disponible <= 0` (caso borde: se agregó más de lo que había en la foto inicial — informativo, el bloqueo real sigue en el backend al cobrar).

3. Si dos módulos (`pos_stock_limit` y `pos_reparto_descuento_volumen`) terminan pintando bajo el mismo `Orderline`, se ordenan uno debajo del otro sin superponerse — ambos son bloques de texto chico, no hay conflicto de layout esperado, pero se verifica visualmente en el browser al implementar.

### Testing

- Python: test de `_load_pos_data` con 1 producto rastreado + 1 no rastreado, verificar `reparto_stock_disponible` correcto para el rastreado y `None` para el no rastreado, en la ubicación del `pos.config` de prueba.
- Manual en navegador: cargar un producto al carrito, subir/bajar cantidad, verificar que el número del renglón baja/sube en vivo y no toca el número de la grilla (que se mantiene fijo, foto de sesión).

## Ítem B — Pase de responsive (5 pantallas custom)

Pantallas en alcance: `pos_reparto_home` (grilla de Inicio), `pos_reparto_viaje` (pantalla del chofer), `pos_reparto_credito` (popup + pantalla Deudores), `pos_reparto_comision` (panel/pivot de Comisiones). Fuera de alcance: cualquier pantalla nativa de `point_of_sale`/backend de Odoo.

- Se audita y corrige en el mismo paso, pantalla por pantalla — no hay entrega intermedia de "lista de lo roto" para este ítem (a diferencia del Ítem C).
- Viewports de verificación por pantalla: tablet apaisada chica (~800×480), tablet apaisada grande (~1280×800), desktop (~1920×1080).
- Técnica: reemplazar ancho/alto fijo en px por unidades relativas + `flex`/`grid` con `auto-fit`/`minmax` donde aplique (mismo patrón ya usado en `pos_reparto_home/static/src/home_screen.scss`, que ya es responsive por diseño). Prestar atención particular a **altura** disponible (scroll vertical en vez de contenido cortado) dado que la tablet apaisada es más baja que una pantalla de PC.
- `pos_reparto_home` probablemente no necesita cambios (ya usa `grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`) — se verifica en los 3 viewports igual, por si hay algún elemento suelto (header, footer) sin el mismo tratamiento.

### Testing

Manual: cada una de las 5 pantallas, en los 3 viewports de arriba, con datos reales cargados — sin scroll horizontal, sin contenido cortado, botones/texto legibles sin zoom.

## Ítem C — Auditoría de intuitividad (recorrido por rol)

**No es un ítem de código.** Entregable: documento con hallazgos priorizados, sin implementar nada todavía.

- Método: recorrer la app en el navegador real (`claude-in-chrome`), logueado como cada uno de los 4 roles (`vendedor@reparto.local`, `deposito@reparto.local`, `adminop@reparto.local`, `gerencia@reparto.local`), siguiendo los flujos que ya están documentados en `MANUAL_USUARIO.md` para cada rol.
- Se anota: etiquetas/textos confusos, pasos de más, comportamientos inconsistentes entre pantallas, cosas que no tienen feedback visual claro (¿el usuario sabe que la acción funcionó?), términos que no coinciden entre el sistema y como habla el cliente.
- Salida: lista priorizada (alto/medio/bajo impacto), cada ítem con pantalla + qué se ve/qué se esperaría en su lugar — no con la solución ya decidida, eso se brainstormea aparte si el usuario decide tomar el ítem.
- No se toca código ni configuración de la base durante este recorrido (salvo login/logout entre roles).

## Fuera de alcance (los 3 ítems)

- Sincronización de stock en tiempo real entre tablets (ya identificado y pospuesto antes, ver memoria `pos_stock_limit_realtime_idea`) — el badge de este spec es informativo con foto de sesión, no resuelve ese caso.
- Cualquier cambio de diseño visual/branding más allá de lo que ya existe (`pos_reparto_branding`).
- Implementación de los hallazgos del Ítem C — quedan para specs futuros según lo que el usuario decida priorizar.
