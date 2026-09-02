from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    reparto_comision_pct = fields.Float(
        string='% Comisión (Reparto)',
        groups='pos_reparto_security.group_reparto_gerencia',
        help='Porcentaje fijo de comisión sobre lo que se le cobra a los '
             'clientes asignados a este vendedor.',
    )
