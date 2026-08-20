# Estado del proyecto — Odoo 19 CE local (Reparto)

Última actualización: 2026-08-20

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

## 6. Facturación (ARCA/AFIP)

Decisión tomada: por ahora, factura **local de Odoo sin timbrar** (Factura A/B/C interna, sin conexión a los webservices de ARCA). El vendedor elige facturar o no, caso por caso, en cada venta — es el comportamiento nativo de POS, no requiere config extra.

Conexión real a ARCA (testing u homologación) queda pendiente para más adelante si hace falta, requiere CUIT real, certificado digital y punto de venta habilitado en ARCA — no se puede simular en este entorno local sin esos datos.

## 7. Test de funcionamiento offline — "Punto de Venta Reparto"

Probado el 2026-08-20: qué pasa si el vendedor pierde señal a mitad de un pedido.

**Método**: se simuló la caída de conexión parando el container `odoo` (no la wifi real) mientras se armaba un pedido en el navegador — el POS deja de poder hablar con el backend, que es lo que importa para este test.

**Pasos y resultado**:
1. Cargar 1 producto (Agua Villa del Sur) con conexión normal → OK.
2. Cortar conexión al backend (`docker compose stop odoo`).
3. Seguir cargando productos sin señal (Coca-Cola, Fernet Branca) → la interfaz **sigue funcionando** (POS es offline-first, guarda en IndexedDB local del navegador).
4. Cobrar en efectivo y **validar sin conexión** → funcionó. Odoo mostró su propio aviso "Conexión perdida — la funcionalidad estará limitada hasta que se restablezca la conexión", pero cerró la venta igual y generó el ticket local (261-1-000004, $10.527).
5. Reconectar backend (`docker compose start odoo`).
6. **La orden NO sincronizó sola** — quedó en cola local. En la consola del navegador quedó registrado el error original: `ConnectionLostError: Connection to "/web/dataset/call_kw/pos.order/sync_from_ui" couldn't be established`, y no hubo reintento automático en background.
7. Al **recargar/reingresar a la sesión de POS**, ahí sí sincronizó: la orden apareció en Odoo real (verificado por API/MCP, no solo en pantalla) como `pos.order` id 4, `state=done`, $10.527, con las 3 líneas correctas.

**Conclusión**: no se pierde el pedido ni la plata — pero la sincronización al recuperar señal **no es 100% automática**. El vendedor tiene que volver a abrir (o recargar) la sesión de POS para que la orden pendiente efectivamente llegue a Odoo. Mientras tanto, esa venta no existe en el servidor (no impacta stock real, no es visible para nadie más) aunque el ticket ya se haya impreso/cobrado.

**Pendiente a investigar**: si hay forma de forzar el reintento de sync automático al detectar reconexión, para sacar el paso manual.

## 8. Acceso MCP (para asistentes de IA)

Configurado servidor MCP `odoo` en Claude Code (`claude mcp add odoo ...`), modo YOLO read-only (no requiere el addon `mcp_server`, autentica con usuario `admin` + API key nativa de Odoo). **La API key está en la config local de Claude Code, no en este repo** — cada persona que quiera este acceso debe generar su propia key en Settings → Users → API Keys y configurarla en su propia máquina.

## 9. Pendiente / próximos pasos

- Parte 2 del diseño de "venta por camión": flujo completo de facturación opcional al cerrar la venta (todavía no se armó, quedó frenado para escribir este reporte).
- Probar el circuito completo en el navegador (vos o tu compañero) desde POS Camión 1.
- Definir si se necesitan más camiones/ubicaciones (el patrón ya es repetible: ubicación + picking type + pos.config).
- Investigar cómo forzar el reintento automático de sync de POS al reconectar (ver sección 7).

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
