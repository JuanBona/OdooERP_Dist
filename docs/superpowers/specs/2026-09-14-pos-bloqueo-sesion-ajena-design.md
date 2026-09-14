# Spec: cerrar el gap de sesión POS ajena ya abierta

**Fecha:** 2026-09-14
**Módulo:** `pos_reparto_security`
**Relacionado:** `docs/superpowers/specs/2026-09-14-pos-bloqueo-camion-vendedor-design.md` (bloqueo duro de camión por vendedor)

## Contexto

El bloqueo duro implementado en RF de camión-por-vendedor filtra `pos.config` vía `ir.rule`, y así esconde la tarjeta del camión ajeno en el dashboard de Punto de Venta. Pero si ya existe una **sesión abierta** en ese camión (dejada por otro usuario), un vendedor puede igual entrar navegando directo a `/pos/ui/<config_id>/...` y unirse a esa sesión — la ruta de la terminal valida contra `pos.session` (que permite que cualquier usuario con "Punto de venta: Usuario" se una a una sesión ya abierta, comportamiento nativo de Odoo para multi-cajero), no contra la `ir.rule` de `pos.config`.

Esto quedó documentado como "gap conocido, aceptado" en `ESTADO_PROYECTO.md`. Ahora se decide cerrarlo.

## Confirmado con el usuario

- El negocio **nunca** comparte una misma sesión de POS entre dos vendedores distintos del mismo camión (no hay multi-cajero legítimo dentro de un camión). Un vendedor = una sesión = su camión asignado.
- Comportamiento deseado ante sesión ajena: **bloqueo duro**, sin excepción por "sesión sin cajero activo" — si no es su camión asignado, no entra, esté la sesión abierta o no.

## Alcance

Solo afecta al grupo `group_reparto_vendedor`. Los otros 3 grupos (Admin Operativa, Gerencia, Depósito) no tienen restricción hoy sobre `pos.config` ni la tendrán sobre `pos.session` — quedan sin cambios.

## Diseño

Espejar el patrón ya usado en `reparto_pos_config_rules.xml` y `reparto_pos_order_rules.xml`: una `ir.rule` nueva sobre `point_of_sale.model_pos_session`.

```xml
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
```

Por qué estos permisos (a diferencia de la regla de `pos.config`, que es solo lectura):

- `perm_read=1`: es lo que tapa el gap — sin esto, la ruta de la terminal no puede ni leer la sesión ajena para unirse.
- `perm_write=1` y `perm_create=1`: el vendedor necesita abrir (`create`) y cerrar/operar (`write`) la sesión de **su propio** camión asignado — el domain ya restringe ambos a `config_id = su camión`, así que no habilita nada fuera de eso.
- `perm_unlink=0`: mismo criterio que el resto del módulo, un vendedor no borra sesiones.

Sin camión asignado (`reparto_camion_asignado_id` vacío), el domain es `[('config_id', '=', False)]` → no ve/crea/opera ninguna sesión, mismo comportamiento "no ve nada por default" que ya tiene `pos.config`.

Ubicación del código: se agrega al archivo existente `security/reparto_pos_config_rules.xml` (mismo tema — control de acceso a la terminal de camión) en vez de crear un archivo nuevo, para no fragmentar reglas que conceptualmente van juntas. Se actualiza `__manifest__.py` solo si hiciera falta declarar un archivo nuevo (no hace falta, ya está en la lista de `data`).

## Testing

Nuevos casos en `tests/test_reparto_security.py`, mismo estilo que los existentes (dos vendedores con camiones distintos, `assertRaises(AccessError)`):

1. Vendedor con camión1 asignado **no puede leer** una `pos.session` cuyo `config_id` es camión2 → `AccessError`.
2. Vendedor con camión1 asignado **sí puede leer** una `pos.session` propia (`config_id = camión1`).
3. Vendedor **sin** camión asignado no puede leer ninguna `pos.session`.
4. (Regresión) Admin/Gerencia/Depósito siguen viendo todas las sesiones sin restricción.

No se toca JS/frontend — el fix es puramente a nivel `ir.rule`, igual que el resto del módulo.

## Fuera de alcance

- No se resuelve el caso de multi-cajero real (no existe en este negocio, confirmado con el usuario). Si en el futuro aparece, hay que revisar esta regla porque rompería ese flujo.
- No se toca `pos.session` de otros módulos (`pos_reparto_viaje`, etc.) — no dependen de esta lectura para su propia lógica según el estado del proyecto.

## Documentación a actualizar tras implementar

`ESTADO_PROYECTO.md`, párrafo "⚠️ Gap conocido, verificado 2026-09-14" en la sección de `pos_reparto_security`: reemplazar por nota de que quedó cerrado, con referencia a este spec y al módulo/regla que lo resuelve.
