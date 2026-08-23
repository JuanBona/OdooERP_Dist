# pos_reparto_security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el módulo `pos_reparto_security`, que da de alta los 4 roles del proyecto Reparto (Vendedor, Depósito, Admin Operativa, Gerencia) y hace que un Vendedor solo vea sus propios clientes (`res.partner`) y pedidos (`pos.order`).

**Architecture:** Módulo Odoo 19 CE, 100% datos declarativos (grupos + `ir.rule`), sin modelos ni lógica Python propia. Se apoya en los campos nativos `user_id` de `res.partner` ("Salesperson") y `pos.order` ("Employee") — ninguno se crea, ya existen. Ver spec: `docs/superpowers/specs/2026-08-23-pos-reparto-security-design.md`.

**Tech Stack:** Odoo 19.0 Community (contenedor `odoo` del `docker-compose.yml` de este repo), Postgres 16, tests con `odoo.tests.common.TransactionCase`.

---

## Notas de entorno (leer antes de arrancar)

- El contenedor `odoo` ya corre (`docker compose ps` debe mostrar `odoo` y `db` up). Si no, `docker compose up -d` primero.
- `addons_path` del contenedor es `/mnt/extra-addons`, montado desde `./addons` de este repo (bind mount) — no hace falta tocar configuración para que Odoo detecte el módulo nuevo, alcanza con crear la carpeta.
- Comando base para instalar/actualizar + correr tests (ejecuta un proceso Odoo aparte y corto, sin tocar el servidor que ya está corriendo en `:8069`):
  ```bash
  docker compose exec -T odoo odoo --db_host=db --db_user=odoo --db_password=odoo -d odoo -i pos_reparto_security --test-enable --test-tags /pos_reparto_security --stop-after-init --log-level=test
  ```
  (para actualizaciones posteriores a la primera instalación, cambiar `-i` por `-u`).
- Si algún comando de Bash falla con rutas tipo `/mnt/...` o `/etc/...` reescritas raro (Git Bash en Windows), anteponer `MSYS_NO_PATHCONV=1` — ya documentado en `INSTRUCTIVO_SETUP.md` §7.
- Estos comandos NO requieren detener el contenedor `odoo` que ya corre — es un proceso Odoo adicional de corta vida contra la misma base. El servidor largo-corriendo en `:8069` no se entera de los cambios hasta que se lo reinicie (Task 4).

---

### Task 1: Scaffold del módulo + grupos de seguridad

**Files:**
- Create: `addons/pos_reparto_security/__manifest__.py`
- Create: `addons/pos_reparto_security/__init__.py`
- Create: `addons/pos_reparto_security/security/reparto_groups.xml`

- [ ] **Step 1: Crear `__manifest__.py`**

```python
{
    'name': 'POS Reparto - Seguridad de Roles',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Grupos de seguridad y reglas de visibilidad para los 4 roles del proyecto Reparto (Vendedor, Depósito, Admin Operativa, Gerencia)',
    'depends': ['point_of_sale'],
    'data': [
        'security/reparto_groups.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
```

- [ ] **Step 2: Crear `__init__.py` vacío**

Sin contenido — el módulo no define modelos Python, solo datos. Crear el archivo con 0 bytes (Odoo necesita el archivo presente para reconocer la carpeta como paquete Python, pero no necesita contenido).

- [ ] **Step 3: Crear `security/reparto_groups.xml`**

**Nota de compatibilidad Odoo 19:** `res.groups` ya no tiene el campo `category_id` directo (eso cambió respecto a versiones viejas de Odoo). Ahora existe una capa intermedia `res.groups.privilege` — cada `res.groups.privilege` tiene su propio `category_id` (a `ir.module.category`), y cada `res.groups` referencia un `privilege_id` (opcional). Confirmado contra el propio módulo `point_of_sale` de esta instancia (`security/point_of_sale_security.xml`), que define su privilegio así:
```xml
<record model="res.groups.privilege" id="res_groups_privilege_point_of_sale">
    <field name="name">Point of Sale</field>
    <field name="sequence">21</field>
    <field name="category_id" ref="base.module_category_sales"/>
</record>
<record id="group_pos_user" model="res.groups">
    <field name="name">User</field>
    <field name="privilege_id" ref="res_groups_privilege_point_of_sale"/>
</record>
```
Nuestros 4 roles son mutuamente excluyentes por usuario (un empleado es Vendedor O Depósito O Admin Operativa O Gerencia, no varios) — encaja bien con agruparlos bajo un solo `res.groups.privilege` (así Odoo los muestra como selección única en Ajustes > Usuarios, en vez de 4 checkboxes independientes).

```xml
<odoo>
    <record id="module_category_reparto" model="ir.module.category">
        <field name="name">Reparto</field>
        <field name="description">Roles del proyecto de preventa y distribución (Reparto)</field>
        <field name="sequence">50</field>
    </record>

    <record id="privilege_reparto_rol" model="res.groups.privilege">
        <field name="name">Rol de Reparto</field>
        <field name="category_id" ref="module_category_reparto"/>
    </record>

    <record id="group_reparto_vendedor" model="res.groups">
        <field name="name">Vendedor</field>
        <field name="privilege_id" ref="privilege_reparto_rol"/>
        <field name="comment">Vendedor de preventa: ve únicamente sus propios clientes y pedidos POS.</field>
    </record>

    <record id="group_reparto_deposito" model="res.groups">
        <field name="name">Depósito</field>
        <field name="privilege_id" ref="privilege_reparto_rol"/>
        <field name="comment">Operador de depósito: recibe pedidos y hace picking. Por ahora sin restricción de datos propia (ver spec 2026-08-23).</field>
    </record>

    <record id="group_reparto_adminop" model="res.groups">
        <field name="name">Administración Operativa</field>
        <field name="privilege_id" ref="privilege_reparto_rol"/>
        <field name="comment">Recepción e impresión de remitos. Por ahora sin restricción de datos propia (ver spec 2026-08-23).</field>
    </record>

    <record id="group_reparto_gerencia" model="res.groups">
        <field name="name">Administración Privada / Gerencia</field>
        <field name="privilege_id" ref="privilege_reparto_rol"/>
        <field name="comment">Acceso protegido a balances, comisiones y gastos. Ve todos los clientes y pedidos.</field>
    </record>
</odoo>
```

- [ ] **Step 4: Instalar el módulo y verificar que carga sin errores**

Run:
```bash
docker compose exec -T odoo odoo --db_host=db --db_user=odoo --db_password=odoo -d odoo -i pos_reparto_security --stop-after-init --log-level=info
```
Expected: el log termina sin líneas `ERROR` ni `CRITICAL`, y debería aparecer algo como `Module pos_reparto_security loaded`.

- [ ] **Step 5: Verificar en la base que los 4 grupos existen**

Run:
```bash
docker compose exec -T db psql -U odoo -d odoo -c "select g.name->>'en_US' from res_groups g join res_groups_privilege p on g.privilege_id = p.id join ir_module_category c on p.category_id = c.id where c.name->>'en_US' = 'Reparto' order by 1;"
```
Expected: 4 filas — `Administración Operativa`, `Administración Privada / Gerencia`, `Depósito`, `Vendedor`. (`name`/`comment` son campos `jsonb` traducibles en Odoo 19 — de ahí el `->>'en_US'`.)

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_security/__manifest__.py addons/pos_reparto_security/__init__.py addons/pos_reparto_security/security/reparto_groups.xml
git commit -m "$(cat <<'EOF'
Agregar scaffold de pos_reparto_security con los 4 grupos de rol

Grupos declarados en categoria propia "Reparto" (Vendedor, Deposito,
Admin Operativa, Gerencia). Todavia sin reglas de acceso - eso llega
en las proximas tareas.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Regla de visibilidad sobre clientes (`res.partner`)

**Files:**
- Create: `addons/pos_reparto_security/security/reparto_partner_rules.xml`
- Create: `addons/pos_reparto_security/tests/__init__.py`
- Create: `addons/pos_reparto_security/tests/test_reparto_security.py`
- Modify: `addons/pos_reparto_security/__manifest__.py`

- [ ] **Step 1: Crear `tests/__init__.py`**

```python
from . import test_reparto_security
```

- [ ] **Step 2: Escribir el test que falla (todavía no existe la regla)**

Crear `addons/pos_reparto_security/tests/test_reparto_security.py`:

```python
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoSecurity(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_vendedor = cls.env.ref('pos_reparto_security.group_reparto_vendedor')
        cls.group_internal = cls.env.ref('base.group_user')

        cls.vendedor_1 = cls.env['res.users'].create({
            'name': 'Vendedor Uno',
            'login': 'vendedor_uno_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.vendedor_2 = cls.env['res.users'].create({
            'name': 'Vendedor Dos',
            'login': 'vendedor_dos_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.usuario_sin_rol = cls.env['res.users'].create({
            'name': 'Usuario Sin Rol',
            'login': 'sin_rol_test',
            'group_ids': [(6, 0, [cls.group_internal.id])],
        })

    def test_vendedor_ve_solo_sus_propios_clientes(self):
        partner_1 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 1',
            'user_id': self.vendedor_1.id,
        })
        partner_2 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 2',
            'user_id': self.vendedor_2.id,
        })

        found_by_vendedor_1 = self.env['res.partner'].with_user(self.vendedor_1).search([
            ('id', 'in', [partner_1.id, partner_2.id]),
        ])
        self.assertEqual(found_by_vendedor_1, partner_1)

        found_by_vendedor_2 = self.env['res.partner'].with_user(self.vendedor_2).search([
            ('id', 'in', [partner_1.id, partner_2.id]),
        ])
        self.assertEqual(found_by_vendedor_2, partner_2)

    def test_usuario_sin_grupo_vendedor_ve_todos_los_clientes(self):
        partner_1 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 1',
            'user_id': self.vendedor_1.id,
        })
        partner_2 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 2',
            'user_id': self.vendedor_2.id,
        })

        found = self.env['res.partner'].with_user(self.usuario_sin_rol).search([
            ('id', 'in', [partner_1.id, partner_2.id]),
        ])
        self.assertEqual(found, partner_1 | partner_2)
```

- [ ] **Step 3: Correr los tests y verificar que `test_vendedor_ve_solo_sus_propios_clientes` falla**

Run:
```bash
docker compose exec -T odoo odoo --db_host=db --db_user=odoo --db_password=odoo -d odoo -u pos_reparto_security --test-enable --test-tags /pos_reparto_security --stop-after-init --log-level=test
```
Expected: `FAIL` en `test_vendedor_ve_solo_sus_propios_clientes` (sin la regla, `vendedor_1` ve ambos partners, no solo el suyo — `assertEqual(found_by_vendedor_1, partner_1)` falla porque `found_by_vendedor_1` trae los dos). `test_usuario_sin_grupo_vendedor_ve_todos_los_clientes` debería pasar igual (todavía es verdad sin la regla).

- [ ] **Step 4: Crear `security/reparto_partner_rules.xml`**

```xml
<odoo>
    <record id="rule_reparto_partner_vendedor" model="ir.rule">
        <field name="name">Vendedor Reparto: solo sus propios clientes</field>
        <field name="model_id" ref="base.model_res_partner"/>
        <field name="domain_force">[('user_id', '=', user.id)]</field>
        <field name="groups" eval="[(4, ref('group_reparto_vendedor'))]"/>
        <field name="perm_read">1</field>
        <field name="perm_write">1</field>
        <field name="perm_create">0</field>
        <field name="perm_unlink">0</field>
    </record>
</odoo>
```

- [ ] **Step 5: Agregar el archivo a `__manifest__.py`**

Modificar el bloque `data` de `addons/pos_reparto_security/__manifest__.py`:

```python
    'data': [
        'security/reparto_groups.xml',
        'security/reparto_partner_rules.xml',
    ],
```

- [ ] **Step 6: Correr los tests de nuevo y verificar que pasan todos**

Run:
```bash
docker compose exec -T odoo odoo --db_host=db --db_user=odoo --db_password=odoo -d odoo -u pos_reparto_security --test-enable --test-tags /pos_reparto_security --stop-after-init --log-level=test
```
Expected: `OK` — los 2 tests pasan.

- [ ] **Step 7: Commit**

```bash
git add addons/pos_reparto_security/security/reparto_partner_rules.xml addons/pos_reparto_security/__manifest__.py addons/pos_reparto_security/tests/
git commit -m "$(cat <<'EOF'
Agregar regla de visibilidad de clientes por vendedor

ir.rule sobre res.partner: un usuario del grupo Vendedor Reparto solo
ve los partners donde el (ya existente) campo user_id (Salesperson)
coincide con el propio. Sin esa regla, o si el usuario no pertenece
al grupo, ve todos los clientes (comportamiento nativo de Odoo).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Regla de visibilidad sobre pedidos POS (`pos.order`)

**Files:**
- Create: `addons/pos_reparto_security/security/reparto_pos_order_rules.xml`
- Modify: `addons/pos_reparto_security/tests/test_reparto_security.py`
- Modify: `addons/pos_reparto_security/__manifest__.py`

- [ ] **Step 1: Dar acceso de POS a los usuarios de prueba y agregar el test que falla**

`pos.order` tiene su propio control de acceso por modelo (aparte de la regla de fila): hace falta que `vendedor_1`/`vendedor_2` estén en `point_of_sale.group_pos_user` para poder siquiera leer el modelo, si no la búsqueda tira `AccessError` en vez de simplemente filtrar filas.

Modificar `setUpClass` en `addons/pos_reparto_security/tests/test_reparto_security.py` — reemplazar:

```python
        cls.group_vendedor = cls.env.ref('pos_reparto_security.group_reparto_vendedor')
        cls.group_internal = cls.env.ref('base.group_user')

        cls.vendedor_1 = cls.env['res.users'].create({
            'name': 'Vendedor Uno',
            'login': 'vendedor_uno_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.vendedor_2 = cls.env['res.users'].create({
            'name': 'Vendedor Dos',
            'login': 'vendedor_dos_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
```

por:

```python
        cls.group_vendedor = cls.env.ref('pos_reparto_security.group_reparto_vendedor')
        cls.group_internal = cls.env.ref('base.group_user')
        cls.group_pos_user = cls.env.ref('point_of_sale.group_pos_user')

        cls.vendedor_1 = cls.env['res.users'].create({
            'name': 'Vendedor Uno',
            'login': 'vendedor_uno_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id, cls.group_pos_user.id])],
        })
        cls.vendedor_2 = cls.env['res.users'].create({
            'name': 'Vendedor Dos',
            'login': 'vendedor_dos_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id, cls.group_pos_user.id])],
        })
```

Agregar al final de la clase `TestRepartoSecurity` (después de `test_usuario_sin_grupo_vendedor_ve_todos_los_clientes`):

```python

    def test_vendedor_ve_solo_sus_propios_pedidos_pos(self):
        order_1 = self._create_minimal_pos_order(self.vendedor_1)
        order_2 = self._create_minimal_pos_order(self.vendedor_2)

        found_by_vendedor_1 = self.env['pos.order'].with_user(self.vendedor_1).search([
            ('id', 'in', [order_1.id, order_2.id]),
        ])
        self.assertEqual(found_by_vendedor_1, order_1)

    def _create_minimal_pos_order(self, user):
        # pos.order.create() exige vals['session_id'] de una sesion abierta
        # (ver PosOrder._complete_values_from_session en point_of_sale) --
        # armar una sesion completa es innecesario para un test de regla de
        # acceso, asi que se inserta la fila directo por SQL con las
        # columnas NOT NULL reales de la tabla (company_id, name,
        # amount_tax, amount_total, amount_paid, amount_return).
        self.env.cr.execute(
            """
            INSERT INTO pos_order (company_id, name, amount_tax, amount_total, amount_paid, amount_return, user_id)
            VALUES (%s, %s, 0, 0, 0, 0, %s)
            RETURNING id
            """,
            (self.env.company.id, 'Test Order', user.id),
        )
        order_id = self.env.cr.fetchone()[0]
        return self.env['pos.order'].browse(order_id)
```

- [ ] **Step 2: Correr los tests y verificar que el nuevo falla, los anteriores siguen pasando**

Run:
```bash
docker compose exec -T odoo odoo --db_host=db --db_user=odoo --db_password=odoo -d odoo -u pos_reparto_security --test-enable --test-tags /pos_reparto_security --stop-after-init --log-level=test
```
Expected: `test_vendedor_ve_solo_sus_propios_pedidos_pos` FALLA (vendedor_1 ve las 2 órdenes, no solo la suya — todavía no hay regla sobre `pos.order`). Los 2 tests de `res.partner` siguen en `OK`.

- [ ] **Step 3: Crear `security/reparto_pos_order_rules.xml`**

```xml
<odoo>
    <record id="rule_reparto_pos_order_vendedor" model="ir.rule">
        <field name="name">Vendedor Reparto: solo sus propios pedidos POS</field>
        <field name="model_id" ref="point_of_sale.model_pos_order"/>
        <field name="domain_force">[('user_id', '=', user.id)]</field>
        <field name="groups" eval="[(4, ref('group_reparto_vendedor'))]"/>
        <field name="perm_read">1</field>
        <field name="perm_write">1</field>
        <field name="perm_create">1</field>
        <field name="perm_unlink">0</field>
    </record>
</odoo>
```

- [ ] **Step 4: Agregar el archivo a `__manifest__.py`**

Modificar el bloque `data` de `addons/pos_reparto_security/__manifest__.py`:

```python
    'data': [
        'security/reparto_groups.xml',
        'security/reparto_partner_rules.xml',
        'security/reparto_pos_order_rules.xml',
    ],
```

- [ ] **Step 5: Correr los tests de nuevo y verificar que pasan todos**

Run:
```bash
docker compose exec -T odoo odoo --db_host=db --db_user=odoo --db_password=odoo -d odoo -u pos_reparto_security --test-enable --test-tags /pos_reparto_security --stop-after-init --log-level=test
```
Expected: `OK` — los 3 tests pasan.

- [ ] **Step 6: Commit**

```bash
git add addons/pos_reparto_security/security/reparto_pos_order_rules.xml addons/pos_reparto_security/__manifest__.py addons/pos_reparto_security/tests/test_reparto_security.py
git commit -m "$(cat <<'EOF'
Agregar regla de visibilidad de pedidos POS por vendedor

ir.rule sobre pos.order, mismo patron que la de res.partner de la
tarea anterior: un usuario del grupo Vendedor Reparto solo ve sus
propios pedidos (campo user_id existente). Cierra RF-PV-01 para
clientes y pedidos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Instalar en el entorno interactivo y dejar documentado

**Files:**
- Modify: `ESTADO_PROYECTO.md`

- [ ] **Step 1: Reiniciar el servidor Odoo que corre en `:8069` para que reconozca el módulo**

Run:
```bash
docker compose restart odoo
```
Expected: `docker compose ps` vuelve a mostrar `odoo` como `running` después de unos segundos.

- [ ] **Step 2: Instalar el módulo desde la interfaz (una vez, manual)**

Entrar a `http://localhost:8069` con modo desarrollador (`?debug=1`), ir a **Apps → Update Apps List**, buscar "POS Reparto - Seguridad de Roles", **Install**. Esto es exactamente el flujo ya documentado en `INSTRUCTIVO_SETUP.md` §4 para módulos nuevos.

- [ ] **Step 3: Agregar una sección al `ESTADO_PROYECTO.md`**

Insertar después de la sección `## 5. Módulo custom: pos_stock_limit` (antes de `## 6. Facturación (ARCA/AFIP)`):

```markdown
## 5bis. Módulo custom: `pos_reparto_security`

Ubicación: `addons/pos_reparto_security/`. Instalado.

Qué hace: da de alta los 4 roles del proyecto (RNF-04 del relevamiento v2.0) como grupos de seguridad en categoría "Reparto" — Vendedor, Depósito, Administración Operativa, Administración Privada/Gerencia. Por ahora la única regla de acceso real es la de Vendedor: un usuario en ese grupo solo ve sus propios clientes (`res.partner`) y pedidos POS (`pos.order`), filtrando por el campo nativo `user_id` de cada modelo (no se creó ningún campo nuevo). Depósito, Admin Operativa y Gerencia no tienen restricción propia todavía — ven todo por comportamiento default de Odoo (ninguna regla los alcanza), a ajustar si el taller de detalle con el cliente revela una diferencia real de permisos entre esos tres.

Pendiente manual (fuera de este módulo): crear los usuarios reales de cada vendedor/depósito/administración y asignarles el grupo `Reparto` que corresponda + el/los grupo(s) estándar de Odoo de la app que vayan a usar (ej. Point of Sale User), y asignar el campo "Salesperson" (`user_id`) en cada cliente real al vendedor que le corresponde.

Ver spec: `docs/superpowers/specs/2026-08-23-pos-reparto-security-design.md`.
```

Actualizar también la sección `## 9. Pendiente / próximos pasos`, agregando esta línea:

```markdown
- Módulo de alerta de crédito (15 días/2 visitas sin pago) sobre `res.partner`, con dashboard filtrado por rol usando los grupos de `pos_reparto_security` recién armados — action item pendiente del ADR-001, bloque 2.
```

- [ ] **Step 4: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "$(cat <<'EOF'
Documentar pos_reparto_security en ESTADO_PROYECTO.md

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- 4 grupos en categoría propia → Task 1.
- Regla de `res.partner` (Vendedor, domain por `user_id`, sin create/unlink) → Task 2.
- Regla de `pos.order` (Vendedor, domain por `user_id`, con create, sin unlink) → Task 3.
- "Por qué no hacen falta reglas para los otros 3 grupos" → verificado implícitamente por `test_usuario_sin_grupo_vendedor_ve_todos_los_clientes` (Task 2) — un usuario sin el grupo Vendedor ve todo, que es el comportamiento esperado también para Depósito/Admin Operativa/Gerencia.
- Edge case de partner sin `user_id` → documentado en la spec como decisión aceptada, no requiere código; no hace falta test adicional porque no cambia el comportamiento de la regla (un partner con `user_id=False` simplemente no matchea `('user_id','=',user.id)` para ningún vendedor, que es el comportamiento ya cubierto).
- Testing con `TransactionCase`, sin demo data → Task 2 y 3.
- "Fuera de alcance": no se tocó Inventario/`stock.picking`, no se crearon usuarios reales ni datos demo, no se tocó comisiones ni alerta de crédito → ningún task de este plan los incluye, consistente.

**Placeholder scan:** sin TBD/TODO ni pasos vagos — cada Run/Expected tiene comando y salida concretos.

**Type consistency:** los XML ids (`group_reparto_vendedor`, `rule_reparto_partner_vendedor`, `rule_reparto_pos_order_vendedor`) y los nombres de campos (`user_id`, `group_ids`, `groups`) se usan de forma consistente entre Task 1, 2 y 3 — verificados contra la base real del proyecto (`ir_model_fields`, `ir_model_data`) antes de escribir el plan, no son nombres supuestos.
