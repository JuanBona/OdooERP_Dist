from odoo import api, models

from .account_move_line import CAMPOS_CREDITO_REPARTO


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _marcar_credito_reparto_a_recalcular(self):
        partners = self.partner_id
        if not partners:
            return
        for campo in CAMPOS_CREDITO_REPARTO:
            self.env.add_to_compute(partners._fields[campo], partners)

    @api.model_create_multi
    def create(self, vals_list):
        payments = super().create(vals_list)
        payments._marcar_credito_reparto_a_recalcular()
        return payments

    def write(self, vals):
        res = super().write(vals)
        self._marcar_credito_reparto_a_recalcular()
        return res
