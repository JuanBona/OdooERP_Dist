-- Devoluciones: un pedido que ya salió en reparto (o se entregó) puede volver completo o en parte.
-- Solo Administración y Gerencia. Se restaura todo lo que había movido la venta:
--  · stock: vuelve lo devuelto;
--  · deuda del cliente: si el pedido ya estaba entregado, baja lo devuelto (si ya había pagado queda saldo a favor);
--  · el pedido y sus líneas quedan con lo que realmente se vendió, así la ganancia, los resúmenes y el cierre de reparto
--    se ajustan solos (el descuento sobre el total baja en la misma proporción).
-- Si vuelve todo, el pedido pasa a "anulado". Queda un registro de cada devolución.

alter table pedido_lineas drop constraint pedido_lineas_cant_check;
alter table pedido_lineas add constraint pedido_lineas_cant_check check (cant >= 0);   -- 0 = se devolvió toda la línea

create table pedido_devoluciones (
  id bigserial primary key,
  pedido_id bigint not null references pedidos on delete restrict,
  usuario_id uuid references perfiles,
  monto numeric(12,2) not null default 0,       -- cuánto bajó el total del pedido (y la deuda del cliente si estaba entregado)
  completa boolean not null default false,      -- volvió todo el pedido
  motivo text,
  creado_en timestamptz not null default now()
);
create table pedido_devolucion_lineas (
  id bigserial primary key,
  devolucion_id bigint not null references pedido_devoluciones on delete cascade,
  linea_id bigint not null references pedido_lineas on delete restrict,
  nombre text not null,
  cant int not null check (cant > 0),
  monto numeric(12,2) not null
);
create index on pedido_devoluciones(pedido_id);
create index on pedido_devolucion_lineas(devolucion_id);
alter table pedido_devoluciones enable row level security;
alter table pedido_devolucion_lineas enable row level security;
create policy "ver devoluciones" on pedido_devoluciones for select using (mi_rol() in ('admin','gerencia'));
create policy "ver lineas devueltas" on pedido_devolucion_lineas for select using (mi_rol() in ('admin','gerencia'));

-- p_items: [{"linea_id": 12, "cant": 3}, ...]  (cantidades que volvieron)
create or replace function devolver_pedido(p_pedido bigint, p_items jsonb, p_motivo text default null)
returns bigint language plpgsql security definer as $$
declare
  v pedidos; l pedido_lineas; it jsonb; q int; valor numeric;
  v_dev bigint; v_suma_old numeric; v_suma_new numeric; v_d_new numeric; v_total_new numeric; v_monto numeric; v_txt text;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración o Gerencia pueden registrar devoluciones'; end if;
  select * into v from pedidos where id = p_pedido for update;
  if v is null then raise exception 'Pedido no encontrado'; end if;
  if v.estado not in ('enReparto','entregado') then raise exception 'Solo se pueden devolver pedidos que ya salieron en reparto'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Elegí qué se devolvió'; end if;
  select coalesce(sum(total), 0) into v_suma_old from pedido_lineas where pedido_id = p_pedido;
  insert into pedido_devoluciones(pedido_id, usuario_id, motivo) values (p_pedido, auth.uid(), nullif(trim(p_motivo), '')) returning id into v_dev;
  for it in select * from jsonb_array_elements(p_items) loop
    q := (it->>'cant')::int;
    if q is null or q <= 0 then raise exception 'Cantidad inválida'; end if;
    select * into l from pedido_lineas where id = (it->>'linea_id')::bigint and pedido_id = p_pedido for update;
    if l is null then raise exception 'Línea no encontrada'; end if;
    if q > l.cant then raise exception 'No se puede devolver más de lo entregado de %', l.nombre; end if;
    valor := case when q = l.cant then l.total else round(l.total * q / l.cant) end;
    update pedido_lineas set cant = cant - q, total = total - valor where id = l.id;
    update productos set stock = stock + q where id = l.producto_id;
    insert into pedido_devolucion_lineas(devolucion_id, linea_id, nombre, cant, monto) values (v_dev, l.id, l.nombre, q, valor);
  end loop;
  -- El descuento sobre el total baja en la misma proporción que lo vendido.
  select coalesce(sum(total), 0) into v_suma_new from pedido_lineas where pedido_id = p_pedido;
  v_d_new := case when v_suma_new = 0 or v_suma_old = 0 then 0 else round(v.descuento_total * v_suma_new / v_suma_old) end;
  v_total_new := v_suma_new - v_d_new;
  v_monto := v.total - v_total_new;
  update pedidos set total = v_total_new, descuento_total = v_d_new where id = p_pedido;
  if v.estado = 'entregado' then
    update clientes set saldo = saldo + v_monto where id = v.cliente_id;   -- baja la deuda (o queda a favor si ya había pagado)
  end if;
  select string_agg(cant || ' x ' || nombre, ', ') into v_txt from pedido_devolucion_lineas where devolucion_id = v_dev;
  update pedido_devoluciones set monto = v_monto, completa = (v_suma_new = 0) where id = v_dev;
  update pedidos set
    estado = case when v_suma_new = 0 then 'anulado'::estado_pedido else estado end,
    historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(),
      'txt', case when v_suma_new = 0 then 'Devolución completa: ' else 'Devolución parcial: ' end || v_txt)
  where id = p_pedido;
  return v_dev;
end $$;
