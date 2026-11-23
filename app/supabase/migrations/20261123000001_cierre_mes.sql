-- Cierre de mes: el último día, desde las 20 h, Gerencia arregla las comisiones con los vendedores
-- y cierra el mes. A las 12 de la noche el Resumen arranca de 0 con el mes nuevo. Queda guardado el resumen (facturación, profit, gastos, % de ganancia,
-- 10 productos y 10 clientes que más compraron, comisión de cada vendedor) tal como estaba.
-- No se borra nada: comisiones, facturación, profit y gastos se cuentan por mes, así que el mes
-- nuevo arranca de 0 solo. Ofertas, descuentos por cantidad y configuración no se tocan.
create table cierres_mes (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$'),   -- '2026-11'
  hora timestamptz not null default now(),
  usuario uuid not null references perfiles default auth.uid(),
  resumen jsonb not null
);
alter table cierres_mes enable row level security;
create policy "cierre ver" on cierres_mes for select using (mi_rol() = 'gerencia');
create policy "cierre cargar" on cierres_mes for insert with check (mi_rol() = 'gerencia' and usuario = auth.uid());
-- Un cierre no se modifica ni se borra (sin políticas de update/delete).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table cierres_mes;
  end if;
end $$;
