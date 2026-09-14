# Despliegue a producción

Guía paso a paso para llevar el sistema del Docker local a un VPS real,
alcanzable desde internet por las tablets de reparto y las PC de oficina.

Arquitectura: mismo `docker compose` de siempre + un proxy Caddy adelante
que provee HTTPS automático (Let's Encrypt) y esconde el puerto de Odoo del
mundo exterior.

## 0. Qué vas a necesitar antes de empezar

- Un VPS con Docker (ver paso 1).
- Un dominio propio apuntando a la IP del VPS (ver paso 2).
- Este repo clonado en el VPS.

## 1. Contratar el VPS

Recomendado: **Hostinger, plan KVM 2** (2 vCPU / 8GB RAM aprox, sobra para
este volumen de datos — 778 clientes, 182 productos, ~5 usuarios de
escritorio + unas tablets), ubicación **São Paulo** (mejor latencia desde
Argentina que EE.UU./Europa), **Ubuntu 24.04 LTS**.

Con el mínimo (1-2 vCPU / 4GB) también alcanza; si elegís ese, bajar
`workers = 0` en `deploy/odoo.conf` (ver paso 5) para no quedarte sin RAM.

Anotá la **IP pública** que te dan — la necesitás en el paso 2.

## 2. Dominio

Comprar uno (`.com.ar` vía [nic.ar](https://nic.ar) si tenés el CUIT/CUIL
del cliente a mano, o un `.com` genérico vía Namecheap/Cloudflare si
preferís algo más rápido de tramitar hoy mismo).

En el panel DNS del dominio, crear un registro:

```
Tipo: A
Nombre: reparto (o el subdominio que prefieras — o @ para el dominio raíz)
Valor: <IP pública del VPS>
TTL: automático
```

Esperar la propagación (minutos a un par de horas). Verificar con
`nslookup tu-dominio.com` desde tu PC antes de seguir.

## 3. Preparar el VPS

Por SSH, como root (o con sudo):

```bash
# Docker + compose plugin (Ubuntu)
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin git

# Firewall — solo SSH, HTTP y HTTPS
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## 4. Traer el código

```bash
git clone https://github.com/JuanBona/OdooERP_Dist.git /opt/reparto
cd /opt/reparto
```

## 5. Configurar secretos

```bash
cp .env.prod.example .env
nano .env   # completar DB_PASSWORD, DOMAIN, ACME_EMAIL con valores reales
            # generar password fuerte: openssl rand -base64 24

cp deploy/odoo.conf.example deploy/odoo.conf
nano deploy/odoo.conf   # completar admin_passwd (otra password fuerte,
                         # NO "admin"), y dbfilter con el DB_NAME que
                         # pusiste en .env
```

`.env` y `deploy/odoo.conf` ya están en `.gitignore` — no se commitean,
quedan solo en el servidor.

## 6. Levantar y cargar los datos

```bash
docker compose -f docker-compose.prod.yml up -d
```

Esperar ~30-60s a que Odoo termine de inicializar la base vacía, después
restaurar el dump actual (el `backup.sql` del repo, redumpeado el
2026-09-14 con los datos reales del cliente y las 4 config de POS):

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U odoo -d odoo -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U odoo -d odoo
```

(Ajustar `-U odoo -d odoo` si pusiste otro `DB_USER`/`DB_NAME` en `.env`.)

Reiniciar Odoo para que tome la base restaurada:

```bash
docker compose -f docker-compose.prod.yml restart odoo
```

## 7. Verificar

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Buscar que emita el certificado sin error ("certificate obtained
successfully"). Abrir `https://tu-dominio.com` en el navegador — debería
pedir login de Odoo con candado verde.

Entrar como `admin` y **cambiar la contraseña de admin** (la que traía la
base de desarrollo no debería quedar como la de producción).

## 8. Backups automáticos

```bash
chmod +x deploy/backup.sh
crontab -e
```

Agregar:

```
0 3 * * * /opt/reparto/deploy/backup.sh >> /var/log/reparto-backup.log 2>&1
```

Guarda los últimos 14 días en `deploy/backups/` dentro del VPS. Para que un
backup no dependa de que el VPS siga vivo, configurar `rclone` (una vez, a
mano: `rclone config`) apuntando a un bucket S3-compatible barato (Hetzner
Storage Box, Backblaze B2) y descomentar el bloque al final de
`deploy/backup.sh`.

## 9. Después del primer deploy

- Actualizar la URL en las tablets/kiosco (RNF-09 del relevamiento) para
  que apunten a `https://tu-dominio.com` en vez de la IP/puerto local.
- Si usás el MCP de Odoo para asistentes de IA, generar una API key nueva
  contra este servidor (Settings → Users → API Keys) — la key vieja era
  para la instancia local.
- Reconfirmar con el cliente la asignación vendedor↔cliente pendiente (ver
  `ESTADO_PROYECTO.md` / memoria del proyecto) antes de dar por cerrada la
  puesta en producción — sigue siendo un dato de negocio, no de infra.

## Actualizar código en producción (deploys posteriores)

```bash
cd /opt/reparto
git pull
docker compose -f docker-compose.prod.yml exec -T odoo \
  odoo -d odoo --db_host=db --db_user=odoo --db_password="$DB_PASSWORD" \
  --no-http --stop-after-init -u <módulo1>,<módulo2>,...
docker compose -f docker-compose.prod.yml restart odoo
```

Mismo patrón que en local — actualizar solo los módulos custom que
cambiaron, no todo el catálogo (más rápido, menos riesgo).
