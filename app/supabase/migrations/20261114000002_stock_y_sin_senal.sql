-- Arranque sin stock contado + envíos sin duplicados desde tablets sin señal.

-- Mientras un producto no está contado ("Sin contar") se puede vender sin límite.
-- Cuando se carga el stock real en Artículos queda contado y desde ahí se controla.
alter table productos add column stock_contado boolean not null default false;

-- Identificador que genera la tablet: si la señal se corta después de guardar y se reintenta,
-- no se duplica el pedido ni el cobro.
alter table pedidos add column uid text unique;
alter table cobros add column uid text unique;

drop function if exists crear_pedido(bigint, jsonb, text);
create or replace function crear_pedido(p_cliente bigint, p_items jsonb, p_obs text default '', p_uid text default null)
returns bigint language plpgsql security definer as $$
declare
  v_cli clientes; v_ped bigint; it jsonb; v_prod productos;
  v_precio numeric; v_pct numeric; v_total numeric := 0; v_lin numeric;
  v_rol rol := mi_rol(); v_manual boolean;
begin
  if p_uid is not null then
    select id into v_ped from pedidos where uid = p_uid;
    if v_ped is not null then return v_ped; end if;  -- ya había llegado
  end if;
  select * into v_cli from clientes where id = p_cliente;
  if v_rol = 'vendedor' and v_cli.vendedor_id is not null and v_cli.vendedor_id <> auth.uid() then
    raise exception 'El cliente no es tuyo';
  end if;
  insert into pedidos(cliente_id, vendedor_id, estado, obs, uid)
  values (p_cliente, case when v_rol = 'vendedor' then auth.uid() else v_cli.vendedor_id end,
          (case when v_cli.saldo < 0 then 'porAutorizar' else 'pendiente' end)::estado_pedido, p_obs, p_uid)
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

drop function if exists registrar_cobro(bigint, numeric, text);
create or replace function registrar_cobro(p_cliente bigint, p_monto numeric, p_medio text, p_uid text default null)
returns void language plpgsql security definer as $$
declare v_cli clientes; v_pct numeric; v_cobro bigint;
begin
  if p_uid is not null and exists (select 1 from cobros where uid = p_uid) then return; end if; -- ya había llegado
  select * into v_cli from clientes where id = p_cliente for update;
  select comision_pct into v_pct from perfiles where id = v_cli.vendedor_id;
  insert into cobros(cliente_id, vendedor_id, cobrador_id, monto, medio, comision, uid)
  values (p_cliente, v_cli.vendedor_id, auth.uid(), p_monto, p_medio, round(p_monto * coalesce(v_pct, 0) / 100, 2), p_uid)
  returning id into v_cobro;
  update clientes set saldo = saldo + p_monto, ultimo_pago = current_date where id = p_cliente;
  if p_medio = 'Efectivo' and mi_rol() in ('admin','gerencia') then
    insert into caja_movimientos(tipo, concepto, monto, persona, cobro_id)
    values ('ingreso', 'Cobro en el depósito', p_monto, v_cli.nombre, v_cobro);
  end if;
end $$;
