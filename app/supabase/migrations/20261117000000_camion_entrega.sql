-- Pedidos agrupados por camión.
-- Cada pedido guarda la fecha en que sale su camión (fecha_entrega). Se calcula al crearlo según el
-- día de visita del cliente: Lun→Mié, Mar→Jue, Mié→Vie, Jue→Sáb, Vie→Mar de la semana siguiente.
-- Se guarda (no se calcula al vuelo) para poder moverlo a mano y para que un cambio de regla futuro
-- no mueva pedidos viejos.

-- "Hoy" en la Argentina (la base corre en UTC: pasadas las 21 hs ya sería "mañana").
create or replace function hoy_ar() returns date language sql stable as
$$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- Feriados (para avisar; los carga Administración o Gerencia) y cambios de ruta de una semana
-- (cuando un día de visita cae en feriado, las visitas de ese día se pasan a otro y después vuelven solas).
create table feriados (
  fecha date primary key,
  nombre text not null
);
create table excepciones_visita (
  id bigserial primary key,
  vendedor_id uuid references perfiles on delete cascade,   -- null = todos los vendedores
  fecha_original date not null,                              -- la visita que no se hace (ej.: lunes feriado)
  fecha_nueva date not null,                                 -- el día en que se hace
  motivo text not null default '',
  creado_por uuid default auth.uid(),
  creado timestamptz not null default now(),
  check (extract(isodow from fecha_original) between 1 and 5),
  check (extract(isodow from fecha_nueva) between 1 and 5),
  check (fecha_original <> fecha_nueva)
);
alter table feriados enable row level security;
alter table excepciones_visita enable row level security;
create policy "ver feriados" on feriados for select to authenticated using (true);
create policy "cargar feriados" on feriados for all to authenticated
  using (mi_rol() in ('admin','gerencia')) with check (mi_rol() in ('admin','gerencia'));
create policy "ver cambios de ruta" on excepciones_visita for select to authenticated using (true);
create policy "cargar cambios de ruta" on excepciones_visita for all to authenticated
  using (mi_rol() in ('admin','gerencia')) with check (mi_rol() in ('admin','gerencia'));

-- Próximos feriados nacionales (Res. 164/2025 y Ley 27.399). Los de 2027 se cargan desde la app cuando se decreten.
insert into feriados(fecha, nombre) values
  ('2026-11-23', 'Día de la Soberanía Nacional (trasladado)'),
  ('2026-12-07', 'Puente turístico (día no laborable)'),
  ('2026-12-08', 'Inmaculada Concepción de María'),
  ('2026-12-25', 'Navidad');

-- Fecha del camión para un cliente con ese día de visita, cargando el pedido el día p_hoy.
--  · Se toma la visita más reciente de ese día (hoy incluido): si el vendedor se olvidó de cargar
--    al cliente del lunes y lo hace el martes, igual va al camión del miércoles.
--  · Si esa visita fue movida por un feriado (excepciones_visita, del vendedor o de todos), cuenta el día nuevo.
--  · El camión tiene que salir después de hoy; si no, se pasa a la semana siguiente.
--  · Cliente sin día (o con "Sábado"): cuenta el día en que se carga; sábado y domingo cuentan como viernes.
create or replace function fecha_entrega_de(p_dia text, p_hoy date, p_vendedor uuid default null) returns date
language plpgsql stable as $$
declare
  v_hoy_dow int := extract(isodow from p_hoy);   -- 1 lunes … 7 domingo
  v_dow int;
  v_visita date;
  v_nueva date;
  v_cam date;
begin
  v_dow := case p_dia when 'Lunes' then 1 when 'Martes' then 2 when 'Miércoles' then 3
                      when 'Jueves' then 4 when 'Viernes' then 5 else null end;
  if v_dow is null then v_dow := least(v_hoy_dow, 5); end if;
  v_visita := p_hoy - ((v_hoy_dow - v_dow + 7) % 7);
  select e.fecha_nueva into v_nueva from excepciones_visita e
   where e.fecha_original = v_visita and (e.vendedor_id is null or e.vendedor_id = p_vendedor)
   order by (e.vendedor_id is null), e.id desc limit 1;  -- el cambio del vendedor gana sobre el general
  if v_nueva is not null then v_visita := v_nueva; v_dow := extract(isodow from v_nueva); end if;
  v_cam := v_visita + case when v_dow = 5 then 4 else 2 end;  -- viernes → martes; el resto, +2 días
  if v_cam <= p_hoy then v_cam := v_cam + 7; end if;
  return v_cam;
end $$;

alter table pedidos add column fecha_entrega date not null default fecha_entrega_de('', hoy_ar());
update pedidos p set fecha_entrega = fecha_entrega_de(c.dia, p.fecha, c.vendedor_id) from clientes c where c.id = p.cliente_id;
create index pedidos_fecha_entrega on pedidos(fecha_entrega);

-- crear_pedido: calcula el camión y define quién autoriza. Todo pedido de un vendedor queda "por autorizar"
-- y recién cuando Administración o Gerencia lo autoriza pasa a depósito; los que cargan ellos mismos
-- entran ya autorizados.
-- p_fecha es el día en que el vendedor cargó el pedido (si estaba
-- sin señal llega después; no puede ser futuro ni de hace más de 14 días).
drop function if exists crear_pedido(bigint, jsonb, text, text);
create or replace function crear_pedido(p_cliente bigint, p_items jsonb, p_obs text default '', p_uid text default null, p_fecha date default null)
returns bigint language plpgsql security definer as $$
declare
  v_cli clientes; v_ped bigint; it jsonb; v_prod productos;
  v_precio numeric; v_pct numeric; v_total numeric := 0; v_lin numeric;
  v_rol rol := mi_rol(); v_manual boolean;
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

-- Cambio manual de camión (feriado, pedido urgente…). Vendedor: solo sus pedidos. Administración y
-- Gerencia: cualquiera. Los camiones salen de martes a sábado.
create or replace function cambiar_fecha_entrega(p_pedido bigint, p_fecha date) returns void
language plpgsql security definer as $$
declare v pedidos; v_rol rol := mi_rol();
begin
  select * into v from pedidos where id = p_pedido for update;
  if v is null then raise exception 'Pedido no encontrado'; end if;
  if v_rol = 'vendedor' then
    if v.vendedor_id is distinct from auth.uid() then raise exception 'El pedido no es tuyo'; end if;
  elsif v_rol not in ('admin','gerencia') then
    raise exception 'No tenés permiso para cambiar el camión';
  end if;
  if v.estado in ('entregado','rechazado','anulado') then raise exception 'El pedido ya está cerrado'; end if;
  if extract(isodow from p_fecha) not between 2 and 6 then raise exception 'Los camiones salen de martes a sábado'; end if;
  update pedidos set fecha_entrega = p_fecha,
    historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(),
      'txt', 'Cambió el camión al ' || (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow from p_fecha)::int]
             || ' ' || to_char(p_fecha, 'DD/MM'))
  where id = p_pedido;
end $$;

-- Avisos en tiempo real a las pantallas abiertas
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table feriados, excepciones_visita;
  end if;
end $$;
