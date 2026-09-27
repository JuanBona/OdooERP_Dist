from odoo import api, models

from .account_move_line import CAMPOS_CREDITO_REPARTO


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _marcar_partners_credito_a_recalcular(self, partners):
        if not partners:
            return
        for nombre in CAMPOS_CREDITO_REPARTO:
            self.env.add_to_compute(partners._fields[nombre], partners)

    @api.model_create_multi
    def create(self, vals_list):
        payments = super().create(vals_list)
        payments._marcar_partners_credito_a_recalcular(payments.partner_id)
        return payments

    def write(self, vals):
        partners_antes = self.partner_id
        res = super().write(vals)
        partners_despues = self.partner_id
        self._marcar_partners_credito_a_recalcular(partners_antes | partners_despues)
        return res

    def unlink(self):
        partners = self.partner_id
        res = super().unlink()
        self._marcar_partners_credito_a_recalcular(partners)
        return res

    def action_post(self):
        res = super().action_post()
        self.filtered(
            lambda p: p.payment_type == 'inbound' and p.partner_type == 'customer'
        )._reparto_conciliar_deuda()
        return res

    def _reparto_conciliar_deuda(self):
        # Odoo no concilia solo un pago sin factura contra la deuda del
        # cliente (aunque caigan en la misma cuenta): sin esto, un cobro
        # de cuenta corriente nunca bajaba el saldo (ver ADR/bug 2026-09-27).
        # Conciliamos contra las lineas mas viejas primero (mismo criterio
        # que credito_fecha_pedido_mas_viejo en res_partner.py).
        for payment in self:
            payment_line = payment.move_id.line_ids.filtered(
                lambda l: l.account_id.account_type == 'asset_receivable' and not l.reconciled
            )
            if not payment_line:
                continue
            lineas_a_cobrar = self.env['account.move.line'].search([
                ('partner_id', '=', payment.partner_id.id),
                ('account_type', '=', 'asset_receivable'),
                ('reconciled', '=', False),
                ('parent_state', '=', 'posted'),
                ('id', 'not in', payment_line.ids),
            ], order='date asc, id asc')
            if not lineas_a_cobrar:
                continue
            (lineas_a_cobrar + payment_line).reconcile()
