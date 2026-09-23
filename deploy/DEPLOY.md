# Despliegue a producción

Guía paso a paso para llevar el sistema del Docker local a un VPS real,
alcanzable desde internet por las tablets de reparto y las PC de oficina.

Arquitectura: `docker compose` + un proxy Caddy adelante que provee HTTPS
automático (Let's Encrypt) y esconde Odoo del mundo exterior. **Un stack por
cliente** (su propio VPS o su propia carpeta/proyecto compose): backup, restore
y actualizaciones quedan aislados entre clientes.

## 0. Qué vas a necesitar antes de empezar

- Un VPS con Docker (paso 1) y un dominio/subdominio apuntando a su IP (paso 2).
- Una cuenta de almacenamiento off-site para backups (Backblaze B2, Cloudflare R2, S3…) y una cuenta gratis en healthchecks.io para las alertas.
- Este repo clonado en el VPS, en un tag de release (`git checkout v1.0.0`), no en `main` suelto.

## 1. Contratar el VPS

Recomendado: **DonWeb (Cloud Server/VPS, Buenos Aires)** — datacenter y
facturación en Argentina. Alternativa más barata: Hostinger KVM (São Paulo,
~30-50 ms más de latencia, irrelevante para un POS).

Dimensionamiento para hasta ~5 usuarios / 2-3 camiones: **2 vCPU / 4 GB RAM**,
40 GB de disco, **Ubuntu 24.04 LTS**. Con 1 vCPU / 2 GB, poner `workers = 0`
en `deploy/odoo.conf`. Anotá la **IP pública**.

## 2. Dominio

Un dominio propio de ustedes con un subdominio por cliente
(`cliente.tudominio.com`): el certificado y el DNS los controlan ustedes.

```
Tipo: A   Nombre: cliente (subdominio)   Valor: <IP pública del VPS>   TTL: automático
```

Verificar con `nslookup cliente.tudominio.com` antes de seguir (Caddy no puede
emitir el certificado si el DNS no resolvió).

## 3. Preparar el VPS

Por SSH, como root:

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin git ufw fail2ban unattended-upgrades rclone

# Usuario de trabajo (no operar como root) con tu clave SSH
adduser --disabled-password --gecos "" deploy
usermod -aG docker,sudo deploy
mkdir -p /home/deploy/.ssh && cp ~/.ssh/authorized_keys /home/deploy/.ssh/ \
  && chown -R deploy:deploy /home/deploy/.ssh

# SSH solo por clave, sin root (probá entrar como `deploy` ANTES de cerrar esta sesión)
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall: solo SSH, HTTP y HTTPS
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

(Postgres no publica ningún puerto y Odoo solo se expone a Caddy: ver `docker-compose.prod.yml`.)

## 4. Traer el código

```bash
sudo mkdir -p /opt/reparto && sudo chown deploy:deploy /opt/reparto
git clone https://github.com/JuanBona/OdooERP_Dist.git /opt/reparto
cd /opt/reparto
git checkout v1.0.0
```

## 5. Configurar secretos

```bash
cp .env.prod.example .env
nano .env   # DB_PASSWORD (openssl rand -base64 24), DOMAIN, ACME_EMAIL,
            # RCLONE_REMOTE, HC_PING_URL. Las imágenes vienen fijadas por digest.
cp deploy/odoo.conf.example deploy/odoo.conf
nano deploy/odoo.conf   # admin_passwd fuerte (NO "admin") y dbfilter = ^<DB_NAME>$
chmod 600 .env deploy/odoo.conf
```

`.env` y `deploy/odoo.conf` están en `.gitignore`: viven solo en el servidor.

## 6. Levantar y crear la base limpia

```bash
docker compose -f docker-compose.prod.yml up -d
./deploy/init_db.sh "Nombre de la Empresa del Cliente"
```

`init_db.sh` crea la base **sin datos de prueba**: idioma es_AR, compañía en
Argentina/ARS, plan de cuentas argentino y todos los módulos del sistema
(tarda varios minutos y reinicia Odoo al final). **No restaurar `backup.sql`
en producción**: es un dump de desarrollo con datos de prueba.

## 7. Verificar

```bash
docker compose -f docker-compose.prod.yml logs caddy | grep -i "certificate obtained"
```

Abrir `https://cliente.tudominio.com`: login con candado verde. Entrar como
`admin` / `admin` y **cambiar esa contraseña en el acto** (Preferencias →
Seguridad de la cuenta).

## 8. Backups automáticos (cada 4 hs, con copia fuera del servidor)

Una sola vez, a mano, configurar el destino cifrado (`rclone config`):
un remoto de B2/R2/S3 y sobre él un remoto **`crypt`** (los backups contienen
datos de clientes y ventas: no subirlos en claro). Poner el remoto crypt en
`RCLONE_REMOTE` (`.env`), y en healthchecks.io crear un check con período de
4 h y gracia de 1 h; su URL va en `HC_PING_URL`.

```bash
chmod +x deploy/*.sh
crontab -e     # como usuario `deploy`
```

```
0 */4 * * * /opt/reparto/deploy/backup.sh >> /var/log/reparto-backup.log 2>&1
```

(`sudo touch /var/log/reparto-backup.log && sudo chown deploy /var/log/reparto-backup.log` antes.)

Cada corrida guarda base + filestore en `deploy/backups/` (7 días), los sube
off-site (30 días) y pinguea healthchecks; si falla o el cron deja de correr,
llega un mail. Pérdida máxima ante un desastre: ~4 hs.

### Simulacro de restore (obligatorio antes de dar el sistema por listo)

Un backup que nunca se restauró no es un backup. En un VPS/stack limpio (o en
tu máquina): `docker compose -f docker-compose.prod.yml up -d`, traer un backup
del off-site (`rclone copy REMOTE:db_XXXX.sql.gz .` y el `filestore_XXXX.tar.gz`)
y correr:

```bash
./deploy/restore.sh db_XXXX.sql.gz filestore_XXXX.tar.gz
```

Verificar login, un POS abierto, ventas históricas y acentos. Anotar cuánto
tardó: ese es el RTO real.

## 9. Después del primer deploy

- Crear los usuarios reales (Ajustes → Usuarios): cada uno con su grupo
  *Reparto* (Vendedor / Depósito / Administración Operativa / Gerencia) más el
  grupo estándar de la app que use. A los vendedores, asignarles el camión en
  la pestaña "Camión (Reparto)".
- Crear los `pos.config` de los camiones (con su ubicación de stock y tipo de
  operación) y el POS de entrega diferida, si aplica.
- El cliente carga productos, listas de precios y clientes (importación de
  Odoo, orden: categorías → productos → precios → clientes con vendedor
  asignado → stock inicial). Cada cliente con su `user_id` (vendedor) asignado.
- Las tablets apuntan a `https://cliente.tudominio.com`. Si una tablet queda en
  spinner infinito tras una actualización: es el service worker cacheado; borrar
  datos del sitio.

## Actualizar código en producción (deploys posteriores)

Siempre con backup fresco antes (`./deploy/backup.sh`) y a un tag de release:

```bash
cd /opt/reparto
git fetch --tags && git checkout v1.X.Y
source .env
docker compose -f docker-compose.prod.yml exec -T odoo \
  odoo -d "$DB_NAME" --db_host=db --db_user="$DB_USER" --db_password="$DB_PASSWORD" \
  --no-http --stop-after-init -u <módulo1>,<módulo2>,...
docker compose -f docker-compose.prod.yml restart odoo   # obligatorio: cache de menús/assets
```

Actualizar solo los módulos custom que cambiaron. Para subir de versión de la
imagen de Odoo: probarlo antes en una copia (restore en local) y cambiar el
digest `ODOO_IMAGE` en `.env`.
