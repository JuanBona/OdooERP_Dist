from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    reparto_despacho_diferido = fields.Boolean(
        string="Descontar stock al despachar",
        default=True,
        help="Si está activo, los pedidos de este POS dejan su picking pendiente (stock comprometido) y el "
             "stock se descuenta recién al confirmar el listado de despacho.",
    )
