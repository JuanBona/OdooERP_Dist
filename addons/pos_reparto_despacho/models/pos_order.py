from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    despacho_id = fields.Many2one('reparto.despacho', string='Despacho', copy=False, index=True, readonly=True)

    def _reparto_fecha_despacho(self):
        """Día en que el pedido debe salir: la fecha de entrega si es ship-later, si no el día de la venta."""
        self.ensure_one()
        return self.shipping_date or fields.Date.context_today(self, self.date_order)

    def _create_order_picking(self):
        # Solo se difiere el picking que nace de la venta de un pedido de camión. Los pickings de
        # cierre de sesión (update_stock_at_closing) no pasan por acá y se validan como siempre.
        # Limitación aceptada: un ticket mixto (venta + devolución) no se difiere y se valida al vender.
        self.ensure_one()
        diferir = bool(self.config_id.reparto_despacho_diferido) and all(line.qty > 0 for line in self.lines)
        return super(PosOrder, self.with_context(reparto_despacho_diferido=diferir))._create_order_picking()
