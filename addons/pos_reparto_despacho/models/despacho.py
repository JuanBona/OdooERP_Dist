import io

import xlsxwriter

from odoo import _, api, fields, models
from odoo.exceptions import UserError

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

    resumen_html = fields.Html(string='Resumen', compute='_compute_resumen_html', sanitize=False)

    @api.depends('fecha', 'state')
    def _compute_resumen_html(self):
        for despacho in self:
            despacho.resumen_html = self.env['ir.qweb']._render(
                'pos_reparto_despacho.despacho_tablas', {'datos': despacho._datos_listado()})

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
            ('config_id.reparto_despacho_diferido', '=', True),
            ('picking_ids.state', 'in', PICKING_PENDIENTE),
        ], order='date_order, id')
        return pedidos.filtered(lambda p: p._reparto_fecha_despacho() <= self.fecha)

    def action_confirmar(self):
        """Valida los pickings de los pedidos pendientes (descuenta el stock) y cierra el listado.
        Idempotente: sobre un despacho ya confirmado solo devuelve el reporte."""
        self.ensure_one()
        # Un solo confirmador a la vez: evita que dos listados validen los mismos pickings.
        self.env.cr.execute("SELECT pg_advisory_xact_lock(hashtext('reparto_despacho_confirmar'))")
        self.env.invalidate_all()
        if self.state == 'confirmado':
            return self.action_imprimir()
        pedidos = self._pedidos_pendientes()
        if not pedidos:
            raise UserError(_("No hay pedidos pendientes de despachar hasta el %s.", self.fecha))
        pickings = pedidos.picking_ids.filtered(lambda p: p.state in PICKING_PENDIENTE)
        pickings.with_context(
            skip_immediate=True, skip_backorder=True, skip_sms=True, skip_expired=True,
        ).button_validate()
        sin_validar = pickings.filtered(lambda p: p.state != 'done')
        if sin_validar:
            raise UserError(_(
                "No se pudo validar el picking de: %s. Revisá el stock y volvé a intentar.",
                ', '.join(sin_validar.mapped('origin')),
            ))
        pedidos.write({'despacho_id': self.id})
        numero = self.search_count([
            ('fecha', '=', self.fecha), ('state', '=', 'confirmado'), ('id', '!=', self.id),
        ]) + 1
        self.write({
            'state': 'confirmado',
            'numero_del_dia': numero,
            'confirmado_por': self.env.uid,
            'confirmado_el': fields.Datetime.now(),
        })
        return self.action_imprimir()

    def action_imprimir(self):
        self.ensure_one()
        return self.env.ref('pos_reparto_despacho.action_report_despacho').report_action(self)

    def _pedidos_listado(self):
        """Confirmado: los pedidos que despachó. Borrador: los que despacharía hoy."""
        self.ensure_one()
        pedidos = self.pedido_ids if self.state == 'confirmado' else self._pedidos_pendientes()
        return pedidos.sudo()

    def _datos_listado(self):
        """Estructura común para el PDF, el Excel y el resumen de pantalla."""
        self.ensure_one()
        pedidos = self._pedidos_listado()
        viajes = self.env['reparto.viaje'].sudo().search([('fecha', '=', self.fecha)])
        chofer_por_config = {v.pos_config_id.id: v.chofer_id.name for v in viajes}
        por_camion, por_cliente = {}, {}
        for pedido in pedidos:
            config = pedido.config_id
            camion = por_camion.setdefault(
                config.id, {'nombre': config.name, 'chofer': chofer_por_config.get(config.id, ''), 'productos': {}})
            partner = pedido.partner_id
            cliente = por_cliente.setdefault(
                partner.id, {'nombre': partner.name or _('Sin cliente'), 'camiones': set(), 'productos': {}})
            cliente['camiones'].add(config.name)
            for linea in pedido.lines:
                nombre = linea.product_id.display_name
                camion['productos'][nombre] = camion['productos'].get(nombre, 0.0) + linea.qty
                cliente['productos'][nombre] = cliente['productos'].get(nombre, 0.0) + linea.qty
        return {
            'por_camion': [
                {'nombre': c['nombre'], 'chofer': c['chofer'],
                 'productos': sorted(c['productos'].items()), 'total': sum(c['productos'].values())}
                for c in sorted(por_camion.values(), key=lambda c: c['nombre'])
            ],
            'por_cliente': [
                {'nombre': c['nombre'], 'camiones': ', '.join(sorted(c['camiones'])),
                 'productos': sorted(c['productos'].items()), 'total': sum(c['productos'].values())}
                for c in sorted(por_cliente.values(), key=lambda c: c['nombre'])
            ],
        }

    def unlink(self):
        if any(despacho.state == 'confirmado' for despacho in self):
            raise UserError(_("Un despacho confirmado no se puede borrar: ya movió stock."))
        return super().unlink()

    def _generar_xlsx(self):
        self.ensure_one()
        datos = self._datos_listado()
        salida = io.BytesIO()
        libro = xlsxwriter.Workbook(salida, {'in_memory': True})
        negrita = libro.add_format({'bold': True})

        hoja = libro.add_worksheet('Por camión')
        fila = 0
        for camion in datos['por_camion']:
            titulo = camion['nombre'] + (' — Chofer: %s' % camion['chofer'] if camion['chofer'] else '')
            hoja.write(fila, 0, titulo, negrita)
            hoja.write(fila, 1, 'Cantidad', negrita)
            fila += 1
            for producto, qty in camion['productos']:
                hoja.write(fila, 0, producto)
                hoja.write(fila, 1, qty)
                fila += 1
            hoja.write(fila, 0, 'Total unidades', negrita)
            hoja.write(fila, 1, camion['total'], negrita)
            fila += 2
        hoja.set_column(0, 0, 45)

        hoja = libro.add_worksheet('Por cliente')
        fila = 0
        for cliente in datos['por_cliente']:
            hoja.write(fila, 0, '%s (%s)' % (cliente['nombre'], cliente['camiones']), negrita)
            hoja.write(fila, 1, 'Cantidad', negrita)
            fila += 1
            for producto, qty in cliente['productos']:
                hoja.write(fila, 0, producto)
                hoja.write(fila, 1, qty)
                fila += 1
            fila += 1
        hoja.set_column(0, 0, 45)

        libro.close()
        return salida.getvalue()

    def action_descargar_xlsx(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_url', 'url': '/pos_reparto_despacho/xlsx/%d' % self.id, 'target': 'self'}
