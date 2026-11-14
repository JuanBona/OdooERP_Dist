-- Ajustes para conectar la app: historial visible en cada pedido, checklist de depósito,
-- usuario corto para el login y avisos en tiempo real.

alter table perfiles add column usuario text unique;          -- "vendedor1" (login: usuario@rincondelsur.app)
alter table pedidos add column historial jsonb not null default '[]';
alter table pedidos add column salio date;                    -- día que salió en reparto

create or replace function mi_nombre() returns text language sql stable security definer as
$$ select coalesce((select nombre from perfiles where id = auth.uid()), 'Sistema') $$;

-- "Pedido cargado" al crear
create or replace function pedido_cargado() returns trigger language plpgsql as $$
begin
  new.historial := jsonb_build_array(jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', 'Pedido cargado'));
  return new;
end $$;
create trigger pedido_cargado before insert on pedidos for each row execute function pedido_cargado();

-- cambiar_estado con texto para el historial (reemplaza la versión anterior)
drop function if exists cambiar_estado(bigint, estado_pedido);
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

-- Tildar / destildar un renglón del checklist de depósito
create or replace function tildar(p_pedido bigint, p_idx int) returns void language plpgsql security definer as $$
declare v pedidos;
begin
  if mi_rol() not in ('deposito','admin','gerencia') then raise exception 'Solo depósito'; end if;
  select * into v from pedidos where id = p_pedido for update;
  if v.estado not in ('pendiente','preparando') then raise exception 'El pedido ya no se está preparando'; end if;
  update pedidos set
    hechos = case when p_idx = any(hechos) then array_remove(hechos, p_idx) else hechos || p_idx end,
    estado = 'preparando',
    historial = case when v.estado = 'pendiente'
      then historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', 'Empezó a preparar') else historial end
  where id = p_pedido;
end $$;

-- Entregas automáticas: lo que salió en reparto antes de hoy pasa a entregado.
-- Programar en Supabase:  select cron.schedule('cierre-reparto', '5 0 * * *', 'select cerrar_reparto()');
create or replace function cerrar_reparto() returns int language plpgsql security definer as $$
declare r record; n int := 0;
begin
  for r in select id, cliente_id, total from pedidos where estado = 'enReparto' and salio < current_date loop
    update clientes set saldo = saldo - r.total where id = r.cliente_id;
    update pedidos set estado = 'entregado',
      historial = historial || jsonb_build_object('fecha', now(), 'usuario', 'Sistema', 'txt', 'Entregado automáticamente al cierre del día')
    where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- El depósito ya no actualiza pedidos directo: lo hace con tildar() y cambiar_estado().
drop policy if exists "depósito tilda" on pedidos;

-- Conteo de caja en una sola llamada (deja la diferencia como ajuste)
create or replace function contar_caja(p_contado numeric, p_motivo text default '') returns numeric
language plpgsql security definer as $$
declare v_esp numeric := saldo_caja(); v_dif numeric := p_contado - v_esp;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración'; end if;
  insert into caja_arqueos(contado, esperado, motivo) values (p_contado, v_esp, p_motivo);
  if v_dif <> 0 then
    insert into caja_movimientos(tipo, concepto, monto, detalle) values ('ajuste', 'Diferencia al contar', v_dif, p_motivo);
  end if;
  return v_dif;
end $$;

-- Avisos en tiempo real a las pantallas abiertas (Supabase Realtime respeta los permisos)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table productos, clientes, pedidos, cobros, caja_movimientos, caja_devoluciones, perfiles;
  end if;
end $$;

-- Fotos de productos en Storage (bucket público "productos"): suben solo Administración y Gerencia.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('productos', 'productos', true) on conflict (id) do nothing;
    execute $p$create policy "fotos subir" on storage.objects for insert to authenticated
      with check (bucket_id = 'productos' and public.mi_rol() in ('admin','gerencia'))$p$;
    execute $p$create policy "fotos reemplazar" on storage.objects for update to authenticated
      using (bucket_id = 'productos' and public.mi_rol() in ('admin','gerencia'))$p$;
  end if;
end $$;
