from odoo import api, fields, models


class PosRepartoComisionLinea(models.Model):
    _name = 'pos.reparto.comision.linea'
    _description = 'Línea de comisión de vendedor (Reparto)'
    _order = 'fecha desc, id desc'

    vendedor_id = fields.Many2one('res.users', required=True, index=True, string='Vendedor')
    partner_id = fields.Many2one('res.partner', required=True, string='Cliente')
    fecha = fields.Date(required=True)
    origen = fields.Selection([
        ('venta_directa', 'Venta directa'),
        ('cobro_credito', 'Cobro de cuenta corriente'),
    ], required=True)
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )
    monto_cobrado = fields.Monetary(required=True, currency_field='currency_id')
    comision_pct = fields.Float(required=True, string='% Comisión')
    comision_monto = fields.Monetary(
        string='Comisión',
        compute='_compute_comision_monto',
        store=True,
        currency_field='currency_id',
    )
    pos_payment_id = fields.Many2one('pos.payment', string='Pago POS')
    account_payment_id = fields.Many2one('account.payment', string='Pago de cuenta corriente')

    _pos_payment_unique = models.Constraint(
        'unique(pos_payment_id)',
        'Ya existe una línea de comisión para este pago de POS.',
    )
    _account_payment_unique = models.Constraint(
        'unique(account_payment_id)',
        'Ya existe una línea de comisión para este pago de cuenta corriente.',
    )
    _origen_exclusivo = models.Constraint(
        'CHECK ((pos_payment_id IS NOT NULL) <> (account_payment_id IS NOT NULL))',
        'La línea de comisión debe tener exactamente un origen: un pago de POS o un pago de cuenta corriente, no ambos ni ninguno.',
    )

    @api.depends('monto_cobrado', 'comision_pct')
    def _compute_comision_monto(self):
        for linea in self:
            linea.comision_monto = linea.monto_cobrado * linea.comision_pct / 100
