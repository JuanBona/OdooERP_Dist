-- Aprobación de pedidos antes de depósito.
-- Los pedidos de vendedores nacen "por autorizar" (ver crear_pedido). Administración y Gerencia los
-- autorizan de a uno (cambiar_estado) o todos juntos (autorizar_pedidos). Depósito solo ve lo ya autorizado.

-- Autoriza varios pedidos de una vez (ej.: todos los de un camión). Solo mueve los que siguen por autorizar.
-- Devuelve cuántos autorizó.
create or replace function autorizar_pedidos(p_ids bigint[]) returns int
language plpgsql security definer as $$
declare n int;
begin
  if mi_rol() not in ('admin','gerencia') then raise exception 'Solo Administración o Gerencia pueden autorizar'; end if;
  update pedidos set estado = 'pendiente',
    historial = historial || jsonb_build_object('fecha', now(), 'usuario', mi_nombre(), 'txt', 'Autorizado y enviado a depósito')
  where id = any(p_ids) and estado = 'porAutorizar';
  get diagnostics n = row_count;
  return n;
end $$;

-- Depósito no ve los pedidos que todavía esperan autorización.
drop policy if exists "ver pedidos" on pedidos;
create policy "ver pedidos" on pedidos for select using (
  mi_rol() in ('admin','gerencia')
  or (mi_rol() = 'deposito' and estado <> 'porAutorizar')
  or (mi_rol() = 'vendedor' and vendedor_id = auth.uid())
);
