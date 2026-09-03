# Estado del proyecto — Odoo 19 CE local (Reparto)

Última actualización: 2026-08-29

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

**Nota operativa:** después de cualquier `-u pos_reparto_branding` (o de cualquier módulo que toque un bundle de assets), el proceso de Odoo que ya está corriendo puede seguir sirviendo el CSS viejo desde su caché en memoria (`ir.qweb._generate_asset_links_cache`), aunque la base ya tenga el bundle actualizado. Borrar el `ir.attachment` cacheado no alcanza en ese caso — hace falta `docker compose restart odoo` para que el proceso vivo levante el bundle nuevo.

## 5quinquies. Módulo custom: `pos_reparto_home`

Ubicación: `addons/pos_reparto_home/`. Instalado, en `main` (mergeado directo, no quedó rama separada).

Qué hace: reemplaza el landing post-login (antes caía en Discuss) por una grilla táctil de cuadrados grandes, uno por app de negocio a la que el usuario tiene acceso — pensada para Depósito/AdminOp/Gerencia/Vendedor tocando en tablet en vez de leer el dropdown de texto chico.

- Método `ir.ui.menu.get_reparto_home_tiles()` arma la lista reusando la visibilidad nativa de menús de Odoo (no duplica permisos), resolviendo por DFS la acción real de cada app (muchos root menus como Sales/Inventory/POS tienen `action=False`, la acción real vive 1-2 niveles más abajo).
- Client action OWL renderiza la grilla; wireado como landing vía un `ir.ui.menu` raíz "Inicio" con `sequence=1`.
- No depende de `pos_reparto_security` — es genérico, se ajusta solo si cambian los grupos de rol.
- Bug corregido durante el build: el propio tile "Inicio" se devolvía a sí mismo en la grilla — está en lista negra de exclusión, con test de regresión.
- 6 tests, todos en verde. Verificado por navegador con los 4 usuarios placeholder.

Spec: `docs/superpowers/specs/2026-08-25-pos-reparto-home-design.md`. Plan: `docs/superpowers/plans/2026-08-25-pos-reparto-home.md`.

## 5septies. Módulo custom: `pos_reparto_descuento_volumen`

Ubicación: `addons/pos_reparto_descuento_volumen/`. Depende de `point_of_sale`, `pos_reparto_security`, `pos_reparto_pricelist`. Cubre **RF-PV-09** (descuentos automáticos por volumen parametrizables por producto + override manual en el renglón, con permisos). Rama `feature/pos-reparto-descuentos-volumen` (pendiente de merge a `main`).

Qué hace:

- **Descuento por volumen por producto**: los tramos son `product.pricelist.item` sobre la lista "Default" (`compute_price='percentage'`, `min_quantity`, `percent_price`, `base='list_price'`). **Sin modelo nuevo** — el motor de precios nativo los aplica, también offline en el POS. Se cargan desde una pestaña "Descuentos por volumen" en el form del producto (un `One2many` de conveniencia `reparto_volumen_item_ids` que inyecta los defaults, así el usuario solo tipea cantidad y %) y se revisan desde el menú Punto de Venta → Configuración → Descuentos por volumen (lista los productos con al menos un tramo). Pestaña y menú visibles solo para Admin Operativa / Gerencia; un `ir.model.access.csv` les da CRUD sobre `product.pricelist.item`. En Odoo 19 la lista "Default" no tiene xmlid (`product.list0` fue removido) — se resuelve por búsqueda `[('company_id','in',[company,False])]`, igual que `pos_reparto_pricelist`.
- **Aviso en el POS** (overrides OWL del `Orderline`): bajo cada renglón cuyo producto tiene tramos, un bloque lista **todos** los tramos (`10+ u → 4% · 20+ u → 8%`) y resalta el activo según la cantidad. Además, un **toast no bloqueante** avisa cuando falta poco (`≤ max(3, 20% del umbral)`) para el próximo tramo, una vez por (línea, tramo), con debounce de 400 ms y reset al alejarse. Los `product.pricelist.item` ya viajan al frontend del POS en la carga inicial (core), así que todo anda offline.
- **Override manual restringido a Admin Operativa / Gerencia** (decisión "A" del spec): los botones "%" y "Precio" del numpad se ocultan para los demás roles (patch de `ProductScreen.getNumpadButtons`, usando un flag `_reparto_puede_override` que el módulo agrega a la carga de `res.users` al POS). El **enforcement real** es un guard en `pos.order.create` (patrón de `pos_stock_limit`): rechaza con `UserError` cualquier línea con `discount > 0` o `price_unit` por debajo del precio de lista si el cajero no es Admin/Gerencia. Cubre el sync offline. El descuento por volumen legítimo no lo dispara (viene como `price_unit` = precio de lista, `float_compare == 0`).

Fuera de alcance (ver spec): descuento agregado por orden, tope de override para Vendedor, descuento en la columna "Desc.%" nativa, descuentos por categoría, escala global por defecto.

9 tests Python en verde (`tests/test_descuento_volumen.py`): One2many + defaults, escala de precios con el motor nativo, dominio del menú, guard de override en sus 4 casos, flag de rol en la carga POS. El bloque de tramos, el toast y el ocultado de botones se verifican en navegador (documentado en el plan).

Spec: `docs/superpowers/specs/2026-08-31-pos-reparto-descuento-volumen-design.md`. Plan: `docs/superpowers/plans/2026-08-31-pos-reparto-descuento-volumen.md`.

## 5sexies. Módulo custom: `pos_reparto_viaje`

Ubicación: `addons/pos_reparto_viaje/`. Instalado en el worktree de la rama `feature/pos-reparto-viaje` (branch real de trabajo: `worktree-pos-reparto-viaje`, todavía no mergeada a `main` al cierre de esta sesión). Depende de `point_of_sale` y `pos_reparto_security`.

Qué hace: implementa la feature "Viaje" (hoja de ruta) del relevamiento v2.0 — Admin Operativa/Gerencia arman a mano, para un chofer y una fecha, la lista de clientes a visitar ese día; el chofer la ve como checklist táctil y se tilda sola al generar cada pedido.

- **Modelos** `reparto.viaje` (`fecha`, `chofer_id`, `pos_config_id`, `parada_ids`, computados `paradas_totales`/`paradas_completadas`/`progreso`, constraint única `(chofer_id, fecha)`) y `reparto.viaje.parada` (`viaje_id`, `partner_id`, `visitado`, `pedido_id`). Sin orden entre paradas (decisión explícita, no es ruta optimizada).
- **Auto-tick**: override de `pos.order.create()` que busca la parada pendiente que matchee chofer+fecha+cliente y la marca visitada — usa `order.date_order` (fecha real de la venta), no la fecha de sincronización, para no romper con pedidos offline sincronizados tarde.
- **Deep-link a POS**: tocar una parada en la pantalla del chofer llama a `action_abrir_pos()` (extiende la URL de `pos.config.open_ui()` con `&reparto_partner_id=<id>`), y un patch de `PosStore` en el frontend de POS lee ese query param al arrancar y preselecciona el cliente en la orden nueva.
- **Pantalla del chofer**: client action OWL nueva, aparece sola como tile en la grilla de `pos_reparto_home` (mismo mecanismo genérico por menú raíz, sin declarar dependencia entre módulos).
- **Panel de Admin**: vista Kanban en menú Punto de Venta → Viajes, filtrada a "Hoy" por defecto, con barra de progreso por chofer.
- 20 tests automáticos, todos en verde. Construido con `superpowers:subagent-driven-development` (implementador + spec review + code review por task, 10 tasks).

**Deuda técnica aceptada**: un mismo cliente en 2 viajes de choferes distintos el mismo día no está bloqueado (caso raro, carga manual duplicada).

**Task 9 (verificación manual en navegador) — hecha el 2026-08-31.** Flujo probado end-to-end como usuario real (`chofer_viaje_manual_test`, grupo Vendedor): tile "Viaje" en Inicio → lista de paradas → tocar parada abre POS Camión 1 con el cliente ya preseleccionado → cobrar → volver a Inicio/Viaje muestra la parada tildada sola (auto-tick) → panel de Admin (Punto de Venta → Viajes) refleja el progreso actualizado (1/2, 50%). No se repitió el caso offline de la sección 7 específicamente para este módulo (queda como regresión pendiente, no bloqueante — el mecanismo de auto-tick ya usa `date_order` para cubrir ese escenario, ver sección 5sexies).

Dos bugs reales encontrados y arreglados durante la verificación:
1. **`pos_store.js`** (`pos_reparto_viaje`): el patch de `PosStore.setup()` asumía que ya existía una orden al momento de preseleccionar el cliente; `this.getOrder()` puede ser `undefined` ahí. Fix: `getOrder() || addNewOrder()`.
2. **`pos_reparto_security`** — bug más serio, no específico de este módulo: la regla de Vendedor sobre `res.partner` (`user_id = user.id`, "solo mis clientes") bloqueaba sin querer el **propio contacto vinculado del vendedor**, porque nadie lo asigna como Salesperson de sí mismo. Como `res.users.name` (y otros campos) son `related` a `partner_id.*`, esto rompía la lectura de `res.users` para cualquier usuario del grupo Vendedor — lo que a su vez rompía abrir **cualquier** sesión de POS (el popup "Opening Control" de Odoo no podía resolver el cashier y crasheaba). Fix: la regla ahora es `['|', ('user_id','=',user.id), ('id','=',user.partner_id.id)]`. Cubierto por un test nuevo (`test_vendedor_puede_leer_su_propio_contacto`). Este bug afecta a **cualquier** usuario del grupo Vendedor en **cualquier** POS, no solo en el flujo de Viaje — ya estaba latente desde que se creó `pos_reparto_security`, simplemente nunca se había probado abrir una sesión de POS real con un usuario de ese grupo hasta ahora.

**Mergeado a `main`.**

**Incidente 2026-08-29 (ya resuelto, dejado por historial):** el volumen de Postgres compartido se vació durante la verificación del Task 5 de este módulo. Recuperado reinstalando los módulos custom. El catálogo real de productos y los usuarios placeholder de `pos_reparto_security` se perdieron en ese incidente y siguen sin recargar (ver ítem de datos maestros pendientes más abajo) — la base actual tiene datos de prueba al azar (50 clientes, 50 productos), no el catálogo real del cliente.

**Nota operativa (encontrada 2026-08-31, importante para cualquiera que retome este proyecto):** los comandos `docker compose` para este proyecto **deben correrse desde el directorio de este worktree**, no desde el checkout principal. El `docker-compose.yml` usa un bind mount relativo (`./addons`), así que si se corre `docker compose -p odooerp_dist up -d odoo` desde otro directorio (aunque se use el mismo `-p` para reusar la base), el mount de `/mnt/extra-addons` se recalcula contra ESE directorio y el container termina sirviendo un `addons/` distinto — silenciosamente, sin error. Eso pasó en esta sesión y causó horas de debugging (el módulo parecía "perder" su ACL/vistas/menú en cada reinstall, cuando en realidad estaba instalando una copia vieja y sin trackear que quedó suelta en `addons/pos_reparto_viaje/` del repo principal). Antes de reinstalar/actualizar cualquier módulo, correr `docker inspect odooerp_dist-odoo-1 --format "{{json .Mounts}}"` y confirmar que el `Source` del bind mount apunta al worktree correcto.

Spec: `docs/superpowers/specs/2026-08-29-pos-reparto-viaje-design.md`. Plan: `docs/superpowers/plans/2026-08-29-pos-reparto-viaje.md`.

## 5octies. Módulo custom: `pos_reparto_comision`

Ubicación: `addons/pos_reparto_comision/`. Rama `worktree-pos-reparto-comision` (pendiente de merge a `main`). Depende de `point_of_sale`, `pos_reparto_security`, `pos_reparto_credito`. Cubre **RF-GV-03** (comisión de vendedor).

**Corrección importante vs. lo resuelto el 2026-08-24**: el relevamiento v2.0 original decía "comisión sobre pedidos generados en el día". El cliente aclaró en el brainstorming del 2026-09-02 que la comisión se devenga **al cobrarle al cliente**, no al generar el pedido — al revés de esa resolución. Este módulo implementa la versión corregida.

Qué hace:

- **`res.users.reparto_comision_pct`**: porcentaje de comisión por vendedor, editable solo por Gerencia (restringido con `groups=` en la definición del campo, no solo en la vista).
- **Modelo `pos.reparto.comision.linea`**: registra cada hecho de cobro que genera comisión — `fecha`, `vendedor_id`, `partner_id`, `origen` (`venta_directa` / `cobro_credito`), `monto_cobrado`, `comision_pct`, `comision_monto`. Los 2 FK de origen (`pos_payment_id`, `account_payment_id`) usan `ondelete='cascade'` y son mutuamente excluyentes (constraint "exactamente un origen"). Sin vistas de edición manual — las líneas se crean solo por los hooks, en modo `.sudo()`.
- **Hook en `pos.order.write()`**: al pagar un pedido en efectivo/directo (venta al contado en el momento), crea la línea con `origen='venta_directa'` inmediatamente.
- **Hook en `account.payment`**: al registrar/confirmar un pago contra la cuenta corriente de un cliente (cobro posterior de un pedido `ship_later`), crea la línea con `origen='cobro_credito'`. Cubre pagos parciales.
- **Seguridad**: `pos.reparto.comision.linea` es de **solo lectura para Gerencia** (`perm_read=1`, resto en `0`) — nadie edita/crea/borra líneas a mano, ni siquiera Gerencia, porque las crean los hooks vía `.sudo()`.
- **Panel para Gerencia**: vista pivot (vendedor × mes, medidas monto cobrado/comisión) + lista de detalle de solo lectura, menú "Comisiones" bajo Punto de Venta, visible solo para `group_reparto_gerencia`.

**Deuda técnica aceptada (no bloqueante, evaluar antes de producción)**:
1. El hook de `pos_order.py` envuelve la creación de la línea en `try/except Exception: log y sigue` (mismo patrón que `pos_reparto_remito`) — puede tragarse silenciosamente un fallo real de comisión de un pedido ya cobrado.
2. El guard de `write()` en `account_payment.py` (`{'state','amount','partner_id'} & vals.keys()`) no re-sincroniza una línea ya creada si cambia `amount`/`partner_id` sin cambiar `state` — queda desactualizada sin error ni log.
3. A diferencia de `pos_order.py`, el hook de `account_payment.py` **no** aísla errores — una excepción ahí aborta el `create()`/`write()`/`action_post()` real del pago en Contabilidad (más grave que bloquear una venta POS).

17 tests Python en verde. Construido con `superpowers:subagent-driven-development` (implementador + spec review + code review por task, 7 tasks). Verificación manual en navegador (Tasks 5-6): logueado como Gerencia el menú "Comisiones" aparece y el pivot carga sin error de acceso; logueado como Vendedor el menú no aparece.

Spec: `docs/superpowers/specs/2026-09-02-pos-reparto-comision-design.md`. Plan: `docs/superpowers/plans/2026-09-02-pos-reparto-comision.md`.

## 6. Facturación (ARCA/AFIP) — **DECISIÓN OBSOLETA, ver relevamiento v2.0**

~~Decisión tomada: por ahora, factura local de Odoo sin timbrar (Factura A/B/C interna, sin conexión a los webservices de ARCA).~~

**Reemplazada el 2026-08-24**: el cliente confirmó por escrito (`Relevamiento_Requerimientos_Odoo_Reparto.docx` v2.0) que **factura con software externo en su PC** (incluida Factura A) y que **facturación fiscal queda 100% fuera de alcance** de este sistema. Odoo solo debe emitir hoja de pedido/remito interno (sin valor fiscal). No hace falta ningún flujo de facturación de POS, ni conexión a ARCA. Ver `ADR-001-arquitectura-toma-pedido.md` en el repo para el detalle de la decisión de arquitectura que surgió de este relevamiento (se sigue sobre POS, no se migra a `sale.order`, justamente porque POS ya es offline-first y no hace falta facturar desde ahí).

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

**Hecho hasta ahora** (relevamiento v2.0, `Relevamiento_Requerimientos_Odoo_Reparto.docx`): `pos_reparto_security` (4 roles + reglas de acceso, sección 5bis), `pos_reparto_credito` (alerta 15 días, sección 5ter), `pos_reparto_branding` (personalización visual, 5quater), `pos_reparto_home` (pantalla de inicio táctil, 5quinquies), `pos_reparto_remito` (remito interno QWeb), `pos_reparto_viaje` (hoja de ruta, sección 5sexies), `pos_reparto_descuento_volumen` (RF-PV-09, sección 5septies). Todo mergeado a `main`. `pos_reparto_comision` (comisión de vendedor, sección 5octies) completo y testeado, falta merge.

**Gaps Must/Should que quedan del relevamiento v2.0** (ver detalle y justificación en memoria `project-reparto-v2-requirements`, o repreguntar al cliente si hace falta el docx):

1. ~~Remito interno QWeb~~ — hecho, mergeado a `main` (módulo `pos_reparto_remito`).
2. ~~Descuentos por volumen parametrizables por producto (ej. 4%/8%/12% según cantidad) + override manual en el renglón (RF-PV-09).~~ — hecho, mergeado a `main` (módulo `pos_reparto_descuento_volumen`, sección 5septies).
3. ~~Comisión de vendedor (RF-GV-03)~~ — hecho, ver sección 5octies. Falta solo el merge a `main`. **Corrección importante**: el cliente aclaró el 2026-09-02 que la comisión se devenga al cobrarle al cliente, no al generar el pedido — al revés de lo que decía esta misma línea hasta la resolución del 2026-08-24.
4. ~~Feature "Viaje"~~ — hecho, mergeado a `main`, ver sección 5sexies.
5. Criterio "2 visitas consecutivas sin cobro" de `pos_reparto_credito` (hoy solo días sin pago, ver deuda técnica en 5ter). **Próximo ítem a tomar.**
6. Productos habituales por cliente / venta sugerida (Should).
7. Integración Google Maps para secuenciar recorrido (Should, requiere API paga).
8. Reconexión automática de sync offline en POS — listener del evento `online` del navegador (ver sección 7, estimado una tarde, no bloqueante).

**Datos maestros pendientes** (no es código, es carga manual — **ampliado tras el incidente del 2026-08-29, ver sección 5sexies**: el catálogo de 182 productos, clientes reales, 2 pos.config originales y los 4 usuarios placeholder se perdieron y hay que recargarlos de cero, no solo completar lo que faltaba):
- Recargar el excel `Lista_Precios_Rincon_Del_Sur_Peyrano.xlsx` (productos, ver convención de carga en memoria `project-reparto-catalogo-productos`) — se perdió con el reset.
- Recrear las 2 configuraciones de POS ("Punto de Venta Reparto" con `ship_later`, "POS Camión 1" con ubicación propia — ver sección 4) — se perdió con el reset, solo queda un `pos.config` mínimo de prueba (id 1, sin la config de camión/ship_later).
- Cargar excel `Clientes_Ordenados_por_Codigo.xlsx` (clientes reales) — todavía no se cargó (esto ya estaba pendiente antes del incidente).
- Recrear los 4 usuarios placeholder de `pos_reparto_security` (`vendedor@reparto.local` etc., pass `Reparto2026!`) — se perdieron con el reset — y cuando haya datos reales, reemplazarlos por personas reales del cliente y asignar `user_id` (vendedor) en cada `res.partner` real.

### División de trabajo (actualizado 2026-09-03)

- **Juan**: ítem 4 (feature "Viaje") mergeado a `main`. Ítem 3 (comisión de vendedor, RF-GV-03) **completo y testeado** — 7/7 tasks del plan, 17 tests en verde, verificación manual en navegador hecha (ver sección 5octies). **Falta: merge a `main` vía `superpowers:finishing-a-development-branch`.** Después de mergear, seguir con ítem 5 (criterio de 2 visitas consecutivas sin cobro).
- **Compañero**: terminó ítem 1 (remito interno QWeb) e ítem 2 (descuentos por volumen) — ambos mergeados a `main`.

Cuando alguno termine su feature y mergee a `main`, actualizar esta sección con el siguiente ítem de la lista de gaps de arriba.

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
