from odoo import api, models

CAMPOS_CREDITO_REPARTO = [
    'credito_monto_adeudado',
    'credito_fecha_pedido_mas_viejo',
    'credito_fecha_ultimo_pago',
    'credito_dias_sin_pago',
]


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    def _partners_credito_reparto(self):
        # No filtramos por parent_state/posted: cuando el asiento pasa de
        # borrador a posteado, ese cambio de estado llega via el related
        # field parent_state (compute del propio ORM, no un write() sobre
        # esta linea), asi que este metodo nunca lo veria igual. Alcanza
        # con marcar el partner en cualquier alta/baja/edicion de linea de
        # cuenta por cobrar: el compute de res.partner ya filtra por
        # parent_state='posted' al leer, asi que una linea todavia en
        # borrador simplemente no suma deuda hasta que se postee de verdad.
        return self.filtered(
            lambda l: l.partner_id and l.account_type == 'asset_receivable'
        ).partner_id

    def _marcar_partners_credito_a_recalcular(self, partners):
        if not partners:
            return
        for nombre in CAMPOS_CREDITO_REPARTO:
            self.env.add_to_compute(partners._fields[nombre], partners)

    @api.model_create_multi
    def create(self, vals_list):
        lines = super().create(vals_list)
        lines._marcar_partners_credito_a_recalcular(lines._partners_credito_reparto())
        return lines

    def write(self, vals):
        partners_antes = self._partners_credito_reparto()
        res = super().write(vals)
        partners_despues = self._partners_credito_reparto()
        self._marcar_partners_credito_a_recalcular(partners_antes | partners_despues)
        return res

    def unlink(self):
        partners = self._partners_credito_reparto()
        res = super().unlink()
        self._marcar_partners_credito_a_recalcular(partners)
        return res
