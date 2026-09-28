from odoo import api, models


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    @api.model
    def _create_picking_from_pos_order_lines(self, location_dest_id, lines, picking_type, partner=False):
        # Solo se difiere la venta (qty > 0). Las devoluciones (qty < 0) siguen el flujo nativo.
        configs = lines.order_id.config_id
        # Una sola linea de devolucion (qty <= 0) valida todo el grupo (pasa al cerrar sesion con update_stock_at_closing).
        diferir = bool(configs) and all(configs.mapped('reparto_despacho_diferido')) \
            and all(line.qty > 0 for line in lines)
        res = super(StockPicking, self.with_context(reparto_despacho_diferido=diferir)) \
            ._create_picking_from_pos_order_lines(location_dest_id, lines, picking_type, partner=partner)
        return res.with_env(self.env)  # el flag vive solo dentro del super

    def _action_done(self):
        # El core valida el picking al vender; con despacho diferido queda armado (movimientos con
        # cantidades) pero sin validar. Lo valida reparto.despacho.action_confirmar.
        if self.env.context.get('reparto_despacho_diferido'):
            return True
        return super()._action_done()
