# Diseño: personalización visual del ERP (marca, menús, tema)

**Fecha:** 2026-08-24
**Contexto:** Sesión de brainstorming con el visual companion (mockups en `.superpowers/brainstorm/`, no versionados). Objetivo del cliente: que el sistema se vea como "el ERP de Rincón del Sur" y no como un Odoo genérico sin tocar, y que el menú principal no muestre apps que hoy nadie usa.

## Objetivo

Tres cambios independientes, agrupados en una sola sesión de trabajo porque comparten el mismo motivo (pulir la primera impresión del sistema):

1. Reemplazar el nombre placeholder "My Company" por el nombre real de la empresa.
2. Ocultar del menú principal las apps que hoy no se usan (Proyecto, Tableros, Rastreador de enlaces), sin desinstalarlas.
3. Recolorear la barra superior del backend (todas las apps, no solo POS) con el rojo de marca ya existente.

## Decisiones tomadas en el brainstorming

- **Logo y colores de marca ya están bien** (`res.company.logo`, `primary_color #a81c21`, `secondary_color #af8e8f`) — se verificó por consola antes de preguntar, así que no hay trabajo de diseño de marca desde cero, solo aplicarla donde falta.
- **Nombre real: "Rincon del sur"** (así, tal como lo escribió el cliente — sin acentuar "Rincón" salvo que después pida lo contrario).
- **Apps que quedan visibles:** Punto de venta, Inventario, Contactos (uso diario, fuera de duda), más **Ventas** y **Facturación** (confirmadas explícitamente).
- **Apps que se ocultan por ahora:** Proyecto, Tableros (Spreadsheet Dashboard), Rastreador de enlaces (Link Tracker) — "hasta que realmente las usemos". No se desinstalan: se ocultan del launcher para poder reactivarlas sin reinstalar nada si algún día hacen falta.
- **Estilo de topbar elegido: Opción A — "rojo corporativo total"** (de 3 mockups mostrados: A rojo total, B neutro con acento rojo, C violeta Odoo + logo). El cliente lo eligió sin dudar ("me encantó"). Aplica a **todo el backend**, no solo a la pantalla de POS (que ya tenía su propio branding en el ticket, independiente de esto).
- **El cambio de nombre de la compañía es dato, no código** — se hace una sola vez desde Ajustes → Compañías, no se automatiza en un módulo (no tiene sentido "programar" el nombre de la empresa; si mañana cambia la razón social, se edita el mismo campo a mano).
- **Ocultar menús y recolorear sí quedan como módulo** (`pos_reparto_branding`), seuniendo la convención ya usada en el proyecto (`pos_reparto_pricelist` para los defaults de lista de precios): que la corrección viva en código versionado, no en un click manual que se puede perder en otro entorno o al reinstalar.

## Arquitectura

Módulo nuevo `pos_reparto_branding`. Depende de `web` (y de `point_of_sale` solo si en la práctica hace falta tocar algo específico del POS — hoy no se prevé).

```
addons/pos_reparto_branding/
├── __init__.py
├── __manifest__.py
├── data/
│   └── hide_unused_menus.xml     (ir.ui.menu active=False sobre los 3 menús raíz)
└── static/src/scss/
    └── navbar_colors.scss        (override de variables SCSS del navbar)
```

## Componentes

### 1. Ocultar apps sin uso (`data/hide_unused_menus.xml`)

Datos XML con `noupdate="1"` que apuntan por `id` externo a los tres menús raíz de Odoo (Proyecto, Tableros, Rastreador de enlaces) y les setean `active="False"`. `noupdate="1"` es importante: si un administrador reactiva alguno a mano desde Ajustes → Técnico → Menús porque empezaron a usarlo, una actualización futura del módulo no se lo vuelve a ocultar por sorpresa.

Antes de escribir el XML final hay que confirmar los `xml_id` externos exactos de esos tres menús raíz en esta instalación (se obtienen por consola, `ir.ui.menu` con `name` = cada app, mirando su `id` completo tipo `<módulo>.menu_xxx`) — es un paso de la fase de implementación, no de este diseño.

### 2. Barra superior roja (`static/src/scss/navbar_colors.scss`)

Se investigó el mecanismo real en el código fuente de Odoo 19 (`web/static/src/webclient/navbar/navbar.variables.scss`): el color de fondo de la topbar sale de la variable SCSS `$o-navbar-background: $o-brand-odoo !default;`.

El módulo agrega un archivo SCSS al bundle `web.assets_backend` que redefine esa variable (o `$o-brand-odoo` directamente, a confirmar en implementación cuál da mejor resultado sin romper otros usos del morado en el resto del backend) a `#a81c21` antes de que se compile el resto de las variables del tema. Por ser variables `!default`, definirlas antes en el orden de carga del bundle alcanza para pisarlas, sin tocar ni un archivo del core.

Alcance: toda pantalla de backend que usa el navbar estándar de Odoo (todas las apps). El ticket/recibo del POS **no se toca** — ya tiene su propio logo y color aplicado por separado (se ve en el ticket impreso) y no pasa por este mecanismo.

### 3. Nombre de la compañía (fuera del módulo, acción manual única)

**Ajustes → Usuarios y compañías → Compañías** → abrir la compañía → campo **Nombre** → `Rincon del sur` → Guardar. Un solo campo, un solo click, no requiere módulo ni migración de datos.

## Testing

- **Ocultar menús:** instalar el módulo en una base de prueba, confirmar que las 3 apps desaparecen del launcher para todos los usuarios (no es un tema de permisos, es una desactivación global del menú), y que se pueden reactivar desde modo desarrollador sin errores.
- **Color del navbar:** verificación visual en navegador real (no hay test automatizado sensato para "se ve rojo") — abrir varias apps (POS, Inventario, Facturación, Contactos, Ajustes) y confirmar que la topbar es roja en todas, sin romper legibilidad de texto/iconos blancos ni el contraste de los badges de notificación.
- **Nombre de compañía:** verificación manual de que se refleja en: encabezado del backend, un ticket de POS nuevo, y una factura nueva.

## Fuera de alcance (explícito)

- No se rediseña el resto de la paleta del backend (botones, links, estados de éxito/error) — solo la topbar, que fue lo pedido y mockeado.
- No se toca el branding del ticket POS ni de las facturas — ya estaban resueltos antes de esta sesión.
- No se desinstalan los módulos de Proyecto/Tableros/Rastreador de enlaces — se ocultan nomás. Desinstalarlos es una decisión aparte, más difícil de revertir (puede haber dependencias), que no se tomó en el brainstorming.
- No se agregan más apps a la lista de "ocultas" sin volver a confirmarlo — la lista de 3 quedó cerrada en esta sesión.
- No se define un mecanismo de "modo oscuro" ni variantes de tema adicionales — quedó una sola opción elegida (A).
