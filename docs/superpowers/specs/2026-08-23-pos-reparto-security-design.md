# Diseño: módulo `pos_reparto_security` (4 roles del proyecto Reparto)

**Fecha:** 2026-08-23
**Contexto:** Action item 4 del `ADR-001-arquitectura-toma-pedido.md`, adelantado porque el módulo de alerta de crédito (siguiente en la cola) necesita un dashboard con visibilidad distinta por rol (Vendedor ve solo sus clientes, Gerencia ve todo).

## Objetivo

Modelar en Odoo los 4 roles confirmados por el cliente en el relevamiento v2.0 (RNF-04): **Vendedor**, **Depósito**, **Administración Operativa**, **Administración Privada/Gerencia**. El requisito funcional concreto que dispara esto ahora es RF-PV-01 ("el vendedor debe... visualización exclusiva de sus propios clientes, pedidos y comisiones").

## Decisiones tomadas en el brainstorming

- Depósito y Administración Operativa quedan como **grupos separados desde ahora**, aunque hoy tengan el mismo alcance de datos (sin restricción). Si el taller de detalle revela una diferencia real de permisos entre ambos, se ajusta después sin tener que reestructurar nada — solo agregar una regla nueva al grupo que corresponda.
- El campo de "dueño" de un cliente es el campo nativo `user_id` (Salesperson) de `res.partner` — ya existe, no se crea nada nuevo. Lo mismo para `pos.order` (campo `user_id`, ya presente como cajero/vendedor de la orden).
- Sigue todo sobre POS (`ADR-001`), no hay dependencia de Ventas/`sale.order`.

## Arquitectura

Módulo nuevo `pos_reparto_security`. Depende únicamente de `point_of_sale` (aporta `pos.order`; `res.partner` es de `base`, siempre disponible). **Sin `stock` como dependencia** — no se toca nada de Inventario en este alcance.

100% datos declarativos (XML), sin código Python. Estructura de archivos:

```
addons/pos_reparto_security/
├── __init__.py          (vacío, no hay modelos Python)
├── __manifest__.py
├── security/
│   ├── reparto_groups.xml
│   ├── reparto_partner_rules.xml
│   └── reparto_pos_order_rules.xml
└── tests/
    ├── __init__.py
    └── test_reparto_security.py
```

## Componentes

### 1. Grupos (`security/reparto_groups.xml`)

4 `res.groups` en una categoría propia `Reparto`:

- `group_reparto_vendedor` — Vendedor
- `group_reparto_deposito` — Depósito
- `group_reparto_adminop` — Administración Operativa
- `group_reparto_gerencia` — Administración Privada / Gerencia

Son marcadores de rol. El acceso base a cada app (Punto de Venta, Inventario) lo siguen dando los grupos estándar de Odoo (POS User, Inventory User, etc.), asignados aparte al crear cada usuario real. Estos 4 grupos existen para que las reglas de este módulo — y las de módulos futuros (comisiones, dashboard de crédito) — puedan diferenciar por rol de negocio sin depender de los grupos genéricos de Odoo.

### 2. Regla sobre clientes (`security/reparto_partner_rules.xml`)

Una `ir.rule` sobre `res.partner`:

- **Domain:** `[('user_id', '=', user.id)]`
- **Grupos:** solo `group_reparto_vendedor`
- **Permisos:** solo read habilitado (la ficha del cliente no es editable por el vendedor — ningún requerimiento lo pide, y así queda alineado con el ACL base de Odoo, que ya deniega `write` en `res.partner` a usuarios internos comunes). Además de esta regla hay una segunda `ir.rule` (`rule_reparto_partner_vendedor_no_create_no_delete`) con domain imposible (`id = False`) que bloquea creación y borrado de forma explícita — no se depende de que `perm_create=0`/`perm_unlink=0` por sí solos impidan la operación (esos flags solo excluyen la regla del set considerado para esa operación, no bloquean nada si otra regla o el ACL de otro grupo lo permite).

### 3. Regla sobre pedidos POS (`security/reparto_pos_order_rules.xml`)

Misma idea sobre `pos.order`:

- **Domain:** `[('user_id', '=', user.id)]`
- **Grupos:** solo `group_reparto_vendedor`
- **Permisos:** read + write + create habilitados (el vendedor necesita poder crear y ver/editar sus propios pedidos). Para unlink, igual que con `res.partner` (ver sección 2), `perm_unlink=0` en esta regla no alcanza por sí solo — el ACL base de `point_of_sale` (`group_pos_user`) ya da permiso de unlink a nivel modelo. Hay una segunda `ir.rule` (`rule_reparto_pos_order_vendedor_no_delete`) con domain imposible (`id = False`) que bloquea el borrado de forma real, coherente con RNF-07 (historial inmutable).

### Por qué no hacen falta reglas para los otros 3 grupos

En Odoo, una `ir.rule` con `groups=[...]` solo restringe a los usuarios que pertenecen a ese grupo. Un usuario que no está en `group_reparto_vendedor` no es tocado por esta regla y ve todos los registros por default (sujeto solo a los permisos de modelo estándar de POS/Inventario). Depósito, Admin Operativa y Gerencia no necesitan una regla "ver todo" explícita — es el comportamiento nativo cuando ninguna regla los restringe.

## Flujo de datos

1. Se crea un usuario real en Odoo (Configuración > Usuarios).
2. Se le asignan los grupos estándar de Odoo necesarios para las apps que va a usar (ej. Point of Sale User).
3. Se le asigna uno de los 4 grupos de `Reparto` según su rol de negocio.
4. Si es Vendedor: para que la regla tenga efecto, cada `res.partner` (cliente) que le corresponda debe tener el campo `user_id` (Salesperson) apuntando a ese usuario. Esto se hace al dar de alta al cliente o editando el campo desde la ficha del partner.
5. A partir de ahí, ese vendedor solo ve (en listas, búsquedas, y cualquier vista de backend) los partners y pos.order donde `user_id` sea él mismo.

## Edge case: clientes sin vendedor asignado

Hoy existe un solo partner de prueba, `Consumidor Final Anónimo`, sin `user_id`. Con la regla activa, **ningún** vendedor lo vería en una búsqueda de clientes filtrada por dueño — porque el domain es una igualdad exacta (`user_id = user.id`), no incluye "o vacío". Esto es aceptable para el caso de uso real (cada cliente de reparto tiene un vendedor asignado desde el alta); el partner "Consumidor Final Anónimo" es para venta de mostrador ad-hoc y no participa del circuito de rutas/crédito. Si en el taller de detalle aparece un caso real de cliente sin vendedor que sí necesite ser visible para todos los vendedores, se ajusta el domain a `['|', ('user_id', '=', user.id), ('user_id', '=', False)]`.

## Testing

Un test Python (`TransactionCase`) en `tests/test_reparto_security.py`, sin necesidad de datos demo (el test crea los suyos):

1. Crear 2 usuarios con `group_reparto_vendedor`.
2. Crear 2 `res.partner`, cada uno con `user_id` apuntando a un vendedor distinto.
3. Con `partner_model.with_user(vendedor_1).search([])`, verificar que solo aparece el partner 1 (no el 2).
4. Simétrico para vendedor 2.
5. Un usuario sin el grupo Vendedor (ej. un usuario base con solo `base.group_user`) debe ver ambos partners — confirma que la ausencia del grupo no restringe.
6. Repetir el mismo patrón (pasos 1-5) para `pos.order` en lugar de `res.partner`.

## Fuera de alcance (explícito)

- No se tocan permisos de Inventario/`stock.picking` — Depósito y Admin Operativa heredan lo que ya da el grupo estándar `Inventory User` de Odoo, sin filtro adicional en este módulo.
- No se crean usuarios reales ni datos demo — la creación de los usuarios de Vendedor/Depósito/Admin Operativa/Gerencia reales queda como paso manual de configuración (fuera de este módulo).
- No se aborda el módulo de comisiones (RF-GV-*) — los 4 grupos quedan preparados para que ese módulo futuro los reutilice, pero su lógica no se construye acá.
- No se aborda el módulo de alerta de crédito (bloque 2, pendiente) — retoma este trabajo como dependencia una vez que este módulo esté instalado.
