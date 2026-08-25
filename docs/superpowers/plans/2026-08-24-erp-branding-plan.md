# Personalización visual del ERP — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nombre real de la compañía, ocultar 3 apps sin uso del menú principal, y recolorear la topbar del backend con el rojo de marca (`#a81c21`), según `docs/superpowers/specs/2026-08-24-erp-branding-design.md`.

**Architecture:** Un módulo nuevo, `pos_reparto_branding` (depende de `web`, `project`, `spreadsheet_dashboard`, `utm`), con datos XML (`ir.ui.menu.active = False`) para ocultar menús y un archivo SCSS registrado en el bundle `web._assets_primary_variables` para recolorear la navbar. El cambio de nombre de la compañía es una acción manual de un solo campo, sin módulo.

**Tech Stack:** Odoo 19 Community (Docker), Python (ORM), SCSS (bundle de assets de Odoo), XML (data de `ir.ui.menu`).

**Entorno de referencia:** contenedor `odoo` vía `docker compose`, base `odoo`, conexión `--db_host=db --db_user=odoo --db_password=odoo` (mismo patrón usado en toda la sesión — ver `docker-compose.yml`).

---

## Contexto técnico ya investigado (no hace falta re-descubrirlo)

- Los 3 menús raíz a ocultar y sus external IDs reales, confirmados por consola contra la base real:
  - `Project` → `project.menu_main_pm`
  - `Dashboards` → `spreadsheet_dashboard.spreadsheet_dashboard_menu_root`
  - `Link Tracker` → `utm.menu_link_tracker_root`
  - (Los nombres en la base están en inglés — Odoo traduce en pantalla vía i18n, pero el campo `name` y las búsquedas por external ID no dependen del idioma.)
- El color de fondo de la topbar del backend sale de la variable SCSS `$o-navbar-background` (definida en `web/static/src/webclient/navbar/navbar.variables.scss` dentro del paquete `odoo/addons/web`, ruta real en el contenedor: `/usr/lib/python3/dist-packages/odoo/addons/web/static/src/webclient/navbar/navbar.variables.scss`). El borde inferior sale de `$o-navbar-border-bottom`.
- Ambas variables son `!default` y se compilan dentro del bundle `web._assets_primary_variables` (glob `web/static/src/**/*.variables.scss`, incluido antes que las reglas de estilo reales de `assets_backend`). Para pisarlas sin tocar el core, un módulo propio agrega su archivo SCSS a ese mismo bundle (`'assets': {'web._assets_primary_variables': [...]}`) — mismo patrón de `'assets'` por bundle que ya usa `pos_reparto_credito` en este repo.
- La función Sass `darken()` está disponible en ese punto de la compilación (Odoo carga `_functions.scss` antes de incluir `_assets_primary_variables` dentro de `_assets_helpers`), así que se puede escribir `darken(#A81C21, 10%)` igual que hace el core, sin hardcodear el tono oscuro a mano.

---

## Task 1: Nombre real de la compañía (acción manual, sin código)

No requiere módulo — es un campo de datos. Se documenta como tarea para no perderlo de la lista.

**Pasos:**

- [ ] **Paso 1:** En el navegador, entrar a Odoo como admin → **Ajustes** → **Usuarios y compañías** → **Compañías** → abrir la única compañía existente.
- [ ] **Paso 2:** Campo **Nombre**: cambiar `My Company` por `Rincon del sur`. Guardar (ícono de nube).
- [ ] **Paso 3: Verificar por consola** (no hace falta UI para confirmar):

```bash
docker compose exec -T odoo odoo shell -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http <<'EOF'
c = env['res.company'].search([], limit=1)
print("name:", c.name)
assert c.name == "Rincon del sur", f"esperaba 'Rincon del sur', quedo '{c.name}'"
print("OK")
EOF
```

Expected: imprime `name: Rincon del sur` y `OK`, sin traceback de `AssertionError`.

- [ ] **Paso 4:** No hay commit — es un cambio de datos en la base, no de código. Seguir a la Task 2.

---

## Task 2: Scaffold del módulo + ocultar menús sin uso

**Files:**
- Create: `addons/pos_reparto_branding/__init__.py`
- Create: `addons/pos_reparto_branding/__manifest__.py`
- Create: `addons/pos_reparto_branding/data/hide_unused_menus.xml`
- Create: `addons/pos_reparto_branding/tests/__init__.py`
- Create: `addons/pos_reparto_branding/tests/test_hide_menus.py`

- [ ] **Step 1: Crear el esqueleto del módulo**

`addons/pos_reparto_branding/__init__.py` (vacío — el módulo no tiene `models/`, todo es data XML + assets; Odoo descubre `tests/` solo cuando corre con `--test-enable`, no hace falta importarlo acá, mismo patrón que `addons/pos_reparto_credito/__init__.py` en este repo):

```python
```

`addons/pos_reparto_branding/__manifest__.py`:

```python
{
    'name': 'POS Reparto - Branding',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Oculta apps sin uso y aplica el color de marca a la barra superior del backend',
    'depends': ['web', 'project', 'spreadsheet_dashboard', 'utm'],
    'data': [
        'data/hide_unused_menus.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

`addons/pos_reparto_branding/tests/__init__.py`:

```python
from . import test_hide_menus
```

- [ ] **Step 2: Escribir el test que falla primero**

`addons/pos_reparto_branding/tests/test_hide_menus.py`:

```python
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestHideUnusedMenus(TransactionCase):

    def test_unused_apps_are_hidden(self):
        hidden_menu_xml_ids = [
            'project.menu_main_pm',
            'spreadsheet_dashboard.spreadsheet_dashboard_menu_root',
            'utm.menu_link_tracker_root',
        ]
        for xml_id in hidden_menu_xml_ids:
            menu = self.env.ref(xml_id)
            self.assertFalse(
                menu.active,
                f"{xml_id} deberia estar oculto (active=False) y sigue activo",
            )

    def test_used_apps_stay_visible(self):
        visible_menu_xml_ids = [
            'point_of_sale.menu_point_root',
            'stock.menu_stock_root',
            'contacts.menu_contacts',
            'sale.sale_menu_root',
            'account.menu_finance',
        ]
        for xml_id in visible_menu_xml_ids:
            menu = self.env.ref(xml_id)
            self.assertTrue(
                menu.active,
                f"{xml_id} no deberia haberse tocado y quedo oculto",
            )
```

- [ ] **Step 3: Falta el archivo de datos todavía — crearlo vacío para poder instalar el módulo y ver el test fallar limpio**

`addons/pos_reparto_branding/data/hide_unused_menus.xml`:

```xml
<odoo>
</odoo>
```

- [ ] **Step 4: Instalar el módulo y correr el test — debe fallar**

```bash
docker compose exec -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo \
  -i pos_reparto_branding --test-enable --test-tags /pos_reparto_branding --stop-after-init
```

Expected: el log muestra `FAIL: TestHideUnusedMenus.test_unused_apps_are_hidden` (los 3 menús siguen `active=True` porque el XML todavía no los toca). `test_used_apps_stay_visible` sí debería pasar (no se tocó nada todavía).

- [ ] **Step 5: Completar el XML que oculta los 3 menús**

`addons/pos_reparto_branding/data/hide_unused_menus.xml`:

```xml
<odoo noupdate="1">
    <record id="project.menu_main_pm" model="ir.ui.menu">
        <field name="active">False</field>
    </record>
    <record id="spreadsheet_dashboard.spreadsheet_dashboard_menu_root" model="ir.ui.menu">
        <field name="active">False</field>
    </record>
    <record id="utm.menu_link_tracker_root" model="ir.ui.menu">
        <field name="active">False</field>
    </record>
</odoo>
```

`noupdate="1"` es a propósito (ver spec): si alguien reactiva un menú a mano desde modo desarrollador, una futura actualización del módulo no se lo vuelve a ocultar solo.

- [ ] **Step 6: Actualizar el módulo y correr el test de nuevo — debe pasar**

```bash
docker compose exec -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo \
  -u pos_reparto_branding --test-enable --test-tags /pos_reparto_branding --stop-after-init
```

Expected: `2 tests` corridos, `0 failed`. Si `test_unused_apps_are_hidden` sigue fallando, revisar que se usó `-u` (update, no `-i`) para que Odoo vuelva a cargar los datos del `noupdate="1")` — con `noupdate="1"`, un `-u` sobre un módulo YA instalado por primera vez con esos datos **no los vuelve a aplicar** si ya existían; en este caso es la primera instalación real así que sí van a cargar. Si en algún momento hay que forzar la recarga de datos `noupdate`, se hace borrando el registro de `ir.model.data` correspondiente o reinstalando el módulo.

- [ ] **Step 7: Verificación manual en navegador**

Recargar `http://localhost:8069/odoo` como admin y confirmar que **Project**, **Dashboards** y **Link Tracker** ya no aparecen en la grilla de apps (ícono de 9 puntos arriba a la izquierda), mientras que Punto de venta, Inventario, Contactos, Ventas y Facturación siguen ahí.

- [ ] **Step 8: Commit**

```bash
git add addons/pos_reparto_branding/__init__.py addons/pos_reparto_branding/__manifest__.py addons/pos_reparto_branding/data/hide_unused_menus.xml addons/pos_reparto_branding/tests/
git commit -m "$(cat <<'EOF'
Ocultar apps sin uso del menu principal (pos_reparto_branding)

Project, Dashboards y Link Tracker no se usan hoy en el dia a dia del
negocio. Se ocultan via ir.ui.menu.active=False con noupdate=1 (no se
desinstalan, quedan reversibles desde modo desarrollador si algun dia
hacen falta). Primer componente del modulo pos_reparto_branding, ver
docs/superpowers/specs/2026-08-24-erp-branding-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Barra superior roja (`#A81C21`)

**Files:**
- Create: `addons/pos_reparto_branding/static/src/scss/navbar_colors.scss`
- Modify: `addons/pos_reparto_branding/__manifest__.py`

- [ ] **Step 1: Crear el archivo SCSS de override**

`addons/pos_reparto_branding/static/src/scss/navbar_colors.scss`:

```scss
// Color de marca de Rincón del Sur — ver res.company.primary_color (#a81c21)
// Pisa las variables del navbar del backend antes de que se compilen las
// reglas que las usan (ver Task 3 en el plan de implementacion para el
// detalle de por que este archivo va en el bundle _assets_primary_variables
// y no directamente en assets_backend).
$o-navbar-background: #A81C21;
$o-navbar-border-bottom: 1px solid darken(#A81C21, 10%);
```

- [ ] **Step 2: Registrar el archivo en el bundle de variables del backend**

Modificar `addons/pos_reparto_branding/__manifest__.py`, agregando la clave `'assets'` (no existía todavía en este módulo):

```python
{
    'name': 'POS Reparto - Branding',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Oculta apps sin uso y aplica el color de marca a la barra superior del backend',
    'depends': ['web', 'project', 'spreadsheet_dashboard', 'utm'],
    'data': [
        'data/hide_unused_menus.xml',
    ],
    'assets': {
        'web._assets_primary_variables': [
            'pos_reparto_branding/static/src/scss/navbar_colors.scss',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 3: No hay test automatizado sensato para "la topbar es roja" — actualizar el módulo y verificar visualmente**

```bash
docker compose exec -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo \
  -u pos_reparto_branding --stop-after-init
```

Expected: log termina en `Modules loaded.` sin tracebacks de compilación SCSS (un error de sintaxis Sass corta la carga con un traceback bien visible mencionando el archivo `navbar_colors.scss`).

- [ ] **Step 4: Forzar recompilación de assets y verificar en el navegador**

Los bundles de assets de Odoo quedan cacheados en la base (`ir.attachment`). Para ver el cambio sin dudas, entrar en modo desarrollador y regenerar assets, o simplemente:

```bash
docker compose exec -T odoo odoo shell -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http <<'EOF'
env['ir.qweb']._pragma_no_cache = True
env['web_editor.assets'].reset_asset('web.assets_backend', 'web.assets_backend.min.css') if 'web_editor.assets' in env else None
env['ir.attachment'].search([('name', 'like', '%assets_backend%')]).unlink()
print("assets_backend cache cleared")
EOF
```

Luego recargar `http://localhost:8069/odoo` (puede hacer falta un hard refresh, Ctrl+Shift+R) y confirmar visualmente:

- La barra superior es roja (`#A81C21`) en **al menos 4 apps distintas**: Inventario, Contactos, Facturación, Punto de venta (pantalla de configuración de backend, no el POS en sí — el POS tiene su propia UI aparte).
- El texto/iconos blancos siguen siendo legibles sobre el rojo.
- Los badges de notificación (mensajes, actividades) siguen siendo visibles y distinguibles del fondo.

Si el color no cambia después del hard refresh, verificar que el `-u pos_reparto_branding` del Step 3 haya corrido sin errores, y que no haya quedado un `!default` en `navbar_colors.scss` (con `!default` puesto, si `_assets_primary_variables` ya definió la variable antes por otro archivo, la nuestra no pisaría nada — en este archivo las líneas van **sin** `!default`, a propósito).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_branding/static/ addons/pos_reparto_branding/__manifest__.py
git commit -m "$(cat <<'EOF'
Recolorear topbar del backend con el rojo de marca (pos_reparto_branding)

Override de \$o-navbar-background / \$o-navbar-border-bottom via el bundle
web._assets_primary_variables, sin tocar archivos del core. Aplica a
todo el backend (todas las apps), no solo al ticket de POS que ya tenia
su propio branding resuelto por separado. Opcion "A" elegida por el
cliente en la sesion de brainstorming con mockups, ver
docs/superpowers/specs/2026-08-24-erp-branding-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Documentar en el estado del proyecto

**Files:**
- Modify: `ESTADO_PROYECTO.md`

- [ ] **Step 1: Agregar una sección nueva siguiendo el patrón de las secciones existentes (5bis, 5ter)**

Buscar la sección `## 6. Facturación (ARCA/AFIP)` en `ESTADO_PROYECTO.md` e insertar **antes** de ella una sección nueva `## 5quater. Módulo custom: pos_reparto_branding` con este contenido:

```markdown
## 5quater. Módulo custom: `pos_reparto_branding`

Ubicación: `addons/pos_reparto_branding/`. Instalado. Depende de `web`, `project`, `spreadsheet_dashboard` y `utm`.

Qué hace: personalización visual pedida por el cliente en la sesión de brainstorming del 2026-08-24 (spec en `docs/superpowers/specs/2026-08-24-erp-branding-design.md`).

- Oculta del menú principal (grilla de apps) tres apps que hoy no se usan: Proyecto, Tableros y Rastreador de enlaces. No se desinstalan — quedan reversibles desde modo desarrollador (`ir.ui.menu.active`) si algún día hacen falta.
- Recolorea la barra superior de **todo el backend** (todas las apps) con el rojo de marca `#A81C21`, vía override de las variables SCSS `$o-navbar-background` / `$o-navbar-border-bottom` en el bundle `web._assets_primary_variables`. No toca el branding del ticket de POS ni de las facturas, que ya estaban resueltos antes de este módulo.

Fuera de este módulo: el nombre de la compañía se cambió a mano (Ajustes → Compañías) de "My Company" a "Rincon del sur" — es un dato, no código, no requiere módulo.
```

- [ ] **Step 2: Actualizar la fecha de "Última actualización" al principio del archivo**

Cambiar la línea 3 (`Última actualización: 2026-08-24`) si correspondiera a una fecha posterior — si sigue siendo el mismo día, dejarla igual.

- [ ] **Step 3: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "$(cat <<'EOF'
Documentar pos_reparto_branding en ESTADO_PROYECTO.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review (completado al escribir este plan)

- **Cobertura del spec:** los 3 objetivos del spec (nombre, ocultar menús, topbar roja) tienen cada uno su tarea. El punto "no se rediseña el resto de la paleta" del spec se refleja en Task 3 acotando el override a solo 2 variables (`$o-navbar-background`, `$o-navbar-border-bottom`), no a `$o-brand-odoo` global.
- **Placeholders:** ninguno — cada paso tiene código completo, comandos exactos y salida esperada.
- **Consistencia de nombres:** `pos_reparto_branding` se usa igual en manifest, comandos docker y `ESTADO_PROYECTO.md`. Los 3 external IDs de menús (`project.menu_main_pm`, `spreadsheet_dashboard.spreadsheet_dashboard_menu_root`, `utm.menu_link_tracker_root`) son los mismos en el XML de datos y en el test.
- **Alcance:** un solo módulo, 3 archivos de código + 1 de test + 1 de docs. No requiere descomponerse en planes separados.
