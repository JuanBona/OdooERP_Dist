# App simple Rincón del Sur — Requerimientos vs. maqueta del cliente

**Regla de oro:** la **pantalla** es la de la maqueta del cliente (`distribuidora_4 (1).html`).
Los **requerimientos** son los del relevamiento v2.0 (los mismos que se cubrieron en Odoo).
Cada requerimiento se resuelve **dentro de una pantalla que ya existe en la maqueta**, con
como mucho un botón, un cartel o un campo más. No se agregan pantallas nuevas salvo que no quede otra.

Referencias: ✅ ya está en la maqueta · 🟡 está, falta un ajuste · 🔴 no está, hay que sumarlo · ⚪ fuera de alcance

## 1. Preventa (vendedor)

| ID | Requerimiento | Maqueta | Cómo se resuelve simple |
|---|---|---|---|
| RF-PV-01 | Login individual, ve solo sus clientes y pedidos | ✅ | Login real con Supabase Auth; permisos por fila (RLS) para que el vendedor no pueda ver lo ajeno ni por API. |
| RF-PV-02 | Catálogo con foto, categoría, precio | 🟡 | La grilla ya está. Falta subir las **fotos reales** (hoy son dibujos de botella). |
| RF-PV-03 | Stock visible al tomar el pedido | ✅ | Chip verde/rojo con unidades. |
| RF-PV-04 | Estado de cuenta antes del pedido | ✅ | Chip "Debe $ / Al día" en el cliente. |
| RF-PV-05 | Pedido impacta en tiempo real | 🟡 | Hoy vive en memoria. Se guarda en Supabase y el depósito lo ve al instante (realtime). |
| RF-PV-06 | Pedidos sin señal | 🔴 | App instalable (PWA): si no hay señal el pedido queda "Pendiente de envío" con un cartelito y sale solo al volver la señal. El vendedor no hace nada. |
| RF-PV-07 | Alerta 15 días sin pago (no bloquea); pago parcial reinicia | 🔴 | Un chip naranja más en el cliente: **"⚠ 18 días sin pagar"**. Se calcula con la fecha del último cobro. No bloquea. |
| RF-PV-08 | Sugerir lo que compra siempre con última cantidad | ✅ | Ya existe "Pedido express". |
| RF-PV-09 | Descuento por volumen **con varios tramos** por producto + cambio manual en el renglón | 🟡 | La maqueta tiene **un** tramo por producto. Se pasa a hasta 3 tramos (ej. 4/8/12%). El cambio manual de precio/descuento: un lápiz en el renglón, solo para Admin/Gerencia. |
| RF-PV-10 | Web responsive para tablet 7"–8.7" | ✅ | Probar en tablet real. |
| RF-PV-12 / RNF-09 | Tablet en modo kiosco (solo app + WhatsApp) | ⚪ | Se configura en el equipo (MDM / modo kiosco de Android), no es desarrollo. |

## 2. Depósito y despacho

| ID | Requerimiento | Maqueta | Cómo se resuelve simple |
|---|---|---|---|
| RF-DL-01 | El pedido llega solo al depósito | ✅ | Pantalla "Preparación". |
| RF-DL-02 | Imprimir remito interno (sin factura fiscal) | ✅ | Ya imprime remito y hoja. Se genera PDF. |
| RF-DL-03 | Stock se descuenta al confirmar el pedido | ✅ | La maqueta ya lo descuenta al enviar. Se hace en la base (transacción) para que dos vendedores no vendan lo mismo. |
| RF-DL-04 | Picking con checklist | ✅ | Tildes por renglón. |
| RF-DL-05 | Pedidos agrupados por ruta: día de la semana + localidad | 🟡 | La maqueta tiene "zona". Se suma **día de visita** al cliente y un filtro "Ruta: Lunes · Peyrano" en Pedidos/Depósito. |
| RF-DL-06 | Alerta stock bajo mínimo | ✅ | "Poco stock" en Inicio. |
| RF-DL-07 | Registrar salida al despachar | 🟡 | Estado "Entregado" ya existe. Falta quién y cuándo (ver RNF-07). |
| RF-DL-08 | Recorrido con Google Maps | ⚪ | **Sacado por ahora** (pedido del cliente 14/11). Queda para más adelante junto con la hoja de reparto. |
| — | Hoja de reparto / hoja de ruta del chofer | ⚪ | **Sacada por ahora.** Cada pedido se marca "Salió en reparto" desde su detalle y al día siguiente pasa solo a Entregado. |

## 3. Facturación

⚪ Fuera de alcance (RF-FA-01 a 07): factura con su sistema externo. La app solo saca remito interno.

## 4. Vendedores, comisiones y caja

| ID | Requerimiento | Maqueta | Cómo se resuelve simple |
|---|---|---|---|
| RF-GV-01/02 | Comisión configurable **por vendedor**, panel privado | 🟡 | La maqueta tiene un % único. Se pone un % por vendedor en Usuarios. Panel solo para Gerencia. |
| RF-GV-03 | Comisión | ✅ | **Sobre lo cobrado** (decisión 14/11). Se calcula en cada cobro con el % del vendedor del cliente. |
| RF-GV-04 | Seguimiento por período | ✅ | **Resumen del mes** (Gerencia), mes calendario. Ver sección 8. |
| — | Caja, rendición del vendedor y gastos (`pos_reparto_caja`) | ✅ | **Caja del depósito** (Administración/Gerencia). Ver sección 8. |
| — | Cuenta corriente / cobro de deuda | ✅ | Saldo + "Nuevo cobro". |
| — | Reporte de ventas por vendedor | ✅ | Reportes. |

## 5. No funcionales

| ID | Requerimiento | Maqueta | Cómo se resuelve simple |
|---|---|---|---|
| RNF-04 | 4 roles: Vendedor, Depósito, Admin Operativa, Gerencia | 🟡 | Se parte "admin" en **Admin Operativa** (pedidos, depósito, imprimir) y **Gerencia** (además finanzas, comisiones, gastos, usuarios). El rol Cliente de la maqueta se saca. |
| RNF-07 | Auditoría: quién cambió precio/stock/pedido y cuándo; pedidos no se borran | 🔴 | Automático en la base (historial). En pantalla solo se ve una línea en el detalle del pedido: "Autorizado por Marcela · 14/11 10:32". Anular = archiva, no borra. |
| RNF-03 | Catálogo en menos de 3 s | 🟡 | Fotos livianas y cache de la PWA. |
| RNF-05 | Crecer de 3 a 4+ vendedores | ✅ | Sin cambios de diseño. |
| RNF-08 | Nube con backup | 🟡 | Supabase (backups diarios) + Vercel/Netlify para la web. |

## 6. Decisiones tomadas (14/11/2026)

1. **Comisión:** sobre lo **cobrado**. Cada cobro registrado suma el % del vendedor del cliente.
2. **Rol Cliente:** se saca de la v1.
3. **Entregas:** cuando un pedido se marca **"Salió en reparto"**, pasa a **Entregado automáticamente** al cierre del día. Solo se marca a mano la excepción: **Rechazado** o **Entrega parcial** (vuelve la mercadería al stock). Nadie tiene que tocar nada si todo salió bien.
4. **Autorización:** solo pasan por "Por autorizar" los pedidos de **clientes con deuda**. El resto va directo al depósito.
5. **Finanzas:** por **mes calendario**.

## 6b. Respuestas del cliente sobre datos (14/11/2026)

- **Entregas automáticas** (punto 3 de arriba): **aprobado**.
- **Fotos:** genéricas por ahora; el admin puede subir la foto real de cada producto desde Artículos.
- **Día de visita / localidad, % de comisión, tramos de descuento:** los **carga el cliente** desde la app (Clientes, Usuarios y Artículos). No se precargan.
- **Límite de crédito:** queda como **mejora a futuro**, no va en la v1.
- **Usuarios:** genéricos, con los 4 roles. El cliente los renombra después.

## 7. Etapas

1. ✅ Login y roles, catálogo, clientes con alerta de deuda, pedido con tramos → depósito con checklist → remito.
2. ✅ Sin señal, caja del depósito, resumen del mes, entregas automáticas.
3. Conectar a Supabase (self-hosted en el servidor donde hoy está Odoo).
4. Pendiente de definir: compras a proveedores, hoja de reparto con Maps, límite de crédito.

## 8. Lógica implementada (etapa 2)

### Sin señal (RF-PV-06)
- La app se instala en la tablet (PWA) y abre aunque no haya señal.
- Si no hay conexión, el pedido queda en una **bandeja de salida** del dispositivo y se ve en "Mis pedidos" como *Pendiente de envío*. Una franja amarilla avisa "Sin señal".
- Al volver la señal se envía solo. Si mientras tanto se quedó sin stock, el pedido queda en la bandeja con el motivo y el vendedor lo puede descartar y recargar.
- El stock se valida y descuenta cuando el pedido llega al sistema, no antes.

### Caja del depósito (rediseño 14/11, pedido del cliente)
Es **la caja física del depósito**. Una sola. La manejan **Administración y Gerencia**; los vendedores no la ven.
- **Saldo siempre a la vista:** cuánto efectivo tendría que haber.
- **Entradas:** cobros en efectivo hechos en el depósito (entran solos), lo que entregan los vendedores, aportes y otros ingresos.
- **Salidas:** qué, cuánto, **a quién**, cuándo y quién lo registró. Se marca si **tiene que volver** y para qué fecha (préstamo, cambio para el reparto, etc.).
- **Devoluciones:** cuánto volvió, cuándo y **cómo** (efectivo, transferencia, descontado del sueldo, otro). Pueden ser parciales. Solo la devolución en efectivo suma a la caja. Las vencidas se marcan en rojo.
- **Vendedores:** cobran en la calle sin caja propia. La app lleva lo que cada uno cobró en efectivo y no entregó; Administración toca "Recibir" cuando lo trae (puede ser parcial).
- **Contar la caja:** se cuenta el efectivo, se compara con el saldo y si no cuadra queda registrada la diferencia con el motivo. Se muestra cuándo se contó por última vez.
- Los movimientos no se editan ni se borran (historial).

### Resumen del mes (Gerencia) — propuesta, el cliente no pidió finanzas
Sale solo de lo que ya se carga; no agrega trabajo:
- Vendido, cobrado, gastos (salidas de caja que no vuelven, sin retiros del dueño), comisiones a pagar, "lo que quedó" (cobrado − gastos − comisiones) y deuda total de clientes.
- Tabla por vendedor: pedidos, vendido, cobrado, comisión.
- Productos más vendidos, gastos por tipo y clientes que más deben.
- No muestra ganancia sobre mercadería porque no se carga el costo. Si la quiere, se agrega un campo "costo" en Artículos.

Datos iniciales: 182 productos de la lista de precios y 776 clientes del Excel.
