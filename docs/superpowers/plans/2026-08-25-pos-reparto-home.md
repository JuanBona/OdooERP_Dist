# Pantalla de inicio táctil por rol (pos_reparto_home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el landing post-login por una grilla de cuadrados grandes (uno por app de negocio que el usuario ya puede ver), para navegar tocando en vez de leer el dropdown de texto chico.

**Architecture:** Módulo nuevo `pos_reparto_home`. Un método Python en `ir.ui.menu` arma la lista de tiles reusando la visibilidad nativa de menús de Odoo (sin duplicar reglas de permisos) y resolviendo, por cada app raíz, la primera acción real encontrada bajando el árbol de menús (muchas apps raíz tienen `action=False` y la acción real vive 1-2 niveles más abajo, ej. Sales → Orders → Quotations). Un client action OWL pinta la grilla y llama esa acción resuelta al tocar un tile. Se cablea como landing agregando un `ir.ui.menu` raíz nuevo con la secuencia más baja de todas, visible a `base.group_user`.

**Tech Stack:** Odoo 19 (Python ORM + OWL 2 / QWeb frontend), Docker (contenedor `odoo` de este proyecto).

---

## Contexto técnico confirmado antes de escribir este plan (no volver a investigar)

- Los menús raíz de apps (Contacts id 300, Sales id 191, Point of Sale id 271, Inventory id 230) tienen `action = False` en la mayoría de los casos — la acción real está en un descendiente. Ejemplo real: `Sales(191) → Orders(192) → Quotations(193, action=ir.actions.act_window,331)`. `Point of Sale(271) → Dashboard(291, action=ir.actions.act_window,482)`. `Contacts(300) → Contacts(301, action=ir.actions.act_window,497)`.
- `ir.ui.menu.get_user_roots()` ya existe en el core y devuelve los ids de menús raíz visibles para el usuario actual (filtra por grupos/reglas). No hay que reimplementar esa parte.
- `ir.ui.menu._filter_visible_menus()` (método ya existente, usado por el core para esto mismo) filtra un recordset de menús a los visibles para el usuario actual. Funciona igual dentro de un `TransactionCase` sin request HTTP activo (usa `if request else False` internamente).
- El campo `web_icon_data` de `ir.ui.menu` ya trae el ícono de cada app como PNG en binario (bytes base64) — no hace falta armar URLs a mano ni depender del string `web_icon` (formato `"modulo,ruta/relativa.png"`).
- `actionService.doAction(numero)` en el frontend acepta directamente el id numérico de CUALQUIER tipo de acción (`ir.actions.act_window`, `ir.actions.client`, etc.) — Odoo lo resuelve solo vía `/web/action/load`. No hace falta mandar el modelo, alcanza con el id.
- External ids confirmados a excluir de la grilla: `mail.menu_root_discuss` (Discuss), `project_todo.menu_todo_todos` (To-do), `base.menu_management` (Apps), `base.menu_administration` (Settings), `base.menu_tests` (Tests — menú técnico que aparece en este entorno de desarrollo).
- Grupos ya definidos en `pos_reparto_security` (ver `addons/pos_reparto_security/security/reparto_groups.xml`) que se usan en los tests de este plan: `point_of_sale.group_pos_user`, `stock.group_stock_user`, `sales_team.group_sale_salesman_all_leads`, `base.group_user`.
- **Ojo:** `base.group_user` (Usuario Interno) por sí solo ya da acceso a la app Contacts — todo usuario interno la ve, incluido un Vendedor sin ningún grupo extra. Por eso el tile de Contacts aparece para todos los roles, no es un bug.

---

## Task 1: Esqueleto del módulo

**Files:**
- Create: `addons/pos_reparto_home/__init__.py`
- Create: `addons/pos_reparto_home/__manifest__.py`
- Create: `addons/pos_reparto_home/models/__init__.py`

- [ ] **Step 1: Crear estructura de carpetas y manifest**

`addons/pos_reparto_home/__manifest__.py`:
```python
{
    'name': 'POS Reparto - Pantalla de Inicio',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Pantalla de inicio con cuadraditos tactiles por rol, reemplaza el landing de Discuss',
    'depends': ['web', 'pos_reparto_branding'],
    'data': [
        'data/home_menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_reparto_home/static/src/home_screen.scss',
            'pos_reparto_home/static/src/home_screen.js',
            'pos_reparto_home/static/src/home_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

`addons/pos_reparto_home/__init__.py`:
```python
from . import models
```

`addons/pos_reparto_home/models/__init__.py`:
```python
from . import ir_ui_menu
```

- [ ] **Step 2: Commit**

```bash
git add addons/pos_reparto_home/__init__.py addons/pos_reparto_home/__manifest__.py addons/pos_reparto_home/models/__init__.py
git commit -m "pos_reparto_home: esqueleto del modulo"
```

(El módulo todavía no instala nada usable — `models/ir_ui_menu.py` y `data/home_menu.xml` referenciados arriba no existen aún, se crean en las próximas tasks. No intentar instalar el módulo todavía.)

---

## Task 2: Método de resolución de tiles (`get_reparto_home_tiles`)

**Files:**
- Create: `addons/pos_reparto_home/models/ir_ui_menu.py`
- Test: `addons/pos_reparto_home/tests/test_home_tiles.py`
- Create: `addons/pos_reparto_home/tests/__init__.py`

- [ ] **Step 1: Escribir el test (todavía va a fallar, el módulo ni instala)**

`addons/pos_reparto_home/tests/__init__.py`:
```python
from . import test_home_tiles
```

`addons/pos_reparto_home/tests/test_home_tiles.py`:
```python
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoHomeTiles(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_internal = cls.env.ref('base.group_user')
        cls.group_pos_user = cls.env.ref('point_of_sale.group_pos_user')
        cls.group_stock_user = cls.env.ref('stock.group_stock_user')
        cls.group_sale_all_leads = cls.env.ref('sales_team.group_sale_salesman_all_leads')

        cls.vendedor = cls.env['res.users'].create({
            'name': 'Test Vendedor Tiles',
            'login': 'test_vendedor_tiles',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_pos_user.id])],
        })
        cls.gerencia = cls.env['res.users'].create({
            'name': 'Test Gerencia Tiles',
            'login': 'test_gerencia_tiles',
            'group_ids': [(6, 0, [
                cls.group_internal.id,
                cls.group_pos_user.id,
                cls.group_stock_user.id,
                cls.group_sale_all_leads.id,
            ])],
        })

    def test_vendedor_ve_pos_y_contactos(self):
        tiles = self.env['ir.ui.menu'].with_user(self.vendedor).get_reparto_home_tiles()
        names = {tile['name'] for tile in tiles}
        self.assertEqual(names, {'Point of Sale', 'Contacts'})

    def test_gerencia_ve_ventas_pos_inventario_contactos(self):
        tiles = self.env['ir.ui.menu'].with_user(self.gerencia).get_reparto_home_tiles()
        names = {tile['name'] for tile in tiles}
        self.assertEqual(names, {'Sales', 'Point of Sale', 'Inventory', 'Contacts'})

    def test_discuss_todo_apps_settings_nunca_aparecen(self):
        tiles = self.env['ir.ui.menu'].with_user(self.gerencia).get_reparto_home_tiles()
        names = {tile['name'] for tile in tiles}
        for excluded in ('Discuss', 'To-do', 'Apps', 'Settings'):
            self.assertNotIn(excluded, names)

    def test_tile_trae_action_id_resuelto_y_valido(self):
        tiles = self.env['ir.ui.menu'].with_user(self.vendedor).get_reparto_home_tiles()
        pos_tile = next(t for t in tiles if t['name'] == 'Point of Sale')
        self.assertTrue(pos_tile['action_id'])
        action = self.env['ir.actions.act_window'].browse(pos_tile['action_id'])
        self.assertTrue(action.exists())

    def test_tile_trae_icono(self):
        tiles = self.env['ir.ui.menu'].with_user(self.vendedor).get_reparto_home_tiles()
        pos_tile = next(t for t in tiles if t['name'] == 'Point of Sale')
        self.assertTrue(pos_tile['web_icon_data'])
```

- [ ] **Step 2: Crear `models/ir_ui_menu.py` vacío y correr el test para confirmar que falla**

`addons/pos_reparto_home/models/ir_ui_menu.py` (versión mínima, sin el método todavía):
```python
from odoo import models


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'
```

Instalar el módulo por primera vez y correr los tests (parar Odoo antes, ver nota de Docker más abajo):

```bash
docker compose stop odoo
docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -i pos_reparto_home --test-enable --test-tags /pos_reparto_home --stop-after-init
```

Expected: falla con `AttributeError: 'ir.ui.menu' object has no attribute 'get_reparto_home_tiles'`.

- [ ] **Step 3: Implementar el método**

`addons/pos_reparto_home/models/ir_ui_menu.py`:
```python
from odoo import api, models

_BLACKLIST_XMLIDS = [
    'mail.menu_root_discuss',
    'project_todo.menu_todo_todos',
    'base.menu_management',
    'base.menu_administration',
    'base.menu_tests',
]


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    def _reparto_home_blacklist_ids(self):
        ids = []
        for xmlid in _BLACKLIST_XMLIDS:
            menu = self.env.ref(xmlid, raise_if_not_found=False)
            if menu:
                ids.append(menu.id)
        return ids

    def _reparto_home_resolve_action_id(self):
        """Primer action_id visible del propio menu o, si no tiene, de sus
        descendientes en orden de sequence (DFS pre-order). Muchas apps raiz
        (Sales, Contacts, Point of Sale, Inventory) tienen action=False y la
        accion real vive 1-2 niveles mas abajo."""
        self.ensure_one()
        if self.action:
            return self.action.id
        children = self.env['ir.ui.menu'].search(
            [('parent_id', '=', self.id)], order='sequence, id',
        )._filter_visible_menus()
        for child in children:
            action_id = child._reparto_home_resolve_action_id()
            if action_id:
                return action_id
        return False

    @api.model
    def get_reparto_home_tiles(self):
        blacklist_ids = self._reparto_home_blacklist_ids()
        roots = self.get_user_roots().filtered(
            lambda m: m.id not in blacklist_ids
        ).sorted('sequence')

        tiles = []
        for menu in roots:
            action_id = menu._reparto_home_resolve_action_id()
            if not action_id:
                continue
            tiles.append({
                'id': menu.id,
                'name': menu.name,
                'web_icon_data': menu.web_icon_data.decode() if menu.web_icon_data else False,
                'action_id': action_id,
            })
        return tiles
```

- [ ] **Step 4: Actualizar el módulo y correr los tests de nuevo**

```bash
docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_home --test-enable --test-tags /pos_reparto_home --stop-after-init
```

Expected: `5 tests ... OK` (o el conteo que corresponda), `0 failed, 0 error(s)`.

- [ ] **Step 5: Levantar Odoo de nuevo**

```bash
docker compose up -d odoo
```

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_home/models/ir_ui_menu.py addons/pos_reparto_home/tests/
git commit -m "pos_reparto_home: metodo get_reparto_home_tiles con resolucion de action por DFS"
```

---

## Task 3: Client action OWL + wiring como pantalla de inicio

**Files:**
- Create: `addons/pos_reparto_home/static/src/home_screen.js`
- Create: `addons/pos_reparto_home/static/src/home_screen.xml`
- Create: `addons/pos_reparto_home/data/home_menu.xml`

- [ ] **Step 1: Componente OWL**

`addons/pos_reparto_home/static/src/home_screen.js`:
```javascript
import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

export class RepartoHomeScreen extends Component {
    static template = "pos_reparto_home.HomeScreen";
    static props = { ...standardActionServiceProps };

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.state = useState({ tiles: [], loading: true });
        onWillStart(async () => {
            this.state.tiles = await this.orm.call("ir.ui.menu", "get_reparto_home_tiles", []);
            this.state.loading = false;
        });
    }

    onTileClick(tile) {
        this.actionService.doAction(tile.action_id, { clearBreadcrumbs: true });
    }
}

registry.category("actions").add("pos_reparto_home.home_screen", RepartoHomeScreen);
```

- [ ] **Step 2: Template QWeb**

`addons/pos_reparto_home/static/src/home_screen.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<templates xml:space="preserve">

    <t t-name="pos_reparto_home.HomeScreen">
        <div class="o_reparto_home">
            <div t-if="state.loading" class="o_reparto_home_loading">
                Cargando...
            </div>
            <div t-elif="!state.tiles.length" class="o_reparto_home_empty">
                No tenés apps asignadas. Avisá a un administrador.
            </div>
            <div t-else="" class="o_reparto_home_grid">
                <div t-foreach="state.tiles" t-as="tile" t-key="tile.id"
                     class="o_reparto_home_tile"
                     t-on-click="() => this.onTileClick(tile)">
                    <img t-if="tile.web_icon_data"
                         t-attf-src="data:image/png;base64,{{tile.web_icon_data}}"/>
                    <span t-out="tile.name"/>
                </div>
            </div>
        </div>
    </t>

</templates>
```

- [ ] **Step 3: Registro server-side de la accion y el menu**

`addons/pos_reparto_home/data/home_menu.xml`:
```xml
<odoo>
    <record id="action_reparto_home" model="ir.actions.client">
        <field name="name">Inicio</field>
        <field name="tag">pos_reparto_home.home_screen</field>
    </record>

    <menuitem id="menu_reparto_home"
        name="Inicio"
        action="action_reparto_home"
        sequence="1"
        groups="base.group_user"/>
</odoo>
```

(Sequence 1 es más baja que Discuss, que hoy tiene sequence 5 y es la primera app — por eso Odoo va a elegir "Inicio" como landing tras el login sin tocar el `action_id` de cada usuario a mano.)

- [ ] **Step 4: Actualizar el módulo**

```bash
docker compose stop odoo
docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_home --stop-after-init
docker compose up -d odoo
```

Expected: sin errores en el log (sin tracebacks de Python ni de carga de assets).

- [ ] **Step 5: Verificación manual en navegador**

Loguear con `vendedor@reparto.local` (password `Reparto2026!`, ver [[project-pos-reparto-security-status]]) y confirmar:
- Tras el login cae directo en la grilla (no en Discuss).
- Se ven 2 cuadraditos: Point of Sale y Contacts, cada uno con su ícono.
- Tocar el cuadradito de Point of Sale navega al dashboard de POS.
- El dropdown chico de siempre sigue teniendo la entrada "Inicio" para volver.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_home/static/src/home_screen.js addons/pos_reparto_home/static/src/home_screen.xml addons/pos_reparto_home/data/home_menu.xml
git commit -m "pos_reparto_home: pantalla de inicio OWL, cablear como landing post-login"
```

---

## Task 4: Estilo visual (grilla táctil + marca)

**Files:**
- Create: `addons/pos_reparto_home/static/src/home_screen.scss`

- [ ] **Step 1: Escribir el SCSS**

`addons/pos_reparto_home/static/src/home_screen.scss`:
```scss
// Mismo rojo de marca que pos_reparto_branding (ver navbar_colors.scss,
// $o-navbar-background ya vale #A81C21 ahi). Se referencia la variable en
// vez de repetir el hex a mano.
$reparto-home-accent: $o-navbar-background;

.o_reparto_home {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f5f5f5;
}

.o_reparto_home_grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 24px;
    max-width: 900px;
    padding: 24px;
}

.o_reparto_home_tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1 / 1;
    min-height: 140px;
    padding: 16px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    user-select: none;
    transition: transform 0.1s ease, box-shadow 0.1s ease;

    &:active {
        transform: scale(0.96);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
        border: 2px solid $reparto-home-accent;
    }

    img {
        width: 64px;
        height: 64px;
        margin-bottom: 12px;
    }

    span {
        font-size: 1rem;
        font-weight: 600;
        text-align: center;
        color: #333333;
    }
}

.o_reparto_home_loading,
.o_reparto_home_empty {
    font-size: 1.2rem;
    color: #666666;
    text-align: center;
    padding: 24px;
}
```

- [ ] **Step 2: Actualizar el módulo y verificar visualmente**

```bash
docker compose stop odoo
docker compose run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_home --stop-after-init
docker compose up -d odoo
```

Expected: sin errores de compilación SCSS (si `$o-navbar-background` no se pudiera resolver en este bundle, el log de este comando muestra un error de Sass explícito con el nombre de la variable — si eso pasa, reemplazar la línea por el hex directo `#A81C21` con el mismo comentario).

Loguear con cualquiera de los 4 usuarios placeholder y confirmar visualmente: tarjetas blancas grandes, separación cómoda para tocar con el dedo, feedback visual (borde rojo) al tocar un cuadradito.

- [ ] **Step 3: Commit**

```bash
git add addons/pos_reparto_home/static/src/home_screen.scss
git commit -m "pos_reparto_home: estilo de grilla tactil con acento de marca"
```

---

## Task 5: Verificación cruzada de los 4 roles + memoria

**Files:** ninguno (solo verificación manual + actualización de memoria del proyecto, fuera del repo)

- [ ] **Step 1: Loguear con los 4 usuarios placeholder y confirmar tiles esperados**

Usar `vendedor@reparto.local`, `deposito@reparto.local`, `adminop@reparto.local`, `gerencia@reparto.local` (password `Reparto2026!` los 4, ver [[project-pos-reparto-security-status]]):

| Usuario | Tiles esperados |
|---|---|
| Vendedor | Point of Sale, Contacts |
| Depósito | Point of Sale, Contacts, Inventory |
| Admin Operativa | Point of Sale, Contacts, Sales, Inventory |
| Gerencia | Point of Sale, Contacts, Sales, Inventory |

- [ ] **Step 2: Confirmar que Discuss/To-do/Apps/Settings siguen accesibles desde el dropdown chico**

Con cualquiera de los 4 usuarios, abrir el dropdown chico (ícono grilla arriba a la izquierda) desde dentro de una app y confirmar que Discuss y To-do siguen ahí (no se ocultaron del sistema, solo no son tiles).

- [ ] **Step 3: Actualizar memoria del proyecto**

Actualizar el archivo de memoria `project_pos_reparto_security_status.md` (o crear uno nuevo si el asistente lo considera, siguiendo la convención ya usada en la sesión) documentando: módulo `pos_reparto_home` completo y qué hace, para que quede registrado igual que el resto de los módulos Reparto.

- [ ] **Step 4: Commit final si quedó algo suelto**

```bash
git status --short
```

Si hay cambios sin commitear (no debería, cada task ya commiteó lo suyo), revisar con `git diff` antes de decidir si commitear.
