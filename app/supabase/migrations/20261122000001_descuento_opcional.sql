-- Descuento por cantidad opcional: ya no se aplica solo al llegar al tramo, hay que tildarlo al tomar el pedido
-- (item.aplicar_desc = true). Si lo tilda un vendedor, queda pendiente de aprobación de Administración/Gerencia,
-- igual que un cambio de precio: se aprueba o se quita, y el pedido no se puede autorizar mientras tanto.
-- Lo que tildan Administración o Gerencia se aplica directo.

alter table pedido_lineas
  add column desc_estado text check (desc_estado in ('pendiente','aprobado','quitado')),
  add column desc_aplicado_por uuid references perfiles,
  add column desc_aplicado_en timestamptz;

-- El historial de precios pasa a cubrir también los descuentos (en ese caso precio_antes/despues guardan el %).
alter table pedido_linea_precio_log
  add column campo text not null default 'precio' check (campo in ('precio','descuento'));
alter table pedido_linea_precio_log drop constraint pedido_linea_precio_log_accion_check;
alter table pedido_linea_precio_log
  add constraint pedido_linea_precio_log_accion_check check (accion in ('propuesto','aprobado','repuesto','corregido','quitado'));

-- ===== crear_pedido: el descuento por cantidad se aplica solo si se tilda =====
create or replace function crear_pedido(p_cliente bigint, p_items jsonb, p_obs text default '', p_uid text default null, p_fecha date default null)
returns bigint language plpgsql security definer as $$
declare
  v_cli clientes; v_ped bigint; it jsonb; v_prod productos;
  v_precio numeric; v_pct numeric; v_total numeric := 0; v_lin numeric;
  v_rol rol := mi_rol(); v_manual boolean; v_linea bigint; v_propuesto boolean; v_desc_prop boolean;
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
    -- Descuento por cantidad: solo si se tildó (aplicar_desc). Corresponde el mayor tramo alcanzado.
    v_pct := coalesce((it->>'desc_manual')::numeric,
      case when coalesce((it->>'aplicar_desc')::boolean, false)
        then (select max((t->>'pct')::numeric) from jsonb_array_elements(v_prod.tramos) t where (it->>'cant')::int >= (t->>'min')::int)
      end, 0);
    v_desc_prop := v_rol = 'vendedor' and (it->>'desc_manual') is null and v_pct > 0;
    v_lin := round(v_precio * (it->>'cant')::int * (1 - v_pct / 100));
    insert into pedido_lineas(pedido_id, producto_id, nombre, cant, precio, pct, manual, total,
                              precio_lista, precio_estado, precio_cambiado_por, precio_cambiado_en,
                              desc_estado, desc_aplicado_por, desc_aplicado_en)
    values (v_ped, v_prod.id, v_prod.nombre, (it->>'cant')::int, v_precio, v_pct, v_manual, v_lin,
            v_prod.precio, case when v_propuesto then 'pendiente' end,
            case when v_propuesto then auth.uid() end, case when v_propuesto then now() end,
            case when v_desc_prop then 'pendiente' end,
            case when v_desc_prop then auth.uid() end, case when v_desc_prop then now() end)
    returning id into v_linea;
    if v_propuesto then
      insert into pedido_linea_precio_log(linea_id, pedido_id, usuario_id, accion, precio_antes, precio_despues)
      values (v_linea, v_ped, auth.uid(), 'propuesto', v_prod.precio, v_precio);
    end if;
    if v_desc_prop then
      insert into pedido_linea_precio_log(linea_id, pedido_id, usuario_id, campo, accion, precio_antes, precio_despues)
      values (v_linea, v_ped, auth.uid(), 'descuento', 'propuesto', 0, v_pct);
    end if;
    insert into linea_costos(linea_id, costo) select v_linea, costo from producto_costos where producto_id = v_prod.id;
    update productos set stock = stock - (it->>'cant')::int where id = v_prod.id;
    v_total := v_total + v_lin;
  end loop;
  update pedidos set total = v_total where id = v_ped;
  return v_ped;
end $$;

-- ===== Resolver el descuento de una línea (solo Administración y Gerencia) =====
-- p_accion: 'aprobado' (queda el descuento) o 'quitado' (la línea vuelve a precio normal).
create or replace function resolver_descuento_linea(p_linea bigint, p_accion text)
returns void language plpgsql security definer as $$
declare l pedido_lineas; v pedidos; v_pct numeric; v_txt text;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración o Gerencia pueden resolver descuentos'; end if;
  select * into l from pedido_lineas where id = p_linea for update;
  if l is null then raise exception 'Línea no encontrada'; end if;
  select * into v from pedidos where id = l.pedido_id for update;
  if v.estado <> 'porAutorizar' then raise exception 'El pedido ya fue autorizado o cerrado'; end if;
  if l.desc_estado is distinct from 'pendiente' then raise exception 'Este descuento ya fue resuelto'; end if;
  if p_accion = 'aprobado' then
    v_pct := l.pct; v_txt := 'Aprobó el descuento de ' || l.nombre;
  elsif p_accion = 'quitado' then
    v_pct := 0; v_txt := 'Quitó el descuento de ' || l.nombre;
  else
    raise exception 'Acción inválida';
  end if;
  update pedido_lineas set pct = v_pct, desc_estado = p_accion,
    total = round(precio * cant * (1 - v_pct / 100))
  where id = p_linea;
  insert into pedido_linea_precio_log(linea_id, pedido_id, usuario_id, campo, accion, precio_antes, precio_despues)
  values (p_linea, l.pedido_id, auth.uid(), 'descuento', p_accion, l.pct, v_pct);
  update pedidos set
    total = (select sum(total) from pedido_lineas where pedido_id = l.pedido_id),
    historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', v_txt)
  where id = l.pedido_id;
end $$;

-- ===== Autorizar: nunca con cambios de precio o descuento pendientes =====
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
     and exists (select 1 from pedido_lineas l where l.pedido_id = p_pedido and (l.precio_estado = 'pendiente' or l.desc_estado = 'pendiente')) then
    raise exception 'Resolvé los cambios de precio o descuento antes de autorizar el pedido';
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
    and not exists (select 1 from pedido_lineas l where l.pedido_id = pedidos.id and (l.precio_estado = 'pendiente' or l.desc_estado = 'pendiente'));
  get diagnostics n = row_count;
  return n;
end $$;
