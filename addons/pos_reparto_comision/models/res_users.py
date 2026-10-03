from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    reparto_comision_pct = fields.Float(
        string='% Comisión (Reparto)',
        groups='pos_reparto_security.group_reparto_gerencia',
        help='Porcentaje fijo de comisión sobre lo que se le cobra a los '
             'clientes asignados a este vendedor.',
    )
    # Sin restricción de grupo: pos_reparto_caja lo usa en dominios que ejecuta Administración.
    reparto_es_externo = fields.Boolean(
        string='Vendedor externo (sin comisión ni rendición)',
        help='Vendedor que no usa camión ni POS propio. Administración carga y cobra por sus '
             'clientes: no genera comisión ni pasa por Rendición, y lo que cobra suma directo '
             'al saldo de Cajas.',
    )

    def _reparto_comision_pct_efectivo(self):
        """% de comisión a congelar en una línea nueva: 0 para un vendedor externo.
        Leer reparto_comision_pct exige sudo (es un campo de Gerencia): llamar como user.sudo()."""
        self.ensure_one()
        return 0.0 if self.reparto_es_externo else self.reparto_comision_pct
