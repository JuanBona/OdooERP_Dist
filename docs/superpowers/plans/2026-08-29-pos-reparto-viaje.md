# pos_reparto_viaje Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `pos_reparto_viaje` module — a "viaje" (hoja de ruta) que Admin Operativa/Gerencia arma para un chofer/vendedor y una fecha, con checklist de clientes a visitar que se tilda solo al generar el pedido, y un tile táctil en la pantalla de Inicio para el chofer.

**Architecture:** Dos modelos nuevos (`reparto.viaje`, `reparto.viaje.parada`) sobre `point_of_sale` + `pos_reparto_security`. Override de `pos.order.create()` para auto-tick server-side (cubre offline/sync, mismo patrón que `pos_reparto_credito`). Deep-link a una sesión de POS nueva con cliente preseleccionado vía query param + patch de `PosStore`, reusando `pos.config.open_ui()` para no duplicar la lógica de creación de sesión. Pantalla del chofer: client action OWL nueva, aparece como tile en `pos_reparto_home` sin tocar ese módulo (mismo mecanismo genérico por menú raíz). Pantalla de Admin: vistas nativas de Odoo (kanban/list/form), sin JS custom.

**Tech Stack:** Odoo 19 CE (Python ORM, OWL, QWeb), Docker Compose (`db`, `odoo`), tests con `TransactionCase` (`odoo.tests.common`).

**Nota de secuencia importante:** el manifest se arma incrementalmente, task por task — cada task agrega a `data`/`assets` solo los archivos que ese mismo task crea. No adelantar referencias a archivos que todavía no existen: Odoo falla la instalación (`-i`/`-u`) si un archivo listado en `data` no existe en disco. Además: `TransactionCase.env` corre como superusuario (bypassa toda ACL/regla), así que los tests que usan el `env` a secas funcionan aunque todavía no exista el CSV de accesos — pero cualquier test con `.with_user(...)` sí necesita que el CSV/las reglas ya existan (por eso esos tests están recién en el Task 3, no antes).

**Nota de entorno (encontrada ejecutando el Task 2):**
- Este proyecto se ejecuta en un worktree separado del checkout principal. Todos los comandos `docker compose` de este plan deben llevar `-p odooerp_dist` (ej. `docker compose -p odooerp_dist stop odoo`) para reusar la misma base de datos real (productos, pos.config, usuarios) en vez de crear una vacía nueva basada en el nombre de carpeta del worktree.
- En Git Bash (Windows), el argumento `--test-tags /pos_reparto_viaje` se mangling a una ruta de Windows si no se antepone `MSYS_NO_PATHCONV=1` al comando — sin eso, corren 0 tests silenciosamente ("Invalid tag..."). Ya está incorporado en los comandos de este plan.
- Odoo 19 ya no soporta el atributo de clase `_sql_constraints` (queda como no-op silencioso, sin error ni warning fuerte — solo un log). El equivalente nuevo es un atributo de clase asignado a `models.Constraint(sql, message)` (ver Task 2). Si se agrega alguna otra constraint SQL en tasks futuros de este o cualquier otro módulo del proyecto, usar `models.Constraint`, no la sintaxis vieja.
- Al re-correr los tests, si el `odoo` service ya está parado (`docker compose -p odooerp_dist stop odoo`) desde un intento anterior, el `stop` del siguiente comando es un no-op inofensivo — no hace falta chequear el estado antes.
- **(Task 3)** `context_today()` NO está disponible en el contexto de evaluación de `domain_force` de `ir.rule` (a diferencia de los dominios de vistas de búsqueda, que sí lo tienen vía el intérprete del cliente web) — usar un override de `ir.rule._eval_context()` (ver `models/ir_rule.py` del Task 3) y referenciar `today` directo en el dominio, no `context_today()`.
- **(Task 5)** En una vista de búsqueda (`search`), el `<group>` que envuelve filtros de "Agrupar por" NO acepta los atributos `string`/`expand` en el esquema RelaxNG de Odoo 19 (`RNG_ERR_INVALIDATTR`) — usar `<group>` sin atributos, mismo patrón que la vista `point_of_sale.view_pos_order_filter` del core. El `<filter>` de agrupación necesita `domain="[]"` explícito (convención del core).
- **(Task 5)** `fields.Date.context_today` no es invocable sin argumento (`context_today(record, timestamp=None)`) — si se necesita pasarlo como `context_today` de cero-argumentos a un `safe_eval` (para reproducir en tests cómo se evalúa un dominio de filtro de búsqueda), envolverlo en `lambda: fields.Date.context_today(self.env.user)`.

---

## Antes de empezar

Trabajar en la rama `feature/pos-reparto-viaje` desde `main`:

```bash
git checkout main
git pull
git checkout -b feature/pos-reparto-viaje
```

Todos los comandos de test de este plan siguen la convención ya documentada en `ESTADO_PROYECTO.md` §5bis (Docker Desktop en Windows/Git Bash):

```bash
docker compose -p odooerp_dist stop odoo
MSYS_NO_PATHCONV=1 docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_viaje --test-enable --test-tags /pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```

Usar `-u` (update) una vez instalado por primera vez; el Task 1 usa `-i` (install) porque el módulo todavía no existe en la base.

---

### Task 1: Esqueleto del módulo

**Files:**
- Create: `addons/pos_reparto_viaje/__init__.py`
- Create: `addons/pos_reparto_viaje/__manifest__.py`
- Create: `addons/pos_reparto_viaje/models/__init__.py`
- Create: `addons/pos_reparto_viaje/models/reparto_viaje.py`

- [ ] **Step 1: Crear el manifest — `data`/`assets` vacíos por ahora, se llenan task por task**

`addons/pos_reparto_viaje/__manifest__.py`:
```python
{
    'name': 'POS Reparto - Viaje (Hoja de Ruta)',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Hoja de ruta diaria por chofer (checklist de clientes a visitar) para el proyecto Reparto',
    'depends': ['point_of_sale', 'pos_reparto_security'],
    'data': [],
    'assets': {},
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 2: `__init__.py` raíz y de `models/`**

`addons/pos_reparto_viaje/__init__.py`:
```python
from . import models
```

`addons/pos_reparto_viaje/models/__init__.py`:
```python
from . import reparto_viaje
```

- [ ] **Step 3: Modelo mínimo, solo para que el módulo instale (se completa en el Task 2)**

`addons/pos_reparto_viaje/models/reparto_viaje.py`:
```python
from odoo import fields, models


class RepartoViaje(models.Model):
    _name = 'reparto.viaje'
    _description = 'Viaje (hoja de ruta diaria de un chofer)'

    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)


class RepartoViajeParada(models.Model):
    _name = 'reparto.viaje.parada'
    _description = 'Parada de un viaje (cliente a visitar)'

    viaje_id = fields.Many2one('reparto.viaje', string='Viaje', required=True, ondelete='cascade')
```

- [ ] **Step 4: Instalar el módulo por primera vez**

Run:
```bash
docker compose -p odooerp_dist stop odoo
docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -i pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```
Expected: instala sin errores, sin tests todavía (no se pasó `--test-enable` porque todavía no hay tests).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_viaje/
git commit -m "pos_reparto_viaje: esqueleto del modulo"
```

---

### Task 2: Modelo completo — campos, compute, constraint

**Files:**
- Modify: `addons/pos_reparto_viaje/models/reparto_viaje.py`
- Create: `addons/pos_reparto_viaje/tests/__init__.py`
- Create: `addons/pos_reparto_viaje/tests/test_reparto_viaje.py`

- [ ] **Step 1: Reemplazar el modelo mínimo por el modelo completo**

Reemplazar todo el contenido de `addons/pos_reparto_viaje/models/reparto_viaje.py`:
```python
from odoo import api, fields, models


class RepartoViaje(models.Model):
    _name = 'reparto.viaje'
    _description = 'Viaje (hoja de ruta diaria de un chofer)'
    _order = 'fecha desc, id desc'

    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    chofer_id = fields.Many2one(
        'res.users', string='Chofer', required=True,
        domain=lambda self: [('group_ids', 'in', self.env.ref('pos_reparto_security.group_reparto_vendedor').id)],
    )
    pos_config_id = fields.Many2one('pos.config', string='Punto de Venta', required=True)
    parada_ids = fields.One2many('reparto.viaje.parada', 'viaje_id', string='Paradas')

    paradas_totales = fields.Integer(string='Paradas totales', compute='_compute_progreso')
    paradas_completadas = fields.Integer(string='Paradas completadas', compute='_compute_progreso')
    progreso = fields.Float(string='Progreso (%)', compute='_compute_progreso')

    _chofer_fecha_unique = models.Constraint(
        'unique(chofer_id, fecha)',
        'Este chofer ya tiene un viaje asignado para esa fecha.',
    )

    @api.depends('parada_ids.visitado')
    def _compute_progreso(self):
        for viaje in self:
            total = len(viaje.parada_ids)
            completadas = len(viaje.parada_ids.filtered('visitado'))
            viaje.paradas_totales = total
            viaje.paradas_completadas = completadas
            viaje.progreso = (completadas / total * 100) if total else 0.0

    @api.model
    def get_mi_viaje_hoy(self):
        viaje = self.search([
            ('chofer_id', '=', self.env.uid),
            ('fecha', '=', fields.Date.context_today(self)),
        ], limit=1)
        if not viaje:
            return False
        return {
            'id': viaje.id,
            'fecha': fields.Date.to_string(viaje.fecha),
            'paradas': [
                {'id': parada.id, 'partner_name': parada.partner_id.name, 'visitado': parada.visitado}
                for parada in viaje.parada_ids
            ],
        }


class RepartoViajeParada(models.Model):
    _name = 'reparto.viaje.parada'
    _description = 'Parada de un viaje (cliente a visitar)'

    viaje_id = fields.Many2one('reparto.viaje', string='Viaje', required=True, ondelete='cascade')
    partner_id = fields.Many2one('res.partner', string='Cliente', required=True)
    visitado = fields.Boolean(string='Visitado', default=False)
    pedido_id = fields.Many2one('pos.order', string='Pedido', readonly=True)

    def action_abrir_pos(self):
        self.ensure_one()
        action = self.viaje_id.pos_config_id.open_ui()
        action['url'] += f'&reparto_partner_id={self.partner_id.id}'
        return action
```

- [ ] **Step 2: Escribir los tests de modelo/constraint/compute**

`addons/pos_reparto_viaje/tests/__init__.py`:
```python
from . import test_reparto_viaje
```

`addons/pos_reparto_viaje/tests/test_reparto_viaje.py`:
```python
from odoo import fields
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoViaje(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_internal = cls.env.ref('base.group_user')
        cls.group_vendedor = cls.env.ref('pos_reparto_security.group_reparto_vendedor')
        cls.group_adminop = cls.env.ref('pos_reparto_security.group_reparto_adminop')

        cls.chofer_1 = cls.env['res.users'].create({
            'name': 'Chofer Viaje Uno',
            'login': 'chofer_viaje_uno_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.chofer_2 = cls.env['res.users'].create({
            'name': 'Chofer Viaje Dos',
            'login': 'chofer_viaje_dos_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.admin_op = cls.env['res.users'].create({
            'name': 'Admin Operativa Viaje Test',
            'login': 'adminop_viaje_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_adminop.id])],
        })

        cls.pos_config = cls.env['pos.config'].search([], limit=1)
        assert cls.pos_config, 'Se necesita al menos un pos.config existente en la base para estos tests.'

        cls.cliente_a = cls.env['res.partner'].create({'name': 'Cliente Viaje A'})
        cls.cliente_b = cls.env['res.partner'].create({'name': 'Cliente Viaje B'})

    def _crear_viaje(self, chofer, fecha, partners):
        return self.env['reparto.viaje'].create({
            'fecha': fecha,
            'chofer_id': chofer.id,
            'pos_config_id': self.pos_config.id,
            'parada_ids': [(0, 0, {'partner_id': p.id}) for p in partners],
        })

    def test_constraint_un_viaje_por_chofer_y_fecha(self):
        hoy = fields.Date.today()
        self._crear_viaje(self.chofer_1, hoy, [self.cliente_a])
        with self.assertRaises(Exception):
            self._crear_viaje(self.chofer_1, hoy, [self.cliente_b])

    def test_mismo_chofer_distinta_fecha_no_rompe_constraint(self):
        hoy = fields.Date.today()
        manana = fields.Date.add(hoy, days=1)
        self._crear_viaje(self.chofer_1, hoy, [self.cliente_a])
        viaje_2 = self._crear_viaje(self.chofer_1, manana, [self.cliente_b])
        self.assertTrue(viaje_2)

    def test_progreso_sin_paradas_es_cero(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [])
        self.assertEqual(viaje.paradas_totales, 0)
        self.assertEqual(viaje.progreso, 0.0)

    def test_progreso_computa_porcentaje_de_visitadas(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a, self.cliente_b])
        viaje.parada_ids[0].visitado = True
        self.assertEqual(viaje.paradas_totales, 2)
        self.assertEqual(viaje.paradas_completadas, 1)
        self.assertEqual(viaje.progreso, 50.0)
```

Estos tests no usan `.with_user(...)`, así que corren en modo superusuario (default de `TransactionCase.env`) y no necesitan que exista todavía ningún ACL — por eso pueden ir antes del Task 3.

- [ ] **Step 3: Correr los tests**

Run:
```bash
docker compose -p odooerp_dist stop odoo
MSYS_NO_PATHCONV=1 docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_viaje --test-enable --test-tags /pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```
Expected: 4 tests, todos en verde.

- [ ] **Step 4: Commit**

```bash
git add addons/pos_reparto_viaje/models/reparto_viaje.py addons/pos_reparto_viaje/tests/
git commit -m "pos_reparto_viaje: modelo completo con compute y constraint"
```

---

### Task 3: Seguridad — ACL y regla de acceso del chofer

**Files:**
- Create: `addons/pos_reparto_viaje/security/ir.model.access.csv`
- Create: `addons/pos_reparto_viaje/security/reparto_viaje_rules.xml`
- Create: `addons/pos_reparto_viaje/models/ir_rule.py`
- Modify: `addons/pos_reparto_viaje/models/__init__.py`
- Modify: `addons/pos_reparto_viaje/__manifest__.py`
- Modify: `addons/pos_reparto_viaje/tests/test_reparto_viaje.py`

**Corrección real de ejecución:** `context_today()` NO está disponible en el contexto de evaluación de `domain_force` de `ir.rule` en este Odoo 19 (a diferencia de los dominios de vistas de búsqueda, que se evalúan con un intérprete distinto en el cliente web y sí lo tienen). `ir.rule._eval_context()` (base) solo expone `user`/`company_id`/`company_ids` — usar `context_today()` ahí revienta con `NameError` al cargar el módulo. Por eso este task agrega `models/ir_rule.py`, que hereda `ir.rule` y agrega `today` al contexto (mismo patrón que usa el core en `website/models/ir_rule.py` para agregar `website`), y los dominios usan `today` directo en vez de `context_today().strftime(...)`.

- [ ] **Step 1: CSV de accesos base**

`addons/pos_reparto_viaje/security/ir.model.access.csv`:
```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_reparto_viaje_vendedor,reparto.viaje.vendedor,model_reparto_viaje,pos_reparto_security.group_reparto_vendedor,1,0,0,0
access_reparto_viaje_adminop,reparto.viaje.adminop,model_reparto_viaje,pos_reparto_security.group_reparto_adminop,1,1,1,1
access_reparto_viaje_gerencia,reparto.viaje.gerencia,model_reparto_viaje,pos_reparto_security.group_reparto_gerencia,1,1,1,1
access_reparto_viaje_parada_vendedor,reparto.viaje.parada.vendedor,model_reparto_viaje_parada,pos_reparto_security.group_reparto_vendedor,1,0,0,0
access_reparto_viaje_parada_adminop,reparto.viaje.parada.adminop,model_reparto_viaje_parada,pos_reparto_security.group_reparto_adminop,1,1,1,1
access_reparto_viaje_parada_gerencia,reparto.viaje.parada.gerencia,model_reparto_viaje_parada,pos_reparto_security.group_reparto_gerencia,1,1,1,1
```

Nota: a diferencia de `pos_reparto_security` (que restringe modelos ya existentes con ACL propia de otros módulos, y por eso necesita reglas con domain imposible para bloquear en serio), acá los modelos son nuevos — nadie más otorga acceso, así que los flags `perm_write/create/unlink=0` del vendedor alcanzan solos, sin necesitar una regla extra de bloqueo duro.

- [ ] **Step 2: Regla de dominio — el chofer solo ve el viaje de HOY que es suyo**

`addons/pos_reparto_viaje/security/reparto_viaje_rules.xml`:
```xml
<odoo>
    <record id="rule_reparto_viaje_vendedor" model="ir.rule">
        <field name="name">Vendedor Reparto: solo su viaje de hoy</field>
        <field name="model_id" ref="model_reparto_viaje"/>
        <field name="domain_force">[('chofer_id', '=', user.id), ('fecha', '=', today)]</field>
        <field name="groups" eval="[(4, ref('pos_reparto_security.group_reparto_vendedor'))]"/>
    </record>

    <record id="rule_reparto_viaje_parada_vendedor" model="ir.rule">
        <field name="name">Vendedor Reparto: solo paradas de su viaje de hoy</field>
        <field name="model_id" ref="model_reparto_viaje_parada"/>
        <field name="domain_force">[('viaje_id.chofer_id', '=', user.id), ('viaje_id.fecha', '=', today)]</field>
        <field name="groups" eval="[(4, ref('pos_reparto_security.group_reparto_vendedor'))]"/>
    </record>
</odoo>
```

- [ ] **Step 2bis: Override de `ir.rule` para exponer `today` al dominio**

`addons/pos_reparto_viaje/models/ir_rule.py`:
```python
from odoo import api, fields, models


class IrRule(models.Model):
    _inherit = 'ir.rule'

    @api.model
    def _eval_context(self):
        result = super()._eval_context()
        result['today'] = fields.Date.context_today(self)
        return result
```

Reemplazar en `addons/pos_reparto_viaje/models/__init__.py`:
```python
from . import reparto_viaje
from . import pos_order
```
por:
```python
from . import ir_rule
from . import reparto_viaje
from . import pos_order
```
(si `pos_order` todavía no existe en este archivo porque el Task 4 no corrió antes que este, dejar solo la línea de `reparto_viaje`; el orden entre `ir_rule` y los demás no importa.)

- [ ] **Step 3: Agregar los 2 archivos a `data` en el manifest**

Reemplazar en `addons/pos_reparto_viaje/__manifest__.py`:
```python
    'data': [],
```
por:
```python
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_viaje_rules.xml',
    ],
```

**Corrección real adicional:** `pos_reparto_security` ya restringe `res.partner` para el grupo Vendedor a "solo mis clientes" (`user_id = user.id`). `get_mi_viaje_hoy()` lee `parada.partner_id.name`, así que `cliente_a`/`cliente_b` en `setUpClass` necesitan `user_id=cls.chofer_1.id` para que el chofer pueda leerlos — si no, `test_get_mi_viaje_hoy_devuelve_paradas_propias` falla con `AccessError`. Agregar ese campo a los dos `create()` de partners en `setUpClass` (ver Task 2 para dónde están esas líneas).

- [ ] **Step 4: Agregar los tests que dependen del ACL/reglas (acceso + `get_mi_viaje_hoy` + `action_abrir_pos`)**

Agregar al final de la clase `TestRepartoViaje` en `addons/pos_reparto_viaje/tests/test_reparto_viaje.py`:
```python
    def test_get_mi_viaje_hoy_sin_viaje_asignado(self):
        resultado = self.env['reparto.viaje'].with_user(self.chofer_2).get_mi_viaje_hoy()
        self.assertFalse(resultado)

    def test_get_mi_viaje_hoy_devuelve_paradas_propias(self):
        self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a, self.cliente_b])
        resultado = self.env['reparto.viaje'].with_user(self.chofer_1).get_mi_viaje_hoy()
        self.assertTrue(resultado)
        nombres = {p['partner_name'] for p in resultado['paradas']}
        self.assertEqual(nombres, {'Cliente Viaje A', 'Cliente Viaje B'})

    def test_action_abrir_pos_agrega_partner_id_a_la_url(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]
        action = parada.with_user(self.chofer_1).action_abrir_pos()
        self.assertEqual(action['type'], 'ir.actions.act_url')
        self.assertIn(f'reparto_partner_id={self.cliente_a.id}', action['url'])

    def test_chofer_no_ve_viaje_de_otro_chofer(self):
        self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_2).search([])
        self.assertFalse(viajes_vistos)

    def test_chofer_no_ve_viaje_de_otra_fecha(self):
        ayer = fields.Date.subtract(fields.Date.today(), days=1)
        self._crear_viaje(self.chofer_1, ayer, [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_1).search([])
        self.assertFalse(viajes_vistos)

    def test_chofer_ve_su_propio_viaje_de_hoy(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_1).search([])
        self.assertEqual(viajes_vistos, viaje)

    def test_admin_operativa_ve_todos_los_viajes(self):
        self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        self._crear_viaje(self.chofer_2, fields.Date.today(), [self.cliente_b])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.admin_op).search([])
        self.assertEqual(len(viajes_vistos), 2)

    def test_chofer_no_puede_crear_viaje(self):
        with self.assertRaises(Exception):
            self.env['reparto.viaje'].with_user(self.chofer_1).create({
                'fecha': fields.Date.today(),
                'chofer_id': self.chofer_1.id,
                'pos_config_id': self.pos_config.id,
            })
```

- [ ] **Step 5: Correr los tests**

Run:
```bash
docker compose -p odooerp_dist stop odoo
MSYS_NO_PATHCONV=1 docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_viaje --test-enable --test-tags /pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```
Expected: 12 tests, todos en verde.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_viaje/security/ addons/pos_reparto_viaje/models/ir_rule.py addons/pos_reparto_viaje/models/__init__.py addons/pos_reparto_viaje/__manifest__.py addons/pos_reparto_viaje/tests/test_reparto_viaje.py
git commit -m "pos_reparto_viaje: ACL y regla de acceso del chofer a su viaje de hoy"
```

---

### Task 4: Auto-tick de la parada al generar el pedido

**Files:**
- Create: `addons/pos_reparto_viaje/models/pos_order.py`
- Modify: `addons/pos_reparto_viaje/models/__init__.py`
- Modify: `addons/pos_reparto_viaje/tests/test_reparto_viaje.py`

- [ ] **Step 1: Override de `create()` en `pos.order`**

`addons/pos_reparto_viaje/models/pos_order.py`:
```python
from odoo import api, fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model_create_multi
    def create(self, vals_list):
        orders = super().create(vals_list)
        orders._reparto_viaje_marcar_parada_visitada()
        return orders

    def _reparto_viaje_marcar_parada_visitada(self):
        for order in self:
            if not order.partner_id or not order.user_id or not order.date_order:
                continue
            fecha_pedido = fields.Date.to_date(order.date_order)
            parada = self.env['reparto.viaje.parada'].sudo().search([
                ('viaje_id.chofer_id', '=', order.user_id.id),
                ('viaje_id.fecha', '=', fecha_pedido),
                ('partner_id', '=', order.partner_id.id),
                ('visitado', '=', False),
            ], limit=1)
            if parada:
                parada.write({'visitado': True, 'pedido_id': order.id})
```

Nota importante (por qué `order.date_order` y no "hoy" del servidor): un pedido puede crearse offline y sincronizarse recién al otro día — `date_order` es la fecha real en la que el chofer hizo la venta (la pone la tablet al cargar el pedido), no la fecha del servidor al sincronizar. Usar "hoy" del servidor rompería el auto-tick justo en el escenario offline que es central a todo este proyecto (ver `ESTADO_PROYECTO.md` §7).

- [ ] **Step 2: Registrar el nuevo archivo en `models/__init__.py`**

Reemplazar en `addons/pos_reparto_viaje/models/__init__.py`:
```python
from . import reparto_viaje
```
por:
```python
from . import reparto_viaje
from . import pos_order
```

- [ ] **Step 3: Agregar a `setUpClass` la apertura de una sesión de POS (necesaria para crear `pos.order` en los tests)**

Reemplazar en `addons/pos_reparto_viaje/tests/test_reparto_viaje.py`:
```python
        cls.pos_config = cls.env['pos.config'].search([], limit=1)
        assert cls.pos_config, 'Se necesita al menos un pos.config existente en la base para estos tests.'
```
por:
```python
        cls.pos_config = cls.env['pos.config'].search([], limit=1)
        assert cls.pos_config, 'Se necesita al menos un pos.config existente en la base para estos tests.'
        if not cls.pos_config.current_session_id:
            cls.pos_config.open_ui()
        cls.session = cls.pos_config.current_session_id
```

- [ ] **Step 4: Agregar el helper `_crear_pedido` y los tests de auto-tick**

Agregar al final de la clase `TestRepartoViaje`:
```python
    def _crear_pedido(self, chofer, partner, fecha_order=None):
        return self.env['pos.order'].create({
            'session_id': self.session.id,
            'config_id': self.pos_config.id,
            'partner_id': partner.id,
            'user_id': chofer.id,
            'date_order': fecha_order or fields.Datetime.now(),
            'amount_total': 0,
            'amount_tax': 0,
            'amount_paid': 0,
            'amount_return': 0,
            'lines': [],
        })

    def test_auto_tick_marca_parada_visitada_al_crear_pedido(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]
        pedido = self._crear_pedido(self.chofer_1, self.cliente_a)
        self.assertTrue(parada.visitado)
        self.assertEqual(parada.pedido_id, pedido)

    def test_pedido_a_cliente_fuera_del_viaje_no_hace_nada(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        self._crear_pedido(self.chofer_1, self.cliente_b)
        self.assertFalse(viaje.parada_ids[0].visitado)

    def test_segundo_pedido_al_mismo_cliente_no_pisa_la_parada_ya_visitada(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]
        primer_pedido = self._crear_pedido(self.chofer_1, self.cliente_a)
        self._crear_pedido(self.chofer_1, self.cliente_a)
        self.assertEqual(parada.pedido_id, primer_pedido)

    def test_auto_tick_usa_fecha_del_pedido_no_fecha_de_sincronizacion(self):
        ayer = fields.Date.subtract(fields.Date.today(), days=1)
        viaje = self._crear_viaje(self.chofer_1, ayer, [self.cliente_a])
        fecha_ayer_datetime = fields.Datetime.to_datetime(ayer)
        self._crear_pedido(self.chofer_1, self.cliente_a, fecha_order=fecha_ayer_datetime)
        self.assertTrue(viaje.parada_ids[0].visitado)
```

- [ ] **Step 5: Correr los tests**

Run:
```bash
docker compose -p odooerp_dist stop odoo
MSYS_NO_PATHCONV=1 docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_viaje --test-enable --test-tags /pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```
Expected: 16 tests, todos en verde. Si `_crear_pedido` falla por un campo requerido de `pos.order` que no está en esta lista (puede variar según la config exacta del `pos.config` elegido), el mensaje de error de Odoo dice cuál falta — agregarlo con un valor mínimo válido.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_viaje/models/pos_order.py addons/pos_reparto_viaje/models/__init__.py addons/pos_reparto_viaje/tests/test_reparto_viaje.py
git commit -m "pos_reparto_viaje: auto-tick de parada al crear pos.order"
```

---

### Task 5: Vistas de Admin (kanban de progreso + form) y menú

**Files:**
- Create: `addons/pos_reparto_viaje/views/reparto_viaje_views.xml`
- Modify: `addons/pos_reparto_viaje/__manifest__.py`
- Modify: `addons/pos_reparto_viaje/tests/test_reparto_viaje.py`

- [ ] **Step 1: Vistas + búsqueda + acción + menú**

`addons/pos_reparto_viaje/views/reparto_viaje_views.xml`:
```xml
<odoo>
    <record id="view_reparto_viaje_kanban" model="ir.ui.view">
        <field name="name">reparto.viaje.kanban</field>
        <field name="model">reparto.viaje</field>
        <field name="arch" type="xml">
            <kanban>
                <field name="chofer_id"/>
                <field name="fecha"/>
                <field name="paradas_totales"/>
                <field name="paradas_completadas"/>
                <field name="progreso"/>
                <templates>
                    <t t-name="kanban-box">
                        <div class="oe_kanban_card oe_kanban_global_click">
                            <strong><field name="chofer_id"/></strong>
                            <div><field name="fecha"/></div>
                            <div>
                                <field name="paradas_completadas"/> / <field name="paradas_totales"/> paradas
                            </div>
                            <field name="progreso" widget="progressbar"/>
                        </div>
                    </t>
                </templates>
            </kanban>
        </field>
    </record>

    <record id="view_reparto_viaje_list" model="ir.ui.view">
        <field name="name">reparto.viaje.list</field>
        <field name="model">reparto.viaje</field>
        <field name="arch" type="xml">
            <list>
                <field name="fecha"/>
                <field name="chofer_id"/>
                <field name="pos_config_id"/>
                <field name="paradas_completadas"/>
                <field name="paradas_totales"/>
                <field name="progreso" widget="progressbar"/>
            </list>
        </field>
    </record>

    <record id="view_reparto_viaje_form" model="ir.ui.view">
        <field name="name">reparto.viaje.form</field>
        <field name="model">reparto.viaje</field>
        <field name="arch" type="xml">
            <form>
                <sheet>
                    <group>
                        <field name="fecha"/>
                        <field name="chofer_id"/>
                        <field name="pos_config_id"/>
                    </group>
                    <field name="parada_ids">
                        <list editable="bottom">
                            <field name="partner_id"/>
                            <field name="visitado" readonly="1"/>
                            <field name="pedido_id" readonly="1"/>
                        </list>
                    </field>
                </sheet>
            </form>
        </field>
    </record>

    <record id="view_reparto_viaje_search" model="ir.ui.view">
        <field name="name">reparto.viaje.search</field>
        <field name="model">reparto.viaje</field>
        <field name="arch" type="xml">
            <search>
                <field name="chofer_id"/>
                <field name="fecha"/>
                <filter name="filter_hoy" string="Hoy" domain="[('fecha', '=', context_today().strftime('%Y-%m-%d'))]"/>
                <group>
                    <filter name="groupby_chofer" string="Chofer" domain="[]" context="{'group_by': 'chofer_id'}"/>
                </group>
            </search>
        </field>
    </record>

    <record id="action_reparto_viaje" model="ir.actions.act_window">
        <field name="name">Viajes</field>
        <field name="res_model">reparto.viaje</field>
        <field name="view_mode">kanban,list,form</field>
        <field name="search_view_id" ref="view_reparto_viaje_search"/>
        <field name="context">{'search_default_filter_hoy': 1}</field>
    </record>

    <menuitem id="menu_reparto_viaje_admin"
        name="Viajes"
        parent="point_of_sale.menu_point_root"
        action="action_reparto_viaje"
        groups="pos_reparto_security.group_reparto_adminop,pos_reparto_security.group_reparto_gerencia"
        sequence="16"/>
</odoo>
```

- [ ] **Step 2: Agregar el archivo a `data` en el manifest**

Reemplazar en `addons/pos_reparto_viaje/__manifest__.py`:
```python
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_viaje_rules.xml',
    ],
```
por:
```python
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_viaje_rules.xml',
        'views/reparto_viaje_views.xml',
    ],
```

- [ ] **Step 3: Test del filtro "Hoy"**

Agregar al final de la clase `TestRepartoViaje`:
```python
    def test_filtro_hoy_de_la_vista_admin_excluye_otras_fechas(self):
        from lxml import etree
        from odoo.tools.safe_eval import safe_eval

        ayer = fields.Date.subtract(fields.Date.today(), days=1)
        self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        self._crear_viaje(self.chofer_2, ayer, [self.cliente_b])

        search_view = self.env.ref('pos_reparto_viaje.view_reparto_viaje_search')
        arch = etree.fromstring(search_view.arch)
        filtro_hoy = arch.find(".//filter[@name='filter_hoy']")
        domain = safe_eval(filtro_hoy.get('domain'), {'context_today': lambda: fields.Date.context_today(self.env.user)})

        encontrados = self.env['reparto.viaje'].with_user(self.admin_op).search(domain)
        self.assertEqual(len(encontrados), 1)
        self.assertEqual(encontrados.chofer_id, self.chofer_1)
```

- [ ] **Step 4: Correr los tests**

Run:
```bash
docker compose -p odooerp_dist stop odoo
MSYS_NO_PATHCONV=1 docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_viaje --test-enable --test-tags /pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```
Expected: 17 tests, todos en verde.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_viaje/views/ addons/pos_reparto_viaje/__manifest__.py addons/pos_reparto_viaje/tests/test_reparto_viaje.py
git commit -m "pos_reparto_viaje: vistas de Admin (kanban de progreso, list, form) y menu"
```

---

### Task 6: Menú raíz y client action para el tile del chofer

**Files:**
- Create: `addons/pos_reparto_viaje/data/viaje_menu.xml`
- Modify: `addons/pos_reparto_viaje/__manifest__.py`
- Modify: `addons/pos_reparto_viaje/tests/test_reparto_viaje.py`

- [ ] **Step 1: Menú raíz + client action**

`addons/pos_reparto_viaje/data/viaje_menu.xml`:
```xml
<odoo>
    <record id="action_reparto_viaje_chofer" model="ir.actions.client">
        <field name="name">Viaje</field>
        <field name="tag">pos_reparto_viaje.viaje_screen</field>
    </record>

    <menuitem id="menu_reparto_viaje_chofer"
        name="Viaje"
        action="action_reparto_viaje_chofer"
        sequence="5"
        groups="pos_reparto_security.group_reparto_vendedor"/>
</odoo>
```

Nota: este `menuitem` no tiene `parent`, por lo tanto es un menú raíz — es justo lo que `pos_reparto_home.get_reparto_home_tiles()` necesita para mostrarlo como cuadradito (lee `get_user_roots()`). No hace falta declarar dependencia de `pos_reparto_home` en el manifest para que esto funcione: es el mismo mecanismo genérico que ya usa el tile de "Inicio" y el resto de las apps.

- [ ] **Step 2: Agregar el archivo a `data` en el manifest**

Reemplazar en `addons/pos_reparto_viaje/__manifest__.py`:
```python
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_viaje_rules.xml',
        'views/reparto_viaje_views.xml',
    ],
```
por:
```python
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_viaje_rules.xml',
        'views/reparto_viaje_views.xml',
        'data/viaje_menu.xml',
    ],
```

- [ ] **Step 3: Tests del menú raíz**

Agregar al final de la clase `TestRepartoViaje`:
```python
    def test_menu_viaje_es_raiz_y_solo_grupo_vendedor(self):
        menu = self.env.ref('pos_reparto_viaje.menu_reparto_viaje_chofer')
        self.assertFalse(menu.parent_id)
        self.assertEqual(menu.groups_id, self.group_vendedor)

    def test_admin_operativa_no_ve_el_menu_viaje_de_chofer(self):
        menu = self.env.ref('pos_reparto_viaje.menu_reparto_viaje_chofer')
        roots_admin = self.env['ir.ui.menu'].with_user(self.admin_op).get_user_roots()
        self.assertNotIn(menu.id, roots_admin.ids)

    def test_chofer_ve_el_menu_viaje_entre_sus_roots(self):
        menu = self.env.ref('pos_reparto_viaje.menu_reparto_viaje_chofer')
        roots_chofer = self.env['ir.ui.menu'].with_user(self.chofer_1).get_user_roots()
        self.assertIn(menu.id, roots_chofer.ids)
```

- [ ] **Step 4: Correr los tests**

Run:
```bash
docker compose -p odooerp_dist stop odoo
MSYS_NO_PATHCONV=1 docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_viaje --test-enable --test-tags /pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```
Expected: 20 tests, todos en verde.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_viaje/data/ addons/pos_reparto_viaje/__manifest__.py addons/pos_reparto_viaje/tests/test_reparto_viaje.py
git commit -m "pos_reparto_viaje: menu raiz y client action para el tile del chofer"
```

---

### Task 7: Pantalla OWL del chofer

**Files:**
- Create: `addons/pos_reparto_viaje/static/src/viaje_screen.js`
- Create: `addons/pos_reparto_viaje/static/src/viaje_screen.xml`
- Create: `addons/pos_reparto_viaje/static/src/viaje_screen.scss`
- Modify: `addons/pos_reparto_viaje/__manifest__.py`

- [ ] **Step 1: Componente OWL**

`addons/pos_reparto_viaje/static/src/viaje_screen.js`:
```javascript
import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

export class RepartoViajeScreen extends Component {
    static template = "pos_reparto_viaje.ViajeScreen";
    static props = { ...standardActionServiceProps };

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.state = useState({ viaje: false, loading: true, error: false });
        onWillStart(async () => {
            try {
                this.state.viaje = await this.orm.call("reparto.viaje", "get_mi_viaje_hoy", []);
            } catch {
                this.state.error = true;
            }
            this.state.loading = false;
        });
    }

    async onParadaClick(parada) {
        if (parada.visitado) {
            return;
        }
        const action = await this.orm.call("reparto.viaje.parada", "action_abrir_pos", [parada.id]);
        this.actionService.doAction(action);
    }
}

registry.category("actions").add("pos_reparto_viaje.viaje_screen", RepartoViajeScreen);
```

- [ ] **Step 2: Template QWeb**

`addons/pos_reparto_viaje/static/src/viaje_screen.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<templates xml:space="preserve">

    <t t-name="pos_reparto_viaje.ViajeScreen">
        <div class="o_reparto_viaje">
            <div t-if="state.loading" class="o_reparto_viaje_loading">
                Cargando...
            </div>
            <div t-elif="state.error" class="o_reparto_viaje_empty">
                No se pudo cargar el viaje. Probá recargar la página.
            </div>
            <div t-elif="!state.viaje" class="o_reparto_viaje_empty">
                No tenés viaje asignado hoy.
            </div>
            <div t-else="" class="o_reparto_viaje_grid">
                <div t-foreach="state.viaje.paradas" t-as="parada" t-key="parada.id"
                     t-attf-class="o_reparto_viaje_parada {{ parada.visitado ? 'o_reparto_viaje_parada_visitada' : '' }}"
                     t-on-click="() => this.onParadaClick(parada)">
                    <span t-out="parada.partner_name"/>
                    <span t-if="parada.visitado" class="o_reparto_viaje_check">✓</span>
                </div>
            </div>
        </div>
    </t>

</templates>
```

- [ ] **Step 3: Estilos**

`addons/pos_reparto_viaje/static/src/viaje_screen.scss`:
```scss
.o_reparto_viaje_grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
}

.o_reparto_viaje_parada {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px;
    font-size: 1.4rem;
    border-radius: 8px;
    background-color: #f5f5f5;
    cursor: pointer;

    &_visitada {
        background-color: #e6f4ea;
        cursor: default;
        opacity: 0.7;
    }
}

.o_reparto_viaje_check {
    color: #2e7d32;
    font-weight: bold;
    font-size: 1.6rem;
}

.o_reparto_viaje_loading,
.o_reparto_viaje_empty {
    padding: 48px;
    text-align: center;
    font-size: 1.2rem;
}
```

- [ ] **Step 4: Registrar los assets en el manifest**

Reemplazar en `addons/pos_reparto_viaje/__manifest__.py`:
```python
    'assets': {},
```
por:
```python
    'assets': {
        'web.assets_backend': [
            'pos_reparto_viaje/static/src/viaje_screen.scss',
            'pos_reparto_viaje/static/src/viaje_screen.js',
            'pos_reparto_viaje/static/src/viaje_screen.xml',
        ],
    },
```

- [ ] **Step 5: Actualizar el módulo y confirmar que no rompe nada (sin tests automáticos de JS, mismo criterio que `pos_reparto_home`)**

Run:
```bash
docker compose -p odooerp_dist stop odoo
MSYS_NO_PATHCONV=1 docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_viaje --test-enable --test-tags /pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```
Expected: 20 tests, todos en verde (sin regresión), sin errores de carga de assets en el log.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_viaje/static/src/viaje_screen.js addons/pos_reparto_viaje/static/src/viaje_screen.xml addons/pos_reparto_viaje/static/src/viaje_screen.scss addons/pos_reparto_viaje/__manifest__.py
git commit -m "pos_reparto_viaje: pantalla tactil OWL del chofer"
```

---

### Task 8: Patch de POS — preseleccionar cliente desde la URL

**Files:**
- Create: `addons/pos_reparto_viaje/static/src/app/services/pos_store.js`
- Modify: `addons/pos_reparto_viaje/__manifest__.py`

- [ ] **Step 1: Patch de `PosStore.setup`**

`addons/pos_reparto_viaje/static/src/app/services/pos_store.js`:
```javascript
import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        const params = new URLSearchParams(window.location.search);
        const partnerId = params.get("reparto_partner_id");
        if (partnerId) {
            const partner = this.models["res.partner"].get(parseInt(partnerId, 10));
            if (partner) {
                this.setPartnerToCurrentOrder(partner);
            }
        }
    },
});
```

- [ ] **Step 2: Registrar el asset en el manifest**

Reemplazar en `addons/pos_reparto_viaje/__manifest__.py`:
```python
    'assets': {
        'web.assets_backend': [
            'pos_reparto_viaje/static/src/viaje_screen.scss',
            'pos_reparto_viaje/static/src/viaje_screen.js',
            'pos_reparto_viaje/static/src/viaje_screen.xml',
        ],
    },
```
por:
```python
    'assets': {
        'web.assets_backend': [
            'pos_reparto_viaje/static/src/viaje_screen.scss',
            'pos_reparto_viaje/static/src/viaje_screen.js',
            'pos_reparto_viaje/static/src/viaje_screen.xml',
        ],
        'point_of_sale._assets_pos': [
            'pos_reparto_viaje/static/src/app/services/pos_store.js',
        ],
    },
```

- [ ] **Step 3: Actualizar módulo y confirmar que no rompe nada**

Run:
```bash
docker compose -p odooerp_dist stop odoo
MSYS_NO_PATHCONV=1 docker compose -p odooerp_dist run --rm odoo odoo server -d odoo --db_host=db --db_user=odoo --db_password=odoo -u pos_reparto_viaje --test-enable --test-tags /pos_reparto_viaje --stop-after-init
docker compose -p odooerp_dist up -d odoo
```
Expected: 20 tests, todos en verde.

- [ ] **Step 4: Commit**

```bash
git add addons/pos_reparto_viaje/static/src/app/ addons/pos_reparto_viaje/__manifest__.py
git commit -m "pos_reparto_viaje: patch de PosStore para preseleccionar cliente desde la URL"
```

---

### Task 9: Verificación manual end-to-end en navegador

No hay forma de automatizar esto (requiere abrir dos pantallas reales y una sesión de POS) — es la misma disciplina que se usó para verificar `pos_reparto_credito` y `pos_reparto_home`.

- [ ] **Step 1: Crear datos de prueba reales desde el admin**

Loguearse como `admin`/`admin`, ir a Reparto → Viajes, crear un viaje para hoy asignado a uno de los 4 usuarios placeholder (`vendedor@reparto.local`, ver `ESTADO_PROYECTO.md` §5bis) con 2-3 clientes reales del catálogo cargado.

- [ ] **Step 2: Loguearse como el chofer y verificar el tile**

Loguearse con `vendedor@reparto.local` / `Reparto2026!`. Confirmar que en la pantalla de Inicio aparece el tile "Viaje" (además de Contacts y POS, ver `ESTADO_PROYECTO.md` §5bis). Tocarlo y confirmar que aparece la lista de paradas cargadas.

- [ ] **Step 3: Verificar el deep-link a POS**

Tocar una parada pendiente. Confirmar que abre una sesión de POS nueva y que el cliente ya está seleccionado en la orden, sin tener que buscarlo.

- [ ] **Step 4: Verificar el auto-tick**

Cargar y cobrar un pedido para ese cliente. Volver a la pantalla de Inicio → Viaje. Confirmar que la parada aparece tildada (✓) sin haber tocado nada manualmente, y que en el panel de Admin (Reparto → Viajes) el progreso del viaje subió.

- [ ] **Step 5: Verificar el caso offline (regresión sobre lo ya documentado en `ESTADO_PROYECTO.md` §7)**

Repetir el flujo cortando la conexión (`docker compose -p odooerp_dist stop odoo`) antes de cobrar, cobrar offline, reconectar (`docker compose -p odooerp_dist start odoo`) y reabrir la sesión de POS. Confirmar que el auto-tick corre igual al sincronizar (usa `date_order`, no la fecha de sincronización — ver Task 4).

- [ ] **Step 6: Si algo no anda como se espera, documentarlo como deuda técnica o bug antes de seguir** (no hay código que commitear en este task si todo funciona).

---

### Task 10: Actualizar `ESTADO_PROYECTO.md` y cerrar la rama

**Files:**
- Modify: `ESTADO_PROYECTO.md`

- [ ] **Step 1: Agregar la sección del módulo nuevo**

Agregar una sección `## 5sexies. Módulo custom: pos_reparto_viaje` a `ESTADO_PROYECTO.md`, con la misma estructura que las secciones 5bis/5ter/5quater/5quinquies existentes (qué hace, modelo, mecanismo de deep-link, auto-tick, deuda técnica aceptada — el caso de un mismo cliente en 2 viajes de choferes distintos el mismo día, ver spec —, referencia a `docs/superpowers/specs/2026-08-29-pos-reparto-viaje-design.md`).

- [ ] **Step 2: Actualizar la sección 9 (pendientes)**

Quitar el ítem 4 ("Feature Viaje") de la lista de gaps Must/Should, y actualizar el bloque "División de trabajo": marcar la parte de Juan como terminada y anotar el siguiente ítem a tomar (ítem 2 de la lista original: descuentos por volumen, según el orden ya sugerido).

- [ ] **Step 3: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "pos_reparto_viaje: documentar modulo completo en ESTADO_PROYECTO.md"
```

- [ ] **Step 4: Seguir el flujo de `superpowers:finishing-a-development-branch` para decidir merge/PR contra `main`** (no hacerlo antes de que el Task 9 de verificación manual haya pasado).
