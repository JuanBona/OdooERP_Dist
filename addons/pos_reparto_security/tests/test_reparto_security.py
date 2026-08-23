from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoSecurity(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_vendedor = cls.env.ref('pos_reparto_security.group_reparto_vendedor')
        cls.group_internal = cls.env.ref('base.group_user')

        cls.vendedor_1 = cls.env['res.users'].create({
            'name': 'Vendedor Uno',
            'login': 'vendedor_uno_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.vendedor_2 = cls.env['res.users'].create({
            'name': 'Vendedor Dos',
            'login': 'vendedor_dos_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.usuario_sin_rol = cls.env['res.users'].create({
            'name': 'Usuario Sin Rol',
            'login': 'sin_rol_test',
            'group_ids': [(6, 0, [cls.group_internal.id])],
        })

    def test_vendedor_ve_solo_sus_propios_clientes(self):
        partner_1 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 1',
            'user_id': self.vendedor_1.id,
        })
        partner_2 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 2',
            'user_id': self.vendedor_2.id,
        })

        found_by_vendedor_1 = self.env['res.partner'].with_user(self.vendedor_1).search([
            ('id', 'in', [partner_1.id, partner_2.id]),
        ])
        self.assertEqual(found_by_vendedor_1, partner_1)

        found_by_vendedor_2 = self.env['res.partner'].with_user(self.vendedor_2).search([
            ('id', 'in', [partner_1.id, partner_2.id]),
        ])
        self.assertEqual(found_by_vendedor_2, partner_2)

    def test_usuario_sin_grupo_vendedor_ve_todos_los_clientes(self):
        partner_1 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 1',
            'user_id': self.vendedor_1.id,
        })
        partner_2 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 2',
            'user_id': self.vendedor_2.id,
        })

        found = self.env['res.partner'].with_user(self.usuario_sin_rol).search([
            ('id', 'in', [partner_1.id, partner_2.id]),
        ])
        self.assertEqual(found, partner_1 | partner_2)
