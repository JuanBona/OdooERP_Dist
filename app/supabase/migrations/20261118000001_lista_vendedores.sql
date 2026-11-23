-- Depósito agrupa los pedidos por vendedor (vendedor → camión → pedidos) y necesita el nombre de los vendedores.
-- La tabla perfiles solo la lee cada uno (la propia fila) o Administración y Gerencia, así que Depósito veía un solo
-- usuario y todos los pedidos caían en "Sin vendedor". Esta vista da solo lo necesario (nombre y usuario), sin las
-- comisiones ni nada más del perfil, y no depende de los permisos de la tabla.
create or replace view lista_vendedores as
  select id, nombre, usuario, rol from perfiles where rol = 'vendedor';
revoke all on lista_vendedores from anon;
grant select on lista_vendedores to authenticated;
