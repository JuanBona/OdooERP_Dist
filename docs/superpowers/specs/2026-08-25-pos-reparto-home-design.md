# Diseño: pantalla de inicio táctil ("cuadraditos") por rol

**Fecha:** 2026-08-25
**Contexto:** Sesión de brainstorming en texto (sin visual companion). Motivo: al probar cuenta por cuenta los 4 roles de Reparto ([[project-pos-reparto-security-status]]), el usuario notó que el único "menú" disponible es el dropdown chico de texto (Discuss/Contactos/POS/...) — nada táctil, pensado para mouse y teclado, no para un fletero/depósito operando desde tablet.

## Objetivo

Reemplazar, para todos los usuarios internos, la pantalla de arranque tras el login por una grilla de cuadrados grandes tipo launcher — uno por cada app de negocio a la que el usuario ya tiene acceso — para navegar tocando en vez de leer un dropdown de texto.

## Decisiones tomadas en el brainstorming

- **Alcance de roles:** los 4 roles Reparto (Vendedor incluido, no solo Depósito/AdminOp/Gerencia) arrancan en esta pantalla.
- **Reemplaza el landing de login.** Hoy cae en Discuss por ser el primer menú por secuencia; pasa a caer acá.
- **Qué cuadraditos se muestran:** solo apps de negocio (Ventas, POS, Inventario, Contactos, Deudores, etc., lo que cada rol ya tenga). Discuss, To-do y Apps quedan afuera de la grilla — siguen estando accesibles por el dropdown chico de siempre, no se ocultan del sistema, solo no son cuadraditos.
- **Fuente de verdad de qué mostrar:** la visibilidad nativa de menús de Odoo (grupos ya asignados en [[project-pos-reparto-security-status]]), no una lista a mano por rol. Si mañana cambia qué grupo ve qué app, la pantalla se actualiza sola sin tocar este módulo.
- **No depende de `pos_reparto_security`:** la lógica de armado de cuadraditos es genérica (lee menús raíz visibles), no conoce los 4 roles Reparto puntualmente. Sirve igual si el día de mañana se agrega un rol nuevo.
- **Estética:** tarjetas blancas, ícono nativo de cada app (ya vienen coloreados por Odoo), acento en el rojo de marca ya definido en `pos_reparto_branding` — no se inventa paleta nueva.
- **Se sigue pudiendo volver:** la pantalla de inicio queda también como una entrada más del dropdown chico ("Inicio"), para volver a la grilla desde adentro de cualquier app.

## Arquitectura

Módulo nuevo `pos_reparto_home`. Depende de `web` y de `pos_reparto_branding` (reusa la variable de color de marca, no duplica el hex).

```
addons/pos_reparto_home/
├── __init__.py
├── __manifest__.py
├── models/
│   └── ir_ui_menu.py          (método get_reparto_home_tiles)
├── data/
│   └── home_menu.xml          (ir.actions.client + ir.ui.menu "Inicio", sequence baja)
├── static/src/
│   ├── home_screen.js         (componente OWL, client action)
│   ├── home_screen.xml        (template QWeb del componente)
│   └── scss/
│       └── home_screen.scss   (grilla + tarjetas, reusa variable de color de pos_reparto_branding)
└── tests/
    └── test_home_tiles.py
```

## Componentes

### 1. Backend: `ir.ui.menu.get_reparto_home_tiles()`

Método `@api.model` llamable por RPC. Pasos:

1. Toma los menús raíz (`parent_id = False`) visibles para el usuario actual, vía el mecanismo estándar de visibilidad de menús de Odoo (mismo criterio que ya decide qué aparece en el dropdown chico) — no se reimplementa lógica de permisos.
2. Excluye por external id fijo (constante en el módulo, no configurable — YAGNI): Discuss (`mail.menu_root_discuss`), To-do (`project_todo.menu_todo_todos`), Apps/instalador (`base.menu_management`), Settings (`base.menu_administration`) y Tests (`base.menu_tests`, menú técnico que aparece en este entorno de desarrollo). Los dos últimos ya quedan implícitamente afuera para los 4 roles Reparto por no tener `base.group_system`, pero se excluyen igual por si loguea un admin.
3. Por cada menú restante devuelve: `id`, `name`, `web_icon` (tal cual lo expone Odoo, ya viene coloreado por app), y descriptor de la acción a ejecutar (mismo `action` que usa el menú nativo).
4. Orden: por `sequence` del menú, igual que hoy en el dropdown.

Caso borde: si la lista queda vacía (rol sin ninguna app de negocio), el frontend muestra un mensaje en vez de una grilla vacía muda.

### 2. Frontend: client action OWL (`home_screen.js` / `.xml`)

- Se registra en el registry de acciones de cliente con un tag propio (ej. `reparto_home_tiles`).
- Al montar, llama `get_reparto_home_tiles` por ORM y guarda el resultado en estado reactivo.
- Mientras carga: spinner simple. Si la lista vino vacía: mensaje ("no tenés apps asignadas, avisá a un administrador").
- Renderiza una grilla CSS (`display: grid`, columnas responsivas) de tarjetas cuadradas, mínimo ~120px de lado — cómodo para tocar con el dedo en tablet. Cada tarjeta: ícono nativo grande + nombre debajo.
- Al tocar una tarjeta: `actionService.doAction(...)` con el descriptor de acción de ese menú — mismo resultado que clickear la app en el dropdown nativo.

### 3. Wiring como pantalla de inicio (`data/home_menu.xml`)

- Un `ir.actions.client` apuntando al tag OWL de arriba.
- Un `ir.ui.menu` raíz nuevo ("Inicio"), `action` = esa client action, `sequence` menor a la de cualquier otra app instalada (así Odoo la elige sola como landing tras login, sin tocar el campo `action_id` de cada usuario a mano — evita repetir esa configuración por cada usuario nuevo que se cree a futuro).
- `groups_id` = `base.group_user`, para que aplique a todo interno (no solo a los 4 roles Reparto), consistente con la decisión de alcance de arriba.

## Testing

- **Python (`TransactionCase`):** usuario con `group_reparto_vendedor` + `point_of_sale.group_pos_user` únicamente → `get_reparto_home_tiles` devuelve solo el tile de Punto de Venta. Usuario con los grupos de Gerencia (ver [[project-pos-reparto-security-status]]) → devuelve Ventas + POS + Inventario + Contactos. En ningún caso aparecen Discuss/To-do/Apps.
- **Verificación manual en navegador:** loguear con cada uno de los 4 usuarios placeholder ya creados (`vendedor@reparto.local`, etc.) y confirmar que cada uno arranca en la grilla, ve solo lo que le corresponde, y que tocar un cuadrado navega correctamente a esa app.
- No se agrega tour JS automatizado por ahora (ninguno de los módulos previos del proyecto lo usa, se mantiene la convención de tests Python + verificación manual).

## Fuera de alcance (explícito)

- No es "modo kiosco" (RNF-09 del relevamiento v2.0) — eso es gestión de dispositivo (MDM), no desarrollo Odoo. Esta pantalla ayuda a que el paso intermedio (mientras no hay MDM) sea más usable, pero no bloquea salir de la app ni nada por el estilo.
- No se personaliza qué apps son "cuadraditos" por instalación/cliente vía configuración — la exclusión de Discuss/To-do/Apps es fija en código para este proyecto.
- No se toca el flujo de la sesión POS en sí (`/pos/ui`) — esta pantalla es previa, para llegar a esa app entre otras, no reemplaza nada de adentro del POS.
- No se agrega buscador ni personalización de orden/favoritos de los cuadraditos — grilla fija por orden de `sequence`, sin drag&drop ni configuración por usuario.
