# Pase de Responsive — Pantallas Custom del POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las pantallas custom del sistema se vean bien y no corten contenido en tablet apaisada (alto reducido) ni en desktop, sin scroll horizontal y con scroll vertical cuando el contenido no entra.

**Architecture:** Ajustes de CSS/SCSS puros, sin tocar Python ni modelos — cambia cómo se centra/desborda cada contenedor. Verificación manual en 3 viewports por pantalla (no hay forma significativa de testear "se ve bien" con un test automático).

**Tech Stack:** SCSS (compilado por el bundler de assets de Odoo), sin librerías nuevas.

---

Referencia del spec: `docs/superpowers/specs/2026-09-14-pos-ux-pass-design.md`, Ítem B.

**Hallazgo al auditar el código (revisa el alcance del spec):** de las 5 pantallas listadas en el spec, solo 2 tienen CSS/OWL custom propio — `pos_reparto_home` (grilla de Inicio) y `pos_reparto_viaje` (lista de paradas del chofer). Las otras 3 ("Deudores", popup de crédito, panel de "Comisiones") son vistas nativas de Odoo (lista/pivot de backend, y un `AlertDialog` nativo) sin una sola línea de CSS propia — la responsividad de esas es responsabilidad del framework, no de este proyecto. Quedan como verificación manual (Task 3), sin tareas de código.

En las 2 pantallas con código propio, ambas comparten el mismo bug real: el contenedor raíz centra verticalmente con `align-items: center` sobre `height: 100%` y **sin `overflow-y: auto`** — en una tablet apaisada más baja que una pantalla de PC, si el contenido (grilla de tiles, o lista de paradas de un chofer con muchas visitas) no entra en el alto disponible, se corta arriba/abajo **sin forma de hacer scroll para verlo**. Es más grave en `pos_reparto_viaje` (una hoja de ruta puede tener bastantes paradas) que en `pos_reparto_home` (cantidad acotada de apps por rol).

### Task 1: Scroll fix en `pos_reparto_home`

**Files:**
- Modify: `addons/pos_reparto_home/static/src/home_screen.scss`

- [ ] **Step 1: Aplicar el fix**

En `addons/pos_reparto_home/static/src/home_screen.scss`, reemplazar estas dos reglas:

```scss
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
```

por:

```scss
.o_reparto_home {
    height: 100%;
    width: 100%;
    display: flex;
    justify-content: center;
    overflow-y: auto;
    background-color: #f5f5f5;
}

.o_reparto_home_grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 24px;
    max-width: 900px;
    padding: 24px;
    margin: auto;
}
```

(Se saca `align-items: center` del contenedor y se pasa el centrado vertical a `margin: auto` en la grilla — con `overflow-y: auto` en el padre, esto centra igual que antes cuando el contenido entra, pero cuando no entra hace scroll en vez de cortar contenido arriba/abajo. El resto del archivo — `.o_reparto_home_tile`, `.o_reparto_home_loading`, `.o_reparto_home_systray_*` — queda sin cambios.)

- [ ] **Step 2: Reconstruir los assets y verificar que no hay error**

```bash
docker compose stop odoo
docker compose run --rm --no-deps -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http --stop-after-init -u pos_reparto_home
docker compose start odoo
```

Esperado: sin tracebacks.

- [ ] **Step 3: Verificar visualmente en 3 viewports**

Con el navegador (herramienta `claude-in-chrome` o DevTools manual), logueado como `gerencia@reparto.local` (el rol con más tiles en su grilla de Inicio), abrir la pantalla de Inicio y redimensionar la ventana a:

1. 800×480 (tablet apaisada chica)
2. 1280×800 (tablet apaisada grande)
3. 1920×1080 (desktop)

Confirmar en los 3: todos los tiles visibles (con scroll si hace falta en el más chico), sin scroll horizontal, sin recorte de contenido.

- [ ] **Step 4: Commit**

```bash
git add addons/pos_reparto_home/static/src/home_screen.scss
git commit -m "fix(pos_reparto_home): permitir scroll vertical en vez de cortar tiles en pantallas bajas"
```

---

### Task 2: Scroll fix + ancho máximo en `pos_reparto_viaje`

**Files:**
- Modify: `addons/pos_reparto_viaje/static/src/viaje_screen.scss`

- [ ] **Step 1: Aplicar el fix**

En `addons/pos_reparto_viaje/static/src/viaje_screen.scss`, reemplazar estas dos reglas:

```scss
.o_reparto_viaje {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f5f5f5;
}

.o_reparto_viaje_grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
}
```

por:

```scss
.o_reparto_viaje {
    height: 100%;
    width: 100%;
    display: flex;
    justify-content: center;
    overflow-y: auto;
    background-color: #f5f5f5;
}

.o_reparto_viaje_grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 24px;
    max-width: 700px;
    width: 100%;
    margin: auto;
}
```

(Mismo criterio que en Task 1. Además se agrega `max-width: 700px` — a diferencia de `pos_reparto_home`, esta grilla no tenía tope de ancho: en un monitor de escritorio ancho, una lista de paradas en renglones de `font-size: 1.4rem` estirados a todo el ancho es incómoda de leer. El resto del archivo — `.o_reparto_viaje_parada`, `.o_reparto_viaje_check`, `.o_reparto_viaje_loading`/`_empty` — queda sin cambios.)

- [ ] **Step 2: Reconstruir los assets y verificar que no hay error**

```bash
docker compose stop odoo
docker compose run --rm --no-deps -T odoo odoo -d odoo --db_host=db --db_user=odoo --db_password=odoo --no-http --stop-after-init -u pos_reparto_viaje
docker compose start odoo
```

Esperado: sin tracebacks.

- [ ] **Step 3: Verificar visualmente en 3 viewports**

Logueado como `vendedor@reparto.local` con un viaje del día asignado (si no hay ninguno cargado para hoy, crear uno de prueba con varias paradas desde Punto de Venta → Viajes, como Admin Operativa o Gerencia, para tener suficientes filas y forzar el caso de scroll), abrir la pantalla "Viaje" y probar los mismos 3 viewports de la Task 1. Confirmar: todas las paradas alcanzables con scroll en el viewport más chico, sin scroll horizontal, la lista no se estira a todo el ancho en 1920×1080.

- [ ] **Step 4: Commit**

```bash
git add addons/pos_reparto_viaje/static/src/viaje_screen.scss
git commit -m "fix(pos_reparto_viaje): permitir scroll vertical y acotar ancho de la lista de paradas"
```

---

### Task 3: Verificación manual de las 3 pantallas nativas (sin código)

**Files:** ninguno — solo verificación en navegador.

- [ ] **Step 1: Deudores**

Logueado como `gerencia@reparto.local`, abrir Punto de Venta → Deudores en los 3 viewports (800×480, 1280×800, 1920×1080). Si algo se corta o obliga a scroll horizontal, anotarlo — es una vista nativa de lista de Odoo, un problema ahí sería un bug para reportar a upstream o mitigar por config de vista (agrupar columnas, etc.), no algo para "arreglar con CSS propio" dentro de este plan.

- [ ] **Step 2: Popup de crédito en el POS**

Logueado como `vendedor@reparto.local`, en una sesión de POS, seleccionar un cliente con deuda (ver sección 9 de `MANUAL_USUARIO.md` para cuáles tienen deuda de ejemplo) y confirmar que el `AlertDialog` nativo se ve bien en los 3 viewports.

- [ ] **Step 3: Panel de Comisiones**

Logueado como `gerencia@reparto.local`, abrir Punto de Venta → Comisiones (vista pivot) en los 3 viewports.

- [ ] **Step 4: Reportar hallazgos**

Si las 3 pantallas se ven bien, no hace falta ningún cambio — se documenta así en la Task 4. Si se encuentra algo roto, se anota como ítem nuevo (no se improvisa un fix fuera de plan) para decidir con el usuario si vale la pena un ajuste de configuración de vista.

---

### Task 4: Documentación

**Files:**
- Modify: `` ESTADO_PROYECTO.md `` (sección `## 5quinquies. Módulo custom: \`pos_reparto_home\`` y sección `## 5sexies. Módulo custom: \`pos_reparto_viaje\``)

- [ ] **Step 1: Actualizar `ESTADO_PROYECTO.md`**

Agregar, al final de la sección `## 5quinquies. Módulo custom: \`pos_reparto_home\`` (después de su último párrafo):

```markdown

**Responsive (2026-09-14):** la grilla ya usaba `grid-template-columns: repeat(auto-fit, minmax(...))`, responsive de por sí. Se corrigió que el contenedor cortaba tiles sin scroll en pantallas bajas (tablet apaisada) — ahora hace scroll vertical en vez de recortar contenido.
```

Y al final de la sección `## 5sexies. Módulo custom: \`pos_reparto_viaje\``:

```markdown

**Responsive (2026-09-14):** mismo fix que `pos_reparto_home` — la lista de paradas ahora hace scroll vertical en vez de cortar filas en tablet apaisada, y quedó acotada a un ancho máximo legible en desktop.
```

- [ ] **Step 2: Commit**

```bash
git add ESTADO_PROYECTO.md
git commit -m "docs: documentar el pase de responsive en Inicio y Viaje"
```
