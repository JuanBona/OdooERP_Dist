from odoo import fields, models


class RepartoCajaGasto(models.Model):
    _name = 'reparto.caja.gasto'
    _description = 'Gasto / egreso de caja (Reparto)'
    _order = 'fecha desc, id desc'

    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    caja = fields.Selection(
        [('efectivo', 'Efectivo'), ('transferencia', 'Transferencia')],
        string='Caja', required=True,
    )
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )
    monto = fields.Monetary(string='Monto', currency_field='currency_id', required=True)
    vendedor_id = fields.Many2one('res.users', string='Vendedor responsable', required=True)
    motivo = fields.Char(string='Motivo', required=True)
    registrado_uid = fields.Many2one(
        'res.users', string='Registrado por', default=lambda self: self.env.user, readonly=True,
    )

    _monto_positivo = models.Constraint('CHECK(monto > 0)', 'El monto del gasto tiene que ser mayor a cero.')
