from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    reparto_camion_asignado_id = fields.Many2one(
        'pos.config',
        string='Camión asignado (Reparto)',
        help='Para vendedores: el único POS de camión que puede abrir. '
             'Vacío = no puede abrir ningún camión.',
    )
