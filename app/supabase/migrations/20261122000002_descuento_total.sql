-- Descuento sobre el total del pedido (monto en $). Lo puede hacer cualquier rol que toma pedidos.
-- Si lo hace un vendedor queda pendiente de aprobación de Administración/Gerencia (aprobar, quitar o corregir el
-- monto), igual que un cambio de precio; el pedido no se puede autorizar mientras tanto.
-- Se guarda aparte de las líneas: total = suma de las líneas - descuento_total.

alter table pedidos
  add column descuento_total numeric(12,2) not null default 0 check (descuento_total >= 0),
  add column desc_total_estado text check (desc_total_estado in ('pendiente','aprobado','quitado','corregido')),
  add column desc_total_por uuid references perfiles,
  add column desc_total_en timestamptz;

-- El historial pasa a cubrir también el descuento sobre el total (sin línea; los montos son $).
alter table pedido_linea_precio_log alter column linea_id drop not null;
alter table pedido_linea_precio_log drop constraint pedido_linea_precio_log_campo_check;
alter table pedido_linea_precio_log
  add constraint pedido_linea_precio_log_campo_check check (campo in ('precio','descuento','total'));

-- Recalcula el total de un pedido: suma de las líneas menos el descuento sobre el total (que nunca puede pasar de la suma).
create or replace function recalcular_total_pedido(p_pedido bigint) returns void
language sql security definer as $$
  update pedidos p set
    descuento_total = least(p.descuento_total, s.suma),
    total = s.suma - least(p.descuento_total, s.suma)
  from (select coalesce(sum(total), 0) as suma from pedido_lineas where pedido_id = p_pedido) s
  where p.id = p_pedido;
$$;

-- ===== crear_pedido: nuevo parámetro p_desc_total (monto en $) =====
drop function if exists crear_pedido(bigint, jsonb, text, text, date);
create or replace function crear_pedido(p_cliente bigint, p_items jsonb, p_obs text default '', p_uid text default null, p_fecha date default null, p_desc_total numeric default 0)
returns bigint language plpgsql security definer as $$
declare
  v_cli clientes; v_ped bigint; it jsonb; v_prod productos;
  v_precio numeric; v_pct numeric; v_total numeric := 0; v_lin numeric;
  v_rol rol := mi_rol(); v_manual boolean; v_linea bigint; v_propuesto boolean; v_desc_prop boolean;
  v_dt numeric := coalesce(p_desc_total, 0);
  v_carga date := greatest(least(coalesce(p_fecha, hoy_ar()), hoy_ar()), hoy_ar() - 14);
begin
  if p_uid is not null then
    select id into v_ped from pedidos where uid = p_uid;
    if v_ped is not null then return v_ped; end if;  -- ya había llegado
  end if;
  if v_dt < 0 then raise exception 'El descuento no puede ser negativo'; end if;
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
  -- Descuento sobre el total: se descuenta de la suma de las líneas. De un vendedor queda pendiente de aprobación.
  if v_dt > 0 and v_dt >= v_total then raise exception 'El descuento no puede ser igual o mayor al total del pedido'; end if;
  update pedidos set total = v_total - v_dt, descuento_total = v_dt,
    desc_total_estado = case when v_dt > 0 and v_rol = 'vendedor' then 'pendiente' end,
    desc_total_por = case when v_dt > 0 and v_rol = 'vendedor' then auth.uid() end,
    desc_total_en = case when v_dt > 0 and v_rol = 'vendedor' then now() end
  where id = v_ped;
  if v_dt > 0 and v_rol = 'vendedor' then
    insert into pedido_linea_precio_log(pedido_id, usuario_id, campo, accion, precio_antes, precio_despues)
    values (v_ped, auth.uid(), 'total', 'propuesto', 0, v_dt);
  end if;
  return v_ped;
end $$;

-- ===== Resolver el descuento sobre el total (solo Administración y Gerencia) =====
-- p_accion: 'aprobado' (queda el monto), 'quitado' (sin descuento) o 'corregido' (usa p_monto).
create or replace function resolver_descuento_total(p_pedido bigint, p_accion text, p_monto numeric default null)
returns void language plpgsql security definer as $$
declare v pedidos; v_suma numeric; v_nuevo numeric; v_txt text;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración o Gerencia pueden resolver descuentos'; end if;
  select * into v from pedidos where id = p_pedido for update;
  if v is null then raise exception 'Pedido no encontrado'; end if;
  if v.estado <> 'porAutorizar' then raise exception 'El pedido ya fue autorizado o cerrado'; end if;
  if v.desc_total_estado is distinct from 'pendiente' then raise exception 'Este descuento ya fue resuelto'; end if;
  select coalesce(sum(total), 0) into v_suma from pedido_lineas where pedido_id = p_pedido;
  if p_accion = 'aprobado' then
    v_nuevo := v.descuento_total; v_txt := 'Aprobó el descuento sobre el total';
  elsif p_accion = 'quitado' then
    v_nuevo := 0; v_txt := 'Quitó el descuento sobre el total';
  elsif p_accion = 'corregido' then
    if p_monto is null or p_monto < 0 or p_monto >= v_suma then raise exception 'Monto de descuento inválido'; end if;
    v_nuevo := p_monto; v_txt := 'Corrigió el descuento sobre el total';
  else
    raise exception 'Acción inválida';
  end if;
  update pedidos set descuento_total = v_nuevo, desc_total_estado = p_accion where id = p_pedido;
  insert into pedido_linea_precio_log(pedido_id, usuario_id, campo, accion, precio_antes, precio_despues)
  values (p_pedido, auth.uid(), 'total', p_accion, v.descuento_total, v_nuevo);
  perform recalcular_total_pedido(p_pedido);
  update pedidos set historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', v_txt)
  where id = p_pedido;
end $$;

-- ===== Las resoluciones de precio y descuento de línea ahora recalculan con el descuento sobre el total =====
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
  perform recalcular_total_pedido(l.pedido_id);
  update pedidos set historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', v_txt)
  where id = l.pedido_id;
end $$;

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
  perform recalcular_total_pedido(l.pedido_id);
  update pedidos set historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', v_txt)
  where id = l.pedido_id;
end $$;

-- ===== Autorizar: nunca con cambios (precio, descuento de línea o descuento sobre el total) pendientes =====
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
     and (v.desc_total_estado = 'pendiente'
          or exists (select 1 from pedido_lineas l where l.pedido_id = p_pedido and (l.precio_estado = 'pendiente' or l.desc_estado = 'pendiente'))) then
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
    and desc_total_estado is distinct from 'pendiente'
    and not exists (select 1 from pedido_lineas l where l.pedido_id = pedidos.id and (l.precio_estado = 'pendiente' or l.desc_estado = 'pendiente'));
  get diagnostics n = row_count;
  return n;
end $$;

-- ===== Ganancia: el descuento sobre el total reduce la ganancia =====
-- Se reparte entre las líneas en proporción a lo que valen: cada línea cuenta por total_línea x (total / suma de líneas).
create or replace function ganancia_cobrada(p_desde date, p_hasta date, p_cliente bigint default null)
returns table(cobrado numeric, ganancia numeric, cobrado_sin_costo numeric)
language plpgsql stable security definer as $$
begin
  if mi_rol() <> 'gerencia' then raise exception 'Solo Gerencia'; end if;
  return query
  with ventas as (       -- cada pedido: cuánto vale y cuánto de eso se ganó (según el costo de sus líneas al venderse)
    select p.cliente_id, p.fecha as f, p.id as orden, p.total as tot,
           coalesce(sum(l.total * (p.total / (p.total + p.descuento_total))) filter (where lc.costo is not null), 0) as conoc,
           coalesce(sum(l.total * (p.total / (p.total + p.descuento_total)) - lc.costo * l.cant) filter (where lc.costo is not null), 0) as gan
      from pedidos p
      join pedido_lineas l on l.pedido_id = p.id
      left join linea_costos lc on lc.linea_id = l.id
     where p.estado not in ('anulado','rechazado') and p.total > 0 and (p_cliente is null or p.cliente_id = p_cliente)
     group by p.id
  ),
  inicial as (           -- saldo con el que arrancó cada cliente (entregados bajan el saldo; cobros lo suben)
    select c.id as cliente_id,
           c.saldo + coalesce((select sum(p.total) from pedidos p where p.cliente_id = c.id and p.estado = 'entregado'), 0)
                   - coalesce((select sum(k.monto) from cobros k where k.cliente_id = c.id), 0) as s0
      from clientes c where p_cliente is null or c.id = p_cliente
  ),
  deudas as (            -- cola de lo que el cliente tiene que pagar, de la más vieja a la más nueva
    select cliente_id, date '0001-01-01' as f, 0::bigint as orden, -s0 as tot, 0::numeric as conoc, 0::numeric as gan from inicial where s0 < 0
    union all select cliente_id, f, orden, tot, conoc, gan from ventas
  ),
  deudas_r as (
    select d.*, sum(d.tot) over w - d.tot as desde_, sum(d.tot) over w as hasta_
      from deudas d window w as (partition by d.cliente_id order by d.f, d.orden rows between unbounded preceding and current row)
  ),
  pagos as (             -- cola de pagos (un saldo a favor inicial paga primero)
    select cliente_id, date '0001-01-01' as f, 0::bigint as orden, s0 as monto from inicial where s0 > 0
    union all select k.cliente_id, k.fecha, k.id, k.monto from cobros k where p_cliente is null or k.cliente_id = p_cliente
  ),
  pagos_r as (
    select g.*, sum(g.monto) over w - g.monto as desde_, sum(g.monto) over w as hasta_
      from pagos g window w as (partition by g.cliente_id order by g.f, g.orden rows between unbounded preceding and current row)
  ),
  reparto as (           -- cuánto de cada cobro del período paga cada deuda, y qué ganancia trae
    select greatest(0, least(g.hasta_, d.hasta_) - greatest(g.desde_, d.desde_)) as parte, d.gan, d.conoc, d.tot
      from pagos_r g
      join deudas_r d on d.cliente_id = g.cliente_id and d.desde_ < g.hasta_ and g.desde_ < d.hasta_
     where g.f between p_desde and p_hasta and g.f > date '0001-01-01'
  ),
  total as (select coalesce(sum(g.monto), 0) as cobrado from pagos_r g where g.f between p_desde and p_hasta and g.f > date '0001-01-01')
  select t.cobrado, round(coalesce(sum(r.parte * r.gan / r.tot), 0), 2), round(t.cobrado - coalesce(sum(r.parte * r.conoc / r.tot), 0), 2)
    from total t left join reparto r on true group by t.cobrado;
end $$;
