from odoo import fields, models


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _reparto_cobros_viaje(self):
        """Deudas cobradas hoy desde Viaje por los choferes de este camion, por medio de pago.

        No son ventas del punto de venta, asi que la caja no las espera en el conteo: se informan en
        el cierre para que el chofer no mezcle esa plata, que se controla aparte en la Rendicion."""
        self.ensure_one()
        choferes = self.env['res.users'].sudo().search(
            [('reparto_camion_asignado_id', '=', self.config_id.id)]) | self.user_id
        pagos = self.env['account.payment'].sudo().search([
            ('reparto_cobro_viaje', '=', True),
            ('create_uid', 'in', choferes.ids),
            ('date', '=', fields.Date.context_today(self)),
            ('state', '!=', 'canceled'),
        ])
        efectivo = sum(pagos.filtered(lambda p: p.journal_id.type == 'cash').mapped('amount'))
        return {'efectivo': efectivo, 'transferencia': sum(pagos.mapped('amount')) - efectivo}

    def get_closing_control_data(self):
        datos = super().get_closing_control_data()
        datos['reparto_cobros_viaje'] = self._reparto_cobros_viaje()
        return datos
