# Bloqueo duro de camión por vendedor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un vendedor solo puede ver/abrir el `pos.config` (POS de camión) que un admin le asignó explícitamente; sin asignación, no ve ninguno.

**Architecture:** Se extiende el módulo existente `pos_reparto_security` (no un módulo nuevo) con: un campo `reparto_camion_asignado_id` (Many2one a `pos.config`) en `res.users`, una `ir.rule` sobre `pos.config` scopeada al grupo `group_reparto_vendedor` con domain `[('id', '=', user.reparto_camion_asignado_id.id)]`, y una vista que expone el campo en el formulario de usuario. Mismo patrón ya usado en el módulo para `res.partner` y `pos.order` (ver `security/reparto_pos_order_rules.xml`).

**Tech Stack:** Odoo 19 CE, Python, XML views/security, `TransactionCase` tests (`odoo.tests.common`). Sin dependencias nuevas — `point_of_sale` ya está en `depends` del módulo.

**Reference spec:** `docs/superpowers/specs/2026-09-14-pos-bloqueo-camion-vendedor-design.md`

---

## Before you start

Correr todo desde la raíz del repo (`docker-compose.yml` usa un bind mount relativo `./addons` — correr `docker compose` desde otro directorio sirve un `addons/` distinto sin avisar).

Comando para instalar/actualizar el módulo y correr sus tests:

```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_security --test-enable --stop-after-init --log-level=test
```

`pos_reparto_security` ya está instalado en la base `odoo` (confirmado: es el módulo que trae los 4 roles), así que se usa `-u` (update) en todos los pasos, no `-i`.

---

### Task 1: Scaffold del paquete `models/` en el módulo existente

**Files:**
- Modify: `addons/pos_reparto_security/__init__.py`
- Create: `addons/pos_reparto_security/models/__init__.py`
- Create: `addons/pos_reparto_security/models/res_users.py`

El módulo hoy es 100% declarativo (XML), sin paquete `models/`. Este task solo arma el andamiaje — el campo real viene en Task 2. Se agrega vacío/mínimo para que el `-u` de este paso confirme que el import no rompe nada antes de meterle contenido real.

- [ ] **Step 1: Crear `models/__init__.py`**

`addons/pos_reparto_security/models/__init__.py`:
```python
from . import res_users
```

- [ ] **Step 2: Crear `models/res_users.py` mínimo**

`addons/pos_reparto_security/models/res_users.py`:
```python
from odoo import models


class ResUsers(models.Model):
    _inherit = 'res.users'
```

- [ ] **Step 3: Hacer que el módulo importe `models/`**

`addons/pos_reparto_security/__init__.py` (hoy está vacío):
```python
from . import models
```

- [ ] **Step 4: Actualizar el módulo y confirmar que no rompe nada**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_security --stop-after-init --log-level=warn
```
Expected: el proceso termina sin trazas de `ERROR` ni `CRITICAL` en el log (una clase `_inherit` vacía es válida en Odoo, no agrega ni quita nada).

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_security/__init__.py addons/pos_reparto_security/models/
git commit -m "feat(pos_reparto_security): scaffold de models/ (sin comportamiento nuevo)"
```

---

### Task 2: Campo `reparto_camion_asignado_id` en `res.users`

**Files:**
- Modify: `addons/pos_reparto_security/models/res_users.py`
- Test: `addons/pos_reparto_security/tests/test_reparto_security.py`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de la clase `TestRepartoSecurity` en `addons/pos_reparto_security/tests/test_reparto_security.py` (el archivo ya existe con otros tests en el mismo estilo — ver imports y `setUpClass` ya presentes, no hace falta tocarlos):

```python
    def test_campo_camion_asignado_default_vacio(self):
        self.assertFalse(self.vendedor_1.reparto_camion_asignado_id)

    def test_campo_camion_asignado_se_puede_setear(self):
        pos_config = self.env['pos.config'].create({'name': 'Camión Test Bloqueo'})
        self.vendedor_1.sudo().reparto_camion_asignado_id = pos_config
        self.assertEqual(self.vendedor_1.reparto_camion_asignado_id, pos_config)
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_security --test-enable --stop-after-init --log-level=test
```
Expected: `FAIL` en ambos tests nuevos — `AttributeError` o similar, `reparto_camion_asignado_id` no existe todavía en `res.users`.

- [ ] **Step 3: Implementar el campo**

`addons/pos_reparto_security/models/res_users.py` (reemplaza el contenido del Task 1):
```python
from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    reparto_camion_asignado_id = fields.Many2one(
        'pos.config',
        string='Camión asignado (Reparto)',
        help='Para vendedores: el único POS de camión que puede abrir. '
             'Vacío = no puede abrir ningún camión.',
    )
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_security --test-enable --stop-after-init --log-level=test
```
Expected: `OK` — todos los tests del módulo pasan, incluidos los 2 nuevos.

- [ ] **Step 5: Commit**

```bash
git add addons/pos_reparto_security/models/res_users.py addons/pos_reparto_security/tests/test_reparto_security.py
git commit -m "feat(pos_reparto_security): campo reparto_camion_asignado_id en res.users"
```

---

### Task 3: `ir.rule` sobre `pos.config` — el bloqueo real

**Files:**
- Create: `addons/pos_reparto_security/security/reparto_pos_config_rules.xml`
- Modify: `addons/pos_reparto_security/__manifest__.py`
- Test: `addons/pos_reparto_security/tests/test_reparto_security.py`

Este es el task central del spec — sin esta regla, el campo del Task 2 no bloquea nada.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de la clase `TestRepartoSecurity` en `addons/pos_reparto_security/tests/test_reparto_security.py`:

```python
    def test_vendedor_sin_camion_asignado_no_ve_ningun_pos_config(self):
        camion_1 = self.env['pos.config'].create({'name': 'Camión 1 Test Bloqueo'})
        camion_2 = self.env['pos.config'].create({'name': 'Camión 2 Test Bloqueo'})

        found = self.env['pos.config'].with_user(self.vendedor_1).search([
            ('id', 'in', [camion_1.id, camion_2.id]),
        ])
        self.assertFalse(found)

    def test_vendedor_con_camion_asignado_ve_solo_ese(self):
        camion_1 = self.env['pos.config'].create({'name': 'Camión 1 Test Bloqueo'})
        camion_2 = self.env['pos.config'].create({'name': 'Camión 2 Test Bloqueo'})
        camion_3 = self.env['pos.config'].create({'name': 'Camión 3 Test Bloqueo'})
        self.vendedor_1.sudo().reparto_camion_asignado_id = camion_2

        found = self.env['pos.config'].with_user(self.vendedor_1).search([
            ('id', 'in', [camion_1.id, camion_2.id, camion_3.id]),
        ])
        self.assertEqual(found, camion_2)

    def test_usuario_sin_grupo_vendedor_ve_todos_los_pos_config(self):
        camion_1 = self.env['pos.config'].create({'name': 'Camión 1 Test Bloqueo'})
        camion_2 = self.env['pos.config'].create({'name': 'Camión 2 Test Bloqueo'})

        found = self.env['pos.config'].with_user(self.usuario_sin_rol).search([
            ('id', 'in', [camion_1.id, camion_2.id]),
        ])
        self.assertEqual(found, camion_1 | camion_2)
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_security --test-enable --stop-after-init --log-level=test
```
Expected: `FAIL` en `test_vendedor_sin_camion_asignado_no_ve_ningun_pos_config` y `test_vendedor_con_camion_asignado_ve_solo_ese` (sin la regla, `vendedor_1` ve los 3 camiones como cualquier usuario POS). `test_usuario_sin_grupo_vendedor_ve_todos_los_pos_config` ya pasa (nada lo restringe todavía) — queda como test de control, se mantiene igual después de agregar la regla.

- [ ] **Step 3: Escribir la `ir.rule`**

`addons/pos_reparto_security/security/reparto_pos_config_rules.xml`:
```xml
<odoo>
    <record id="rule_reparto_pos_config_vendedor" model="ir.rule">
        <field name="name">Vendedor Reparto: solo su camión asignado</field>
        <field name="model_id" ref="point_of_sale.model_pos_config"/>
        <field name="domain_force">[('id', '=', user.reparto_camion_asignado_id.id)]</field>
        <field name="groups" eval="[(4, ref('group_reparto_vendedor'))]"/>
        <field name="perm_read">1</field>
        <field name="perm_write">0</field>
        <field name="perm_create">0</field>
        <field name="perm_unlink">0</field>
    </record>
</odoo>
```

- [ ] **Step 4: Registrar el archivo nuevo en el manifest**

`addons/pos_reparto_security/__manifest__.py` — agregar la línea nueva a la lista `data`, junto a las otras reglas de seguridad (después de `'security/reparto_pos_order_rules.xml'`):
```python
    'data': [
        'security/reparto_groups.xml',
        'security/reparto_admin_user.xml',
        'security/reparto_partner_rules.xml',
        'security/reparto_pos_order_rules.xml',
        'security/reparto_pos_config_rules.xml',
        'data/reparto_stock_config.xml',
    ],
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_security --test-enable --stop-after-init --log-level=test
```
Expected: `OK` — los 3 tests nuevos pasan, y ningún test preexistente del archivo se rompe (en particular `test_admin_tiene_roles_de_escritorio`, que no toca `pos.config`).

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_security/security/reparto_pos_config_rules.xml addons/pos_reparto_security/__manifest__.py addons/pos_reparto_security/tests/test_reparto_security.py
git commit -m "feat(pos_reparto_security): bloqueo duro — vendedor solo ve su pos.config asignado"
```

---

### Task 4: Exponer el campo en el formulario de usuario

**Files:**
- Create: `addons/pos_reparto_security/views/res_users_views.xml`
- Modify: `addons/pos_reparto_security/__manifest__.py`
- Test: `addons/pos_reparto_security/tests/test_reparto_security.py`

Sin esto, el campo del Task 2 solo se puede setear por código/consola — un admin real necesita poder hacerlo desde Configuración > Usuarios.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de la clase `TestRepartoSecurity`:

```python
    def test_campo_camion_asignado_visible_en_formulario_de_usuario(self):
        admin = self.env.ref('base.user_admin')
        arch = self.env['res.users'].with_user(admin).get_view(
            self.env.ref('base.view_users_form').id
        )['arch']
        self.assertIn('reparto_camion_asignado_id', arch)
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_security --test-enable --stop-after-init --log-level=test
```
Expected: `FAIL` en `test_campo_camion_asignado_visible_en_formulario_de_usuario` — el campo existe en el modelo (Task 2) pero ninguna vista lo muestra todavía.

- [ ] **Step 3: Escribir la vista**

`addons/pos_reparto_security/views/res_users_views.xml` (mismo patrón exacto que usa `pos_reparto_comision/views/res_users_views.xml` para su propio campo):
```xml
<odoo>
    <record id="view_users_form_reparto_camion" model="ir.ui.view">
        <field name="name">res.users.form.reparto.camion</field>
        <field name="model">res.users</field>
        <field name="inherit_id" ref="base.view_users_form"/>
        <field name="arch" type="xml">
            <xpath expr="//notebook" position="inside">
                <page string="Camión (Reparto)">
                    <group>
                        <field name="reparto_camion_asignado_id"/>
                    </group>
                </page>
            </xpath>
        </field>
    </record>
</odoo>
```

No lleva `groups=` en la página (a diferencia de la de comisión, que es solo para Gerencia) — quien ya tiene acceso a editar usuarios (Configuración > Usuarios, gateado por `base.group_system`) es quien debe poder asignar el camión; no hace falta una restricción de rol de Reparto adicional acá.

- [ ] **Step 4: Registrar la vista en el manifest**

`addons/pos_reparto_security/__manifest__.py` — agregar al final de la lista `data`:
```python
    'data': [
        'security/reparto_groups.xml',
        'security/reparto_admin_user.xml',
        'security/reparto_partner_rules.xml',
        'security/reparto_pos_order_rules.xml',
        'security/reparto_pos_config_rules.xml',
        'data/reparto_stock_config.xml',
        'views/res_users_views.xml',
    ],
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run:
```bash
docker compose -p odooerp_dist run --rm odoo odoo -d odoo -u pos_reparto_security --test-enable --stop-after-init --log-level=test
```
Expected: `OK` — todos los tests del módulo pasan, incluido el nuevo.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_security/views/res_users_views.xml addons/pos_reparto_security/__manifest__.py addons/pos_reparto_security/tests/test_reparto_security.py
git commit -m "feat(pos_reparto_security): exponer camión asignado en el formulario de usuario"
```

---

### Task 5: Verificación manual en el navegador + documentación final

**Files:**
- Modify: `ESTADO_PROYECTO.md:96-111` (sección `5bis. Módulo custom: pos_reparto_security`)

Todos los tests automáticos ya pasan (Tasks 1-4). Este task confirma con los ojos que el flujo real funciona, y deja registro en la documentación de estado del proyecto — mismo lugar donde ya está documentado el resto de este módulo.

- [ ] **Step 1: Asignar Camión 1 al usuario `Vendedor Prueba` desde el backend**

En el navegador, loguear como `admin` (o `Admin Operaciones`) en `http://localhost:8069/odoo`, ir a **Ajustes → Usuarios y compañías → Usuarios**, abrir `Vendedor Prueba`, pestaña **"Camión (Reparto)"** (nueva, del Task 4), setear **"Camión asignado (Reparto)"** = `POS Camion 1`. Guardar.

- [ ] **Step 2: Confirmar que el vendedor ve solo su camión**

Cerrar sesión, loguear como `Vendedor Prueba`, ir a **Punto de venta**. Expected: el dashboard muestra únicamente la tarjeta de `POS Camion 1` — no aparecen `POS Camion 2` ni `POS Camion 3`.

- [ ] **Step 3: Confirmar que sin asignación no ve ningún camión**

Volver a loguear como admin, borrar el camión asignado de `Vendedor Prueba` (dejar el campo vacío), guardar. Loguear de nuevo como `Vendedor Prueba` y entrar a **Punto de venta**. Expected: ningún camión visible.

- [ ] **Step 4: Confirmar que Depósito/Admin Operativa/Gerencia no están afectados**

Loguear como `Admin Operaciones` (u otro usuario con rol Depósito/Gerencia), entrar a **Punto de venta**. Expected: las 3 tarjetas de camión siguen visibles, como antes de este feature.

- [ ] **Step 5: Dejar `Vendedor Prueba` en un estado consistente para el resto del equipo**

Volver a asignarle `POS Camion 1` (el que venía usando antes de este feature, según el estado real del negocio hoy) para no romper flujos manuales de otras pruebas en la base compartida.

- [ ] **Step 6: Actualizar `ESTADO_PROYECTO.md`**

En la sección `## 5bis. Módulo custom: pos_reparto_security` (líneas 96-111), agregar después del párrafo que empieza con "No se creó ningún campo nuevo..." (línea 107):

```markdown
**Bloqueo duro de camión por vendedor (agregado 2026-09-14):** un vendedor solo ve/puede abrir el `pos.config` (POS de camión) asignado en el campo nuevo `res.users.reparto_camion_asignado_id` (pestaña "Camión (Reparto)" del formulario de usuario) — filtrado por una `ir.rule` sobre `pos.config`, mismo patrón que las reglas de `res.partner`/`pos.order` de arriba. Sin asignación, el vendedor no ve ningún camión (domain imposible, no un "ve todos" por default). No reemplaza el control operativo de "una tablet por vendedor" ya en uso, lo complementa. Se descartó el módulo estándar `pos_hr` — resuelve login multi-cajero dentro de una sesión ya abierta, no cuál `pos.config` puede abrir un usuario del backend (ver spec).

Ver spec: `docs/superpowers/specs/2026-09-14-pos-bloqueo-camion-vendedor-design.md`.
```

- [ ] **Step 7: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "docs: documentar bloqueo duro de camión por vendedor en ESTADO_PROYECTO"
```

---

## Fuera de alcance (heredado del spec)

- No se instala `pos_hr` ni `hr`.
- No se soporta más de un camión asignado por vendedor (cardinalidad 1:1, campo Many2one).
- No se toca la pantalla de login de Odoo — solo filtra qué `pos.config` es visible una vez autenticado.
