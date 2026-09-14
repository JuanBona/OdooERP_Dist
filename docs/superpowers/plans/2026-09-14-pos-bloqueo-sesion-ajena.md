# Bloqueo de sesión POS ajena — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el gap conocido en `pos_reparto_security` donde un vendedor puede unirse a una `pos.session` ya abierta de un camión que no es el suyo (navegando directo a `/pos/ui/<config_id>`), aunque el dashboard ya le esconda ese camión.

**Architecture:** Una sola `ir.rule` nueva sobre `point_of_sale.model_pos_session`, mismo patrón que las reglas existentes de `pos.config`/`pos.order` en este módulo: domain `[('config_id', '=', user.reparto_camion_asignado_id.id)]` para el grupo `group_reparto_vendedor`, con `perm_read/write/create=1` (necesita operar su propia sesión) y `perm_unlink=0`.

**Tech Stack:** Odoo 19 (`ir.rule`, `point_of_sale`), `TransactionCase` (`odoo.tests.common`), XML data.

**Spec:** `docs/superpowers/specs/2026-09-14-pos-bloqueo-sesion-ajena-design.md`

---

### Task 1: Agregar la `ir.rule` de `pos.session`

**Files:**
- Modify: `addons/pos_reparto_security/security/reparto_pos_config_rules.xml`

- [ ] **Step 1: Agregar el nuevo `<record>` al archivo existente**

Reemplazar el contenido completo del archivo por:

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

    <record id="rule_reparto_pos_session_vendedor" model="ir.rule">
        <field name="name">Vendedor Reparto: solo la sesión de su camión asignado</field>
        <field name="model_id" ref="point_of_sale.model_pos_session"/>
        <field name="domain_force">[('config_id', '=', user.reparto_camion_asignado_id.id)]</field>
        <field name="groups" eval="[(4, ref('group_reparto_vendedor'))]"/>
        <field name="perm_read">1</field>
        <field name="perm_write">1</field>
        <field name="perm_create">1</field>
        <field name="perm_unlink">0</field>
    </record>
</odoo>
```

No hace falta tocar `__manifest__.py`: `reparto_pos_config_rules.xml` ya está en `data`.

- [ ] **Step 2: Actualizar el módulo en Odoo para cargar la regla**

Run: `python odoo-bin -c <tu.conf> -u pos_reparto_security --stop-after-init`

(usar el mismo comando/config que se usó en los commits anteriores de este módulo; si hay un script propio del proyecto para esto, usarlo en su lugar)

Expected: termina sin traceback, log muestra el módulo actualizado.

- [ ] **Step 3: Commit**

```bash
git add addons/pos_reparto_security/security/reparto_pos_config_rules.xml
git commit -m "feat(pos_reparto_security): bloquear sesión POS de camión ajeno para vendedor"
```

---

### Task 2: Tests de la regla nueva

**Files:**
- Modify: `addons/pos_reparto_security/tests/test_reparto_security.py`

Agregar estos 4 métodos de test a la clase `TestRepartoSecurity` (al final del archivo, después de `test_campo_camion_asignado_visible_en_formulario_de_usuario`). Todos usan `env['pos.session'].sudo().create(...)` para armar la sesión (evita pelear con permisos al armar el fixture) y después verifican el acceso `with_user(...)`.

- [ ] **Step 1: Escribir los tests (deben fallar)**

```python
    def test_vendedor_no_puede_leer_sesion_de_camion_ajeno(self):
        camion_1 = self.env['pos.config'].create({'name': 'Camión 1 Test Sesión'})
        camion_2 = self.env['pos.config'].create({'name': 'Camión 2 Test Sesión'})
        self.vendedor_1.sudo().reparto_camion_asignado_id = camion_1

        sesion_camion_2 = self.env['pos.session'].sudo().create({
            'config_id': camion_2.id,
            'user_id': self.vendedor_2.id,
        })

        with self.assertRaises(AccessError):
            sesion_camion_2.with_user(self.vendedor_1).read(['id'])

    def test_vendedor_puede_leer_sesion_de_su_propio_camion(self):
        camion_1 = self.env['pos.config'].create({'name': 'Camión 1 Test Sesión'})
        self.vendedor_1.sudo().reparto_camion_asignado_id = camion_1

        sesion_propia = self.env['pos.session'].sudo().create({
            'config_id': camion_1.id,
            'user_id': self.vendedor_1.id,
        })

        leida = sesion_propia.with_user(self.vendedor_1).read(['id'])
        self.assertEqual(leida[0]['id'], sesion_propia.id)

    def test_vendedor_sin_camion_asignado_no_ve_ninguna_sesion(self):
        camion_1 = self.env['pos.config'].create({'name': 'Camión 1 Test Sesión'})
        sesion = self.env['pos.session'].sudo().create({
            'config_id': camion_1.id,
            'user_id': self.vendedor_2.id,
        })

        with self.assertRaises(AccessError):
            sesion.with_user(self.vendedor_1).read(['id'])

    def test_usuario_sin_grupo_vendedor_ve_todas_las_sesiones(self):
        usuario_pos_sin_vendedor = self.env['res.users'].create({
            'name': 'Usuario POS Sin Rol Vendedor Sesión',
            'login': 'usuario_pos_sin_vendedor_sesion_test',
            'group_ids': [(6, 0, [self.group_internal.id, self.group_pos_user.id])],
        })
        camion_1 = self.env['pos.config'].create({'name': 'Camión 1 Test Sesión'})
        sesion = self.env['pos.session'].sudo().create({
            'config_id': camion_1.id,
            'user_id': self.vendedor_1.id,
        })

        leida = sesion.with_user(usuario_pos_sin_vendedor).read(['id'])
        self.assertEqual(leida[0]['id'], sesion.id)
```

- [ ] **Step 2: Correr los tests para confirmar que fallan sin la regla revertida**

Esto es solo para verificar que el test detecta el gap: si ya aplicaste el Task 1, saltar este paso de "debe fallar" y correr directo el Step 4 (deben pasar). Si querés confirmar el gap primero, comentar temporalmente el `<record id="rule_reparto_pos_session_vendedor">` agregado en Task 1, correr:

Run: `python odoo-bin -c <tu.conf> --test-enable --test-tags pos_reparto_security --stop-after-init -u pos_reparto_security`

Expected: `test_vendedor_no_puede_leer_sesion_de_camion_ajeno` y `test_vendedor_sin_camion_asignado_no_ve_ninguna_sesion` FALLAN (no se levanta `AccessError`). Después, descomentar el record.

- [ ] **Step 3: Correr los tests con la regla aplicada**

Run: `python odoo-bin -c <tu.conf> --test-enable --test-tags pos_reparto_security --stop-after-init -u pos_reparto_security`

Expected: los 4 tests nuevos (y todos los existentes del archivo) PASAN.

- [ ] **Step 4: Commit**

```bash
git add addons/pos_reparto_security/tests/test_reparto_security.py
git commit -m "test(pos_reparto_security): cubrir bloqueo de sesión POS de camión ajeno"
```

---

### Task 3: Actualizar la documentación del gap cerrado

**Files:**
- Modify: `ESTADO_PROYECTO.md`

- [ ] **Step 1: Reemplazar el párrafo del gap conocido**

Buscar el párrafo que empieza con `> ⚠️ **Gap conocido, verificado 2026-09-14:**` (dentro de la sección de `pos_reparto_security`, después del párrafo de "Bloqueo duro de camión por vendedor") y reemplazarlo por:

```markdown
**Gap cerrado (2026-09-14):** el caso de unirse a una sesión ya abierta de un camión ajeno navegando directo a `/pos/ui/<config_id>/...` se tapó agregando una `ir.rule` sobre `pos.session` (mismo patrón que la de `pos.config`, mismo archivo `reparto_pos_config_rules.xml`): un vendedor solo puede leer/crear/operar la sesión de su propio camión asignado. Ver `docs/superpowers/specs/2026-09-14-pos-bloqueo-sesion-ajena-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "docs: documentar cierre del gap de sesión POS de camión ajeno"
```

---

## Notas para quien ejecuta

- No hay cambios de JS/frontend en este plan — todo el fix es a nivel `ir.rule` (ORM), consistente con el resto del módulo.
- El negocio confirmó que nunca hay multi-cajero real (dos vendedores compartiendo la misma sesión de un mismo camión). Si eso cambiara en el futuro, esta regla se rompe y hay que revisarla.
- Al terminar las 3 tasks, seguir con `superpowers:finishing-a-development-branch` para decidir merge/PR, igual que se hizo con la feature de bloqueo de camión.
