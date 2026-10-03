from odoo import api, fields, models
from odoo.exceptions import UserError


class RepartoViaje(models.Model):
    _name = 'reparto.viaje'
    _description = 'Viaje (hoja de ruta diaria de un chofer)'
    _order = 'fecha desc, id desc'

    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    chofer_id = fields.Many2one(
        'res.users', string='Chofer', required=True,
        domain=lambda self: [('group_ids', 'in', self.env.ref('pos_reparto_security.group_reparto_vendedor').id)],
    )
    pos_config_id = fields.Many2one('pos.config', string='Punto de Venta', required=True)
    parada_ids = fields.One2many('reparto.viaje.parada', 'viaje_id', string='Paradas')

    paradas_totales = fields.Integer(string='Paradas totales', compute='_compute_progreso')
    paradas_completadas = fields.Integer(string='Paradas completadas', compute='_compute_progreso')
    progreso = fields.Float(string='Progreso (%)', compute='_compute_progreso')

    @api.depends('chofer_id', 'fecha')
    def _compute_display_name(self):
        for viaje in self:
            viaje.display_name = f"{viaje.chofer_id.name or 'Viaje'} - {viaje.fecha or ''}".strip(' -')

    _chofer_fecha_unique = models.Constraint(
        'unique(chofer_id, fecha)',
        'Este chofer ya tiene un viaje asignado para esa fecha.',
    )

    @api.depends('parada_ids.visitado')
    def _compute_progreso(self):
        for viaje in self:
            total = len(viaje.parada_ids)
            completadas = len(viaje.parada_ids.filtered('visitado'))
            viaje.paradas_totales = total
            viaje.paradas_completadas = completadas
            viaje.progreso = (completadas / total * 100) if total else 0.0

    @api.model
    def get_mi_viaje_hoy(self):
        viaje = self.search([
            ('chofer_id', '=', self.env.uid),
            ('fecha', '=', fields.Date.context_today(self)),
        ], limit=1)
        if not viaje:
            return False
        return {
            'id': viaje.id,
            'fecha': fields.Date.to_string(viaje.fecha),
            'paradas': [
                {
                    'id': parada.id,
                    'partner_name': parada.partner_id.name,
                    'visitado': parada.visitado,
                    'tiene_pedido': bool(parada.pedido_id),
                    'deuda_monto': parada.partner_id.credito_monto_adeudado,
                }
                for parada in viaje.parada_ids
            ],
        }


class RepartoViajeParada(models.Model):
    _name = 'reparto.viaje.parada'
    _description = 'Parada de un viaje (cliente a visitar)'

    viaje_id = fields.Many2one('reparto.viaje', string='Viaje', required=True, ondelete='cascade')
    partner_id = fields.Many2one('res.partner', string='Cliente', required=True)
    visitado = fields.Boolean(string='Visitado', default=False)
    pedido_id = fields.Many2one('pos.order', string='Pedido', readonly=True)

    def action_abrir_pos(self):
        self.ensure_one()
        action = self.viaje_id.pos_config_id.open_ui()
        separator = '&' if '?' in action['url'] else '?'
        action['url'] += f'{separator}reparto_partner_id={self.partner_id.id}'
        return action

    def action_cobrar_deuda(self, monto, medio):
        self.ensure_one()
        if self.viaje_id.chofer_id.id != self.env.uid:
            raise UserError('No podés cobrar una parada que no es tuya.')
        if medio not in ('efectivo', 'transferencia'):
            raise UserError('Medio de pago inválido.')
        partner = self.partner_id
        deuda = partner.credito_monto_adeudado
        if monto <= 0:
            raise UserError('El monto tiene que ser mayor a cero.')
        if monto > deuda:
            raise UserError(f'El monto no puede ser mayor a la deuda actual (${deuda:.2f}).')
        journal_type = 'cash' if medio == 'efectivo' else 'bank'
        # Sin scope por company_id: mismo criterio que pos_reparto_caja
        # (comision_linea._compute_caja_medio), solo importa journal.type.
        # Revisar si alguna vez hay mas de un journal del mismo type por company.
        journal = self.env['account.journal'].search([('type', '=', journal_type)], limit=1)
        if not journal:
            raise UserError('No hay un diario configurado para ese medio de pago.')
        payment = self.env['account.payment'].sudo().create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': monto,
            'journal_id': journal.id,
            'reparto_cobro_viaje': True,
        })
        payment.action_post()
        # El grupo Vendedor no tiene perm_write sobre reparto.viaje.parada
        # (ver ir.model.access.csv): solo Admin Operativa/Gerencia pueden
        # escribir directamente. El chofer marca su propia parada como
        # visitada a traves de esta accion controlada, igual que ya hace
        # el auto-tick de pos_order.py.
        self.sudo().write({'visitado': True})
        return partner.credito_monto_adeudado
