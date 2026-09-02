import logging

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def write(self, vals):
        result = super().write(vals)
        if vals.get('state') in ('paid', 'done'):
            for order in self:
                try:
                    order._crear_lineas_comision_venta_directa()
                except Exception:
                    _logger.exception(
                        "Failed to create comision lines for order %s", order.name
                    )
        return result

    def _crear_lineas_comision_venta_directa(self):
        self.ensure_one()
        vendedor = self.partner_id.user_id if self.partner_id else False
        if not vendedor:
            return
        Linea = self.env['pos.reparto.comision.linea'].sudo()
        fecha = self.date_order.date() if self.date_order else fields.Date.context_today(self)
        for payment in self.payment_ids:
            if payment.payment_method_id.type == 'pay_later':
                continue
            if Linea.search_count([('pos_payment_id', '=', payment.id)]):
                continue
            Linea.create({
                'vendedor_id': vendedor.id,
                'partner_id': self.partner_id.id,
                'fecha': fecha,
                'origen': 'venta_directa',
                'monto_cobrado': payment.amount,
                'comision_pct': vendedor.sudo().reparto_comision_pct,
                'pos_payment_id': payment.id,
            })
