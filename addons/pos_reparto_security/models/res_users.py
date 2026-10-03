from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    reparto_camion_asignado_id = fields.Many2one(
        'pos.config',
        string='Camión asignado (Reparto)',
        help='Para vendedores: el único POS de camión que puede abrir. '
             'Vacío = no puede abrir ningún camión.',
    )

    def _get_invalidation_fields(self):
        # La regla de pos.config/pos.session depende de este campo y Odoo
        # cachea el dominio de las reglas por usuario: sin esto, reasignar el
        # camion no tiene efecto hasta reiniciar el servidor.
        return super()._get_invalidation_fields() | {'reparto_camion_asignado_id'}
