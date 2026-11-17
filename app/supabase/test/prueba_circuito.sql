-- Prueba del circuito completo con permisos por rol (RLS). Correr después de stub_auth.sql y schema.sql.
-- Cada bloque "como X" simula un usuario logueado en Supabase.
\set ON_ERROR_STOP 1
-- Supabase da estos permisos por defecto al rol authenticated (RLS decide qué filas ve cada uno).
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users(id, email) values
 ('00000000-0000-0000-0000-000000000001','v1@x'), ('00000000-0000-0000-0000-000000000002','v2@x'),
 ('00000000-0000-0000-0000-000000000003','dep@x'), ('00000000-0000-0000-0000-000000000004','adm@x'),
 ('00000000-0000-0000-0000-000000000005','ger@x');
insert into perfiles(id, nombre, rol, comision_pct) values
 ('00000000-0000-0000-0000-000000000001','Vendedor 1','vendedor',5),
 ('00000000-0000-0000-0000-000000000002','Vendedor 2','vendedor',3),
 ('00000000-0000-0000-0000-000000000003','Depósito','deposito',0),
 ('00000000-0000-0000-0000-000000000004','Administración','admin',0),
 ('00000000-0000-0000-0000-000000000005','Gerencia','gerencia',0);
insert into productos(nombre, categoria, precio, stock, tramos, stock_contado) values
 ('ACEITE DE OLIVA 500CC X6','Almacén',60000,50,'[{"min":5,"pct":4},{"min":10,"pct":8}]',true),
 ('AGUA IVESS 2L X6','Bebidas',5500,3,'[]',true),
 ('VINO SIN CONTAR','Vinos',9000,0,'[]',false);
insert into clientes(codigo, nombre, vendedor_id, saldo, ultimo_pago) values
 (1,'Cliente al día','00000000-0000-0000-0000-000000000001',0,null),
 (2,'Cliente que debe','00000000-0000-0000-0000-000000000001',-45200,current_date - 20),
 (3,'Cliente de V2','00000000-0000-0000-0000-000000000002',0,null);

create or replace function como(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); end $$;
create or replace function chequear(ok boolean, txt text) returns void language plpgsql as $$
begin if ok then raise notice 'OK   %', txt; else raise exception 'FALLA %', txt; end if; end $$;

-- ===== Vendedor 1 =====
select como('00000000-0000-0000-0000-000000000001');
set role authenticated;
select chequear((select count(*) from clientes) = 2, 'vendedor 1 ve solo sus 2 clientes (no el de V2)');
select chequear(crear_pedido(2, '[{"producto_id":1,"cant":6}]') is not null, 'vendedor carga pedido a cliente con deuda');
select chequear((select estado from pedidos order by id desc limit 1) = 'porAutorizar', 'pedido de cliente con deuda queda por autorizar');
select chequear((select total from pedidos order by id desc limit 1) = 345600, 'tramo 5+ aplica 4%: 6 x 60000 x 0.96 = 345600');
select chequear((select stock from productos where id = 1) = 44, 'stock se descontó al confirmar (50 -> 44)');
select chequear(crear_pedido(1, '[{"producto_id":2,"cant":1}]') is not null, 'pedido a cliente al día');
select chequear((select estado from pedidos order by id desc limit 1) = 'porAutorizar', 'todo pedido de vendedor espera autorización, aunque el cliente esté al día');
do $$ begin perform crear_pedido(1, '[{"producto_id":2,"cant":10}]'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'No hay stock suficiente%', 'no deja vender más que el stock'); end $$;
do $$ begin perform crear_pedido(1, '[{"producto_id":1,"cant":1,"precio_manual":1}]'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Solo Administración%', 'vendedor no puede cambiar precios'); end $$;
do $$ begin perform cambiar_estado(1, 'pendiente', 'x'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'No tenés permiso%', 'vendedor no puede autorizar'); end $$;
select chequear(crear_pedido(1, '[{"producto_id":3,"cant":12}]') is not null, 'producto sin contar se vende aunque el stock esté en 0');
select chequear((select stock from productos where id = 3) = -12, 'producto sin contar lleva la cuenta de lo vendido (-12)');
select chequear(crear_pedido(1, '[{"producto_id":3,"cant":1}]', '', 'tablet-abc') = crear_pedido(1, '[{"producto_id":3,"cant":1}]', '', 'tablet-abc'), 'reenviar el mismo pedido sin señal no lo duplica');
select chequear((select count(*) from pedidos where uid = 'tablet-abc') = 1, 'queda un solo pedido con ese identificador');
select registrar_cobro(2, 20000, 'Efectivo', 'cobro-xyz');
select registrar_cobro(2, 20000, 'Efectivo', 'cobro-xyz');
select chequear((select comision from cobros order by id desc limit 1) = 1000, 'comisión 5% sobre lo cobrado');
select chequear((select saldo from clientes where id = 2) = -25200 and (select ultimo_pago from clientes where id = 2) = current_date, 'cobro baja la deuda y reinicia la alerta');
select chequear((select count(*) from caja_movimientos) = 0, 'vendedor no ve la caja');
do $$ begin insert into caja_movimientos(tipo, concepto, monto) values ('ingreso','trucho',1000); raise exception 'debió fallar';
exception when insufficient_privilege then perform chequear(true, 'vendedor no puede cargar en la caja'); end $$;
reset role;


-- ===== Vendedor da de alta y edita clientes =====
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
insert into clientes(nombre, dir, vendedor_id, saldo) values ('Kiosco Nuevo', 'San Martín 1', '00000000-0000-0000-0000-000000000001', 99999);
select chequear((select saldo from clientes where nombre = 'Kiosco Nuevo') = 0, 'cliente nuevo del vendedor arranca con saldo 0 aunque mande otro');
select chequear((select codigo from clientes where nombre = 'Kiosco Nuevo') = 4, 'código automático: el siguiente libre (4)');
update clientes set dir = 'San Martín 999', saldo = 500000 where nombre = 'Kiosco Nuevo';
select chequear((select dir from clientes where nombre = 'Kiosco Nuevo') = 'San Martín 999', 'vendedor edita la dirección de su cliente');
select chequear((select saldo from clientes where nombre = 'Kiosco Nuevo') = 0, 'vendedor no puede cambiar el saldo');
update clientes set nombre = 'HACKEADO' where codigo = 3;
reset role;
select chequear((select nombre from clientes where codigo = 3) = 'Cliente de V2', 'vendedor no puede editar clientes de otro vendedor');
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin insert into clientes(nombre, vendedor_id) values ('Para V2', '00000000-0000-0000-0000-000000000002');
  perform chequear((select vendedor_id from clientes where nombre = 'Para V2') = '00000000-0000-0000-0000-000000000001', 'cliente creado por el vendedor queda a su nombre aunque elija otro');
exception when others then perform chequear(true, 'vendedor no puede crear clientes para otro vendedor'); end $$;
reset role;

-- ===== Camión de entrega =====
-- Regla pura: Lun→Mié, Mar→Jue, Mié→Vie, Jue→Sáb, Vie→Mar siguiente (semana del lun 16/11/2026).
select chequear(fecha_entrega_de('Lunes', date '2026-11-16') = date '2026-11-18', 'camión: lunes → miércoles');
select chequear(fecha_entrega_de('Martes', date '2026-11-17') = date '2026-11-19', 'camión: martes → jueves');
select chequear(fecha_entrega_de('Miércoles', date '2026-11-18') = date '2026-11-20', 'camión: miércoles → viernes');
select chequear(fecha_entrega_de('Jueves', date '2026-11-19') = date '2026-11-21', 'camión: jueves → sábado');
select chequear(fecha_entrega_de('Viernes', date '2026-11-20') = date '2026-11-24', 'camión: viernes → martes de la semana siguiente');
select chequear(fecha_entrega_de('Lunes', date '2026-11-17') = date '2026-11-18', 'camión: cliente del lunes cargado el martes igual va al miércoles');
select chequear(fecha_entrega_de('Lunes', date '2026-11-18') = date '2026-11-25', 'camión: si el camión sale hoy, pasa a la semana siguiente');
select chequear(fecha_entrega_de('', date '2026-11-21') = date '2026-11-24', 'camión: sin día, cargado el sábado → martes');
select chequear(fecha_entrega_de('', date '2026-11-22') = date '2026-11-24', 'camión: sin día, cargado el domingo → martes');
select chequear(fecha_entrega_de('', date '2026-11-16') = date '2026-11-18', 'camión: sin día cuenta el día en que se carga');

select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
update clientes set dia = 'Martes' where codigo = 1;
select crear_pedido(1, '[{"producto_id":2,"cant":1}]', '', 'cam-1');
select chequear((select fecha_entrega from pedidos where uid = 'cam-1') = fecha_entrega_de('Martes', hoy_ar()), 'pedido nuevo guarda el camión según el día del cliente');
select chequear((select fecha_entrega from pedidos where uid = 'cam-1') > hoy_ar(), 'el camión siempre sale después de hoy');
select crear_pedido(1, '[{"producto_id":2,"cant":1}]', '', 'cam-2', hoy_ar() + 30);
select chequear((select fecha from pedidos where uid = 'cam-2') = hoy_ar(), 'un pedido no puede tener fecha de carga futura');
select cambiar_fecha_entrega((select id from pedidos where uid = 'cam-1'), date_trunc('week', hoy_ar())::date + 10);
select chequear((select fecha_entrega from pedidos where uid = 'cam-1') = date_trunc('week', hoy_ar())::date + 10, 'vendedor cambia el camión de su pedido');
select chequear((select historial->-1->>'txt' from pedidos where uid = 'cam-1') like 'Cambió el camión al jueves%', 'el cambio de camión queda en el historial');
do $$ begin perform cambiar_fecha_entrega((select id from pedidos where uid = 'cam-1'), date_trunc('week', hoy_ar())::date + 7); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Los camiones salen%', 'no se puede mover un camión a lunes (solo martes a sábado)'); end $$;
reset role;
select set_config('t.cam1', (select id::text from pedidos where uid = 'cam-1'), false); -- el vendedor 2 no ve este pedido
select como('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ begin perform cambiar_fecha_entrega(current_setting('t.cam1')::bigint, date_trunc('week', hoy_ar())::date + 11); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'El pedido no es tuyo%', 'vendedor no cambia el camión del pedido de otro'); end $$;
reset role;
select como('00000000-0000-0000-0000-000000000003'); set role authenticated;
do $$ begin perform cambiar_fecha_entrega(current_setting('t.cam1')::bigint, date_trunc('week', hoy_ar())::date + 11); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'No tenés permiso%', 'depósito no cambia el camión'); end $$;
reset role;
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
select cambiar_fecha_entrega((select id from pedidos where uid = 'cam-1'), date_trunc('week', hoy_ar())::date + 11);
select chequear((select fecha_entrega from pedidos where uid = 'cam-1') = date_trunc('week', hoy_ar())::date + 11, 'administración cambia el camión de cualquier pedido');
reset role;

-- ===== Feriados y cambios de ruta =====
-- El lunes 23/11/2026 es feriado: sus visitas pasan al martes 24/11 (para todos).
insert into excepciones_visita(vendedor_id, fecha_original, fecha_nueva, motivo) values (null, date '2026-11-23', date '2026-11-24', 'Feriado');
select chequear(fecha_entrega_de('Lunes', date '2026-11-24') = date '2026-11-26', 'feriado: el cliente del lunes, visitado el martes, sale en el camión del jueves');
select chequear(fecha_entrega_de('Martes', date '2026-11-24') = date '2026-11-26', 'feriado: los clientes del martes no cambian');
select chequear(fecha_entrega_de('Lunes', date '2026-11-30') = date '2026-12-02', 'la semana siguiente vuelve a la normalidad solo');
-- Cambio solo para un vendedor: gana sobre el general.
insert into excepciones_visita(vendedor_id, fecha_original, fecha_nueva) values ('00000000-0000-0000-0000-000000000001', date '2026-11-23', date '2026-11-25');
select chequear(fecha_entrega_de('Lunes', date '2026-11-25', '00000000-0000-0000-0000-000000000001') = date '2026-11-27', 'cambio de un vendedor: el suyo gana sobre el general');
select chequear(fecha_entrega_de('Lunes', date '2026-11-25', '00000000-0000-0000-0000-000000000002') = date '2026-11-26', 'cambio de un vendedor: el otro sigue con el general');
delete from excepciones_visita;
select chequear(fecha_entrega_de('Lunes', date '2026-11-24') = date '2026-11-25', 'sin cambios de ruta vale la regla normal');

select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select chequear((select count(*) from feriados) >= 4, 'el vendedor ve los feriados');
do $$ begin insert into feriados(fecha, nombre) values (date '2026-12-31', 'trucho'); raise exception 'debió fallar';
exception when insufficient_privilege then perform chequear(true, 'vendedor no puede cargar feriados'); end $$;
do $$ begin insert into excepciones_visita(fecha_original, fecha_nueva) values (date '2026-11-23', date '2026-11-24'); raise exception 'debió fallar';
exception when insufficient_privilege then perform chequear(true, 'vendedor no puede cambiar la ruta'); end $$;
reset role;
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
insert into feriados(fecha, nombre) values (date '2027-01-01', 'Año Nuevo');
insert into excepciones_visita(fecha_original, fecha_nueva, motivo) values (date '2026-11-23', date '2026-11-24', 'Feriado');
select chequear((select count(*) from excepciones_visita) = 1, 'administración carga un cambio de ruta');
do $$ begin insert into excepciones_visita(fecha_original, fecha_nueva) values (date '2026-11-21', date '2026-11-24'); raise exception 'debió fallar';
exception when check_violation then perform chequear(true, 'no se puede mover una visita desde o hacia un sábado'); end $$;
delete from excepciones_visita;
select chequear((select count(*) from excepciones_visita) = 0, 'administración cancela el cambio de ruta');
reset role;

-- ===== Autorización antes de depósito =====
select chequear((select estado from pedidos where uid = 'cam-1') = 'porAutorizar', 'el pedido del vendedor queda por autorizar');
select set_config('t.ids', (select array_to_string(array_agg(id), ',') from pedidos where uid in ('cam-1', 'cam-2')), false);
select como('00000000-0000-0000-0000-000000000003'); set role authenticated;
select chequear((select count(*) from pedidos where estado = 'porAutorizar') = 0, 'depósito no ve los pedidos por autorizar');
do $$ begin perform autorizar_pedidos(string_to_array(current_setting('t.ids'), ',')::bigint[]); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Solo Administración%', 'depósito no puede autorizar'); end $$;
reset role;
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ begin perform autorizar_pedidos(string_to_array(current_setting('t.ids'), ',')::bigint[]); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Solo Administración%', 'vendedor no puede autorizar'); end $$;
reset role;
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
select crear_pedido(1, '[{"producto_id":1,"cant":1}]', '', 'adm-1');
select chequear((select estado from pedidos where uid = 'adm-1') = 'pendiente', 'lo que carga administración entra ya autorizado');
select chequear(autorizar_pedidos(string_to_array(current_setting('t.ids'), ',')::bigint[]) = 2, 'administración autoriza varios pedidos juntos');
select chequear(autorizar_pedidos(string_to_array(current_setting('t.ids'), ',')::bigint[]) = 0, 'autorizar de nuevo no repite nada');
select chequear((select estado from pedidos where uid = 'cam-1') = 'pendiente', 'el pedido autorizado pasa a depósito');
select chequear((select historial->-1->>'txt' from pedidos where uid = 'cam-1') = 'Autorizado y enviado a depósito', 'la autorización queda en el historial');
reset role;
select como('00000000-0000-0000-0000-000000000003'); set role authenticated;
select chequear((select count(*) from pedidos where uid = 'cam-1') = 1, 'depósito ve el pedido una vez autorizado');
reset role;

-- ===== Vendedor 2 no ve pedidos de V1 =====
select como('00000000-0000-0000-0000-000000000002'); set role authenticated;
select chequear((select count(*) from pedidos) = 0, 'vendedor 2 no ve pedidos de vendedor 1');
reset role;

-- ===== Administración =====
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
select cambiar_estado(1, 'pendiente', 'Autorizado');
select chequear((select estado from pedidos where id = 1) = 'pendiente', 'administración autoriza');
select chequear((select a_rendir from vendedores_a_rendir where nombre = 'Vendedor 1') = 20000, 'vendedor 1 tiene 20000 para entregar');
insert into caja_movimientos(tipo, concepto, monto, persona, vendedor_id) values ('ingreso','Rendición de vendedor',15000,'Vendedor 1','00000000-0000-0000-0000-000000000001');
insert into caja_movimientos(tipo, concepto, monto, persona, vuelve, vuelve_fecha) values ('egreso','Préstamo',-10000,'Juan',true,current_date+5);
insert into caja_devoluciones(movimiento_id, monto, como) values ((select id from caja_movimientos where concepto='Préstamo'), 4000, 'Efectivo');
select registrar_cobro(1, 8000, 'Efectivo');
select chequear(saldo_caja() = 15000 - 10000 + 4000 + 8000, 'saldo de caja = 17000');
select chequear((select falta from caja_pendientes) = 6000, 'préstamo: faltan volver 6000');
select chequear((select a_rendir from vendedores_a_rendir where nombre = 'Vendedor 1') = 5000, 'vendedor 1 debe entregar 5000');
select chequear(contar_caja(16500, 'faltante de prueba') = -500, 'contar caja registra faltante');
select chequear(saldo_caja() = 16500, 'saldo ajustado al conteo');
do $$ begin update caja_movimientos set monto = 1 where concepto = 'Préstamo';
  perform chequear((select monto from caja_movimientos where concepto = 'Préstamo') = -10000, 'movimientos de caja no se pueden modificar'); end $$;
reset role;
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select chequear((select count(*) from caja_pendientes) = 0, 'vendedor no ve los préstamos de la caja');
select chequear(mi_a_rendir() = 5000, 'vendedor ve lo suyo para entregar (5000)');
reset role;

-- ===== Costo de los productos =====
insert into producto_costos(producto_id, costo) values (1, 40000);
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select crear_pedido(1, '[{"producto_id":1,"cant":1}]', '', 'costo-1');
select chequear((select count(*) from producto_costos) = 0, 'el vendedor no ve el costo de los productos');
select chequear((select count(*) from linea_costos) = 0, 'el vendedor no ve el costo de las líneas');
do $$ begin insert into producto_costos(producto_id, costo) values (2, 1); raise exception 'debió fallar';
exception when insufficient_privilege then perform chequear(true, 'el vendedor no puede cargar costos'); end $$;
reset role;
select chequear((select costo from linea_costos where linea_id = (select max(id) from pedido_lineas)) = 40000, 'la línea del pedido guarda el costo al venderse');
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
update producto_costos set costo = 50000 where producto_id = 1;
select chequear((select costo from producto_costos where producto_id = 1) = 50000, 'administración cambia el costo');
select chequear((select costo from linea_costos where linea_id = (select max(id) from pedido_lineas)) = 40000, 'cambiar el costo no reescribe lo ya vendido');
reset role;

-- ===== Tres cajas: cobros por medio, salidas, pases y conteos =====
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select registrar_cobro(1, 5000, 'Transferencia', 'tr-1');
do $$ begin perform registrar_cobro(1, 7000, 'Cheque', 'ch-0'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Poné el número%', 'un cobro con cheque sin sus datos no se acepta'); end $$;
select registrar_cobro(1, 7000, 'Cheque', 'ch-1', '{"numero":"0001234","banco":"Banco Nación","cobro":"2026-12-15"}');
select chequear(mi_a_rendir() = 5000, 'transferencias y cheques no suman efectivo que el vendedor tenga que entregar');
do $$ begin perform pasar_entre_cajas('efectivo', 'transferencia', 100); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Solo Administración%', 'el vendedor no pasa plata entre cajas'); end $$;
reset role;
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
select chequear(saldo_caja('transferencia') = 5000, 'la transferencia entra sola a su caja');
select chequear(saldo_caja('cheques') = 7000, 'el cheque entra solo a su caja');
select chequear((select cheque_numero || '/' || cheque_banco || '/' || cheque_cobro from caja_movimientos where caja = 'cheques') = '0001234/Banco Nación/2026-12-15', 'el cheque queda con número, banco y fecha de cobro');
select chequear(saldo_caja() = 16500, 'el saldo de efectivo no cambia con transferencias ni cheques');
do $$ begin insert into caja_movimientos(tipo, concepto, monto, caja) values ('ingreso', 'Otro ingreso', 100, 'cheques'); raise exception 'debió fallar';
exception when check_violation then perform chequear(true, 'un movimiento a mano en cheques sin datos no se acepta'); end $$;
insert into caja_movimientos(tipo, concepto, monto, persona, caja) values ('egreso', 'Gasto varios', -2000, 'Kiosco', 'transferencia');
select chequear(saldo_caja('transferencia') = 3000, 'una salida resta de la caja que se eligió');
select pasar_entre_cajas('efectivo', 'transferencia', 1500, 'depósito en el banco');
select chequear(saldo_caja() = 15000 and saldo_caja('transferencia') = 4500, 'el pase entre cajas mueve la plata');
do $$ begin perform pasar_entre_cajas('efectivo', 'cheques', 100); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Poné el número%', 'un pase hacia cheques pide los datos del cheque'); end $$;
do $$ begin perform pasar_entre_cajas('efectivo', 'efectivo', 100); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Elegí dos cajas%', 'el pase pide dos cajas distintas'); end $$;
select pasar_entre_cajas('cheques', 'efectivo', 7000, 'cheque cobrado', '{"numero":"0001234","banco":"Banco Nación","cobro":"2026-12-15"}');
select chequear(saldo_caja('cheques') = 0 and saldo_caja() = 22000, 'cobrar un cheque lo pasa a la caja de efectivo');
select chequear((select count(*) from caja_movimientos where concepto = 'Pase entre cajas' and tipo = 'ajuste') = 4, 'los pases son ajustes: no cuentan como gasto ni como ingreso');
select chequear(contar_caja(4500, '', 'transferencia') = 0, 'contar la caja de transferencia cuadra');
select chequear((select caja from caja_arqueos order by id desc limit 1) = 'transferencia', 'el conteo queda en la caja que se contó');
insert into caja_devoluciones(movimiento_id, monto, como) values ((select id from caja_movimientos where concepto = 'Préstamo'), 1000, 'Transferencia');
select chequear(saldo_caja('transferencia') = 5500 and saldo_caja() = 22000, 'lo que vuelve por transferencia entra a la caja de transferencia');
reset role;

-- ===== La ganancia de un cobro usa el precio y el costo de la venta original =====
-- Una Coca se vende a 100 (costo 60); después sube a 120 (costo 80) y recién ahí se cobra la venta vieja.
insert into productos(nombre, categoria, precio, stock, tramos, stock_contado) values ('COCA 1.5L', 'Bebidas', 100, 100, '[]', true);
insert into producto_costos(producto_id, costo) values ((select id from productos where nombre = 'COCA 1.5L'), 60);
insert into clientes(codigo, nombre, vendedor_id, saldo) values (90, 'Cliente Coca', '00000000-0000-0000-0000-000000000001', 0), (91, 'Cliente sin costo', '00000000-0000-0000-0000-000000000001', 0);
select set_config('t.coca', (select id::text from productos where nombre = 'COCA 1.5L'), false);
select set_config('t.c90', (select id::text from clientes where codigo = 90), false);
select set_config('t.c91', (select id::text from clientes where codigo = 91), false);
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select crear_pedido(current_setting('t.c90')::bigint, ('[{"producto_id":' || current_setting('t.coca') || ',"cant":10}]')::jsonb, '', 'coca-1');   -- 10 × 100 = 1000, costo 600
select crear_pedido(current_setting('t.c91')::bigint, '[{"producto_id":3,"cant":1}]', '', 'sc-1');                                                  -- producto sin costo: 9000
reset role;
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
update productos set precio = 120 where nombre = 'COCA 1.5L';
update producto_costos set costo = 80 where producto_id = current_setting('t.coca')::bigint;
select registrar_cobro(current_setting('t.c90')::bigint, 1000, 'Efectivo');    -- cobra la venta vieja, ya con el precio nuevo
select registrar_cobro(current_setting('t.c91')::bigint, 9000, 'Efectivo');
do $$ begin perform ganancia_cobrada(date '2000-01-01', date '2100-01-01'); raise exception 'debió fallar';
exception when others then perform chequear(sqlerrm like 'Solo Gerencia%', 'administración no ve la ganancia'); end $$;
reset role;
select como('00000000-0000-0000-0000-000000000005'); set role authenticated;
select chequear((select ganancia from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c90')::bigint)) = 400,
  'cobrar una venta hecha a 100 gana 400 con el precio de entonces (con el precio nuevo serían 333)');
select chequear((select cobrado from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c90')::bigint)) = 1000, 'lo cobrado de esa venta es 1000');
select chequear((select cobrado_sin_costo from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c91')::bigint)) = 9000
  and (select ganancia from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c91')::bigint)) = 0, 'cobrar una venta sin costo no suma ganancia y se informa aparte');
reset role;
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select crear_pedido(current_setting('t.c90')::bigint, ('[{"producto_id":' || current_setting('t.coca') || ',"cant":10}]')::jsonb, '', 'coca-2');   -- 10 × 120 = 1200, costo 800
reset role;
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
select registrar_cobro(current_setting('t.c90')::bigint, 600, 'Transferencia');   -- paga la mitad de la segunda venta
reset role;
select como('00000000-0000-0000-0000-000000000005'); set role authenticated;
select chequear((select ganancia from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c90')::bigint)) = 600,
  'los cobros pagan primero las ventas más viejas: 1000 de la primera (400) + 600 de la segunda (la mitad de 400) = 600');
select chequear((select ganancia from ganancia_cobrada(date '2000-01-01', date '2000-01-02', current_setting('t.c90')::bigint)) = 0, 'fuera del período no suma');
reset role;

-- Deuda anterior al sistema: se paga primero y no tiene costo conocido.
insert into productos(nombre, categoria, precio, stock, tramos, stock_contado) values ('AGUA X', 'Bebidas', 100, 100, '[]', true);
insert into producto_costos(producto_id, costo) values ((select id from productos where nombre = 'AGUA X'), 60);
insert into clientes(codigo, nombre, vendedor_id, saldo) values (92, 'Deuda vieja sola', '00000000-0000-0000-0000-000000000001', -5000), (93, 'Deuda vieja y venta', '00000000-0000-0000-0000-000000000001', -1000);
select set_config('t.c92', (select id::text from clientes where codigo = 92), false);
select set_config('t.c93', (select id::text from clientes where codigo = 93), false);
select set_config('t.agua', (select id::text from productos where nombre = 'AGUA X'), false);
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select crear_pedido(current_setting('t.c93')::bigint, ('[{"producto_id":' || current_setting('t.agua') || ',"cant":10}]')::jsonb, '', 'agua-1');  -- 1000, costo 600
reset role;
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
select registrar_cobro(current_setting('t.c92')::bigint, 3000, 'Efectivo');
select registrar_cobro(current_setting('t.c93')::bigint, 1500, 'Efectivo');
reset role;
select como('00000000-0000-0000-0000-000000000005'); set role authenticated;
select chequear((select ganancia from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c92')::bigint)) = 0
  and (select cobrado_sin_costo from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c92')::bigint)) = 3000, 'cobrar una deuda anterior al sistema no suma ganancia');
select chequear((select ganancia from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c93')::bigint)) = 200
  and (select cobrado_sin_costo from ganancia_cobrada(date '2000-01-01', date '2100-01-01', current_setting('t.c93')::bigint)) = 1000, 'la deuda vieja se paga primero: 1500 = 1000 viejos (sin costo) + 500 de la venta (gana 200)');
reset role;

-- ===== Depósito ve el nombre de los vendedores, pero no sus comisiones =====
select como('00000000-0000-0000-0000-000000000003'); set role authenticated;
select chequear((select count(*) from perfiles) = 1, 'depósito solo lee su propio perfil');
select chequear((select count(*) from lista_vendedores) = 2, 'depósito ve la lista de los 2 vendedores (para agrupar los pedidos)');
select chequear((select string_agg(nombre, ',' order by nombre) from lista_vendedores) = 'Vendedor 1,Vendedor 2', 'la lista trae los nombres');
reset role;
select chequear((select count(*) from information_schema.columns where table_name = 'lista_vendedores' and column_name = 'comision_pct') = 0, 'la lista de vendedores no incluye las comisiones');
select como('00000000-0000-0000-0000-000000000001'); set role authenticated;
select chequear((select count(*) from perfiles) = 1, 'un vendedor tampoco lee los perfiles de los demás');
reset role;

-- ===== Depósito =====
select como('00000000-0000-0000-0000-000000000003'); set role authenticated;
select tildar(1, 0);
select chequear((select estado from pedidos where id = 1) = 'preparando' and (select hechos from pedidos where id = 1) = '{0}', 'depósito tilda y pasa a preparando');
select cambiar_estado(1, 'preparado', 'Preparado');
select chequear((select estado from pedidos where id = 1) = 'preparado', 'depósito marca preparado');
reset role;

-- ===== Reparto y cierre automático =====
select como('00000000-0000-0000-0000-000000000004'); set role authenticated;
select tildar(1, 0) where false;
select cambiar_estado(1, 'enReparto', 'Salió en reparto');
reset role;
select chequear(cerrar_reparto() = 0, 'el mismo día no se cierra el reparto');
update pedidos set salio = current_date - 1 where id = 1;
select chequear(cerrar_reparto() = 1, 'al día siguiente pasa a entregado solo');
select chequear(jsonb_array_length((select historial from pedidos where id = 1)) >= 4, 'el pedido tiene su historial');
select chequear((select saldo from clientes where id = 2) = -25200 - 345600, 'entregado suma a la cuenta corriente');
select chequear((select count(*) from auditoria) > 5, 'queda historial en auditoría');
select 'TODAS LAS PRUEBAS PASARON' as resultado;
