# Instalar en el servidor (reemplaza a Odoo)

La app es una web estática (React) + Supabase (base de datos, login y fotos). Supabase corre con
Docker en el mismo servidor donde hoy está Odoo. Antes de apagar Odoo: **backup final** de su base
(`deploy/backup.sh`) y anotar los **saldos de cuenta corriente y el stock** reales para cargarlos.

## 1. Supabase con Docker

Se usa el Docker Compose oficial de Supabase (self-hosting):

```bash
git clone --depth 1 https://github.com/supabase/supabase
cp -r supabase/docker ~/supabase && cd ~/supabase
cp .env.example .env
```

En `.env` cambiar **sí o sí**: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`
(generarlos como dice la guía oficial de self-hosting), `DASHBOARD_USERNAME/PASSWORD`,
`SITE_URL` y `API_EXTERNAL_URL` con el dominio real. Después:

```bash
docker compose up -d
```

Recursos: unos 2–4 GB de RAM para todos los servicios. Se puede apagar lo que no se usa
(`analytics`, `functions`, `imgproxy`, `supavisor`) para que entre en un servidor chico.

## 2. Cargar el esquema y los datos

Desde una máquina con el repo (`app/`):

```bash
npx supabase db push --db-url "postgresql://postgres:<POSTGRES_PASSWORD>@<servidor>:5432/postgres"
SUPABASE_URL=https://api.<dominio> SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> CLAVE_INICIAL=<clave> node scripts/cargar_datos.mjs
```

Crea los 5 usuarios (vendedor1, vendedor2, deposito, admin, gerencia) con la clave inicial,
los 182 productos y los 776 clientes. **Cambiar las claves** después desde el panel de Supabase.

Entregas automáticas (pasa a Entregado lo que salió en reparto el día anterior), en el SQL editor:

```sql
create extension if not exists pg_cron;
select cron.schedule('cierre-reparto', '5 0 * * *', 'select cerrar_reparto()');
```

## 3. Publicar la app

```bash
cd app
VITE_SUPABASE_URL=https://api.<dominio> VITE_SUPABASE_ANON_KEY=<ANON_KEY> npm run build
```

Copiar `app/dist/` al servidor y servirlo con Caddy (ya está en `deploy/Caddyfile`), por ejemplo:

```
app.<dominio> {
  root * /srv/rincon
  try_files {path} /index.html
  file_server
}
api.<dominio> {
  reverse_proxy localhost:8000   # Kong de Supabase
}
```

Necesita HTTPS (Caddy lo saca solo) para que la app se pueda instalar en las tablets y ande sin señal.

## 4. Backups

Backup diario de la base con `pg_dump` (cron del servidor), igual que se hacía con Odoo:

```bash
docker exec supabase-db pg_dump -U postgres -Fc postgres > /backups/rincon-$(date +%F).dump
```

## Probar en local (desarrollo)

```bash
cd app
npx supabase start          # levanta Supabase con Docker y aplica supabase/migrations
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<de supabase status> CLAVE_INICIAL=demo1234 node scripts/cargar_datos.mjs
echo "VITE_SUPABASE_URL=http://127.0.0.1:54321" > .env
echo "VITE_SUPABASE_ANON_KEY=<de supabase status>" >> .env
npm run dev
```

Pruebas de la base (permisos por rol, stock, caja, comisiones): `supabase/test/prueba_circuito.sql`
(ver el encabezado del archivo).
