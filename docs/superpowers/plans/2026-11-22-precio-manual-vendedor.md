# Precio manual del vendedor con aprobación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El vendedor puede poner el precio unitario a mano en una línea de pedido; Administración/Gerencia deben aprobar, reponer a lista o corregir cada cambio antes de autorizar el pedido, con historial y quién lo hizo.

**Architecture:** La línea del pedido guarda el precio de lista, el estado del cambio (`pendiente/aprobado/repuesto/corregido`) y quién/cuándo. Un log aparte (solo Admin/Gerencia) guarda cada paso. La regla "no se autoriza con cambios pendientes" vive en la base (`cambiar_estado` y `autorizar_pedidos`); la pantalla solo la refleja. La demo (`api/demo.js`) replica la misma regla.

**Tech Stack:** Postgres/Supabase (SQL, RLS, funciones `security definer`), React 18 + Vite, PostgREST. Tests SQL con `prueba_circuito.sql`.

**Spec:** `docs/superpowers/specs/2026-11-22-precio-manual-vendedor-design.md`

## Cómo correr los tests SQL (no hay Docker local)

Runner con PGlite en el scratchpad (ya instalado en esta sesión):

```bash
cd "C:/Users/Bonan/AppData/Local/Temp/claude/7f3e8d225e3a6150/1ecf3773-5f74-4921-b039-f93bf3decbc6/scratchpad/pg" && node correr.mjs "C:/Users/Bonan/Desktop/OdooERP_Dist"
```

Carga `stub_auth.sql`, todas las migraciones en orden y `prueba_circuito.sql`. Salida esperada si todo pasa: `OK: llegó al final`. Si una verificación falla imprime `FALLÓ: FALLA <texto>`.

## Estructura de archivos

| Archivo | Qué hace |
|---|---|
| `app/supabase/migrations/20261122000000_precio_manual_vendedor.sql` (crear) | Columnas, tabla de log, `crear_pedido`, `resolver_precio_linea`, `cambiar_estado`, `autorizar_pedidos` |
| `app/supabase/test/prueba_circuito.sql` (modificar) | Tests de permisos y circuito |
| `app/src/lib/reglas.js` (modificar) | Helpers `lineasConPrecio`, `precioPendiente`, `bajoCosto`; permisos `editarPrecio`/`editarDescuento` |
| `app/src/api/supabase.js` (modificar) | Mapeo de líneas, select con log, realtime, `resolverPrecio` |
| `app/src/api/demo.js` (modificar) | Misma regla en modo demo |
| `app/src/views/Catalogo.jsx` (modificar) | Cuadro de precio para el vendedor (solo precio unitario) |
| `app/src/views/Pedidos.jsx` (modificar) | Recuadro `CambiosDePrecio`, botón Autorizar, "Autorizar todos", resumen del camión |
| `app/src/views/Inicio.jsx` (modificar) | Etiqueta "⚠ Precio cambiado" en `PedidoRow` |
| `docs/superpowers/specs/2026-11-17-pedidos-por-camion-design.md` (modificar) | Sección nueva con el comportamiento final |

---

### Task 1: Base de datos con tests primero

**Files:**
- Modify: `app/supabase/test/prueba_circuito.sql` (línea 45-46 y bloque nuevo antes de `select 'TODAS LAS PRUEBAS PASARON'`)
- Create: `app/supabase/migrations/20261122000000_precio_manual_vendedor.sql`

- [ ] **Step 1: Cambiar el test que prohibía precios al vendedor**

En `prueba_circuito.sql`, reemplazar las líneas 45-46:

```sql
do $$ begin perform crear_pedido(1, '[{"producto_id":1,"cant":1,"precio_manual":1}]'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Solo Administración%', 'vendedor no puede cambiar precios'); end $$;
```

por:

```sql
do $$ begin perform crear_pedido(1, '[{"producto_id":1,"cant":1,"desc_manual":50}]'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Solo Administración%', 'vendedor no puede cambiar descuentos'); end $$;
```

- [ ] **Step 2: Agregar el bloque de tests nuevo**

Insertar justo antes de la última línea `select 'TODAS LAS PRUEBAS PASARON' as resultado;`:

```sql
-- ===== Precio manual del vendedor con aprobación =====
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select crear_pedido(1, '[{"producto_id":1,"cant":1,"precio_manual":50000}]', '', 'pm-1');
select crear_pedido(1, '[{"producto_id":1,"cant":1,"precio_manual":60000}]', '', 'pm-2');
select crear_pedido(1, '[{"producto_id":1,"cant":1,"precio_manual":45000}]', '', 'pm-3');
select crear_pedido(1, '[{"producto_id":1,"cant":1,"precio_manual":40000}]', '', 'pm-4');
select chequear((select precio from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-1')) = 50000, 'el vendedor puede poner su precio');
select chequear((select precio_lista from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-1')) = 60000, 'la línea guarda el precio de lista');
select chequear((select precio_estado from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-1')) = 'pendiente', 'el cambio queda pendiente');
select chequear((select precio_cambiado_por from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-1')) = '00000000-0000-0000-0000-000000000001', 'queda registrado quién cambió el precio');
select chequear((select total from pedidos where uid = 'pm-1') = 50000, 'el total del pedido usa el precio del vendedor');
select chequear((select precio_estado from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-2')) is null, 'poner el mismo precio de lista no es un cambio');
select chequear((select manual from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-2')) = false, 'poner el mismo precio de lista no marca la línea como manual');
do $$ begin perform crear_pedido(1, '[{"producto_id":1,"cant":1,"precio_manual":-5}]'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'El precio no puede ser negativo%', 'no se acepta un precio negativo'); end $$;
do $$ begin perform resolver_precio_linea((select id from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-1')), 'aprobado'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Solo Administración%', 'vendedor no puede resolver precios'); end $$;
select chequear((select count(*) from pedido_linea_precio_log) = 0, 'vendedor no lee el historial de precios');
update pedido_lineas set precio = 1 where pedido_id = (select id from pedidos where uid = 'pm-1');
select chequear((select precio from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-1')) = 50000, 'vendedor no puede tocar el precio de una línea directo');
reset role;

select como('00000000-0000-0000-0000-000000000003'); set role authenticated;
select chequear((select count(*) from pedido_lineas where precio_estado = 'pendiente') = 0, 'depósito no ve líneas con precio pendiente');
reset role;

select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
select set_config('t.pm1', (select id::text from pedidos where uid = 'pm-1'), false);
select set_config('t.pm2', (select id::text from pedidos where uid = 'pm-2'), false);
select set_config('t.pm3', (select id::text from pedidos where uid = 'pm-3'), false);
select set_config('t.pm4', (select id::text from pedidos where uid = 'pm-4'), false);
select chequear((select count(*) from pedido_linea_precio_log where accion = 'propuesto') = 3, 'administración ve el historial: 3 cambios propuestos');
do $$ begin perform cambiar_estado(current_setting('t.pm1')::bigint, 'pendiente', 'Autorizado'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Resolvé los cambios de precio%', 'no se autoriza un pedido con precio pendiente'); end $$;
select chequear(autorizar_pedidos(array[current_setting('t.pm1')::bigint, current_setting('t.pm2')::bigint]) = 1, 'autorizar varios salta el pedido con precio pendiente');
select chequear((select estado from pedidos where id = current_setting('t.pm1')::bigint) = 'porAutorizar', 'el pedido con precio pendiente sigue por autorizar');
select chequear((select estado from pedidos where id = current_setting('t.pm2')::bigint) = 'pendiente', 'el pedido sin cambios sí se autorizó');
-- corregir a un tercer precio
select resolver_precio_linea((select id from pedido_lineas where pedido_id = current_setting('t.pm1')::bigint), 'corregido', 55000);
select chequear((select precio from pedido_lineas where pedido_id = current_setting('t.pm1')::bigint) = 55000, 'corregir deja el precio nuevo');
select chequear((select precio_estado from pedido_lineas where pedido_id = current_setting('t.pm1')::bigint) = 'corregido', 'la línea queda corregida');
select chequear((select total from pedidos where id = current_setting('t.pm1')::bigint) = 55000, 'corregir recalcula el total del pedido');
select chequear((select count(*) from pedido_linea_precio_log where pedido_id = current_setting('t.pm1')::bigint) = 2, 'el historial tiene propuesto y corregido');
do $$ begin perform resolver_precio_linea((select id from pedido_lineas where pedido_id = current_setting('t.pm1')::bigint), 'aprobado'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like '%ya fue resuelto%', 'un precio ya resuelto no se resuelve dos veces'); end $$;
select cambiar_estado(current_setting('t.pm1')::bigint, 'pendiente', 'Autorizado y enviado a depósito');
select chequear((select estado from pedidos where id = current_setting('t.pm1')::bigint) = 'pendiente', 'resuelto el precio, el pedido se autoriza');
-- volver a lista
select resolver_precio_linea((select id from pedido_lineas where pedido_id = current_setting('t.pm3')::bigint), 'repuesto');
select chequear((select precio from pedido_lineas where pedido_id = current_setting('t.pm3')::bigint) = 60000, 'reponer vuelve al precio de lista');
select chequear((select manual from pedido_lineas where pedido_id = current_setting('t.pm3')::bigint) = false, 'reponer saca la marca de manual');
select chequear((select total from pedidos where id = current_setting('t.pm3')::bigint) = 60000, 'reponer recalcula el total');
-- aprobar
select resolver_precio_linea((select id from pedido_lineas where pedido_id = current_setting('t.pm4')::bigint), 'aprobado');
select chequear((select precio from pedido_lineas where pedido_id = current_setting('t.pm4')::bigint) = 40000, 'aprobar deja el precio del vendedor');
select chequear((select precio_estado from pedido_lineas where pedido_id = current_setting('t.pm4')::bigint) = 'aprobado', 'la línea queda aprobada');
-- lo que carga administración no pasa por aprobación
select crear_pedido(1, '[{"producto_id":1,"cant":1,"precio_manual":1000}]', '', 'pm-adm');
select chequear((select precio_estado from pedido_lineas where pedido_id = (select id from pedidos where uid = 'pm-adm')) is null, 'el precio manual de administración no necesita aprobación');
select chequear((select estado from pedidos where uid = 'pm-adm') = 'pendiente', 'el pedido de administración entra autorizado');
reset role;

select como('00000000-0000-0000-0000-000000000005'); set role authenticated;
select chequear((select count(*) from pedido_linea_precio_log) >= 6, 'gerencia también ve el historial de precios');
reset role;
```

- [ ] **Step 3: Correr y verificar que falla**

Correr el runner (ver arriba). Esperado: `ERROR en` o `FALLÓ:` por columna/función inexistente (ej. `column "precio_lista" does not exist` o `function resolver_precio_linea ... does not exist`). Confirma que los tests miden algo.

- [ ] **Step 4: Escribir la migración**

Crear `app/supabase/migrations/20261122000000_precio_manual_vendedor.sql`:

```sql
-- Precio manual del vendedor con aprobación de Administración.
-- El vendedor puede poner el precio unitario de una línea (solo vale para ese pedido). La línea guarda el
-- precio de lista y queda "pendiente" hasta que Administración o Gerencia lo aprueben, repongan o corrijan.
-- Un pedido con cambios pendientes no se puede autorizar (ni de a uno ni con "Autorizar todos").

alter table pedido_lineas
  add column precio_lista numeric(12,2),                                   -- precio del catálogo al cargar el pedido
  add column precio_estado text check (precio_estado in ('pendiente','aprobado','repuesto','corregido')),
  add column precio_cambiado_por uuid references perfiles,                 -- vendedor que puso el precio
  add column precio_cambiado_en timestamptz;

-- Historial: una fila por paso (el vendedor propone; Administración aprueba, repone o corrige).
create table pedido_linea_precio_log (
  id bigserial primary key,
  linea_id bigint not null references pedido_lineas on delete cascade,
  pedido_id bigint not null references pedidos on delete cascade,
  usuario_id uuid references perfiles,
  accion text not null check (accion in ('propuesto','aprobado','repuesto','corregido')),
  precio_antes numeric(12,2) not null,
  precio_despues numeric(12,2) not null,
  creado_en timestamptz not null default now()
);
create index on pedido_linea_precio_log(linea_id);
create index on pedido_linea_precio_log(pedido_id);
alter table pedido_linea_precio_log enable row level security;
create policy "ver historial de precios" on pedido_linea_precio_log for select using (mi_rol() in ('admin','gerencia'));

-- ===== crear_pedido: el vendedor puede poner el precio (no el descuento) =====
create or replace function crear_pedido(p_cliente bigint, p_items jsonb, p_obs text default '', p_uid text default null, p_fecha date default null)
returns bigint language plpgsql security definer as $$
declare
  v_cli clientes; v_ped bigint; it jsonb; v_prod productos;
  v_precio numeric; v_pct numeric; v_total numeric := 0; v_lin numeric;
  v_rol rol := mi_rol(); v_manual boolean; v_linea bigint; v_propuesto boolean;
  v_carga date := greatest(least(coalesce(p_fecha, hoy_ar()), hoy_ar()), hoy_ar() - 14);
begin
  if p_uid is not null then
    select id into v_ped from pedidos where uid = p_uid;
    if v_ped is not null then return v_ped; end if;  -- ya había llegado
  end if;
  select * into v_cli from clientes where id = p_cliente;
  if v_rol = 'vendedor' and v_cli.vendedor_id is not null and v_cli.vendedor_id <> auth.uid() then
    raise exception 'El cliente no es tuyo';
  end if;
  insert into pedidos(cliente_id, vendedor_id, estado, obs, uid, fecha, fecha_entrega)
  values (p_cliente, case when v_rol = 'vendedor' then auth.uid() else v_cli.vendedor_id end,
          (case when v_rol = 'vendedor' then 'porAutorizar' else 'pendiente' end)::estado_pedido, p_obs, p_uid,
          v_carga, fecha_entrega_de(v_cli.dia, v_carga, v_cli.vendedor_id))
  returning id into v_ped;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from productos where id = (it->>'producto_id')::bigint for update;
    if v_prod.stock_contado and v_prod.stock < (it->>'cant')::int then
      raise exception 'No hay stock suficiente de % (quedan %)', v_prod.nombre, v_prod.stock;
    end if;
    if (it->>'desc_manual') is not null and v_rol not in ('admin','gerencia') then
      raise exception 'Solo Administración puede cambiar descuentos';
    end if;
    if (it->>'precio_manual') is not null and (it->>'precio_manual')::numeric < 0 then
      raise exception 'El precio no puede ser negativo';
    end if;
    -- Cambio de precio de un vendedor: queda pendiente de aprobación. Poner el mismo precio de lista no es un cambio.
    v_propuesto := v_rol = 'vendedor' and (it->>'precio_manual') is not null
                   and (it->>'precio_manual')::numeric <> v_prod.precio;
    v_manual := case when v_rol = 'vendedor' then v_propuesto
                     else (it->>'precio_manual') is not null or (it->>'desc_manual') is not null end;
    v_precio := case when v_rol = 'vendedor' and not v_propuesto then v_prod.precio
                     else coalesce((it->>'precio_manual')::numeric, v_prod.precio) end;
    v_pct := coalesce((it->>'desc_manual')::numeric,
      (select max((t->>'pct')::numeric) from jsonb_array_elements(v_prod.tramos) t where (it->>'cant')::int >= (t->>'min')::int), 0);
    v_lin := round(v_precio * (it->>'cant')::int * (1 - v_pct / 100));
    insert into pedido_lineas(pedido_id, producto_id, nombre, cant, precio, pct, manual, total,
                              precio_lista, precio_estado, precio_cambiado_por, precio_cambiado_en)
    values (v_ped, v_prod.id, v_prod.nombre, (it->>'cant')::int, v_precio, v_pct, v_manual, v_lin,
            v_prod.precio, case when v_propuesto then 'pendiente' end,
            case when v_propuesto then auth.uid() end, case when v_propuesto then now() end)
    returning id into v_linea;
    if v_propuesto then
      insert into pedido_linea_precio_log(linea_id, pedido_id, usuario_id, accion, precio_antes, precio_despues)
      values (v_linea, v_ped, auth.uid(), 'propuesto', v_prod.precio, v_precio);
    end if;
    insert into linea_costos(linea_id, costo) select v_linea, costo from producto_costos where producto_id = v_prod.id;
    update productos set stock = stock - (it->>'cant')::int where id = v_prod.id;
    v_total := v_total + v_lin;
  end loop;
  update pedidos set total = v_total where id = v_ped;
  return v_ped;
end $$;

-- ===== Resolver un cambio de precio (solo Administración y Gerencia) =====
-- p_accion: 'aprobado' (deja el precio del vendedor), 'repuesto' (vuelve al de lista) o 'corregido' (usa p_precio).
create or replace function resolver_precio_linea(p_linea bigint, p_accion text, p_precio numeric default null)
returns void language plpgsql security definer as $$
declare l pedido_lineas; v pedidos; v_nuevo numeric; v_txt text;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración o Gerencia pueden resolver precios'; end if;
  select * into l from pedido_lineas where id = p_linea for update;
  if l is null then raise exception 'Línea no encontrada'; end if;
  select * into v from pedidos where id = l.pedido_id for update;
  if v.estado <> 'porAutorizar' then raise exception 'El pedido ya fue autorizado o cerrado'; end if;
  if l.precio_estado is distinct from 'pendiente' then raise exception 'Este precio ya fue resuelto'; end if;
  if p_accion = 'aprobado' then
    v_nuevo := l.precio; v_txt := 'Aprobó el precio de ' || l.nombre;
  elsif p_accion = 'repuesto' then
    v_nuevo := l.precio_lista; v_txt := 'Volvió a precio de lista: ' || l.nombre;
  elsif p_accion = 'corregido' then
    if p_precio is null or p_precio < 0 then raise exception 'Precio inválido'; end if;
    v_nuevo := p_precio; v_txt := 'Corrigió el precio de ' || l.nombre;
  else
    raise exception 'Acción inválida';
  end if;
  update pedido_lineas set precio = v_nuevo, precio_estado = p_accion, manual = (p_accion <> 'repuesto'),
    total = round(v_nuevo * cant * (1 - pct / 100))
  where id = p_linea;
  insert into pedido_linea_precio_log(linea_id, pedido_id, usuario_id, accion, precio_antes, precio_despues)
  values (p_linea, l.pedido_id, auth.uid(), p_accion, l.precio, v_nuevo);
  update pedidos set
    total = (select sum(total) from pedido_lineas where pedido_id = l.pedido_id),
    historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', v_txt)
  where id = l.pedido_id;
end $$;

-- ===== Autorizar: nunca con cambios de precio pendientes =====
-- De a uno (cambiar_estado): da error. Varios juntos (autorizar_pedidos): salta esos pedidos y devuelve cuántos autorizó.
create or replace function cambiar_estado(p_pedido bigint, p_estado estado_pedido, p_txt text default null)
returns void language plpgsql security definer as $$
declare v pedidos; v_rol rol := mi_rol();
begin
  select * into v from pedidos where id = p_pedido for update;
  if v is null then raise exception 'Pedido no encontrado'; end if;
  if p_estado in ('pendiente','enReparto','entregado','rechazado','anulado') and v_rol not in ('admin','gerencia') then
    raise exception 'No tenés permiso para este cambio';
  end if;
  if p_estado in ('preparando','preparado') and v_rol not in ('deposito','admin','gerencia') then raise exception 'Solo depósito'; end if;
  if v.estado = 'porAutorizar' and p_estado = 'pendiente'
     and exists (select 1 from pedido_lineas l where l.pedido_id = p_pedido and l.precio_estado = 'pendiente') then
    raise exception 'Resolvé los cambios de precio antes de autorizar el pedido';
  end if;
  if p_estado in ('anulado','rechazado') then
    update productos p set stock = p.stock + l.cant from pedido_lineas l where l.pedido_id = p_pedido and l.producto_id = p.id;
  end if;
  if p_estado = 'entregado' then
    update clientes set saldo = saldo - v.total where id = v.cliente_id;
  end if;
  update pedidos set estado = p_estado,
    salio = case when p_estado = 'enReparto' then current_date else salio end,
    historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', coalesce(p_txt, p_estado::text))
  where id = p_pedido;
end $$;

create or replace function autorizar_pedidos(p_ids bigint[]) returns int
language plpgsql security definer as $$
declare n int;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración o Gerencia pueden autorizar'; end if;
  update pedidos set estado = 'pendiente',
    historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', 'Autorizado y enviado a depósito')
  where id = any(p_ids) and estado = 'porAutorizar'
    and not exists (select 1 from pedido_lineas l where l.pedido_id = pedidos.id and l.precio_estado = 'pendiente');
  get diagnostics n = row_count;
  return n;
end $$;
```

- [ ] **Step 5: Correr y verificar que pasa**

Correr el runner. Esperado: `OK: llegó al final`. Si falla, leer el `FALLA <texto>` y arreglar la migración (no el test, salvo que el test esté mal).

- [ ] **Step 6: Commit**

```bash
git add app/supabase/migrations/20261122000000_precio_manual_vendedor.sql app/supabase/test/prueba_circuito.sql
git commit -m "feat(pedidos): precio manual del vendedor con aprobación (base de datos)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reglas y capa de API (cliente)

**Files:**
- Modify: `app/src/lib/reglas.js` (bloque `puede`, ~línea 134, y helpers nuevos antes de él)
- Modify: `app/src/api/supabase.js` (`mapLinea` línea 49, select de pedidos línea 79, `TABLA` línea 105, nuevo método junto a `autorizarPedidos` línea 189)
- Modify: `app/src/api/demo.js` (`crearPedido` línea 80, `cambiarEstado` línea 100, `autorizarPedidos` línea 155, nuevo método)

- [ ] **Step 1: Helpers y permisos en `reglas.js`**

Justo antes de `export const puede = {` agregar:

```js
// Cambios de precio del vendedor: todas las líneas con cambio (cualquier estado) y si alguna espera decisión.
export const lineasConPrecio = p => p.lineas.filter(l => l.precioEstado);
export const precioPendiente = p => p.lineas.some(l => l.precioEstado === "pendiente");
// Vende por debajo del costo (el costo solo lo trae la base a Administración y Gerencia; al vendedor le llega null).
export const bajoCosto = l => l.costo != null && l.cant > 0 && l.total / l.cant < l.costo;
```

En `puede`, reemplazar la línea `editarPrecio: ...` por:

```js
  editarPrecio: u => ["vendedor", "admin", "gerencia"].includes(u.rol),     // vendedor: solo el precio, con aprobación
  editarDescuento: u => ["admin", "gerencia"].includes(u.rol),
```

- [ ] **Step 2: `supabase.js` — mapeo, select, realtime, método**

Reemplazar `mapLinea` (línea 49) por:

```js
const mapLinea = l => ({
  id: l.id, costo: costoDe(l.linea_costos), productoId: l.producto_id, nombre: l.nombre, cant: l.cant, precio: num(l.precio), pct: num(l.pct), manual: l.manual, total: num(l.total),
  precioLista: l.precio_lista == null ? null : num(l.precio_lista), precioEstado: l.precio_estado, cambiadoPor: l.precio_cambiado_por, cambiadoEn: l.precio_cambiado_en,
  // Historial de precios: solo lo devuelve la base a Administración y Gerencia (a los demás les llega vacío).
  log: (l.pedido_linea_precio_log || []).sort((a, b) => a.id - b.id).map(h => ({ accion: h.accion, usuarioId: h.usuario_id, antes: num(h.precio_antes), despues: num(h.precio_despues), fecha: h.creado_en })),
});
```

En la carga de pedidos (línea ~79) cambiar `select("*, pedido_lineas(*, linea_costos(costo))")` por:

```js
select("*, pedido_lineas(*, linea_costos(costo), pedido_linea_precio_log(*))")
```

En `TABLA` (línea ~105) agregar la entrada `pedido_linea_precio_log: "pedidos"` dentro del objeto.

Debajo de `async autorizarPedidos(...) {...},` agregar:

```js
  // Administración / Gerencia resuelven un cambio de precio del vendedor: "aprobado", "repuesto" (vuelve a lista) o "corregido" (precio nuevo).
  async resolverPrecio(user, lineaId, accion, precio = null) {
    const { error } = await sb.rpc("resolver_precio_linea", { p_linea: lineaId, p_accion: accion, p_precio: precio }); err(error);
    await recargar("pedidos");
  },
```

- [ ] **Step 3: `demo.js` — misma regla**

En `crearPedido`, reemplazar la línea `const lineas = calcPedido(items, db.productos);` y la línea siguiente del `forEach` por:

```js
    if (user.rol === "vendedor" && items.some(it => it.descManual != null)) throw new Error("Solo Administración puede cambiar descuentos.");
    if (items.some(it => it.precioManual != null && it.precioManual < 0)) throw new Error("El precio no puede ser negativo.");
    const lineas = calcPedido(items, db.productos);
    lineas.forEach(l => {
      const prod = db.productos.find(p => p.id === l.productoId);
      prod.stock -= l.cant; l.costo = prod.costo ?? null; // el costo queda guardado al vender
      l.id = db.seq++; l.precioLista = prod.precio; l.precioEstado = null; l.log = [];
      // El vendedor cambia el precio: queda pendiente de aprobación (poner el precio de lista no es un cambio).
      if (user.rol === "vendedor") {
        if (l.precio !== prod.precio) {
          l.precioEstado = "pendiente"; l.cambiadoPor = user.id; l.cambiadoEn = new Date().toISOString();
          l.log.push({ accion: "propuesto", usuarioId: user.id, antes: prod.precio, despues: l.precio, fecha: l.cambiadoEn });
        } else l.manual = false;
      }
    });
```

En `cambiarEstado`, al principio de la función (después de `const p = ...`) agregar:

```js
    if (p.estado === "porAutorizar" && estado === "pendiente" && p.lineas.some(l => l.precioEstado === "pendiente")) {
      throw new Error("Resolvé los cambios de precio antes de autorizar el pedido");
    }
```

En `autorizarPedidos`, cambiar el filtro `p.estado === "porAutorizar"` por:

```js
p.estado === "porAutorizar" && !p.lineas.some(l => l.precioEstado === "pendiente")
```

Debajo de `autorizarPedidos` agregar el método:

```js
  // Administración / Gerencia resuelven un cambio de precio del vendedor.
  resolverPrecio(user, lineaId, accion, precio = null) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia pueden resolver precios.");
    const p = db.pedidos.find(x => x.lineas.some(l => l.id === lineaId));
    const l = p?.lineas.find(x => x.id === lineaId);
    if (!l) throw new Error("Línea no encontrada.");
    if (p.estado !== "porAutorizar") throw new Error("El pedido ya fue autorizado o cerrado.");
    if (l.precioEstado !== "pendiente") throw new Error("Este precio ya fue resuelto.");
    let nuevo, txt;
    if (accion === "aprobado") { nuevo = l.precio; txt = "Aprobó el precio de " + l.nombre; }
    else if (accion === "repuesto") { nuevo = l.precioLista; txt = "Volvió a precio de lista: " + l.nombre; }
    else if (accion === "corregido") {
      if (precio == null || precio < 0) throw new Error("Precio inválido.");
      nuevo = precio; txt = "Corrigió el precio de " + l.nombre;
    } else throw new Error("Acción inválida.");
    (l.log ||= []).push({ accion, usuarioId: user.id, antes: l.precio, despues: nuevo, fecha: new Date().toISOString() });
    l.precio = nuevo; l.precioEstado = accion; l.manual = accion !== "repuesto";
    l.total = Math.round(nuevo * l.cant * (1 - l.pct / 100));
    p.total = p.lineas.reduce((s, x) => s + x.total, 0);
    p.historial.push({ fecha: new Date().toISOString(), usuario: user.nombre, txt });
    audit(user, txt, "#" + p.id);
    save();
  },
```

- [ ] **Step 4: Verificar que compila**

Run: `cd app && npm run build`
Expected: `✓ built in ...` sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/reglas.js app/src/api/supabase.js app/src/api/demo.js
git commit -m "feat(pedidos): API y reglas del precio manual del vendedor

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pantalla del vendedor (cuadro de precio)

**Files:**
- Modify: `app/src/views/Catalogo.jsx` (línea 183 texto de la línea, línea 191 botón ✎, línea 203 uso, `EditarLinea` líneas 207-225)

- [ ] **Step 1: Mostrar "a confirmar" en la línea del carrito**

En la línea 183 reemplazar `{l.manual ? " · precio manual" : ""}` por:

```jsx
{l.manual ? (user.rol === "vendedor" ? " · precio a confirmar por Administración" : " · precio manual") : ""}
```

- [ ] **Step 2: El cuadro solo ofrece precio al vendedor**

Reemplazar la función `EditarLinea` completa por:

```jsx
function EditarLinea({ l, onClose, onOk }) {
  const { user } = useApp();
  const conDesc = puede.editarDescuento(user);
  const [precio, setPrecio] = useState(l.precio);
  const [desc, setDesc] = useState(l.pct);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Cambiar precio · {l.nombre}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          {conDesc ? "Queda registrado quién lo cambió." : "Vale solo para este pedido. Administración tiene que aprobar el cambio antes de que el pedido pase a depósito."}
        </p>
        <div className="grid g2">
          <div className="field"><label htmlFor="el-p">Precio unitario</label><input id="el-p" type="number" min="0" value={precio} onChange={e => setPrecio(e.target.value)} /></div>
          {conDesc && <div className="field"><label htmlFor="el-d">Descuento %</label><input id="el-d" type="number" value={desc} onChange={e => setDesc(e.target.value)} /></div>}
        </div>
        <div className="row"><button className="btn sec" onClick={() => onOk({})}>Volver al automático</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => onOk(conDesc ? { precioManual: +precio, descManual: +desc } : { precioManual: +precio })}>Aplicar</button></div>
      </div>
    </div>
  );
}
```

El import de `puede` ya existe en la línea 5 de `Catalogo.jsx`; `useApp` también.

- [ ] **Step 3: Verificar**

Run: `cd app && npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add app/src/views/Catalogo.jsx
git commit -m "feat(pedidos): el vendedor puede cambiar el precio de una línea

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pantalla de administración

**Files:**
- Modify: `app/src/views/Pedidos.jsx` (import línea 5, `resumenPedidos` líneas 17-25, `AutorizarTodos` líneas 47-62, `PedidoDetalle` líneas 205-265, componente nuevo `CambiosDePrecio`)
- Modify: `app/src/views/Inicio.jsx` (import línea 6, `PedidoRow` línea ~95)

- [ ] **Step 1: Imports**

En `Pedidos.jsx` línea 5 agregar `bajoCosto, lineasConPrecio, precioPendiente` al import de `"../lib/reglas"`. En `Inicio.jsx` línea 6 agregar `precioPendiente` al import de `"../lib/reglas"`.

- [ ] **Step 2: Etiqueta en la fila del pedido (`Inicio.jsx`)**

En `PedidoRow`, dentro del `<div style={{ textAlign: "right" }}>` agregar antes de `<ChipEstado .../>`:

```jsx
{p.estado === "porAutorizar" && precioPendiente(p) && <div><span className="chip warn" style={{ fontWeight: 800 }}>⚠ Precio cambiado</span></div>}
```

- [ ] **Step 3: Resumen del camión y "Autorizar todos" (`Pedidos.jsx`)**

En `resumenPedidos` agregar tras `const porAut = ...`:

```js
  const conPrecio = a.filter(p => p.estado === "porAutorizar" && precioPendiente(p)).length;
```

y en el JSX de `abajo`, después del `{porAut > 0 && ...}` agregar:

```jsx
{conPrecio > 0 && <b style={{ color: "var(--aut)" }}> · {conPrecio} con precio cambiado</b>}
```

Reemplazar `AutorizarTodos` completo por:

```jsx
// Autorizar de una vez todos los pedidos de un camión que esperan aprobación (Administración y Gerencia).
// Los pedidos con un cambio de precio sin resolver quedan afuera: se revisan uno por uno.
function AutorizarTodos({ ps }) {
  const { db, user, toast } = useApp();
  const todos = puede.autorizar(user) ? ps.filter(p => p.estado === "porAutorizar") : [];
  const pend = todos.filter(p => !precioPendiente(p));
  const conPrecio = todos.length - pend.length;
  if (!todos.length) return null;
  const conDeuda = pend.filter(p => db.clientes.find(c => c.id === p.clienteId)?.saldo < 0).length;
  const autorizar = async () => {
    try {
      const n = await api.autorizarPedidos(user, pend.map(p => p.id));
      const aviso = conPrecio ? ` · ${conPrecio} quedan pendientes: tienen precio cambiado` : "";
      toast((n === 1 ? "1 pedido autorizado y enviado a depósito" : `${n} pedidos autorizados y enviados a depósito`) + aviso);
    } catch (e) { toast(e.message); }
  };
  return (
    <div className="row between" style={{ padding: "8px 4px", flexWrap: "wrap" }}>
      <span className="muted">{todos.length} por autorizar{conDeuda ? ` · ${conDeuda} de clientes que deben` : ""}{conPrecio ? ` · ${conPrecio} con precio cambiado (se revisan uno por uno)` : ""}</span>
      {pend.length > 0 && <button className="btn sm" onClick={autorizar}><Icon n="check" s={16} /> Autorizar todos ({pend.length})</button>}
    </div>
  );
}
```

- [ ] **Step 4: Componente `CambiosDePrecio` (`Pedidos.jsx`)**

Agregar justo antes de `export function PedidoDetalle() {`:

```jsx
const ACCION_TXT = { propuesto: "Puso el precio", aprobado: "Aprobó", repuesto: "Volvió a lista", corregido: "Corrigió" };
const hora = f => new Date(f).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Cambios de precio hechos por el vendedor. Administración y Gerencia los aprueban, reponen el precio de lista o corrigen.
function CambiosDePrecio({ p }) {
  const { db, user, toast } = useApp();
  const [corrigiendo, setCorrigiendo] = useState(null);   // { id, precio }
  const [historial, setHistorial] = useState(null);       // id de la línea con el historial abierto
  const lineas = lineasConPrecio(p);
  const pendientes = lineas.filter(l => l.precioEstado === "pendiente");
  if (!lineas.length) return null;
  if (!puede.autorizar(user)) {
    return pendientes.length ? <p className="chip st-porAutorizar" style={{ display: "block", borderRadius: 9, padding: 10, marginTop: 12 }}>Hay {pendientes.length === 1 ? "un precio" : pendientes.length + " precios"} a confirmar por Administración antes de que el pedido pase a depósito.</p> : null;
  }
  const quien = id => db.usuarios.find(u => u.id === id)?.nombre || "El vendedor";
  const decidir = async (l, accion, precio = null) => {
    try { await api.resolverPrecio(user, l.id, accion, precio); setCorrigiendo(null); toast("Precio resuelto"); } catch (e) { toast(e.message); }
  };
  const aprobarTodos = async () => {
    try { for (const l of pendientes) await api.resolverPrecio(user, l.id, "aprobado"); toast("Precios aprobados"); } catch (e) { toast(e.message); }
  };
  const ESTADO_CHIP = { aprobado: "Aprobado", repuesto: "Repuesto a lista", corregido: "Corregido" };
  return (
    <div className="card" style={{ marginTop: 12, border: pendientes.length ? "2px solid var(--aut)" : undefined, background: pendientes.length ? "var(--danger-bg)" : undefined }}>
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>{pendientes.length ? `⚠ ${quien(p.vendedorId)} cambió ${pendientes.length === 1 ? "un precio" : pendientes.length + " precios"}. Tenés que resolverlo para autorizar el pedido.` : "Cambios de precio resueltos"}</b>
        {pendientes.length > 1 && p.estado === "porAutorizar" && <button className="btn sm sec" onClick={aprobarTodos}>Aprobar todos los cambios</button>}
      </div>
      {lineas.map(l => {
        const propuesto = l.log[0]?.despues ?? l.precio;
        const dif = l.precioLista ? Math.round((1 - propuesto / l.precioLista) * 100) : 0;
        const pend = l.precioEstado === "pendiente";
        return (
          <div key={l.id} style={{ padding: "10px 0", borderTop: "1px solid rgba(0,0,0,.12)" }}>
            <div><b>{l.nombre}</b> · lista {fmt(l.precioLista)} → {quien(l.cambiadoPor)} puso <b>{fmt(propuesto)}</b> ({dif > 0 ? "−" + dif + "%" : dif < 0 ? "+" + -dif + "%" : "igual"}){l.cambiadoEn ? " · " + hora(l.cambiadoEn) : ""}</div>
            {bajoCosto(l) && <div style={{ color: "var(--danger, #c0392b)", fontWeight: 800 }}>⚠ Por debajo del costo ({fmt(l.costo)})</div>}
            {!pend && <div className="muted">{ESTADO_CHIP[l.precioEstado]}{l.precioEstado !== "aprobado" ? ": " + fmt(l.precio) : ""}</div>}
            {pend && p.estado === "porAutorizar" && (corrigiendo?.id === l.id ? (
              <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                <input type="number" min="0" aria-label="Precio corregido" value={corrigiendo.precio} onChange={e => setCorrigiendo({ id: l.id, precio: e.target.value })} style={{ width: 130 }} />
                <button className="btn sm" disabled={corrigiendo.precio === "" || +corrigiendo.precio < 0} onClick={() => decidir(l, "corregido", +corrigiendo.precio)}>Guardar precio</button>
                <button className="btn sm sec" onClick={() => setCorrigiendo(null)}>Cancelar</button>
              </div>
            ) : (
              <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                <button className="btn sm" onClick={() => decidir(l, "aprobado")}>Aprobar</button>
                <button className="btn sm sec" onClick={() => decidir(l, "repuesto")}>Volver a lista ({fmt(l.precioLista)})</button>
                <button className="btn sm sec" onClick={() => setCorrigiendo({ id: l.id, precio: l.precio })}>Corregir precio</button>
              </div>
            ))}
            <button className="btn sm sec" style={{ marginTop: 6 }} onClick={() => setHistorial(historial === l.id ? null : l.id)}>{historial === l.id ? "Ocultar historial" : "Ver historial"}</button>
            {historial === l.id && (
              <ul className="muted" style={{ margin: "6px 0 0 18px" }}>
                {l.log.map((h, i) => <li key={i}>{ACCION_TXT[h.accion]} · {quien(h.usuarioId)} · {fmt(h.antes)} → {fmt(h.despues)} · {hora(h.fecha)}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Usarlo en el detalle y deshabilitar Autorizar (`Pedidos.jsx`)**

En `PedidoDetalle`, justo antes de `<div className="tw" style={{ overflowX: "auto" }}>` (la tabla de líneas) insertar:

```jsx
        <CambiosDePrecio p={p} />
```

En la tabla, reemplazar `{l.manual && <span className="muted"> (manual)</span>}` por:

```jsx
{l.precioEstado === "pendiente" ? <span className="chip warn"> precio a confirmar</span> : l.manual && <span className="muted"> (manual)</span>}
```

Reemplazar el botón Autorizar (línea ~256) por:

```jsx
          {p.estado === "porAutorizar" && puede.autorizar(user) && <button className="btn" disabled={precioPendiente(p)} title={precioPendiente(p) ? "Resolvé los cambios de precio primero" : ""} onClick={() => accion("pendiente", "Autorizado y enviado a depósito")}><Icon n="check" s={17} /> Autorizar</button>}
```

- [ ] **Step 6: Verificar build**

Run: `cd app && npm run build`
Expected: build OK.

- [ ] **Step 7: Probar el flujo en modo demo**

Run (en segundo plano): `cd app && npm run dev` y abrir la URL que imprime Vite en el navegador (sin `.env` corre en modo demo, clave `1234`; usuarios en `app/src/seed.json`).
Recorrido: entrar como vendedor → armar pedido → ✎ en una línea → poner otro precio → Enviar → entrar como administración → abrir el pedido → ver recuadro rojo con la fila → comprobar que **Autorizar** está deshabilitado → **Corregir precio** → **Autorizar** se habilita → "Ver historial" muestra los pasos. En Pedidos → camión: ver "N con precio cambiado" y que **Autorizar todos** no incluye ese pedido.
Si la extensión de Chrome no responde, decirle al usuario que lo pruebe y no insistir.

- [ ] **Step 8: Commit**

```bash
git add app/src/views/Pedidos.jsx app/src/views/Inicio.jsx
git commit -m "feat(pedidos): administración aprueba, repone o corrige precios del vendedor

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Documentación

**Files:**
- Modify: `docs/superpowers/specs/2026-11-17-pedidos-por-camion-design.md` (sección nueva al final)
- Modify: `docs/superpowers/specs/2026-11-22-precio-manual-vendedor-design.md` (dos ajustes)

(`MANUAL_USUARIO.md` y `docs/guias/` describen el sistema Odoo anterior y no cubren esta app; no se tocan.)

- [ ] **Step 1: Sección nueva en el spec de pedidos por camión**

Agregar al final de `2026-11-17-pedidos-por-camion-design.md`:

```markdown

## 13. Precio manual del vendedor con aprobación (implementado)

- El vendedor puede cambiar el **precio unitario** de una línea al cargar el pedido (el descuento sigue automático y solo lo cambian Administración y Gerencia). Vale **solo para ese pedido**: el catálogo no se toca.
- Si el precio difiere del de lista, la línea queda **pendiente**: el pedido muestra "⚠ Precio cambiado" y no se puede autorizar. Poner el mismo precio de lista no cuenta como cambio.
- En el pedido, Administración y Gerencia ven un recuadro rojo: lista → precio que puso el vendedor (con %), quién y cuándo. Por línea: **Aprobar**, **Volver a lista** o **Corregir precio** (un tercer precio). "Aprobar todos los cambios" y "Ver historial" (propuesto, aprobado, repuesto, corregido, con quién y cuándo).
- **Autorizar** está deshabilitado mientras haya pendientes; la base lo valida también (`cambiar_estado` da error "Resolvé los cambios de precio antes de autorizar el pedido"). **Autorizar todos** del camión salta esos pedidos y avisa cuántos quedaron; en la fila del camión: "N con precio cambiado".
- Si el precio final queda **por debajo del costo**, la fila se marca en rojo (el costo solo lo trae la base a Administración y Gerencia).
- Lo que cargan Administración o Gerencia con precio manual no pasa por aprobación.
- El historial vive en `pedido_linea_precio_log` (solo lo leen Administración y Gerencia). El vendedor ve "precio a confirmar" mientras está pendiente.
```

- [ ] **Step 2: Ajustar dos puntos del spec nuevo**

En `2026-11-22-precio-manual-vendedor-design.md`:

1. Reemplazar `- Marca "por debajo del costo": se calcula en la base con el costo que ya guardan las tablas de costo (solo visibles para admin y gerencia). El vendedor no recibe esa información.` por `- Marca "por debajo del costo": se calcula en la pantalla con el costo de la línea (`linea_costos`), que la base solo entrega a admin y gerencia. El vendedor no recibe esa información.`
2. En la línea de "Autorización (hoy `autorizarPedidos`…" reemplazar `devuelve cuántos quedaron pendientes, para mostrar el aviso` por `devuelve cuántos autorizó; la pantalla ya sabe cuántos dejó afuera y lo avisa`.
3. Cambiar `Estado: diseño acordado con el usuario, sin implementar.` por `Estado: implementado.`

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers
git commit -m "docs: precio manual del vendedor con aprobación

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verificación final, merge y deploy

- [ ] **Step 1: Verificación completa**

```bash
cd "C:/Users/Bonan/AppData/Local/Temp/claude/7f3e8d225e3a6150/1ecf3773-5f74-4921-b039-f93bf3decbc6/scratchpad/pg" && node correr.mjs "C:/Users/Bonan/Desktop/OdooERP_Dist"
cd "C:/Users/Bonan/Desktop/OdooERP_Dist/app" && npm run build
```
Expected: `OK: llegó al final` y build OK. Invocar `superpowers:verification-before-completion` antes de afirmar que está listo.

- [ ] **Step 2: Pedir confirmación al usuario antes del deploy**

El deploy toca producción y aplica una migración. Mostrar el resumen y preguntar "¿Mergeo y subo?" antes de seguir.

- [ ] **Step 3: PR y merge**

```bash
git push -u origin feat/precio-manual-vendedor
gh pr create --title "feat(pedidos): precio manual del vendedor con aprobación de administración" --body "<resumen + plan de pruebas>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge
```

- [ ] **Step 4: Backup y deploy en el servidor**

```bash
ssh donweb 'cd /opt/rincon/app/servidor && ./backup.sh'
ssh donweb 'cd /opt/rincon && git pull --ff-only && cd app/servidor && ./instalar.sh rincondelsur.duckdns.org'
```
(El crontab de backups estaba roto según la memoria: verificar que `backup.sh` corra bien a mano antes de la migración.)

- [ ] **Step 5: Verificar producción**

```bash
ssh donweb 'cd /opt/rincon && git rev-parse --short HEAD; docker exec supabase-db psql -U postgres -c "\d pedido_linea_precio_log" | head -5'
ssh donweb 'curl -sk https://rincondelsur.duckdns.org/ | grep -o "index-[A-Za-z0-9_-]*\.js"'
```
Expected: commit = `origin/main`, la tabla existe, el bundle nuevo se sirve. Avisar al usuario que hacen falta 2 aperturas de la app para ver la versión nueva (service worker).
