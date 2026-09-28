from odoo import models


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    def _action_done(self):
        # El core valida el picking al vender; con despacho diferido queda armado (movimientos con
        # cantidades) pero sin validar. Lo valida reparto.despacho.action_confirmar.
        # El contexto lo pone solo pos.order._create_order_picking (venta de un pedido de camión).
        if self.env.context.get('reparto_despacho_diferido'):
            return True
        return super()._action_done()
