from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    despacho_id = fields.Many2one('reparto.despacho', string='Despacho', copy=False, index=True, readonly=True)

    def _reparto_fecha_despacho(self):
        """Día en que el pedido debe salir: la fecha de entrega si es ship-later, si no el día de la venta."""
        self.ensure_one()
        return self.shipping_date or fields.Date.context_today(self, self.date_order)
