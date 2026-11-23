-- El vendedor puede editar su pedido mientras siga "por autorizar" (ej.: una promo que pasa días antes
-- de la visita y el cliente va sumando mercadería). Administración y Gerencia también pueden.
-- Con p_confirmar = true el vendedor lo confirma el día de la visita: queda como si lo hubiera levantado
-- ese día (fecha de carga = hoy y el camión se recalcula).
--
-- Para no duplicar las reglas de crear_pedido (stock, precios y descuentos que quedan para aprobar,
-- costos) se arma un pedido nuevo con crear_pedido, se le pasan sus líneas al pedido original y se borra
-- el nuevo. El número de pedido no cambia.
create or replace function editar_pedido(p_pedido bigint, p_items jsonb, p_obs text default '',
  p_desc_total numeric default 0, p_confirmar boolean default false)
returns bigint language plpgsql security definer as $$
declare v_ped pedidos; v_cli clientes; v_nuevo bigint; v_n pedidos; v_rol rol := mi_rol(); v_fecha date;
begin
  select * into v_ped from pedidos where id = p_pedido for update;
  if v_ped.id is null then raise exception 'No existe el pedido'; end if;
  if v_ped.estado <> 'porAutorizar' then
    raise exception 'El pedido ya fue autorizado: no se puede editar';
  end if;
  if v_rol = 'vendedor' and v_ped.vendedor_id <> auth.uid() then raise exception 'El pedido no es tuyo'; end if;
  if v_rol not in ('vendedor','admin','gerencia') then raise exception 'No podés editar pedidos'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'El pedido está vacío'; end if;

  -- Devuelve el stock de lo que tenía y saca sus líneas (los costos y el historial de precios se van con ellas).
  update productos pr set stock = pr.stock + l.cant
    from (select producto_id, sum(cant) cant from pedido_lineas where pedido_id = p_pedido group by producto_id) l
    where pr.id = l.producto_id;
  delete from pedido_linea_precio_log where pedido_id = p_pedido;
  delete from pedido_lineas where pedido_id = p_pedido;

  v_fecha := case when p_confirmar then hoy_ar() else v_ped.fecha end;
  v_nuevo := crear_pedido(v_ped.cliente_id, p_items, coalesce(p_obs, ''), null, v_fecha, coalesce(p_desc_total, 0));
  select * into v_n from pedidos where id = v_nuevo;
  update pedido_lineas set pedido_id = p_pedido where pedido_id = v_nuevo;
  update pedido_linea_precio_log set pedido_id = p_pedido where pedido_id = v_nuevo;
  select * into v_cli from clientes where id = v_ped.cliente_id;
  update pedidos set obs = v_n.obs, total = v_n.total, descuento_total = v_n.descuento_total,
    desc_total_estado = v_n.desc_total_estado, desc_total_por = v_n.desc_total_por, desc_total_en = v_n.desc_total_en,
    fecha = v_fecha,
    fecha_entrega = case when p_confirmar then v_n.fecha_entrega else fecha_entrega end,
    historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(),
      'txt', case when p_confirmar then 'Confirmado en la visita' else 'Pedido editado' end)
  where id = p_pedido;
  delete from pedidos where id = v_nuevo;
  return p_pedido;
end $$;
