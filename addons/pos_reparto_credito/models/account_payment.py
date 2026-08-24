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
