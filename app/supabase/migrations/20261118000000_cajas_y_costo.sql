-- Tres cajas (efectivo, transferencia, cheques) y costo de los productos.

-- ===== Costo =====
-- El costo del producto sirve para calcular la ganancia. Es información sensible (los vendedores no
-- tienen que verla), por eso vive en tablas aparte que solo leen Administración y Gerencia.
-- Cada línea de pedido guarda el costo que tenía al venderse: un cambio de costo posterior no reescribe
-- la ganancia de meses anteriores.
create table producto_costos (
  producto_id bigint primary key references productos on delete cascade,
  costo numeric(12,2) not null check (costo >= 0)
);
create table linea_costos (
  linea_id bigint primary key references pedido_lineas on delete cascade,
  costo numeric(12,2) not null            -- costo unitario al momento de la venta
);
alter table producto_costos enable row level security;
alter table linea_costos enable row level security;
create policy "ver costos" on producto_costos for select using (mi_rol() in ('admin','gerencia'));
create policy "cargar costos" on producto_costos for insert with check (mi_rol() in ('admin','gerencia'));
create policy "cambiar costos" on producto_costos for update using (mi_rol() in ('admin','gerencia')) with check (mi_rol() in ('admin','gerencia'));
create policy "borrar costos" on producto_costos for delete using (mi_rol() in ('admin','gerencia'));
create policy "ver costos de lineas" on linea_costos for select using (mi_rol() in ('admin','gerencia'));

-- ===== Cajas =====
alter table caja_movimientos add column caja text not null default 'efectivo' check (caja in ('efectivo','transferencia','cheques'));
alter table caja_arqueos add column caja text not null default 'efectivo' check (caja in ('efectivo','transferencia','cheques'));
-- Datos del cheque (obligatorios en todo movimiento de la caja de cheques, salvo la diferencia al contar).
alter table caja_movimientos add column cheque_numero text;
alter table caja_movimientos add column cheque_banco text;
alter table caja_movimientos add column cheque_cobro date;      -- fecha de cobro
alter table caja_movimientos add constraint cheque_con_datos check (
  caja <> 'cheques' or concepto = 'Diferencia al contar'
  or (coalesce(trim(cheque_numero), '') <> '' and coalesce(trim(cheque_banco), '') <> '' and cheque_cobro is not null));

-- Saldo de una caja = sus movimientos + las devoluciones que volvieron por ese medio
-- (lo que vuelve en efectivo entra a la caja de efectivo; lo que vuelve por transferencia, a la de transferencia).
drop function if exists saldo_caja();
create or replace function saldo_caja(p_caja text default 'efectivo') returns numeric language sql stable as $$
  select coalesce((select sum(monto) from caja_movimientos where caja = p_caja), 0)
       + coalesce((select sum(monto) from caja_devoluciones
                    where (como = 'Efectivo' and p_caja = 'efectivo') or (como = 'Transferencia' and p_caja = 'transferencia')), 0)
$$;

-- Contar una caja: deja la diferencia como ajuste en esa caja.
drop function if exists contar_caja(numeric, text);
create or replace function contar_caja(p_contado numeric, p_motivo text default '', p_caja text default 'efectivo') returns numeric
language plpgsql security definer as $$
declare v_esp numeric := saldo_caja(p_caja); v_dif numeric := p_contado - v_esp;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración'; end if;
  insert into caja_arqueos(contado, esperado, motivo, caja) values (p_contado, v_esp, p_motivo, p_caja);
  if v_dif <> 0 then
    insert into caja_movimientos(tipo, concepto, monto, detalle, caja) values ('ajuste', 'Diferencia al contar', v_dif, p_motivo, p_caja);
  end if;
  return v_dif;
end $$;

-- Pasar plata de una caja a otra (ej.: depositar efectivo en el banco, cobrar un cheque). No es ni un
-- gasto ni un ingreso: se registra como dos ajustes "Pase entre cajas". Si una de las cajas es la de
-- cheques hay que informar el cheque (p_cheque: numero, banco, cobro).
create or replace function pasar_entre_cajas(p_origen text, p_destino text, p_monto numeric, p_detalle text default '', p_cheque jsonb default null)
returns void language plpgsql security definer as $$
declare v_num text := p_cheque->>'numero'; v_banco text := p_cheque->>'banco'; v_cobro date := nullif(p_cheque->>'cobro', '')::date;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración o Gerencia'; end if;
  if p_origen not in ('efectivo','transferencia','cheques') or p_destino not in ('efectivo','transferencia','cheques') then raise exception 'Caja inválida'; end if;
  if p_origen = p_destino then raise exception 'Elegí dos cajas distintas'; end if;
  if not (p_monto > 0) then raise exception 'Poné el monto'; end if;
  if 'cheques' in (p_origen, p_destino) and (coalesce(trim(v_num), '') = '' or coalesce(trim(v_banco), '') = '' or v_cobro is null) then
    raise exception 'Poné el número, el banco y la fecha de cobro del cheque';
  end if;
  insert into caja_movimientos(tipo, concepto, monto, persona, detalle, caja, cheque_numero, cheque_banco, cheque_cobro)
  values ('ajuste', 'Pase entre cajas', -p_monto, 'A ' || p_destino, p_detalle, p_origen,
          case when p_origen = 'cheques' then v_num end, case when p_origen = 'cheques' then v_banco end, case when p_origen = 'cheques' then v_cobro end);
  insert into caja_movimientos(tipo, concepto, monto, persona, detalle, caja, cheque_numero, cheque_banco, cheque_cobro)
  values ('ajuste', 'Pase entre cajas', p_monto, 'De ' || p_origen, p_detalle, p_destino,
          case when p_destino = 'cheques' then v_num end, case when p_destino = 'cheques' then v_banco end, case when p_destino = 'cheques' then v_cobro end);
end $$;

-- ===== Cobros: cada medio entra a su caja =====
--  · Efectivo: si cobra Administración o Gerencia entra a la caja de efectivo; si cobra un vendedor lo tiene que entregar.
--  · Transferencia: entra sola a la caja de transferencia (no hay nada físico que entregar).
--  · Cheque: entra solo a la caja de cheques, con su número, banco y fecha de cobro (obligatorios).
drop function if exists registrar_cobro(bigint, numeric, text, text);
create or replace function registrar_cobro(p_cliente bigint, p_monto numeric, p_medio text, p_uid text default null, p_cheque jsonb default null)
returns void language plpgsql security definer as $$
declare
  v_cli clientes; v_pct numeric; v_cobro bigint;
  v_num text := p_cheque->>'numero'; v_banco text := p_cheque->>'banco'; v_cobro_fecha date := nullif(p_cheque->>'cobro', '')::date;
begin
  if p_uid is not null and exists (select 1 from cobros where uid = p_uid) then return; end if; -- ya había llegado
  if p_medio = 'Cheque' and (coalesce(trim(v_num), '') = '' or coalesce(trim(v_banco), '') = '' or v_cobro_fecha is null) then
    raise exception 'Poné el número, el banco y la fecha de cobro del cheque';
  end if;
  select * into v_cli from clientes where id = p_cliente for update;
  select comision_pct into v_pct from perfiles where id = v_cli.vendedor_id;
  insert into cobros(cliente_id, vendedor_id, cobrador_id, monto, medio, comision, uid)
  values (p_cliente, v_cli.vendedor_id, auth.uid(), p_monto, p_medio, round(p_monto * coalesce(v_pct, 0) / 100, 2), p_uid)
  returning id into v_cobro;
  update clientes set saldo = saldo + p_monto, ultimo_pago = current_date where id = p_cliente;
  if p_medio = 'Efectivo' and mi_rol() in ('admin','gerencia') then
    insert into caja_movimientos(tipo, concepto, monto, persona, cobro_id)
    values ('ingreso', 'Cobro en el depósito', p_monto, v_cli.nombre, v_cobro);
  elsif p_medio = 'Transferencia' then
    insert into caja_movimientos(tipo, concepto, monto, persona, cobro_id, caja)
    values ('ingreso', 'Cobro por transferencia', p_monto, v_cli.nombre, v_cobro, 'transferencia');
  elsif p_medio = 'Cheque' then
    insert into caja_movimientos(tipo, concepto, monto, persona, cobro_id, caja, cheque_numero, cheque_banco, cheque_cobro)
    values ('ingreso', 'Cobro con cheque', p_monto, v_cli.nombre, v_cobro, 'cheques', v_num, v_banco, v_cobro_fecha);
  end if;
end $$;

-- ===== Pedidos: guardan el costo de cada línea =====
create or replace function crear_pedido(p_cliente bigint, p_items jsonb, p_obs text default '', p_uid text default null, p_fecha date default null)
returns bigint language plpgsql security definer as $$
declare
  v_cli clientes; v_ped bigint; it jsonb; v_prod productos;
  v_precio numeric; v_pct numeric; v_total numeric := 0; v_lin numeric;
  v_rol rol := mi_rol(); v_manual boolean; v_linea bigint;
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
    values (v_ped, v_prod.id, v_prod.nombre, (it->>'cant')::int, v_precio, v_pct, v_manual, v_lin)
    returning id into v_linea;
    insert into linea_costos(linea_id, costo) select v_linea, costo from producto_costos where producto_id = v_prod.id;
    update productos set stock = stock - (it->>'cant')::int where id = v_prod.id;
    v_total := v_total + v_lin;
  end loop;
  update pedidos set total = v_total where id = v_ped;
  return v_ped;
end $$;

-- ===== Ganancia de lo cobrado =====
-- Un cobro llega después de la venta, y entre medio los precios pueden haber cambiado. Por eso la ganancia
-- de un cobro se calcula con el PRECIO y el COSTO DE LA VENTA ORIGINAL: cada cobro paga primero las ventas
-- más viejas del cliente (la deuda más antigua se salda primero) y gana lo que se ganó en esas ventas.
-- Si el cliente pagó una Coca que compró a 100, se cuenta con ese 100 aunque hoy valga 120.
--  · Una deuda anterior al sistema (saldo inicial) se paga primero y no tiene costo conocido.
--  · Lo que se cobra de ventas sin costo cargado, o de más (adelantos), no suma ganancia y se informa aparte.
-- Solo Gerencia. Devuelve lo cobrado entre las fechas, la ganancia y cuánto de lo cobrado no tiene costo conocido.
create or replace function ganancia_cobrada(p_desde date, p_hasta date, p_cliente bigint default null)
returns table(cobrado numeric, ganancia numeric, cobrado_sin_costo numeric)
language plpgsql stable security definer as $$
begin
  if mi_rol() <> 'gerencia' then raise exception 'Solo Gerencia'; end if;
  return query
  with ventas as (       -- cada pedido: cuánto vale y cuánto de eso se ganó (según el costo de sus líneas al venderse)
    select p.cliente_id, p.fecha as f, p.id as orden, p.total as tot,
           coalesce(sum(l.total) filter (where lc.costo is not null), 0) as conoc,
           coalesce(sum(l.total - lc.costo * l.cant) filter (where lc.costo is not null), 0) as gan
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
