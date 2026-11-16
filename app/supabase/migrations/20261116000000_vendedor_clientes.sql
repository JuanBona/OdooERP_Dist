-- El vendedor puede dar de alta clientes (quedan a su nombre) y editar los suyos y los sin asignar.
-- No puede tocar saldo, último pago, código ni a qué vendedor pertenece el cliente.

create policy "vendedor crea clientes" on clientes for insert to authenticated
  with check (mi_rol() = 'vendedor' and vendedor_id = auth.uid());

create policy "vendedor edita sus clientes" on clientes for update to authenticated
  using (mi_rol() = 'vendedor' and (vendedor_id = auth.uid() or vendedor_id is null))
  with check (mi_rol() = 'vendedor' and (vendedor_id = auth.uid() or vendedor_id is null));

-- Código automático (el siguiente libre) si no viene uno.
create or replace function cliente_codigo() returns trigger language plpgsql security definer as $$
begin
  if new.codigo is null then
    perform pg_advisory_xact_lock(hashtext('clientes_codigo'));
    select coalesce(max(codigo), 0) + 1 into new.codigo from clientes;
  end if;
  return new;
end $$;
create trigger cliente_codigo before insert on clientes for each row execute function cliente_codigo();

-- Campos que el vendedor no puede cambiar (aunque llame a la base directo).
create or replace function cliente_campos_vendedor() returns trigger language plpgsql as $$
begin
  -- Solo frena ediciones directas desde la app (rol authenticated). Las funciones del sistema
  -- (cobros, entregas) corren con su dueño y sí actualizan el saldo.
  if current_user <> 'authenticated' or mi_rol() is distinct from 'vendedor' then return new; end if;
  if tg_op = 'INSERT' then
    new.saldo := 0; new.ultimo_pago := null; new.vendedor_id := auth.uid();
  else
    new.saldo := old.saldo; new.ultimo_pago := old.ultimo_pago; new.codigo := old.codigo;
    new.vendedor_id := coalesce(old.vendedor_id, auth.uid()); -- si estaba sin asignar, queda suyo
  end if;
  return new;
end $$;
create trigger cliente_campos_vendedor before insert or update on clientes for each row execute function cliente_campos_vendedor();
