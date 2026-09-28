from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    reparto_despacho_diferido = fields.Boolean(
        string="Descontar stock al despachar",
        default=False,
        help="Activar en los POS de camión: los pedidos dejan su picking pendiente (stock comprometido) y el "
             "stock se descuenta recién al confirmar el listado de despacho. Desactivado, el stock se "
             "descuenta al vender, como en Odoo estándar.",
    )
