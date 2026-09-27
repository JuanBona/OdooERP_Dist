from odoo import api, fields, models
from odoo.exceptions import UserError


class RepartoCajaRendicion(models.Model):
    _name = 'reparto.caja.rendicion'
    _description = 'Rendición de caja de un vendedor (Reparto)'
    _order = 'fecha desc, id desc'

    vendedor_id = fields.Many2one('res.users', string='Vendedor', required=True)
    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )

    monto_esperado_efectivo = fields.Monetary(
        string='Esperado Efectivo', currency_field='currency_id', readonly=True,
    )
    monto_esperado_transferencia = fields.Monetary(
        string='Esperado Transferencia', currency_field='currency_id', readonly=True,
    )
    monto_recibido_efectivo = fields.Monetary(string='Recibido Efectivo', currency_field='currency_id')
    monto_recibido_transferencia = fields.Monetary(
        string='Recibido Transferencia', currency_field='currency_id',
    )
    diferencia_efectivo = fields.Monetary(
        string='Diferencia Efectivo', currency_field='currency_id',
        compute='_compute_diferencias', store=True,
    )
    diferencia_transferencia = fields.Monetary(
        string='Diferencia Transferencia', currency_field='currency_id',
        compute='_compute_diferencias', store=True,
    )

    state = fields.Selection(
        [('borrador', 'Borrador'), ('rendido', 'Rendido')],
        string='Estado', default='borrador', required=True,
    )
    rendido_uid = fields.Many2one('res.users', string='Rendido por', readonly=True)
    rendido_fecha = fields.Datetime(string='Fecha de rendición', readonly=True)

    @api.depends(
        'monto_recibido_efectivo', 'monto_esperado_efectivo',
        'monto_recibido_transferencia', 'monto_esperado_transferencia',
    )
    def _compute_diferencias(self):
        for rendicion in self:
            rendicion.diferencia_efectivo = (
                rendicion.monto_recibido_efectivo - rendicion.monto_esperado_efectivo
            )
            rendicion.diferencia_transferencia = (
                rendicion.monto_recibido_transferencia - rendicion.monto_esperado_transferencia
            )

    @api.model_create_multi
    def create(self, vals_list):
        Linea = self.env['pos.reparto.comision.linea'].sudo()
        for vals in vals_list:
            vendedor_id = vals.get('vendedor_id')
            if not vendedor_id:
                continue
            pendientes = Linea.search([
                ('vendedor_id', '=', vendedor_id),
                ('rendicion_id', '=', False),
            ])
            vals.setdefault(
                'monto_esperado_efectivo',
                sum(pendientes.filtered(lambda l: l.caja == 'efectivo').mapped('monto_cobrado')),
            )
            vals.setdefault(
                'monto_esperado_transferencia',
                sum(pendientes.filtered(lambda l: l.caja == 'transferencia').mapped('monto_cobrado')),
            )
        return super().create(vals_list)

    def action_rendir(self):
        Linea = self.env['pos.reparto.comision.linea'].sudo()
        for rendicion in self:
            if rendicion.state != 'borrador':
                raise UserError('Esta rendición ya fue confirmada.')
            pendientes = Linea.search([
                ('vendedor_id', '=', rendicion.vendedor_id.id),
                ('rendicion_id', '=', False),
            ])
            pendientes.write({'rendicion_id': rendicion.id})
            rendicion.write({
                'state': 'rendido',
                'rendido_uid': self.env.user.id,
                'rendido_fecha': fields.Datetime.now(),
            })
