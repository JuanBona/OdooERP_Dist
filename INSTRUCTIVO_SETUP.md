# Cómo levantar este proyecto (para nuevos devs)

Guía para clonar el repo y tener el mismo entorno local que el resto del equipo.

## 1. Requisitos previos

- **Docker Desktop** instalado y corriendo.
- **Git**.
- (Opcional, para trabajar con el asistente de IA vía MCP) **uv/uvx**: https://docs.astral.sh/uv/

## 2. Clonar y levantar

```bash
git clone <URL_DEL_REPO>
cd OdooERP_Dist
docker compose up -d
```

Primera vez descarga las imágenes de Odoo 19 y Postgres 16 (puede tardar unos minutos). Confirmá que quedó arriba:

```bash
docker compose ps
```

Ambos servicios (`odoo`, `db`) deben decir `running`.

## 3. Inicializar la base de datos (SOLO la primera vez que alguien la levanta desde cero)

Si es tu primera vez y nadie te pasó un dump de base de datos (ver sección 5), la base arranca vacía. Hay que instalar el módulo `base`:

```bash
docker compose stop odoo
docker compose run --rm odoo odoo -d odoo -i base --stop-after-init
docker compose up -d odoo
```

Después entrá a `http://localhost:8069` — deberías ver la pantalla de login. Usuario/clave por defecto: `admin` / `admin`.

**Importante:** esto te da una base "en blanco" de Odoo — sin la localización Argentina, sin los productos de prueba, sin los puntos de venta configurados. Para tener el mismo estado de negocio que el resto del equipo, pedile a alguien un dump (sección 5) en vez de arrancar de cero, o seguí los pasos del `ESTADO_PROYECTO.md` para reconstruir la config a mano.

## 4. Módulos custom

Los módulos propios viven en `./addons/` y Odoo los detecta automáticamente por el bind mount. Si alguien agrega un módulo nuevo (o vos):

```bash
docker compose restart odoo
```

Después, desde Odoo (developer mode activado — `?debug=1` en la URL), andá a **Apps → Update Apps List**, buscá el módulo, y **Install**.

## 5. Sincronizar la base de datos con el equipo

**Por ahora no hay automatización para esto** (es una base chica, dos personas). Mientras tanto:

**Para compartir tu estado actual:**
```bash
docker compose exec db pg_dump -U odoo odoo > backup.sql
```
Mandale ese archivo a tu compañero (Drive, WhatsApp, lo que sea — **no lo subas a git**, está en `.gitignore` a propósito).

**Para importar un dump que te pasaron:**
```bash
# Con Odoo apagado y la base limpia
docker compose stop odoo
docker compose exec -T db psql -U odoo -d odoo -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose exec -T db psql -U odoo odoo < backup.sql
docker compose up -d odoo
```

⚠️ Esto reemplaza TODO lo que tengas cargado en tu base local. Avisale a tu compañero antes de hacerlo si tenés algo propio sin respaldar.

## 6. Cómo trabajar de forma colaborativa (sin pisarse)

- **Una rama por feature.** Nunca commitear directo a `main`. Ej: `git checkout -b feature/facturacion-camion`.
- **Cada feature grande, su propio módulo** dentro de `addons/`. Si vos tocás `pos_stock_limit` y tu compañero arma algo de facturación, que sea `addons/pos_invoicing_camion/` aparte — así los `git diff` no se cruzan.
- **Antes de tocar la base de datos con cambios de config (nuevos productos, POS, etc.), avisá en el chat/grupo.** No hay forma automática de mezclar dos bases Postgres distintas — si los dos cargan datos distintos en paralelo, alguien pierde su trabajo al importar el dump del otro.
- **`ESTADO_PROYECTO.md` es la fuente de verdad.** Cada vez que alguien termina algo importante, lo anota ahí (qué se hizo, qué falta) antes de avisar "listo" — así el otro no tiene que adivinar el estado leyendo el chat de otro.
- **Pull Request incluso siendo dos.** Aunque sean ustedes dos nomás, mergear por PR (no push directo a main) deja registro de qué se revisó y por qué, y evita romper lo que el otro está probando en su rama.
- **Nunca commitear:**
  - `.claude/` (settings locales, puede tener API keys)
  - dumps de base (`*.sql`, `*.dump`)
  - cualquier certificado/credencial real de ARCA cuando lleguemos a esa parte

## 7. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `http://localhost:8069` no carga | Odoo no terminó de levantar | `docker compose logs -f odoo`, esperar línea "HTTP service running" |
| Error 500 en `/` al entrar | Base sin inicializar (`ir.module.module` no existe) | Repetir paso 3 (init con `-i base`) |
| Módulo nuevo no aparece en Apps | Odoo no escaneó el addons_path de nuevo | `docker compose restart odoo`, después "Update Apps List" en Odoo |
| `docker compose exec` falla con rutas raras (Git Bash / Windows) | MSYS reescribe rutas tipo `/mnt/...` | Anteponer `MSYS_NO_PATHCONV=1` al comando |
