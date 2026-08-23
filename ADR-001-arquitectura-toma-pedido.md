# ADR-001: Arquitectura del circuito de toma de pedido (Preventa/Reparto)

**Status:** Proposed
**Date:** 2026-08-23
**Deciders:** Equipo de implementación (a confirmar con cliente en taller de detalle)

## Context

El spike técnico previo (ver `ESTADO_PROYECTO.md`) se construyó íntegramente sobre **Punto de Venta (POS)**, con dos configuraciones:

- **"Punto de Venta Reparto"** (`ship_later=True`): cobra hoy, entrega diferida.
- **"POS Camión 1"** (`ship_later=False`): venta ambulante, cobro inmediato, stock del camión.

El relevamiento v2.0 confirmado con el cliente (`Relevamiento_Requerimientos_Odoo_Reparto.docx`) describe el flujo real de negocio (CU-01/CU-02) con matices que no estaban claros al iniciar el spike:

- El vendedor **no cobra en el momento** — venta "a crédito"/"contra boleta". Se emite alerta (no bloqueo) a los 15 días sin pago (RF-PV-07).
- El stock debe descontarse (comprometerse) **de forma inmediata al confirmar el pedido en la tablet**, no al despacho (RF-DL-03) — para que otro vendedor no venda lo mismo dos veces.
- El despacho físico ocurre **al día siguiente hábil**, con picking/checklist (RF-DL-04) y registro de **salida definitiva** de stock en ese momento (RF-DL-07).
- No se emite comprobante fiscal desde el sistema — solo hoja de pedido/remito interno (RF-DL-02, CU-03). Facturación queda 100% fuera de alcance.
- Debe funcionar sin conexión en la calle y sincronizar solo al recuperar señal (RF-PV-06, RNF-06) — ya validado parcialmente en el spike sobre POS (ver §7 de `ESTADO_PROYECTO.md`): funciona, pero la sincronización automática al reconectar no es 100% transparente.

La pregunta de fondo: **¿seguimos construyendo sobre POS, migramos la toma de pedido a `sale.order` (Ventas), o un híbrido?**

## Decision

**Seguir sobre POS**, no migrar a `sale.order` para la toma de pedido en campo. Se recomienda:

1. Usar el método de pago **"Customer Account" / venta a crédito** de POS (feature nativa) para modelar el "contra boleta" — el pedido cierra sin cobro real, queda la deuda en la cuenta corriente del cliente.
2. Mantener y generalizar la configuración `ship_later` (ruta "Deliver in 1 step (ship)") como base para todos los vendedores de preventa — el picking pendiente que genera es lo que el depósito usa para el circuito de picking/checklist/despacho al día siguiente (RF-DL-04, RF-DL-07).
3. Construir el módulo de alerta de crédito (15 días / 2 visitas) como extensión que consulta el estado de cuenta del `res.partner` **antes** de permitir tomar el pedido en POS (RF-PV-04, RF-PV-07) — hook en la apertura de sesión/selección de cliente en el frontend de POS.
4. Ajustar plantilla QWeb del picking/remito para que cumpla el formato de "hoja de pedido/remito interno" (RF-DL-02) — ya no hace falta la lógica de facturación local que se había evaluado antes.

## Options Considered

### Option A: Seguir sobre POS (elegida)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja-Media — ya hay una base validada (`pos_stock_limit`, dos configs, test offline hecho) |
| Costo | Bajo — reutiliza spike existente |
| Offline | **Nativo** — POS es offline-first (IndexedDB), ya probado en este entorno |
| Ajuste al modelo de crédito | Requiere usar "Customer Account" como método de pago — no es facturación, es feature nativa de POS pensada justo para venta sin cobro inmediato |
| Reserva/descuento de stock al confirmar | Nativo — POS descuenta al cerrar la orden, coincide con RF-DL-03 |
| Picking/checklist en depósito | Vía `ship_later` → genera `stock.picking` pendiente, es el mismo mecanismo que usa Ventas por debajo |
| Madurez del equipo con la herramienta | Alta — ya se validó, testeó y documentó en el spike |

**Pros:** offline nativo sin desarrollo extra (el requisito más riesgoso del relevamiento, RF-PV-06/RNF-06, ya está resuelto en un 90%); reutiliza todo el trabajo hecho; el modelo de "cobro a crédito" tiene soporte nativo, no es un workaround forzado.
**Contras:** UX de POS está pensada para checkout rápido, no para un catálogo visual de preventa con búsqueda por categoría — puede necesitar ajustes de interfaz/tema; el concepto de "ruta por vendedor propia, no compartida" (RF-PV-01, ver a cada vendedor solo sus clientes) no es 100% nativo en POS multi-sesión, hay que configurar bien las reglas de acceso.

### Option B: Migrar a `sale.order` (cotización → confirmación → entrega)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Alta — reconstruir desde cero lo ya probado |
| Costo | Alto |
| Offline | **No nativo.** El cliente web de Ventas/backend de Odoo requiere conexión permanente. Cubrir RF-PV-06/RNF-06 exigiría construir una capa de sincronización offline propia (PWA con cache local, cola de reintentos) — esfuerzo grande, no trivial |
| Ajuste al modelo de crédito | Nativo — cotización confirmada sin pago es el flujo estándar de Ventas |
| Reserva/descuento de stock al confirmar | Nativo — reserva al confirmar la orden, descuento definitivo al validar la entrega — encaja perfecto con RF-DL-03 + RF-DL-07 |
| Picking/checklist en depósito | Nativo — es el flujo estándar de Inventario |
| Madurez del equipo con la herramienta | Ninguna validación previa en este proyecto |

**Pros:** semántica de negocio más "correcta" (reserva vs. descuento definitivo, crédito, remito) sin necesidad de forzar features de POS a un caso que no es checkout.
**Contras:** pierde el offline-first que ya está resuelto — es el requisito de mayor riesgo técnico del relevamiento y aquí habría que reconstruirlo desde cero (probablemente una PWA/app tablet a medida hablando con la API de Odoo, con cola local); descarta todo el spike ya validado.

### Option C: Híbrido (POS Camión 1 se queda en POS, preventa migra a Sales)

Evaluado y descartado por ahora: duplica la superficie de mantenimiento (dos módulos de crédito, dos flujos de picking) sin resolver el problema de offline para el caso que más lo necesita (preventa en la calle). Podría reconsiderarse más adelante si el catálogo/checkout de POS resulta insuficiente para la UX de preventa.

## Trade-off Analysis

El factor decisivo es **offline-first**: es un requisito validado como crítico por el cliente (tablets con chip de datos pero conectividad variable en calle) y es exactamente lo que POS ya resuelve de fábrica en Odoo 19 CE. Migrar a Ventas resolvería mejor la semántica de crédito/reserva de stock, pero a costa de tener que reconstruir desde cero — con desarrollo propio — la capacidad offline que hoy es gratis. El "contra boleta" tiene solución nativa razonable en POS vía cuenta corriente del cliente, así que no es un bloqueante real para quedarse en POS.

## Consequences

- Se valida y confirma la base del spike (`pos_stock_limit`, configs de `ship_later`) como cimiento correcto — no se tira trabajo hecho.
- Facturación local queda descartada como línea de trabajo (ya no aplica, ver relevamiento v2.0 §2.3).
- Próximo desarrollo a medida: módulo de alerta de crédito (15 días/2 visitas) sobre POS + `res.partner`.
- Queda pendiente de validar en el taller de detalle: si la UX estándar de POS (grilla de productos, buscador) alcanza para el "catálogo visual con fotos" pedido (RF-PV-02) o si hace falta personalización de interfaz.
- Se revisita esta decisión si en el taller de detalle surge que la UX de POS no es viable para vendedores (por ejemplo, si el cliente pide una app nativa en vez de navegador).

## Action Items

1. [ ] Configurar/validar método de pago "Customer Account" en POS para venta a crédito.
2. [ ] Diseñar módulo de alerta de crédito (15 días / 2 visitas, reinicio con pago parcial) — hook en selección de cliente en POS.
3. [ ] Ajustar plantilla QWeb del picking a formato de remito interno.
4. [ ] Validar reglas de acceso multi-vendedor en POS (cada uno ve solo sus clientes/pedidos) contra RF-PV-01/RNF-04.
5. [ ] Confirmar con cliente en taller de detalle si la UX nativa de POS alcanza para el catálogo visual (RF-PV-02) antes de invertir en personalización de interfaz.
