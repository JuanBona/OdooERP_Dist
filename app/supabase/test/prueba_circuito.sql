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
select chequear((select estado from pedidos order by id desc limit 1) = 'pendiente', 'cliente al día va directo a depósito');
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
