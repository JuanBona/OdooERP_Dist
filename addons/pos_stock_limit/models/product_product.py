from odoo import models

PICKING_PENDIENTE = ('confirmed', 'waiting', 'assigned', 'partially_available')


class ProductProduct(models.Model):
    _inherit = 'product.product'

    def _reparto_comprometido(self, location):
        """{product_id: cantidad} de pedidos POS con picking todavía sin validar que salen de `location`
        (o de sus hijas). qty_available no lo descuenta hasta que el picking se valida."""
        grupos = self.env['stock.move'].sudo()._read_group(
            [
                ('product_id', 'in', self.ids),
                ('location_id', 'child_of', location.id),
                ('state', 'in', PICKING_PENDIENTE),
                ('picking_id.pos_order_id', '!=', False),
            ],
            ['product_id'],
            ['product_uom_qty:sum'],
        )
        return {producto.id: qty for producto, qty in grupos}
