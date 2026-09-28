# Diseño: módulo `pos_reparto_despacho` (Listado de despacho, RF-A03)

**Fecha:** 2026-09-28
**Contexto:** Fase 6 del roadmap acordado el 2026-09-26 (ver `2026-09-26-pos-reparto-caja-design.md`). Fases 1-5 ya hechas.

## Objetivo

Depósito/Administración genera, por fecha, un **listado de despacho** con todo lo vendido por los camiones que todavía no salió del depósito. Al **confirmar e imprimir** el listado, el stock se descuenta de forma definitiva, **una sola vez**. Si después entra un pedido del mismo día, sale en un listado **complementario**.

## Decisiones tomadas

- **El stock se descuenta solo al confirmar el despacho** (respuesta del cliente 2026-09-28). Hoy los 3 camiones (`ship_later = False`) validan el picking al vender; eso cambia.
- **Reserva al vender, descuento al despachar.** El picking sigue creándose al vender (stock comprometido, RF-DL-03 del ADR-001) pero no se valida: queda `assigned`. Se descartó "no crear picking hasta el despacho" porque perdería la reserva y permitiría sobreventa entre vendedores.
- **Por fecha y por camión a la vez.** El listado es de una fecha, y se presenta agrupado **por camión** = el POS de camión (`pos.config`) con el que se tomó el pedido, y **por cliente**.
- **Selección de pedidos:** los pedidos con fecha de salida **hasta** la del listado (`<=`, para no dejar huérfano un pedido atrasado) con al menos un picking pendiente (`confirmed`/`waiting`/`assigned`) y sin despacho asignado. Incluye también los `ship_later` de "Punto de Venta Reparto" (fecha = `shipping_date` si existe, si no `date_order`).
- **Se confirma desde la pantalla de despacho** (botón), no automático al cerrar sesión de POS.

## Arquitectura

```
addons/pos_reparto_despacho/
├── __manifest__.py       depende de point_of_sale, stock, pos_reparto_security, pos_stock_limit
├── models/
│   ├── pos_config.py     campo reparto_despacho_diferido (bool)
│   ├── stock_picking.py  override _create_picking_from_pos_order_lines: si la config es diferida,
│   │                     confirmar+reservar en vez de _action_done()
│   ├── pos_order.py      despacho_id (M2O reparto.despacho, copy=False)
│   └── despacho.py       reparto.despacho
├── controllers/xlsx.py   descarga Excel (con chequeo de grupo)
├── report/               QWeb PDF: sección "Por camión" + sección "Por cliente"
├── security/             ACL + reglas
├── views/                form/list del despacho + menú
├── data/                 secuencia DESP/%(year)s/
└── tests/
```

### `reparto.despacho`
`name` (secuencia), `fecha`, `state` (`borrador` → `confirmado`), `pedido_ids` (One2many inverso de `pos.order.despacho_id`), `es_complementario` (hay otro despacho confirmado de la misma fecha), `confirmado_por`, `confirmado_el`.

- **Crear** con `fecha`: en borrador carga los pedidos candidatos (selección de arriba).
- **`action_confirmar()`**: bloqueo de fila (`SELECT … FOR UPDATE`, patrón de `pos_reparto_remito`); si ya está confirmado, no hace nada; valida los pickings de sus pedidos, asigna `despacho_id`, pasa a `confirmado` y devuelve la acción de imprimir el PDF. Todo en una transacción: si un picking falla, no queda nada a medias.
- **Reimprimir** un despacho confirmado no toca stock.
- **Complementario:** el siguiente despacho de la misma fecha toma solo pedidos con `despacho_id` vacío, y queda rotulado "Complementario".

### Listado (PDF y Excel, mismo contenido)
1. **Por camión:** para cada POS de camión, productos y cantidades totales; muestra el chofer del `reparto.viaje` de esa fecha y ese camión si existe.
2. **Por cliente:** cada cliente con sus productos, cantidades y el camión donde se tomó el pedido.
El Excel se arma con `xlsxwriter` (ya incluido en Odoo) y se baja por un controller que exige pertenecer a Depósito/AdminOp/Gerencia.

### Impacto en `pos_stock_limit`
El bloqueo al cobrar compara contra `qty_available` (stock físico), que no descuenta lo comprometido por pedidos aún no despachados (las cantidades de los movimientos de POS no reservan stock). Pasa a restarle el **stock comprometido**: la suma de los movimientos pendientes de pedidos POS que salen de la ubicación (`product.product._reparto_comprometido`). Sin este cambio, dos vendedores podrían vender la misma unidad. El badge de stock del POS (`reparto_stock_disponible`) se actualiza igual.

### Seguridad
Depósito, Administración Operativa y Gerencia: crear/confirmar/imprimir. Vendedor: sin acceso. Menú bajo **Inventario → Operaciones** (Depósito no tiene la app de Punto de Venta).

## Tests
- Confirmar descuenta el stock una sola vez (doble confirmación no duplica).
- Complementario: un pedido posterior sale solo en el segundo listado.
- Consolidados por camión y por cliente con totales correctos.
- Un pedido `ship_later` entra en el listado.
- `pos_stock_limit` bloquea con stock reservado por pedidos pendientes.
- Un Vendedor no puede leer ni confirmar despachos.

## Riesgos / fuera de alcance
- **Contabilidad de cierre de sesión:** Odoo espera pickings hechos al cerrar la sesión. Con despacho diferido el costo (COGS) se registra al validar en el despacho, no al cerrar caja. Se verifica al implementar; si rompe el cierre, se revisa el enfoque.
- Devoluciones antes del despacho: se usa el flujo nativo de Odoo (cancela el picking); sin lógica propia.
- Se deja fuera: secuenciación de ruta (Google Maps, otro ítem), picking con checklist por producto, exportación de la Cuenta Corriente (fase 3 la dejó para acá pero no es parte de RF-A03 tal como se pidió).
