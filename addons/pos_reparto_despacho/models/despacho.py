from odoo import _, api, fields, models

PICKING_PENDIENTE = ('confirmed', 'waiting', 'assigned', 'partially_available')


class RepartoDespacho(models.Model):
    _name = 'reparto.despacho'
    _description = 'Listado de despacho'
    _order = 'fecha desc, id desc'

    name = fields.Char(string='Número', readonly=True, copy=False, default=lambda self: _('Nuevo'))
    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)
    state = fields.Selection(
        [('borrador', 'Borrador'), ('confirmado', 'Confirmado')],
        string='Estado', default='borrador', required=True, readonly=True, copy=False)
    pedido_ids = fields.One2many('pos.order', 'despacho_id', string='Pedidos despachados', readonly=True)
    numero_del_dia = fields.Integer(string='Nº del día', readonly=True, copy=False)
    es_complementario = fields.Boolean(string='Complementario', compute='_compute_es_complementario', store=True)
    confirmado_por = fields.Many2one('res.users', string='Confirmado por', readonly=True, copy=False)
    confirmado_el = fields.Datetime(string='Confirmado el', readonly=True, copy=False)

    @api.depends('numero_del_dia')
    def _compute_es_complementario(self):
        for despacho in self:
            despacho.es_complementario = despacho.numero_del_dia > 1

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('name') or vals['name'] == _('Nuevo'):
                vals['name'] = self.env['ir.sequence'].next_by_code('reparto.despacho') or _('Nuevo')
        return super().create(vals_list)

    def _pedidos_pendientes(self):
        """Pedidos con picking sin validar, sin despacho, cuya fecha de salida es <= a la del listado.
        Usa sudo: Depósito no tiene acceso de lectura a pos.order."""
        self.ensure_one()
        pedidos = self.env['pos.order'].sudo().search([
            ('despacho_id', '=', False),
            ('picking_ids.state', 'in', PICKING_PENDIENTE),
        ], order='date_order, id')
        return pedidos.filtered(lambda p: p._reparto_fecha_despacho() <= self.fecha)
