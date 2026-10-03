# Migración de datos/configuración de v1.0.0 a v1.1.0. Se corre con `odoo shell`, DESPUÉS de instalar
# y actualizar los módulos (ver deploy/DEPLOY.md, "Actualizar código en producción"). Es REPETIBLE: lo que
# ya está hecho se saltea. Sin COMMIT=1 es un ensayo: hace todo y revierte al final.
#
#   docker compose -f docker-compose.prod.yml exec -T -e COMMIT=1 odoo odoo shell -d "$DB_NAME" \
#     --db_host=db --db_user="$DB_USER" --db_password="$DB_PASSWORD" --no-http < deploy/migraciones/v1_1_0.py
#
# Desinstalar l10n_ar_pos va aparte (recarga el registro de módulos): ver deploy/init_db.sh.
import os

from odoo.exceptions import UserError

COMMIT = os.environ.get("COMMIT") == "1"
TZ = "America/Argentina/Buenos_Aires"
hecho = []

# --- 1. Cajas abiertas: solo se cierran si no tienen ventas ------------------------------------
for sesion in env["pos.session"].search([("state", "!=", "closed")]):
    if sesion.order_ids:
        raise UserError(f"La caja {sesion.name} tiene ventas: cerrarla desde el punto de venta y volver a correr.")
    sesion.action_pos_session_closing_control()
    hecho.append(f"caja {sesion.name} cerrada (sin ventas)")

# --- 2. Stock general: los camiones venden desde WH/Existencias ----------------------------------
almacen = env["stock.warehouse"].search([("company_id", "=", env.company.id)], limit=1)
general = almacen.lot_stock_id
configs = env["pos.config"].search([])
camiones = configs.picking_type_id.default_location_src_id.filtered(lambda l: l != general)
for tipo in configs.picking_type_id.filtered(lambda t: t.default_location_src_id != general):
    tipo.default_location_src_id = general
    hecho.append(f"{tipo.name}: vende desde {general.complete_name}")
for quant in env["stock.quant"].search([("location_id", "child_of", camiones.ids)]):
    # Restos de pruebas de la época de stock por camión: el stock real se carga en el general.
    hecho.append(f"stock en {quant.location_id.complete_name}: {quant.product_id.display_name} "
                 f"{quant.quantity} -> 0")
    quant.with_context(inventory_mode=True).write({"inventory_quantity": 0})
    quant.action_apply_inventory()
if camiones:
    camiones.write({"active": False})
    hecho.append(f"ubicaciones archivadas: {', '.join(camiones.mapped('complete_name'))}")

# --- 3. Configuración de los puntos de venta ------------------------------------------------------
cta_cte = env["pos.payment.method"].search([]).filtered(lambda m: m.type == "pay_later")
if cta_cte.filtered(lambda m: not m.split_transactions):
    cta_cte.write({"split_transactions": True})
    hecho.append("Cuenta corriente: identifica al cliente")
Pricelist = env["product.pricelist"]
lista = Pricelist.search([("company_id", "in", [env.company.id, False])], order="id", limit=1) \
    or Pricelist.create({"name": "Default", "currency_id": env.company.currency_id.id})
for cfg in configs:
    if not cfg.pricelist_id:
        cfg.write({"use_pricelist": True, "pricelist_id": lista.id, "available_pricelist_ids": [(6, 0, [lista.id])]})
        hecho.append(f"{cfg.name}: lista de precios {lista.name}")
    if not cfg.reparto_despacho_diferido:
        cfg.reparto_despacho_diferido = True
        hecho.append(f"{cfg.name}: el stock baja al confirmar el listado de despacho")

for cfg in configs.filtered("limit_categories"):
    cfg.write({"limit_categories": False, "iface_available_categ_ids": [(5, 0, 0)]})
    hecho.append(f"{cfg.name}: muestra todas las categorías (estaba limitado a las de ejemplo)")

# --- 3b. Productos de ejemplo de Odoo ("Cargar muestra" del POS): se archivan, no se borran ---------
de_sistema = (configs.tip_product_id | configs.down_payment_product_id).product_tmpl_id
ids_ejemplo = env["ir.model.data"].search([("model", "=", "product.template"),
                                          ("module", "in", ("product", "point_of_sale"))]).mapped("res_id")
ejemplo = env["product.template"].browse(ids_ejemplo).exists().filtered("active") - de_sistema
ejemplo = ejemplo.filtered(lambda t: t.name not in ("Tips", "Propinas"))
if ejemplo:
    ejemplo.write({"active": False})
    hecho.append(f"{len(ejemplo)} productos de ejemplo de Odoo archivados ({', '.join(ejemplo[:4].mapped('name'))}...)")

# --- 4. Zona horaria única ------------------------------------------------------------------------
env["ir.default"].set("res.partner", "tz", TZ)
usuarios = env["res.users"].with_context(active_test=False).search(
    [("share", "=", False), ("id", "!=", env.ref("base.user_root").id)])
sin_tz = (usuarios.partner_id | env.company.partner_id).filtered(lambda p: p.tz != TZ)
if sin_tz:
    sin_tz.write({"tz": TZ})
    hecho.append(f"zona horaria {TZ}: {len(sin_tz)} usuarios/empresa")

# --- 5. Vendedor externo --------------------------------------------------------------------------
if not env["res.users"].with_context(active_test=False).search([("login", "=", "vendedor04")]):
    env["res.users"].create({"name": "Vendedor 04 (externo)", "login": "vendedor04", "lang": "es_AR",
                             "tz": TZ, "reparto_es_externo": True})
    hecho.append("usuario Vendedor 04 (externo) creado, sin contraseña")

print("\n".join(hecho) or "Nada para hacer: ya estaba migrado.")
if COMMIT:
    env.cr.commit()
    print("GUARDADO")
else:
    env.cr.rollback()
    print("ENSAYO: no se guardó nada (correr con COMMIT=1 para aplicar)")
