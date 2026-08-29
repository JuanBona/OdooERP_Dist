# Spec: pos_reparto_remito — Remito interno por venta de camión

**Fecha:** 2026-08-29  
**Autor:** Franco (compañero de equipo)  
**Estado:** Aprobado — listo para implementar  
**Feature del relevamiento:** RF-DL-02 (hoja de pedido/remito interno, sin valor fiscal)  
**ADR de referencia:** ADR-001 punto 4

---

## 1. Contexto y objetivo

Los camiones de reparto realizan ventas ambulantes registradas en POS (módulo `POS Camión 1` y futuros). Al cobrar cada venta, el cliente debe recibir un remito interno (sin valor fiscal) que certifique la entrega de la mercadería.

El remito debe:
- Generarse automáticamente al confirmar el cobro
- Quedar guardado como PDF adjunto al pedido en Odoo (para trazabilidad y reenvío posterior)
- Enviarse por email al cliente si tiene dirección registrada
- Funcionar para cualquier camión actual y futuro sin configuración extra

Facturación fiscal queda 100% fuera de alcance (ver ADR-001 y relevamiento v2.0 §2.3).

---

## 2. Arquitectura

**Módulo nuevo:** `pos_reparto_remito`  
**Depende de:** `point_of_sale`, `pos_reparto_security`  
**Sin JS:** todo server-side, sin parches de cliente POS.

### Flujo

```
Camionero cobra en POS (tablet)
    ↓
POS sincroniza con el servidor (con o sin delay por offline)
    ↓
pos.order._process_order() — override en pos_reparto_remito:
    1. Asigna número correlativo (ir.sequence) → pos.order.remito_number
    2. Renderiza plantilla QWeb → bytes PDF
    3. Crea ir.attachment adjunto al pos.order
    4. Si partner.email → crea y envía mail.mail con PDF adjunto
    (fallo de email: se loguea, no rollbackea la orden)
```

**Decisión de diseño — offline:** el remito se genera en el servidor cuando el pedido sincroniza, no en el momento exacto del cobro en la tablet. Si el camionero estaba offline, el remito llega con el delay de la reconexión. Esto es aceptable dado que el requisito offline del ADR-001 tiene prioridad sobre inmediatez del remito.

**Aplica a todos los POS config** (Camión 1, futuros camiones) sin configuración por camión.

---

## 3. Modelo de datos

### Campo nuevo en `pos.order`

```python
remito_number = fields.Char(string="Nº Remito", readonly=True, copy=False)
```

### Secuencia

Una `ir.sequence` global para todos los camiones:
- Código: `pos.remito.reparto`
- Formato: `R-%(year)s-%(seq)05d` → ej. `R-2026-00001`
- Número único por empresa (no por camión — el camión se identifica dentro del contenido del remito)

### Adjunto

El PDF se guarda como `ir.attachment` estándar:
- `res_model = 'pos.order'`
- `res_id = order.id`
- `name = 'Remito-R-2026-00001.pdf'`

No se agrega campo extra en `pos.order`. El botón nativo "Adjuntos" del backend lo muestra automáticamente.

### Idempotencia

El override verifica `if not order.remito_number` antes de generar. Si `_process_order` se llama dos veces (retry de sync), no se genera un segundo remito ni se sobreescribe el número.

---

## 4. Contenido del remito (QWeb)

Layout A4, una página, en español.

### Estructura

```
┌─────────────────────────────────────────────────┐
│  [LOGO]   RINCON DEL SUR                        │
│           CUIT: XX-XXXXXXXX-X                   │
│           Dirección · Localidad                 │
│                              Nº R-2026-00001    │
│                              Fecha: 29/08/2026  │
│                              Hora:  14:35       │
├─────────────────────────────────────────────────┤
│  CLIENTE                    VENDEDOR            │
│  Nombre cliente             Juan Pérez          │
│  CUIT/DNI: XX-XXX-X         Camión: POS Camión 1│
│  Dirección cliente                              │
├─────────────────────────────────────────────────┤
│  Producto          Cant.   P.Unit.   Subtotal   │
│  ─────────────────────────────────────────────  │
│  Coca-Cola 2.25L     4    $1.850,00  $7.400,00  │
│  Quilmes x12         2    $8.400,00 $16.800,00  │
│  ─────────────────────────────────────────────  │
│                            TOTAL:  $24.200,00   │
├─────────────────────────────────────────────────┤
│  Condición de pago: Cuenta Corriente            │
└─────────────────────────────────────────────────┘
```

### Mapeo de campos

| Campo remito | Fuente Odoo |
|---|---|
| Logo | `res.company.logo` |
| Nombre empresa | `res.company.name` |
| CUIT empresa | `res.company.vat` |
| Dirección empresa | `res.company.street` + `res.company.city` |
| Nº remito | `pos.order.remito_number` |
| Fecha | `pos.order.date_order` (date) |
| Hora | `pos.order.date_order` (time) |
| Cliente nombre | `pos.order.partner_id.name` |
| Cliente CUIT/DNI | `partner.vat` con label `partner.l10n_latam_identification_type_id.name` |
| Dirección cliente | `partner.street` + `partner.city` |
| Vendedor | `pos.order.user_id.name` |
| Camión | `pos.order.config_id.name` |
| Líneas detalle | `pos.order.lines` → `product_id.name`, `qty`, `price_unit`, `price_subtotal` |
| Total | `pos.order.amount_total` |
| Condición de pago | `pos.order.payment_ids[0].payment_method_id.name` (primer método; si hay varios, se listan todos separados por coma) |

**Pedido sin partner:** si `partner_id` es False (venta anónima), la sección Cliente muestra "Consumidor Final" y no se intenta enviar email.

---

## 5. Email

**Condición de envío:** `order.partner_id` existe y `order.partner_id.email` no está vacío.

| Campo | Valor |
|---|---|
| From | Servidor SMTP saliente configurado en Odoo |
| To | `partner.email` |
| Subject | `Remito {remito_number} — {company.name}` |
| Body | "Estimado/a {partner.name}, adjunto encontrará su remito de compra del {fecha}. Ante cualquier consulta no dude en comunicarse con nosotros." |
| Adjunto | PDF del remito |

**Implementación:** `mail.mail.create({...}).send()` — sin chatter, sin notificaciones internas en Odoo.

**Fallo de envío:** se captura la excepción, se loguea con `_logger.warning()`, la orden y el adjunto no se ven afectados. El mail puede reenviarse manualmente desde el backend adjuntando el PDF existente.

---

## 6. Testing

Archivo: `addons/pos_reparto_remito/tests/test_reparto_remito.py`

| Test | Verifica |
|---|---|
| `test_remito_generado_al_confirmar` | `pos.order` con `state='done'` → `remito_number` asignado + `ir.attachment` creado |
| `test_remito_idempotente` | Llamar `_process_order` dos veces → mismo `remito_number`, un solo adjunto |
| `test_secuencia_correlativa` | Dos pedidos → `R-2026-00001` y `R-2026-00002` en orden |
| `test_email_enviado_con_mail` | Partner con email → se crea `mail.mail` con PDF adjunto |
| `test_sin_email_no_falla` | Partner sin email → no hay error, adjunto igual se crea |
| `test_sin_partner_no_falla` | `partner_id=False` → no hay error, remito generado con "Consumidor Final" |

Verificación manual (no automatizable): abrir PDF y confirmar logo, CUIT, líneas y total legibles; confirmar que email llega con adjunto a casilla real.

---

## 7. Estructura del módulo

```
addons/pos_reparto_remito/
├── __manifest__.py
├── __init__.py
├── models/
│   ├── __init__.py
│   └── pos_order.py          # campo remito_number + override _process_order
├── data/
│   └── remito_sequence.xml   # ir.sequence para numeración
├── report/
│   ├── remito_report.xml     # ir.actions.report
│   └── remito_template.xml   # plantilla QWeb A4
└── tests/
    ├── __init__.py
    └── test_reparto_remito.py
```

---

## 8. Fuera de alcance (YAGNI)

- Botón "Ver remito" en pantalla de POS (puede agregarse después si el cliente lo pide)
- Envío por WhatsApp automático (requiere WhatsApp Business API — el camionero descarga y manda manualmente)
- Remito para el `stock.picking` de ship_later (flujo de preventa — fuera de este módulo)
- Numeración correlativa por camión (numeración global es suficiente y más simple)
- Firma digital o valor fiscal de ningún tipo
