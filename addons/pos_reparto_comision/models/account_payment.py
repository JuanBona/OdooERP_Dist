import logging

from odoo import api, models

_logger = logging.getLogger(__name__)

ESTADOS_COBRADOS = ('in_process', 'paid')


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _crear_linea_comision_cobro_credito(self):
        self.ensure_one()
        if self.payment_type != 'inbound' or not self.partner_id:
            return
        vendedor = self.partner_id.user_id
        Linea = self.env['pos.reparto.comision.linea'].sudo()
        existente = Linea.search([('account_payment_id', '=', self.id)])
        if not vendedor:
            existente.unlink()
            return
        if existente:
            # El % de comisión queda congelado; solo se re-sincronizan los datos del cobro.
            existente.write({
                'vendedor_id': vendedor.id,
                'partner_id': self.partner_id.id,
                'fecha': self.date,
                'monto_cobrado': self.amount,
            })
            return
        Linea.create({
            'vendedor_id': vendedor.id,
            'partner_id': self.partner_id.id,
            'fecha': self.date,
            'origen': 'cobro_credito',
            'monto_cobrado': self.amount,
            'comision_pct': vendedor.sudo().reparto_comision_pct,
            'account_payment_id': self.id,
        })

    def _sincronizar_lineas_comision(self):
        # Un fallo de comisión nunca debe abortar el pago en Contabilidad.
        for payment in self:
            try:
                with self.env.cr.savepoint():
                    if payment.state in ESTADOS_COBRADOS:
                        payment._crear_linea_comision_cobro_credito()
                    else:
                        self.env['pos.reparto.comision.linea'].sudo().search([
                            ('account_payment_id', '=', payment.id),
                        ]).unlink()
            except Exception:
                _logger.exception(
                    "Failed to sync comision line for payment %s", payment.id
                )

    @api.model_create_multi
    def create(self, vals_list):
        payments = super().create(vals_list)
        payments._sincronizar_lineas_comision()
        return payments

    def write(self, vals):
        result = super().write(vals)
        if {'state', 'amount', 'partner_id', 'date'} & vals.keys():
            self._sincronizar_lineas_comision()
        return result

    def unlink(self):
        self.env['pos.reparto.comision.linea'].sudo().search([
            ('account_payment_id', 'in', self.ids),
        ]).unlink()
        return super().unlink()
