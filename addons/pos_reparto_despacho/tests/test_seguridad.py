from odoo.exceptions import AccessError
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestSeguridadDespacho(DespachoCase):

    def _usuario(self, nombre, grupo_xmlid):
        return self.env['res.users'].create({
            'name': nombre,
            'login': nombre.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id, self.env.ref(grupo_xmlid).id])],
        })

    def test_vendedor_no_puede_leer_despachos(self):
        vendedor = self._usuario('Vendedor Despacho', 'pos_reparto_security.group_reparto_vendedor')
        despacho = self.env['reparto.despacho'].create({})
        with self.assertRaises(AccessError):
            despacho.with_user(vendedor).check_access('read')

    def test_deposito_puede_crear_despachos(self):
        deposito = self._usuario('Deposito Despacho', 'pos_reparto_security.group_reparto_deposito')
        despacho = self.env['reparto.despacho'].with_user(deposito).create({})
        self.assertEqual(despacho.state, 'borrador')

    def test_gerencia_y_adminop_pueden_crear_despachos(self):
        for grupo in ('group_reparto_gerencia', 'group_reparto_adminop'):
            usuario = self._usuario('Usuario ' + grupo, 'pos_reparto_security.' + grupo)
            self.env['reparto.despacho'].with_user(usuario).create({})
