# Diseño: bloqueo duro de camión por vendedor en `pos_reparto_security`

**Fecha:** 2026-09-14
**Contexto:** MANUAL_USUARIO.md (sección 5.4, Paso 5) documentaba dos caminos para restringir qué camión puede abrir cada vendedor: el operativo (una tablet por vendedor, ya en uso) y el "técnico" (instalar `pos_hr`). El cliente pidió el bloqueo técnico ("duro") para que un vendedor no pueda ni ver el POS de un camión que no es el suyo.

## Decisiones tomadas en el brainstorming

- **No se usa `pos_hr`.** Ese módulo estándar de Odoo controla el login por PIN/empleado *dentro de una sesión POS ya abierta* (multi-cajero compartiendo una caja) — no controla qué `pos.config` puede abrir un usuario del backend. Instalarlo traería además el módulo `hr` completo (Empleados) sin resolver el problema pedido.
- **Bloqueo por `ir.rule` sobre `pos.config`**, mismo patrón ya usado en `reparto_pos_order_rules.xml` para `pos.order`. Se agrega a `pos_reparto_security` (módulo dueño de grupos/reglas de rol) en vez de crear un módulo nuevo.
- **Cardinalidad uno a uno**: un vendedor tiene un único camión asignado (`reparto_camion_asignado_id`), no una lista. Coincide con el uso real (una tablet por vendedor).
- **Sin asignar = sin acceso**: si el campo está vacío, el vendedor no ve ningún `pos.config`. Evita dejar el sistema abierto por omisión mientras un admin no cargó la asignación.
- La regla se scopea únicamente a `group_reparto_vendedor`. Depósito, Administración Operativa y Gerencia no llevan esta regla y siguen viendo todos los `pos.config`, igual que hoy — mismo razonamiento que en el spec de 2026-08-23 ("Por qué no hacen falta reglas para los otros 3 grupos").

## Arquitectura

Se extiende `pos_reparto_security` (no un módulo nuevo). Agrega su primer modelo Python (hasta ahora el módulo era 100% declarativo):

```
addons/pos_reparto_security/
├── models/
│   ├── __init__.py
│   └── res_users.py                       (nuevo)
├── views/
│   └── res_users_views.xml                (nuevo)
├── security/
│   ├── reparto_groups.xml
│   ├── reparto_admin_user.xml
│   ├── reparto_partner_rules.xml
│   ├── reparto_pos_order_rules.xml
│   └── reparto_pos_config_rules.xml       (nuevo)
├── data/
│   └── reparto_stock_config.xml
└── tests/
    ├── __init__.py
    └── test_reparto_security.py           (se extiende)
```

`__manifest__.py` suma `'point_of_sale'` ya está en `depends` (no hace falta agregar nada ahí — `pos.config` es del mismo módulo `point_of_sale` ya declarado); se agregan los 2 archivos XML nuevos a `data`.

## Componentes

### 1. Campo nuevo (`models/res_users.py`)

```python
class ResUsers(models.Model):
    _inherit = 'res.users'

    reparto_camion_asignado_id = fields.Many2one(
        'pos.config',
        string='Camión asignado (Reparto)',
        help='Para vendedores: el único POS de camión que puede abrir. '
             'Vacío = no puede abrir ningún camión.',
    )
```

Sin dominio restrictivo a nivel modelo sobre qué `pos.config` se puede elegir (cualquier admin que edite esto ya sabe qué está haciendo); la vista sí puede sugerir mediante el widget estándar de búsqueda.

### 2. Vista (`views/res_users_views.xml`)

`ir.ui.view` que hereda el formulario de usuarios (`base.view_users_form`) y agrega el campo nuevo en la pestaña de acceso ("Permisos" / grupos), visible junto a los checkboxes de rol de Reparto ya existentes. No se agrega ningún control de visibilidad adicional — queda gobernado por el mismo permiso que ya hace falta hoy para editar usuarios (`base.group_system` / Configuración > Usuarios).

### 3. Regla sobre `pos.config` (`security/reparto_pos_config_rules.xml`)

Una `ir.rule`:

- **Domain:** `[('id', '=', user.reparto_camion_asignado_id.id)]`
- **Grupos:** solo `group_reparto_vendedor`
- **Permisos:** `perm_read=1`, resto en `0` (el vendedor no crea/edita/borra configuraciones de POS, solo necesita verlas para poder abrir sesión).

Cuando `reparto_camion_asignado_id` está vacío, el domain queda `[('id', '=', False)]` — ningún `pos.config` tiene `id = False`, así que la búsqueda no devuelve nada. Mismo mecanismo que ya usa `rule_reparto_partner_vendedor_no_create_no_delete` en el spec anterior para bloquear una operación de forma explícita con un domain imposible.

## Flujo de datos

1. Admin (Admin Operativa o Gerencia, vía Configuración > Usuarios) le asigna a un vendedor su camión en el campo nuevo `reparto_camion_asignado_id`.
2. El vendedor entra a la app Punto de Venta. El dashboard lista `pos.config` vía kanban — la `ir.rule` filtra qué registros puede leer.
3. Solo aparece la tarjeta del camión asignado. Si no tiene asignado, el dashboard no muestra ninguna tarjeta de camión (las demás apps del vendedor, Clientes/etc., no se tocan).
4. Si el vendedor intenta forzar la URL de la sesión de otro camión, Odoo deniega el acceso con el error estándar (mismo comportamiento que ya existe hoy para `pos.order` ajeno).

## Interacción con reglas existentes

No hay conflicto: `rule_reparto_pos_order_vendedor` (que limita qué `pos.order` ve un vendedor a los propios) sigue funcionando igual, es una capa independiente y complementaria — antes bloqueaba solo los *pedidos*, ahora además se bloquea el *POS* en sí.

## Edge case: usuario Vendedor sin ningún grupo de acceso a POS

Si a un usuario se le asigna `group_reparto_vendedor` pero todavía no tiene el grupo estándar `point_of_sale.group_pos_user` (dado por `implied_ids` en `reparto_groups.xml`, así que en la práctica siempre lo tiene), la regla nueva no cambia nada — sigue sin acceso al modelo por ACL base, como ya pasa hoy.

## Testing

Se extiende `tests/test_reparto_security.py` con un tercer bloque (mismo patrón `TransactionCase` que los bloques de `res.partner` y `pos.order`):

1. Crear 3 `pos.config` de prueba (o reusar los 3 reales de Camión 1/2/3 si el test los necesita con esos nombres — a definir en el plan de implementación).
2. Crear un usuario Vendedor sin `reparto_camion_asignado_id`: `pos_config.with_user(vendedor).search([])` debe devolver vacío.
3. Asignarle Camión 2: la misma búsqueda debe devolver exactamente ese registro, no Camión 1 ni Camión 3.
4. Un usuario Depósito/Admin Operativa/Gerencia (sin `group_reparto_vendedor`) debe ver los 3 `pos.config` sin restricción — confirma que la regla no los toca.

## Fuera de alcance (explícito)

- No se instala `pos_hr` ni `hr`.
- No se resuelve el caso de un vendedor que necesite cubrir más de un camión (turnos rotativos) — si aparece ese caso real, ver nota de cardinalidad arriba; requeriría cambiar el campo a Many2many y ajustar el domain de la regla a `in` en vez de `=`.
- No se toca la pantalla de login de Odoo en sí (usuario/contraseña) — sigue siendo la autenticación estándar, esto solo filtra qué `pos.config` es visible/abrible una vez autenticado.
- No reemplaza el control operativo actual (una tablet por vendedor) — lo complementa como defensa técnica adicional.
