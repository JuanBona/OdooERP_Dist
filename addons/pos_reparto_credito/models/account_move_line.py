from odoo import api, models

CAMPOS_CREDITO_REPARTO = [
    'credito_monto_adeudado',
    'credito_fecha_pedido_mas_viejo',
    'credito_fecha_ultimo_pago',
    'credito_dias_sin_pago',
]


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _marcar_credito_reparto_a_recalcular(self):
        partners = self.filtered(
            lambda l: l.partner_id and l.account_type == 'asset_receivable'
        ).partner_id
        if not partners:
            return
        for campo in CAMPOS_CREDITO_REPARTO:
            self.env.add_to_compute(partners._fields[campo], partners)

    @api.model_create_multi
    def create(self, vals_list):
        lines = super().create(vals_list)
        lines._marcar_credito_reparto_a_recalcular()
        return lines

    def write(self, vals):
        res = super().write(vals)
        self._marcar_credito_reparto_a_recalcular()
        return res
