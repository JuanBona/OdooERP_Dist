# Diseño: módulo `pos_reparto_caja` (Cajas de empresa, Rendición y Gastos)

**Fecha:** 2026-09-26
**Contexto:** Requerimientos v2.0 actualizados (reunión 2026-09-26): RF-G01 (Cajas + Rendición), RF-G03/RF-A05 (Gastos). Fase 2 del roadmap acordado ese día (Fase 1 — stock camión→general, RF-A02/RF-V01 — ya ejecutada directamente en la DB de dev, sin cambios de código, ver commit log / memoria de sesión).

## Roadmap completo acordado (para contexto, no todo se implementa en esta spec)

1. ~~Stock camión → stock general (RF-A02)~~ — hecho, config/datos, sin código.
2. **Cajas + Gastos + Rendición (RF-G01, RF-G03, RF-A05) — esta spec.**
3. Cuenta corriente: pantalla + filtro por vendedor (RF-G05, RF-A04, RF-V04).
4. Viajes: mostrar deuda y cobrar tocando importe (RF-V05) — hoy `viaje_screen.js` solo tilda parada, no hay UI de cobro.
5. Ventas por vendedor (RF-A01).
6. Listado de despacho: consolidado por camión + por cliente, PDF/Excel, descuento de stock al imprimir sin duplicar (RF-A03).
7. Vendedor 04 externo sin comisión (RF-U01).
8. Comprobante con deuda en rojo (RF-V06).
9. Trayecto en Inicio (RF-G02, deseable).

## Objetivo de esta fase

Gerencia necesita ver cuánta plata física/electrónica tiene la empresa disponible, separada en **Caja Efectivo** y **Caja Transferencia**. Lo que cobra cada vendedor en la calle (ventas directas + cobros de cuenta corriente en Viajes) no impacta ese saldo hasta que Administración confirma la **Rendición** de ese vendedor. Administración también registra **Gastos** (egresos) contra una de las 2 cajas, atribuidos a un vendedor a modo informativo.

## Decisiones tomadas en el brainstorming

- **2 cajas, no 3.** "Efectivo" y "pesos" son la misma caja dicha dos veces. Débito y crédito (tarjeta) se agrupan junto con transferencia bancaria en **Caja Transferencia** — una sola caja para todo lo no-efectivo.
- **El medio real (Efectivo/Débito/Crédito) se conserva a nivel de línea** para detalle/reporte, aunque el saldo de Cajas solo se muestre agrupado en 2.
- **El saldo de Cajas NO es el balance contable en vivo de los journals.** Es una cifra propia: `Σ rendiciones confirmadas (monto recibido) − Σ gastos`, por caja, acumulado histórico (no se resetea por día). El pago que reduce la cuenta corriente del cliente se postea igual en el momento (correcto para RF-V04/V05, auditable en Contabilidad), pero el ítem de menú "Cajas" que ve Gerencia no lee eso — lee las Rendiciones. Se evaluó la alternativa de journals-billetera-por-vendedor con traspaso contable real (más "correcto" contablemente) y se descartó por sobre-ingeniería para lo que se pidió.
- **Rendición: Administración tipea el monto real recibido** (efectivo y transferencia) y el sistema calcula la diferencia contra lo esperado (suma de cobros pendientes de ese vendedor). La diferencia queda guardada aunque se rinda igual — no bloquea el cierre, es un registro de auditoría/control.
- **Ambas cajas rinden igual**, aunque transferencia no sea plata física — es decisión explícita del cliente (control uniforme), no una optimización técnica.
- **Un vendedor puede rendir más de una vez** — no está atado a "una rendición por día calendario". Cada rendición cierra todo lo que esté pendiente de ese vendedor al momento de apretar el botón.
- **Gastos son informativos por vendedor** (no descuentan nada de su comisión ni de su próxima rendición automáticamente) pero **sí restan del saldo de la caja de empresa correspondiente** — es un egreso real.
- **Consolidar medios de pago**, mismo patrón que se hizo con el stock en la Fase 1: los 3 camiones hoy tienen payment methods separados ("Efectivo Camión 1/2/3", journals "Caja Camion 1/2/3", más "Card"→Bank). Pasan a 3 métodos compartidos entre los 3 camiones: Efectivo (journal Caja Efectivo), Débito y Crédito (ambos journal Caja Transferencia). Esto es config/datos, no requiere modelo nuevo — se hace igual que la consolidación de ubicaciones de stock (Fase 1).

## Arquitectura

```
addons/pos_reparto_caja/
├── __init__.py
├── __manifest__.py           (depende de point_of_sale, account, pos_reparto_security, pos_reparto_comision)
├── models/
│   ├── __init__.py
│   ├── comision_linea.py     (extiende pos.reparto.comision.linea: caja, medio_pago, rendicion_id)
│   ├── caja_rendicion.py     (reparto.caja.rendicion)
│   └── caja_gasto.py         (reparto.caja.gasto)
├── views/
│   ├── caja_rendicion_views.xml   (form/list + botón Rendir, menú bajo Administración)
│   ├── caja_gasto_views.xml       (form/list + menú, Gerencia + Administración)
│   └── caja_dashboard_views.xml   (item de menú "Cajas" para Gerencia: 2 tiles de saldo)
├── security/
│   ├── ir.model.access.csv
│   └── caja_rules.xml        (record rules: reusan los 4 grupos de pos_reparto_security)
├── data/
│   └── caja_payment_methods.xml  (o script de migración: consolidación de payment methods/journals — ver nota abajo)
└── tests/
    └── test_reparto_caja.py
```

Nota sobre la consolidación de payment methods: al igual que la Fase 1 (stock), esto puede hacerse como script ejecutado una vez contra la DB de dev (no data file versionado), ya que es config/datos de esta instancia puntual, no lógica reutilizable. Se decide al momento de implementar cuál de las 2 formas conviene (dato de instalación vs. script manual).

## Modelo de datos

### `pos.reparto.comision.linea` (extensión, módulo existente `pos_reparto_comision`)

Campos nuevos:
- `caja` — Selection(`efectivo`, `transferencia`), compute+store, derivado del journal del pago de origen (`pos_payment_id.payment_method_id.journal_id` o `account_payment_id.journal_id`).
- `medio_pago` — Char o Selection, detalle real (Efectivo/Débito/Crédito), derivado del nombre del payment method/payment method line de origen.
- `rendicion_id` — Many2one a `reparto.caja.rendicion`, nullable. `null` = pendiente de rendir.

"Pendiente a rendir" de un vendedor = `Σ comision_linea.monto_cobrado WHERE vendedor_id = X AND rendicion_id = NULL`, agrupado por `caja`.

### `reparto.caja.rendicion` (nuevo)

- `vendedor_id` — Many2one res.users, required.
- `fecha` — Date, default hoy.
- `monto_esperado_efectivo` / `monto_esperado_transferencia` — Monetary, compute (suma de líneas pendientes de ese vendedor al momento de crear el registro, congelado — no se recalcula después de creado, mismo criterio de inmutabilidad que `pos_reparto_comision`).
- `monto_recibido_efectivo` / `monto_recibido_transferencia` — Monetary, cargado por Administración.
- `diferencia_efectivo` / `diferencia_transferencia` — Monetary, compute = recibido − esperado.
- `state` — Selection(`borrador`, `rendido`), default `borrador`.
- `rendido_uid` / `rendido_fecha` — se completan al confirmar.

Acción `action_rendir()`:
1. Requiere `state == 'borrador'` y ambos montos recibidos cargados (permitir 0 explícito, no permitir vacío).
2. Marca `rendicion_id = self` en todas las `comision_linea` de `vendedor_id` con `rendicion_id = NULL` **al momento de ejecutar** (no las fijadas al crear el borrador — si entre crear el borrador y apretar Rendir el vendedor cobró algo más, entra también; evita condición de carrera de "cobros que se pierden entre medio").
3. `state = 'rendido'`, guarda `rendido_uid`/`rendido_fecha`.
4. Ya rendido, el registro es de solo lectura (no permitir editar montos recibidos post-rendición — si Administración se equivocó, se corrige con un ajuste/gasto o un registro contable aparte, no reabriendo la rendición. Fuera de alcance de esta fase el flujo de corrección).

### `reparto.caja.gasto` (nuevo)

- `fecha` — Date, default hoy.
- `caja` — Selection(`efectivo`, `transferencia`), required.
- `monto` — Monetary, required, > 0.
- `vendedor_id` — Many2one res.users, required (a quién se le atribuye).
- `motivo` — Char, required.
- `registrado_uid` — usuario que lo cargó (automático).

Sin lógica de descuento automático — es un registro plano. Resta del saldo mostrado en el dashboard de Cajas (ver abajo).

## Saldo de Cajas (RF-G01, dashboard/menú para Gerencia)

```
saldo_caja(caja) = Σ reparto.caja.rendicion.monto_recibido_<caja> WHERE state = 'rendido'
                 − Σ reparto.caja.gasto.monto WHERE gasto.caja = <caja>
```

Vista simple (2 números grandes, Efectivo y Transferencia), sin filtro de fecha en esta fase — es el saldo disponible actual, no un reporte histórico. Puede vivir como método compute expuesto en una vista tipo `kanban`/`dashboard` liviana, sin over-engineering.

## Permisos

Reusa los 4 grupos de `pos_reparto_security`:
- **Gerencia**: ve el dashboard de Cajas, ve/crea Gastos, ve todas las Rendiciones (solo lectura).
- **Administración**: crea/confirma Rendiciones (botón Rendir), crea Gastos, ve el dashboard de Cajas.
- **Vendedor**: sin acceso a ningún modelo de este módulo (ni el propio — no necesita ver su rendición histórica en esta fase).

## Error handling / edge cases

- Vendedor sin nada pendiente (0 en ambas cajas): permitir igual crear+rendir una rendición en 0 (caso raro pero no debe romper); considerar ocultar el botón "Nueva rendición" en la UI si no hay pendiente, para no ensuciar, pero no bloquearlo a nivel modelo.
- Gasto con monto ≤ 0: bloqueado por constraint.
- Rendición sin ambos montos recibidos cargados: `action_rendir` debe fallar con `UserError` claro.
- Dos rendiciones simultáneas del mismo vendedor (doble click / dos pestañas): la segunda, al ejecutar, no debe volver a tomar líneas ya marcadas por la primera (el filtro `rendicion_id = NULL` en el momento de ejecutar ya lo previene naturalmente).

## Testing

Mismo patrón que los módulos existentes (`tests/test_reparto_caja.py`, tags de test):
- Cálculo de `monto_esperado_*` al crear una rendición (suma correcta de líneas pendientes, agrupada por caja).
- `action_rendir` marca las líneas correctas y ninguna otra (no toca líneas de otro vendedor, no toca líneas ya rendidas).
- Cálculo de diferencia (positiva, negativa, cero).
- Saldo de Cajas: suma correcta de rendiciones confirmadas menos gastos, por caja, y que una rendición en `borrador` no afecte el saldo.
- Permisos: Vendedor no puede leer/crear rendiciones ni gastos; Administración puede rendir (botón `action_rendir`); Gerencia ve rendiciones pero el botón Rendir queda restringido a Administración — el doc del cliente dice explícitamente "Administración confirma la rendición".

## Fuera de alcance (esta fase)

- Traspaso contable real entre journal-billetera-vendedor y journal de empresa (ver Opción B descartada).
- Flujo de corrección de una rendición ya confirmada.
- Reporte histórico de rendiciones/gastos con filtro de fecha (el dashboard es "saldo actual", no un reporte — puede pedirse como fase futura).
- Vista propia para que el Vendedor consulte su historial de rendiciones.
