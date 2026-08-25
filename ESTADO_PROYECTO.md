# Estado del proyecto — Odoo 19 CE local (Reparto)

Última actualización: 2026-08-24

## 1. Infraestructura

Instancia local de Odoo 19.0 Community vía Docker Compose (`docker-compose.yml` en la raíz).

- **odoo**: imagen `odoo:19.0`, puerto `8069`, bind mount `./addons` → `/mnt/extra-addons`.
- **db**: `postgres:16`, credenciales dev (`odoo`/`odoo`), volumen persistente `odoo-db-data`.
- Volumen `odoo-web-data` para filestore (adjuntos, imágenes).
- Base de datos real: **`odoo`** (no `reparto_spike` — esa base no existe en este entorno).
- Login admin: `admin` / `admin`.

Levantar: `docker compose up -d`. Ver estado: `docker compose ps`. Logs: `docker compose logs -f odoo`.

## 2. Localización Argentina

- País de la compañía ("My Company") = Argentina.
- Módulo `l10n_ar` instalado (junto con `l10n_latam_base`, `l10n_latam_invoice_document`).
- Plan de cuentas aplicado: **`ar_ri`** (Responsable Inscripto), 308 cuentas cargadas.
- Tipos de documento LATAM cargados (66 en total), incluye Factura A/B/C (`INVOICES A/B/C`, codes 1/6/11).
- Idioma **Español (Argentina)** (`es_AR`) instalado y asignado al usuario admin y al partner de la compañía.

## 3. Datos de prueba

**Categorías de producto**: Gaseosas, Cervezas, Aguas, Licores (+ una creada manualmente: "Bebidas Alcoholicas").

**Productos** (`product.template`, todos `type=consu`, `is_storable=True`, `available_in_pos=True`):

| Producto | Categoría | Precio | Stock total |
|---|---|---|---|
| Coca-Cola 2.25L | Gaseosas | $1.850 | 120 |
| Quilmes Cristal x12 | Cervezas | $8.400 | 45 |
| Agua Villa del Sur c/gas | Aguas | $650 | ~198 |
| Fernet Branca 750ml | Licores | $6.200 | 15 |
| Sprite 2.25L | Gaseosas | $1.750 | 90 |
| Fernet Branca (carga manual) | Bebidas Alcoholicas | $14.500 | 200 |

Nota: hubo un incidente de stock negativo en Coca-Cola (orden de prueba de 555 unidades en POS) — corregido manualmente a 120.

## 4. Punto de Venta — dos configuraciones distintas

### a) "Punto de Venta Reparto" (id 1)
Caso de uso: venta con **entrega diferida** ("Ship Later"). Cobra hoy, entrega en una fecha futura.
- `ship_later = True`
- `warehouse_id` = My Company (depósito central)
- `route_id` = "Deliver in 1 step (ship)"
- Circuito: vender → elegir "Ship Later" → fecha + cliente → cobrar → queda un delivery pendiente en Inventory hasta validarlo el día de entrega.

### b) "POS Camión 1" (id 2)
Caso de uso: **venta ambulante desde camión de reparto**, cobro inmediato, stock propio del camión.
- `ship_later = False`
- Tipo de operación propio: `POS Camión 1 Orders` (id 19), origen = ubicación `Camión 1`.
- Ubicación de stock `Camión 1` (id 19): interna, hija de `WH/Stock`.
- Carga inicial ya transferida a Camión 1: 40 Coca-Cola, 15 Quilmes, 8 Fernet Branca (transferencia interna `WH/Stock → Camión 1`, validada).
- Rutina diaria pendiente de repetir: transferencia interna WH/Stock → Camión 1 con lo que sale cada día.

**Nota:** se había creado por error un warehouse duplicado "Camion 01" (CM01) — quedó **archivado** (no eliminado, para no perder historial), sin uso actual.

## 5. Módulo custom: `pos_stock_limit`

Ubicación: `addons/pos_stock_limit/`. Instalado.

Qué hace: bloquea en el backend (`pos.order.create`) cualquier orden de POS que pida más cantidad de un producto que la disponible en la ubicación de origen de ESE punto de venta específico. Genérico — sirve para cualquier POS/warehouse futuro sin tocar código, porque lee la ubicación dinámicamente desde `pos.config.picking_type_id.default_location_src_id`.

Probado: pedir 999 Coca-Colas contra Camión 1 (40 disponibles) → bloqueado con mensaje claro. Pedir 5 → pasa sin problema.

Limitación conocida (a propósito, YAGNI): valida al cobrar/cerrar la orden, no en tiempo real mientras se arma el carrito en pantalla.

## 5bis. Módulo custom: `pos_reparto_security`

Ubicación: `addons/pos_reparto_security/`. Instalado.

Qué hace: da de alta los 4 roles del proyecto (RNF-04 del relevamiento v2.0) como grupos de seguridad en categoría "Reparto" — Vendedor, Depósito, Administración Operativa, Administración Privada/Gerencia (agrupados bajo un `res.groups.privilege` común, para que sean mutuamente excluyentes en la pantalla de usuarios — patrón nuevo de Odoo 19, `res.groups` ya no tiene `category_id` directo).

Reglas de acceso reales, solo para el grupo Vendedor (los otros 3 grupos no tienen regla propia todavía — ven todo por comportamiento default de Odoo, a ajustar si el taller de detalle con el cliente revela una diferencia real de permisos entre ellos):

- **`res.partner`**: un vendedor solo ve (y no puede editar) sus propios clientes, filtrando por el campo nativo `user_id` ("Salesperson"). Crear y borrar clientes está bloqueado de forma dura (regla con domain imposible `id = False`) — no depende de qué otros grupos tenga el usuario en el futuro.
- **`pos.order`**: un vendedor solo ve, crea y edita sus propios pedidos (filtrando por `user_id`, campo nativo de "Empleado"/cajero de la orden). Borrar pedidos está bloqueado de forma dura, mismo patrón — importante porque el ACL base de POS le da permiso de borrado a cualquier usuario de `Point of Sale User`, así que sin esta regla extra el bloqueo simple (`perm_unlink=0`) no alcanzaba (esto se descubrió y corrigió durante la implementación, ver historial de commits del módulo).

No se creó ningún campo nuevo — ambas reglas reutilizan el campo `user_id` que ya existía en cada modelo.

Pendiente manual (fuera de este módulo): crear los usuarios reales de cada vendedor/depósito/administración y asignarles el grupo `Reparto` que corresponda + el/los grupo(s) estándar de Odoo de la app que vayan a usar (ej. Point of Sale User), y asignar el campo "Salesperson" (`user_id`) en cada cliente real al vendedor que le corresponde.

Ver spec: `docs/superpowers/specs/2026-08-23-pos-reparto-security-design.md`.

## 5ter. Módulo custom: `pos_reparto_credito`

Ubicación: `addons/pos_reparto_credito/`. Instalado. Depende de `point_of_sale`, `account` y `pos_reparto_security`.

Qué hace: implementa la alerta de crédito de RF-PV-07 del relevamiento v2.0 (deuda vencida por cliente) más una pantalla de consulta de deudores.

- **4 campos nuevos en `res.partner`** (todos `compute`, `store=True`, recalculados por triggers reales — no `@api.depends()` vacío decorativo, sino invalidación disparada a mano desde `account.move.line` y `account.payment` cuando cambia algo que afecta la deuda de un partner):
  - `credito_monto_adeudado`: suma de `amount_residual` de líneas de `account.move.line` tipo `asset_receivable`, no conciliadas, del asiento posteado.
  - `credito_fecha_pedido_mas_viejo`: fecha del asiento más viejo con saldo pendiente.
  - `credito_fecha_ultimo_pago`: fecha del último `account.payment` entrante confirmado; si nunca pagó, cae a la fecha del pedido más viejo.
  - `credito_dias_sin_pago`: días transcurridos desde esa fecha de referencia hasta hoy.
- **Pantalla "Deudores"** (`res_partner_deudores_views.xml`): entrada de menú dentro de Punto de Venta, visible para los 4 grupos de `pos_reparto_security`. Lista de clientes con `credito_monto_adeudado > 0`, ordenada por días sin pago descendente, con semáforo de color (naranja ≥10 días, rojo ≥15 días — el corte de 15 días es el crédito máximo del proyecto según el relevamiento v2.0). Como no tiene regla de acceso propia, un Vendedor la ve filtrada automáticamente por la regla de `res.partner` de `pos_reparto_security` (solo sus propios clientes); los otros 3 grupos ven todos los deudores.
- **Popup no bloqueante en POS**: al seleccionar un cliente con deuda en cualquier punto de venta, un parche de `PosStore.setPartnerToCurrentOrder` (JS, `static/src/app/services/pos_store.js`) muestra un `AlertDialog` informativo con el monto adeudado y los días sin pago (mismo semáforo de severidad que la pantalla Deudores). Es puramente informativo — no impide continuar la venta, a propósito (RF-PV-07 pide avisar, no bloquear).
- **Offline**: los 3 campos que necesita el popup (`credito_monto_adeudado`, `credito_fecha_ultimo_pago`, `credito_dias_sin_pago`) se agregan a `_load_pos_data_fields` de `res.partner`, así viajan en la carga inicial de datos del POS y el aviso funciona también sin conexión.

Cubierto por 10 tests automáticos (`tests/test_reparto_credito.py`), todos en verde, más verificación manual del popup en navegador real.

**Deuda técnica aceptada** (revisada y aceptada por ahora durante el proceso de build, a tener en cuenta a futuro):

1. Las queries de `account.move.line`/`account.payment` en `_compute_credito_fields` no tienen scoping por `company_id`. Aceptable porque el proyecto es de una sola compañía; si algún día se agrega una segunda compañía hay que sumar ese filtro (el propio Odoo core lo hace en el campo análogo `res.partner.credit`/`debit`, ver `account/models/partner.py::_credit_debit_get`).
2. El criterio de "2 visitas consecutivas sin cobro" de RF-PV-07 no está implementado — solo el criterio de días sin pago. Requiere trackear visitas/pedidos independientemente de si generaron deuda, que es una pieza de datos distinta a lo que hoy calculan estos campos.
3. Si se concilian dos líneas de `account.move.line` ya existentes directamente entre sí (sin pasar por un `account.payment` nuevo — ej. contra una nota de crédito o un ajuste manual), el trigger de recálculo no se dispara, porque `create`/`write`/`unlink` de `account.move.line` no cubren ese camino (la reconciliación en sí no hace `write()` sobre las líneas que concilia). Aceptado porque el flujo real de este proyecto siempre cobra vía un `account.payment` nuevo (ver `ADR-001` y el spec del módulo) — si en algún momento aparece un caso real de conciliación directa sin pago, hay que sumar un trigger también sobre `account.partial.reconcile`/`account.full.reconcile`.

## 5quater. Módulo custom: `pos_reparto_branding`

Ubicación: `addons/pos_reparto_branding/`. Instalado. Depende de `web`, `project`, `spreadsheet_dashboard` y `utm`.

Qué hace: personalización visual pedida por el cliente en la sesión de brainstorming del 2026-08-24 (spec en `docs/superpowers/specs/2026-08-24-erp-branding-design.md`).

- Oculta del menú principal (grilla de apps) tres apps que hoy no se usan: Proyecto, Tableros y Rastreador de enlaces. No se desinstalan — quedan reversibles desde modo desarrollador (`ir.ui.menu.active`) si algún día hacen falta.
- Recolorea la barra superior de **todo el backend** (todas las apps) con el rojo de marca `#A81C21`, vía override de las variables SCSS `$o-navbar-background` / `$o-navbar-border-bottom` en el bundle `web._assets_primary_variables`. No toca el branding del ticket de POS ni de las facturas, que ya estaban resueltos antes de este módulo. Elementos menores fuera de este alcance a propósito (quedan en el violeta por defecto de Odoo): el indicador de carga (`.o_loading_indicator`) y el encabezado del buscador en la vista mobile, que leen `$o-brand-odoo` directo en vez de las variables del navbar.

Fuera de este módulo: el nombre de la compañía se cambió a mano (Ajustes → Compañías) de "My Company" a "Rincon del sur" — es un dato, no código, no requiere módulo.

## 6. Facturación (ARCA/AFIP)

Decisión tomada: por ahora, factura **local de Odoo sin timbrar** (Factura A/B/C interna, sin conexión a los webservices de ARCA). El vendedor elige facturar o no, caso por caso, en cada venta — es el comportamiento nativo de POS, no requiere config extra.

Conexión real a ARCA (testing u homologación) queda pendiente para más adelante si hace falta, requiere CUIT real, certificado digital y punto de venta habilitado en ARCA — no se puede simular en este entorno local sin esos datos.

## 7. Test de funcionamiento offline — "Punto de Venta Reparto" y "POS Camión 1"

Probado el 2026-08-20: qué pasa si el vendedor pierde señal a mitad de un pedido. Se corrió el mismo test en **ambos** puntos de venta para determinar si el problema era puntual del circuito de entrega diferida o general de Odoo.

**Método**: se simuló la caída de conexión parando el container `odoo` (no la wifi real) mientras se armaba un pedido en el navegador — el POS deja de poder hablar con el backend, que es lo que importa para este test.

**Pasos (idénticos en los dos POS)**:
1. Cargar 1 producto con conexión normal → OK.
2. Cortar conexión al backend (`docker compose stop odoo`).
3. Seguir cargando productos sin señal → la interfaz **sigue funcionando** (POS es offline-first, guarda en IndexedDB local del navegador).
4. Cobrar y **validar sin conexión** → funcionó en los dos casos. Odoo mostró su propio aviso "Conexión perdida — la funcionalidad estará limitada hasta que se restablezca la conexión", pero cerró la venta igual y generó el ticket local.
5. Reconectar backend (`docker compose start odoo`).
6. Esperar sin tocar nada en el navegador (8 seg) → **la orden NO sincronizó sola en ninguno de los dos POS**. Consola del navegador registra el mismo error en ambos casos: `ConnectionLostError: Connection to "/web/dataset/call_kw/pos.order/sync_from_ui" couldn't be established`, sin reintento automático en background.
7. Al **recargar/reingresar a la sesión de POS**, ahí sí sincronizó en los dos casos, sin pérdida de datos.

**Resultado**:

| | Punto de Venta Reparto | POS Camión 1 |
|---|---|---|
| Ticket local generado offline | 261-1-000004, $10.527 | 261-2-000001, $9.740,50 |
| Sync automático al reconectar | ❌ No | ❌ No |
| Sync al reabrir sesión | ✅ Sí (`pos.order` id 4, verificado por API) | ✅ Sí (`pos.order` id 5, verificado por API) |

**Conclusión: es un comportamiento general de esta versión/config de Odoo, no algo puntual del circuito de entrega diferida.** Afecta por igual a Ship Later y a cobro inmediato — el POS base de Odoo no reintenta `sync_from_ui` solo al detectar reconexión, necesita que alguien vuelva a entrar a la sesión. No se pierde el pedido ni la plata en ningún caso, pero mientras la sesión no se reabre, esa venta no existe en el servidor (no impacta stock real, no es visible para nadie más) aunque el ticket ya se haya impreso/cobrado.

**Mitigaciones evaluadas** (aplican igual a los dos POS, no hace falta separar el arreglo por circuito):
- **De proceso (gratis, ya aplicable)**: capacitar al vendedor con la regla "al llegar a cada nuevo comercio, si perdiste señal en el anterior, refrescá la pantalla antes de arrancar" — mismo hábito que "revisar que hay señal".
- **Técnica chica (estimado: una tarde de desarrollo)**: agregar un listener del evento `online` del navegador que dispare el reintento de sync automáticamente, sin esperar que el vendedor reabra nada. Pendiente de implementar.

## 8. Acceso MCP (para asistentes de IA)

Configurado servidor MCP `odoo` en Claude Code (`claude mcp add odoo ...`), modo YOLO read-only (no requiere el addon `mcp_server`, autentica con usuario `admin` + API key nativa de Odoo). **La API key está en la config local de Claude Code, no en este repo** — cada persona que quiera este acceso debe generar su propia key en Settings → Users → API Keys y configurarla en su propia máquina.

## 9. Pendiente / próximos pasos

- Parte 2 del diseño de "venta por camión": flujo completo de facturación opcional al cerrar la venta (todavía no se armó, quedó frenado para escribir este reporte).
- Probar el circuito completo en el navegador (vos o tu compañero) desde POS Camión 1.
- Definir si se necesitan más camiones/ubicaciones (el patrón ya es repetible: ubicación + picking type + pos.config).
- Implementar banner con listener del evento `online` del navegador para reintento automático de sync en POS (ver sección 7 — estimado una tarde, no bloqueante, hay mitigación de proceso mientras tanto).
- Módulo de alerta de crédito: **hecho**, ver `pos_reparto_credito` en sección 5ter — cubre el criterio de días sin pago; el criterio de "2 visitas consecutivas sin cobro" de RF-PV-07 queda pendiente (ver deuda técnica en esa sección).

---

# Ideas para trabajar en co-working con tu compañero

**1. Iniciar git ahora, antes de que crezca más.** Hoy esta carpeta no es un repo. Recomendado:
```
git init
git add docker-compose.yml addons/ ESTADO_PROYECTO.md
git commit -m "Setup inicial: Odoo 19 + AR localization + POS camión"
```
Después suben a GitHub/GitLab (privado) y cada uno clona. Así los dos tienen el mismo `docker-compose.yml` y el mismo código del módulo `addons/pos_stock_limit/` versionado — sin eso, cualquier cambio que uno haga en su máquina el otro no lo ve.

**2. Nunca commitear secretos.** El `docker-compose.yml` actual tiene password de Postgres hardcodeada (`odoo`/`odoo`) — para dev local está bien, pero si más adelante conectan APIs reales (AFIP, pagos), esas credenciales van en un `.env` con `.gitignore`, nunca en el yml.

**3. La base de datos NO viaja por git.** Todo lo que armamos (productos, POS, plan de cuentas AR) vive dentro del volumen de Postgres de tu máquina — tu compañero no lo tiene. Dos caminos:
   - **Rápido/manual**: le pasás un dump (`docker compose exec db pg_dump -U odoo odoo > backup.sql`), él lo importa. Sirve ahora, pero se desincroniza de nuevo apenas alguno cambia algo.
   - **Prolijo/reproducible**: mover la configuración (categorías, POS, ubicaciones) a datos XML de un módulo Odoo propio (`data/*.xml` con `noupdate="0"`), para que instalando el módulo se recree todo solo. Más laburo ahora, pero es lo que realmente escala con dos personas tocando la misma base de reglas de negocio.

**4. Dividir por módulos, no por archivos sueltos.** Cada feature nueva (facturación, más camiones, reportes) como su propio módulo dentro de `addons/`, cada uno en su carpeta. Así los dos pueden trabajar en paralelo sin pisarse en el mismo archivo.

**5. Ramas por feature + este doc como fuente de verdad.** Actualizamos `ESTADO_PROYECTO.md` cada vez que se cierra algo importante, así no dependen de scrollear el chat para saber qué está hecho.
