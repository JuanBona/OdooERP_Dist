-- Rincón del Sur — esquema de base para Supabase (nube o self-hosted con Docker).
-- Ejecutar en el SQL Editor de Supabase. Replica las reglas de src/lib/reglas.js.

create type rol as enum ('vendedor','deposito','admin','gerencia');
create type estado_pedido as enum ('porAutorizar','pendiente','preparando','preparado','enReparto','entregado','rechazado','anulado');

create table perfiles (            -- 1 a 1 con auth.users
  id uuid primary key references auth.users on delete cascade,
  nombre text not null,
  rol rol not null default 'vendedor',
  comision_pct numeric(5,2) not null default 0   -- RF-GV-01/02: % por vendedor, sobre lo cobrado
);

create table productos (
  id bigserial primary key,
  nombre text not null,
  categoria text not null,
  precio numeric(12,2) not null check (precio >= 0),
  stock int not null default 0,
  stock_min int not null default 0,
  tramos jsonb not null default '[]',             -- RF-PV-09: [{"min":10,"pct":4}, ...] hasta 3
  foto_url text,
  activo boolean not null default true
);

create table clientes (
  id bigserial primary key,
  codigo int unique,
  nombre text not null,
  dir text default '', localidad text default '', cuit text default '', tel text default '',
  dia text default '',                            -- RF-DL-05: día de visita
  vendedor_id uuid references perfiles,
  saldo numeric(12,2) not null default 0,         -- negativo = debe
  ultimo_pago date,                               -- RF-PV-07
  obs text default ''
);

create table pedidos (
  id bigserial primary key,
  cliente_id bigint not null references clientes,
  vendedor_id uuid references perfiles,
  fecha date not null default current_date,
  creado timestamptz not null default now(),
  estado estado_pedido not null,
  total numeric(12,2) not null default 0,
  obs text default '',
  hechos int[] not null default '{}'              -- checklist de depósito (RF-DL-04)
);

create table pedido_lineas (
  id bigserial primary key,
  pedido_id bigint not null references pedidos on delete restrict,
  producto_id bigint not null references productos,
  nombre text not null, cant int not null check (cant > 0),
  precio numeric(12,2) not null, pct numeric(5,2) not null default 0,
  manual boolean not null default false, total numeric(12,2) not null
);

create table cobros (
  id bigserial primary key,
  fecha date not null default current_date,
  cliente_id bigint not null references clientes,
  vendedor_id uuid references perfiles,
  monto numeric(12,2) not null check (monto > 0),
  medio text not null,
  comision numeric(12,2) not null default 0,      -- RF-GV-03: calculada sobre el cobro
  usuario uuid references perfiles default auth.uid()
);

-- RNF-07: historial inmutable (solo insert)
create table auditoria (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  usuario uuid default auth.uid(),
  tabla text not null, registro text not null, accion text not null, datos jsonb
);

create or replace function mi_rol() returns rol language sql stable security definer as
$$ select rol from perfiles where id = auth.uid() $$;

create or replace function auditar() returns trigger language plpgsql security definer as $$
begin
  insert into auditoria(tabla, registro, accion, datos)
  values (tg_table_name, coalesce(new.id, old.id)::text, tg_op, to_jsonb(coalesce(new, old)));
  return coalesce(new, old);
end $$;
create trigger aud_productos after insert or update on productos for each row execute function auditar();
create trigger aud_clientes  after insert or update on clientes  for each row execute function auditar();
create trigger aud_pedidos   after insert or update on pedidos   for each row execute function auditar();
create trigger aud_cobros    after insert on cobros               for each row execute function auditar();

-- Crear pedido en una transacción: valida stock, lo descuenta (RF-DL-03) y decide el estado.
-- items: [{"producto_id":1,"cant":6,"precio_manual":null,"desc_manual":null}, ...]
create or replace function crear_pedido(p_cliente bigint, p_items jsonb, p_obs text default '')
returns bigint language plpgsql security definer as $$
declare
  v_cli clientes; v_ped bigint; it jsonb; v_prod productos;
  v_precio numeric; v_pct numeric; v_total numeric := 0; v_lin numeric;
  v_rol rol := mi_rol(); v_manual boolean;
begin
  select * into v_cli from clientes where id = p_cliente;
  if v_rol = 'vendedor' and v_cli.vendedor_id is not null and v_cli.vendedor_id <> auth.uid() then
    raise exception 'El cliente no es tuyo';
  end if;
  insert into pedidos(cliente_id, vendedor_id, estado, obs)
  values (p_cliente, case when v_rol = 'vendedor' then auth.uid() else v_cli.vendedor_id end,
          (case when v_cli.saldo < 0 then 'porAutorizar' else 'pendiente' end)::estado_pedido, p_obs)
  returning id into v_ped;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from productos where id = (it->>'producto_id')::bigint for update;
    if v_prod.stock < (it->>'cant')::int then
      raise exception 'No hay stock suficiente de % (quedan %)', v_prod.nombre, v_prod.stock;
    end if;
    v_manual := (it->>'precio_manual') is not null or (it->>'desc_manual') is not null;
    if v_manual and v_rol not in ('admin','gerencia') then raise exception 'Solo Administración puede cambiar precios'; end if;
    v_precio := coalesce((it->>'precio_manual')::numeric, v_prod.precio);
    v_pct := coalesce((it->>'desc_manual')::numeric,
      (select max((t->>'pct')::numeric) from jsonb_array_elements(v_prod.tramos) t where (it->>'cant')::int >= (t->>'min')::int), 0);
    v_lin := round(v_precio * (it->>'cant')::int * (1 - v_pct / 100));
    insert into pedido_lineas(pedido_id, producto_id, nombre, cant, precio, pct, manual, total)
    values (v_ped, v_prod.id, v_prod.nombre, (it->>'cant')::int, v_precio, v_pct, v_manual, v_lin);
    update productos set stock = stock - (it->>'cant')::int where id = v_prod.id;
    v_total := v_total + v_lin;
  end loop;
  update pedidos set total = v_total where id = v_ped;
  return v_ped;
end $$;

-- Cambiar estado: devuelve stock al anular/rechazar y pasa a cuenta corriente al entregar.
create or replace function cambiar_estado(p_pedido bigint, p_estado estado_pedido)
returns void language plpgsql security definer as $$
declare v pedidos; v_rol rol := mi_rol();
begin
  select * into v from pedidos where id = p_pedido for update;
  if p_estado in ('pendiente','enReparto','entregado','rechazado','anulado') and v_rol not in ('admin','gerencia') then
    raise exception 'No tenés permiso para este cambio';
  end if;
  if p_estado = 'preparado' and v_rol not in ('deposito','admin','gerencia') then raise exception 'Solo depósito'; end if;
  if p_estado in ('anulado','rechazado') then
    update productos p set stock = p.stock + l.cant from pedido_lineas l where l.pedido_id = p_pedido and l.producto_id = p.id;
  end if;
  if p_estado = 'entregado' then
    update clientes set saldo = saldo - v.total where id = v.cliente_id;
  end if;
  update pedidos set estado = p_estado where id = p_pedido;
end $$;

-- Cobro: suma al saldo, reinicia la alerta de 15 días y calcula la comisión del vendedor del cliente.
create or replace function registrar_cobro(p_cliente bigint, p_monto numeric, p_medio text)
returns void language plpgsql security definer as $$
declare v_cli clientes; v_pct numeric;
begin
  select * into v_cli from clientes where id = p_cliente for update;
  select comision_pct into v_pct from perfiles where id = v_cli.vendedor_id;
  insert into cobros(cliente_id, vendedor_id, monto, medio, comision)
  values (p_cliente, v_cli.vendedor_id, p_monto, p_medio, round(p_monto * coalesce(v_pct, 0) / 100, 2));
  update clientes set saldo = saldo + p_monto, ultimo_pago = current_date where id = p_cliente;
end $$;

-- Entregas automáticas (decisión 3): todo lo que está "en reparto" pasa a entregado al cierre del día.
-- Programar con pg_cron:  select cron.schedule('cierre-reparto', '0 23 * * *', 'select cerrar_reparto()');
create or replace function cerrar_reparto() returns int language plpgsql security definer as $$
declare r record; n int := 0;
begin
  for r in select id, cliente_id, total from pedidos where estado = 'enReparto' loop
    update clientes set saldo = saldo - r.total where id = r.cliente_id;
    update pedidos set estado = 'entregado' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Permisos por fila (RNF-04). El vendedor solo ve lo suyo.
alter table perfiles enable row level security;
alter table productos enable row level security;
alter table clientes enable row level security;
alter table pedidos enable row level security;
alter table pedido_lineas enable row level security;
alter table cobros enable row level security;
alter table auditoria enable row level security;

create policy "perfil propio o admin" on perfiles for select using (id = auth.uid() or mi_rol() in ('admin','gerencia'));
create policy "gerencia edita perfiles" on perfiles for update using (mi_rol() = 'gerencia');

create policy "todos ven productos" on productos for select using (auth.uid() is not null);
create policy "admin edita productos" on productos for all using (mi_rol() in ('admin','gerencia'));

create policy "ver clientes" on clientes for select using (
  mi_rol() <> 'vendedor' or vendedor_id = auth.uid() or vendedor_id is null);
create policy "admin edita clientes" on clientes for all using (mi_rol() in ('admin','gerencia'));

create policy "ver pedidos" on pedidos for select using (mi_rol() <> 'vendedor' or vendedor_id = auth.uid());
create policy "depósito tilda" on pedidos for update using (mi_rol() in ('deposito','admin','gerencia'));

create policy "ver lineas" on pedido_lineas for select using (exists (select 1 from pedidos p where p.id = pedido_id));

create policy "ver cobros" on cobros for select using (mi_rol() in ('admin','gerencia') or vendedor_id = auth.uid());

create policy "gerencia ve auditoría" on auditoria for select using (mi_rol() = 'gerencia');
-- Sin políticas de update/delete en auditoria: nadie la puede modificar.

-- Fotos de productos: crear un bucket público "productos" en Storage.

-- ===== Caja del depósito: una sola, la manejan Administración y Gerencia =====
-- Cada movimiento dice qué, cuánto, a quién / de quién, quién lo registró y cuándo.
-- Las salidas pueden marcarse "vuelve": se registran devoluciones (pueden ser parciales).
create type tipo_mov as enum ('ingreso','egreso','ajuste');
create table caja_movimientos (
  id bigserial primary key,
  fecha date not null default current_date,
  hora timestamptz not null default now(),
  tipo tipo_mov not null,
  concepto text not null,                    -- Rendición de vendedor, Pago a proveedor, Préstamo...
  monto numeric(12,2) not null,              -- positivo entra, negativo sale
  persona text default '',                   -- a quién se le dio / de quién vino
  detalle text default '',
  vuelve boolean not null default false,     -- solo egresos
  vuelve_fecha date,
  vendedor_id uuid references perfiles,      -- en rendiciones
  cobro_id bigint references cobros,         -- cobro en efectivo hecho en el depósito
  usuario uuid not null references perfiles default auth.uid(),
  check ((tipo = 'ingreso' and monto > 0) or (tipo = 'egreso' and monto < 0) or tipo = 'ajuste'),
  check (vuelve = false or tipo = 'egreso')
);

create table caja_devoluciones (
  id bigserial primary key,
  movimiento_id bigint not null references caja_movimientos,
  hora timestamptz not null default now(),
  monto numeric(12,2) not null check (monto > 0),
  como text not null,                        -- Efectivo, Transferencia, Descontado del sueldo, Otro
  usuario uuid not null references perfiles default auth.uid()
);

create table caja_arqueos (                  -- cada vez que se cuenta la caja
  id bigserial primary key,
  hora timestamptz not null default now(),
  contado numeric(12,2) not null, esperado numeric(12,2) not null, motivo text default '',
  usuario uuid not null references perfiles default auth.uid()
);

-- Saldo en efectivo = movimientos + devoluciones que volvieron en efectivo
create or replace function saldo_caja() returns numeric language sql stable as $$
  select coalesce((select sum(monto) from caja_movimientos), 0)
       + coalesce((select sum(monto) from caja_devoluciones where como = 'Efectivo'), 0)
$$;

create or replace view caja_pendientes with (security_invoker = true) as     -- plata afuera que tiene que volver
select m.*, -m.monto - coalesce((select sum(d.monto) from caja_devoluciones d where d.movimiento_id = m.id), 0) as falta
from caja_movimientos m where m.vuelve
  and -m.monto - coalesce((select sum(d.monto) from caja_devoluciones d where d.movimiento_id = m.id), 0) > 0;

alter table cobros add column cobrador_id uuid references perfiles default auth.uid();

create or replace view vendedores_a_rendir with (security_invoker = true) as -- efectivo cobrado en la calle y no entregado
select p.id as vendedor_id, p.nombre,
  coalesce((select sum(monto) from cobros c where c.cobrador_id = p.id and c.medio = 'Efectivo'), 0)
  - coalesce((select sum(monto) from caja_movimientos m where m.vendedor_id = p.id and m.concepto = 'Rendición de vendedor'), 0) as a_rendir
from perfiles p where p.rol = 'vendedor';

-- Cobro (reemplaza la versión de arriba): si cobra Administración en efectivo, entra a la caja.
create or replace function registrar_cobro(p_cliente bigint, p_monto numeric, p_medio text)
returns void language plpgsql security definer as $$
declare v_cli clientes; v_pct numeric; v_cobro bigint;
begin
  select * into v_cli from clientes where id = p_cliente for update;
  select comision_pct into v_pct from perfiles where id = v_cli.vendedor_id;
  insert into cobros(cliente_id, vendedor_id, cobrador_id, monto, medio, comision)
  values (p_cliente, v_cli.vendedor_id, auth.uid(), p_monto, p_medio, round(p_monto * coalesce(v_pct, 0) / 100, 2))
  returning id into v_cobro;
  update clientes set saldo = saldo + p_monto, ultimo_pago = current_date where id = p_cliente;
  if p_medio = 'Efectivo' and mi_rol() in ('admin','gerencia') then
    insert into caja_movimientos(tipo, concepto, monto, persona, cobro_id)
    values ('ingreso', 'Cobro en el depósito', p_monto, v_cli.nombre, v_cobro);
  end if;
end $$;

alter table caja_movimientos enable row level security;
alter table caja_devoluciones enable row level security;
alter table caja_arqueos enable row level security;
-- Solo Administración y Gerencia ven y cargan la caja. Nadie edita ni borra movimientos (historial inmutable).
create policy "caja ver" on caja_movimientos for select using (mi_rol() in ('admin','gerencia'));
create policy "caja cargar" on caja_movimientos for insert with check (mi_rol() in ('admin','gerencia') and usuario = auth.uid());
create policy "devol ver" on caja_devoluciones for select using (mi_rol() in ('admin','gerencia'));
create policy "devol cargar" on caja_devoluciones for insert with check (mi_rol() in ('admin','gerencia') and usuario = auth.uid());
create policy "arqueo ver" on caja_arqueos for select using (mi_rol() in ('admin','gerencia'));
create policy "arqueo cargar" on caja_arqueos for insert with check (mi_rol() in ('admin','gerencia') and usuario = auth.uid());
create trigger aud_caja after insert on caja_movimientos for each row execute function auditar();
create trigger aud_devol after insert on caja_devoluciones for each row execute function auditar();

-- Lo que el vendedor logueado tiene para entregar (las vistas respetan permisos, así que el vendedor usa esta función).
create or replace function mi_a_rendir() returns numeric language sql stable security definer as $$
  select coalesce((select sum(monto) from cobros where cobrador_id = auth.uid() and medio = 'Efectivo'), 0)
       - coalesce((select sum(monto) from caja_movimientos where vendedor_id = auth.uid() and concepto = 'Rendición de vendedor'), 0)
$$;
