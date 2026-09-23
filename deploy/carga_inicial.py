# Carga inicial de un cliente: productos, clientes, 3 camiones (ubicación, tipo de
# operación, caja, método de pago y POS) y usuarios por rol. Se corre con
# `odoo shell` (ver deploy/carga_inicial.sh, que lo invoca). Es REPETIBLE: lo que
# ya existe se saltea o se actualiza, nada se duplica.
#
# Variables de entorno: CARGA_DIR (default /tmp/carga), COMMIT=1 para guardar
# (sin COMMIT es un ensayo: hace todo y revierte al final).
# Archivos en CARGA_DIR: clientes.csv, productos.csv y, opcional, asignacion.csv
# (columnas codigo,camion) para asignar cada cliente a un camión (vendedor).
import csv
import os
import secrets

from odoo.exceptions import UserError

D = os.environ.get("CARGA_DIR", "/tmp/carga")
COMMIT = os.environ.get("COMMIT") == "1"
N_CAMIONES = 3
report = []


def leer(nombre):
    with open(os.path.join(D, nombre), newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


# --- Productos ---------------------------------------------------------------
Cat, Prod = env["product.category"], env["product.template"]
cats = {c.name: c for c in Cat.search([])}
creados = existentes = 0
for r in leer("productos.csv"):
    if Prod.search_count([("name", "=", r["nombre"])]):  # no se pisa nada de lo ya cargado/editado
        existentes += 1
        continue
    cat = cats.get(r["categoria"]) or Cat.create({"name": r["categoria"]})
    cats[r["categoria"]] = cat
    Prod.create({"name": r["nombre"], "list_price": float(r["precio"]), "categ_id": cat.id,
                 "type": "consu", "is_storable": True, "available_in_pos": True, "sale_ok": True})
    creados += 1
print(f"Productos: {creados} creados, {existentes} ya existían (no se modifican)")

# --- Clientes ----------------------------------------------------------------
Partner = env["res.partner"]
cuit_type, arg = env.ref("l10n_ar.it_cuit"), env.ref("base.ar")
creados = existentes = sin_cuit_valido = 0
for r in leer("clientes.csv"):
    if Partner.search_count([("ref", "=", r["codigo"]), ("customer_rank", ">", 0)]):
        existentes += 1
        continue
    vals = {"name": r["nombre"], "ref": r["codigo"], "street": r["domicilio"] or False,
            "phone": r["telefono"] or False, "email": r["email"] or False,
            "country_id": arg.id, "customer_rank": 1, "lang": "es_AR"}
    if r["cuit"]:
        vals.update(vat=r["cuit"], l10n_latam_identification_type_id=cuit_type.id)
    try:
        with env.cr.savepoint():
            Partner.create(vals)
    except Exception as e:  # CUIT inválido: se carga igual, sin CUIT, y queda en el reporte
        vals.pop("vat", None)
        vals.pop("l10n_latam_identification_type_id", None)
        vals["comment"] = f"CUIT/DNI original del Excel (no válido como CUIT): {r['cuit']}"
        Partner.create(vals)
        sin_cuit_valido += 1
        report.append(f"cliente {r['codigo']} {r['nombre']}: CUIT '{r['cuit']}' rechazado "
                      f"(guardado en la nota del cliente)")
    creados += 1
print(f"Clientes: {creados} creados ({sin_cuit_valido} sin CUIT por CUIT inválido), "
      f"{existentes} ya existían")

# --- Camiones: ubicación, tipo de operación, caja, método de pago y POS -------------
wh = env["stock.warehouse"].search([], limit=1)
clientes_dest = env.ref("stock.stock_location_customers")
metodos = env["pos.payment.method"].search([])  # `type` es calculado: se filtra en Python
card = metodos.filtered(lambda m: m.type == "bank")[:1]
cta_cte = metodos.filtered(lambda m: m.type == "pay_later")[:1]
if not card:
    banco = env["account.journal"].search([("type", "=", "bank")], limit=1)
    if not banco:
        raise UserError("No hay diario de banco: revisar que el plan de cuentas esté instalado")
    card = env["pos.payment.method"].create({"name": "Tarjeta", "journal_id": banco.id})
if not cta_cte:  # sin diario => tipo pay_later (cuenta corriente)
    cta_cte = env["pos.payment.method"].create({"name": "Cuenta corriente"})
pos_por_camion = {}
for n in range(1, N_CAMIONES + 1):
    loc = env["stock.location"].search([("name", "=", f"Camion {n}"), ("location_id", "=", wh.lot_stock_id.id)], limit=1) \
        or env["stock.location"].create({"name": f"Camion {n}", "usage": "internal", "location_id": wh.lot_stock_id.id})
    ptype = env["stock.picking.type"].search([("sequence_code", "=", f"VCAM{n}"), ("warehouse_id", "=", wh.id)], limit=1) \
        or env["stock.picking.type"].create({
            "name": f"Venta Camion {n}", "code": "outgoing", "sequence_code": f"VCAM{n}",
            "warehouse_id": wh.id, "default_location_src_id": loc.id,
            "default_location_dest_id": clientes_dest.id})
    # Carga (depósito -> camión) y Descarga (camión -> depósito): rutina diaria de stock
    for prefijo, codigo, origen, destino in (
            ("Carga", "CAM", wh.lot_stock_id, loc), ("Descarga", "DCAM", loc, wh.lot_stock_id)):
        if not env["stock.picking.type"].search_count([("sequence_code", "=", f"{codigo}{n}"), ("warehouse_id", "=", wh.id)]):
            env["stock.picking.type"].create({
                "name": f"{prefijo} Camion {n}", "code": "internal", "sequence_code": f"{codigo}{n}",
                "warehouse_id": wh.id, "default_location_src_id": origen.id,
                "default_location_dest_id": destino.id})
    jrn = env["account.journal"].search([("code", "=", f"CJ{n}"), ("type", "=", "cash")], limit=1) \
        or env["account.journal"].create({"name": f"Caja Camion {n}", "code": f"CJ{n}", "type": "cash"})
    efectivo = env["pos.payment.method"].search([("name", "=", f"Efectivo Camion {n}")], limit=1) \
        or env["pos.payment.method"].create({"name": f"Efectivo Camion {n}", "type": "cash", "journal_id": jrn.id})
    cfg = env["pos.config"].search([("name", "=", f"POS Camion {n}")], limit=1) \
        or env["pos.config"].create({
            "name": f"POS Camion {n}", "picking_type_id": ptype.id,
            "payment_method_ids": [(6, 0, [card.id, cta_cte.id, efectivo.id])]})
    pos_por_camion[n] = cfg
print(f"Camiones: {N_CAMIONES} POS + tipos Carga/Descarga listos ({', '.join(c.name for c in pos_por_camion.values())})")

# --- Usuarios por rol --------------------------------------------------------
G = "pos_reparto_security."
usuarios = [(f"Transportista Camion {n}", f"camion{n}", G + "group_reparto_vendedor", n)
            for n in range(1, N_CAMIONES + 1)] + [
    ("Administracion", "administracion", G + "group_reparto_adminop", None),
    ("Deposito", "deposito", G + "group_reparto_deposito", None),
    ("Gerencia", "gerencia", G + "group_reparto_gerencia", None)]
user_por_camion, claves = {}, []
for nombre, login, grupo, camion in usuarios:
    u = env["res.users"].search([("login", "=", login)], limit=1)
    if not u:
        clave = secrets.token_urlsafe(9)
        u = env["res.users"].with_context(no_reset_password=True).create({
            "name": nombre, "login": login, "password": clave, "lang": "es_AR",
            "tz": "America/Argentina/Buenos_Aires",
            "group_ids": [(6, 0, [env.ref("base.group_user").id, env.ref(grupo).id])],
            **({"reparto_camion_asignado_id": pos_por_camion[camion].id} if camion else {})})
        claves.append((login, clave))
    if camion:
        user_por_camion[camion] = u

# --- Asignación cliente -> camión (opcional) ---------------------------------
if os.path.exists(os.path.join(D, "asignacion.csv")):
    n_asig = 0
    for r in leer("asignacion.csv"):
        p = Partner.search([("ref", "=", r["codigo"]), ("customer_rank", ">", 0)], limit=1)
        u = user_por_camion.get(int(r["camion"]))
        if p and u:
            p.user_id = u
            n_asig += 1
    print(f"Clientes asignados a un camión: {n_asig}")
else:
    print("AVISO: no hay asignacion.csv. Los transportistas solo ven SUS clientes: "
          "hasta asignarlos (Vendedor en cada cliente) no verán ninguno en el POS.")

if claves:
    print("\nUSUARIOS CREADOS (anotá las claves AHORA: no se vuelven a mostrar)")
    for login, clave in claves:
        print(f"  {login:16} {clave}")
if report:
    print("\nREPORTE (para revisar a mano):")
    print("\n".join("  " + x for x in report))

if COMMIT:
    env.cr.commit()
    print("\nGUARDADO.")
else:
    env.cr.rollback()
    print("\nENSAYO: no se guardó nada. Repetir con COMMIT=1 para guardar.")
