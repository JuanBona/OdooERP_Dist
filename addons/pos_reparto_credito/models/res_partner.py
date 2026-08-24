from odoo import fields, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    credito_monto_adeudado = fields.Monetary(
        string='Monto adeudado',
        compute='_compute_credito_fields',
        currency_field='currency_id',
    )
    credito_fecha_pedido_mas_viejo = fields.Date(
        string='Pedido más viejo sin pagar',
        compute='_compute_credito_fields',
    )
    credito_fecha_ultimo_pago = fields.Date(
        string='Último pago',
        compute='_compute_credito_fields',
    )
    credito_dias_sin_pago = fields.Integer(
        string='Días sin pago',
        compute='_compute_credito_fields',
    )

    def _compute_credito_fields(self):
        today = fields.Date.context_today(self)
        deuda_domain = [
            ('partner_id', 'in', self.ids),
            ('account_type', '=', 'asset_receivable'),
            ('reconciled', '=', False),
            ('parent_state', '=', 'posted'),
        ]
        deuda_por_partner = {
            partner.id: (monto, fecha)
            for partner, monto, fecha in self.env['account.move.line']._read_group(
                deuda_domain, groupby=['partner_id'],
                aggregates=['amount_residual:sum', 'date:min'],
            )
        }
        ultimo_pago_por_partner = {
            partner.id: fecha
            for partner, fecha in self.env['account.payment']._read_group(
                [
                    ('partner_id', 'in', self.ids),
                    ('payment_type', '=', 'inbound'),
                    ('move_id.state', '=', 'posted'),
                ],
                groupby=['partner_id'], aggregates=['date:max'],
            )
        }

        for partner in self:
            monto, fecha_vieja = deuda_por_partner.get(partner.id, (0.0, False))
            partner.credito_monto_adeudado = monto
            if not monto:
                partner.credito_fecha_pedido_mas_viejo = False
                partner.credito_fecha_ultimo_pago = False
                partner.credito_dias_sin_pago = 0
                continue
            partner.credito_fecha_pedido_mas_viejo = fecha_vieja
            fecha_referencia = ultimo_pago_por_partner.get(partner.id) or fecha_vieja
            partner.credito_fecha_ultimo_pago = fecha_referencia
            partner.credito_dias_sin_pago = (today - fecha_referencia).days if fecha_referencia else 0
