from odoo import fields, models
from odoo.exceptions import AccessError

# Lo unico que Gerencia puede escribir en un usuario (ver write): el resto sigue siendo del administrador.
CAMPOS_GERENCIA = {'reparto_comision_pct', 'reparto_es_externo'}


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

    def write(self, vals):
        # Gerencia tiene permiso de escritura sobre res.users solo para cargar el % de comision y la
        # marca de externo desde el menu Vendedores. Sin esta traba, ese permiso le dejaria cambiar
        # claves, camiones o grupos (incluido darse permisos de administrador).
        usuario = self.env.user
        if (not self.env.su and usuario.has_group('pos_reparto_security.group_reparto_gerencia')
                and not usuario.has_group('base.group_system')):
            permitidos = set(CAMPOS_GERENCIA)
            if self == usuario:
                permitidos |= set(self.SELF_WRITEABLE_FIELDS)
            if set(vals) - permitidos:
                raise AccessError('Gerencia solo puede cargar el % de comisión y la marca de vendedor externo.')
        return super().write(vals)

    def _reparto_comision_pct_efectivo(self):
        """% de comisión a congelar en una línea nueva: 0 para un vendedor externo.
        Leer reparto_comision_pct exige sudo (es un campo de Gerencia): llamar como user.sudo()."""
        self.ensure_one()
        return 0.0 if self.reparto_es_externo else self.reparto_comision_pct
