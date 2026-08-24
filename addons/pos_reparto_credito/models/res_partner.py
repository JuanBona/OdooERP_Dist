from odoo import fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    credito_monto_adeudado = fields.Monetary(
        string='Monto adeudado',
        compute='_compute_credito_fields',
        currency_field='currency_id',
    )

    def _compute_credito_fields(self):
        deuda_domain = [
            ('partner_id', 'in', self.ids),
            ('account_type', '=', 'asset_receivable'),
            ('reconciled', '=', False),
            ('parent_state', '=', 'posted'),
        ]
        monto_por_partner = {
            partner.id: monto
            for partner, monto in self.env['account.move.line']._read_group(
                deuda_domain, groupby=['partner_id'], aggregates=['amount_residual:sum'],
            )
        }
        for partner in self:
            partner.credito_monto_adeudado = monto_por_partner.get(partner.id, 0.0)
