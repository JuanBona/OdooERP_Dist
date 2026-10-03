from odoo import fields, models


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    reparto_cobro_viaje = fields.Boolean(
        string='Cobrado desde Viaje', readonly=True, copy=False,
        help='Deuda cobrada por el chofer desde la pantalla Viaje (no es una venta del punto de venta).',
    )
