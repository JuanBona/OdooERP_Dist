from odoo import api, fields, models


class RepartoCajaDashboard(models.TransientModel):
    _name = 'reparto.caja.dashboard'
    _description = 'Panel de saldo de Cajas (Reparto)'

    currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )
    saldo_efectivo = fields.Monetary(
        string='Saldo Caja Efectivo', currency_field='currency_id', compute='_compute_saldos',
    )
    saldo_transferencia = fields.Monetary(
        string='Saldo Caja Transferencia', currency_field='currency_id', compute='_compute_saldos',
    )

    def _compute_saldos(self):
        for rec in self:
            rec.saldo_efectivo = rec._saldo_caja('efectivo')
            rec.saldo_transferencia = rec._saldo_caja('transferencia')

    @api.model
    def _saldo_caja(self, caja):
        campo_recibido = 'monto_recibido_efectivo' if caja == 'efectivo' else 'monto_recibido_transferencia'
        rendido = self.env['reparto.caja.rendicion'].sudo().search([('state', '=', 'rendido')])
        total_rendido = sum(rendido.mapped(campo_recibido))
        # Lo que cobra Administración por los clientes de un vendedor externo no pasa por Rendición:
        # ya está en la empresa, suma directo al saldo.
        cobrado_externos = self.env['pos.reparto.comision.linea'].sudo().search([
            ('vendedor_id.reparto_es_externo', '=', True),
            ('caja', '=', caja),
        ])
        total_externos = sum(cobrado_externos.mapped('monto_cobrado'))
        gastos = self.env['reparto.caja.gasto'].sudo().search([('caja', '=', caja)])
        total_gasto = sum(gastos.mapped('monto'))
        return total_rendido + total_externos - total_gasto
