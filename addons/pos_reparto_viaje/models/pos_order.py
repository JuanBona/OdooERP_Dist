from odoo import api, fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model_create_multi
    def create(self, vals_list):
        orders = super().create(vals_list)
        orders._reparto_viaje_marcar_parada_visitada()
        return orders

    def _reparto_viaje_marcar_parada_visitada(self):
        for order in self:
            if not order.partner_id or not order.user_id or not order.date_order:
                continue
            fecha_pedido = fields.Date.to_date(order.date_order)
            parada = self.env['reparto.viaje.parada'].sudo().search([
                ('viaje_id.chofer_id', '=', order.user_id.id),
                ('viaje_id.fecha', '=', fecha_pedido),
                ('partner_id', '=', order.partner_id.id),
                ('visitado', '=', False),
            ], limit=1)
            if parada:
                parada.write({'visitado': True, 'pedido_id': order.id})
