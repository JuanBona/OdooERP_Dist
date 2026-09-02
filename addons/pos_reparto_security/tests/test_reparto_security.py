from odoo.exceptions import AccessError
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoSecurity(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_vendedor = cls.env.ref('pos_reparto_security.group_reparto_vendedor')
        cls.group_internal = cls.env.ref('base.group_user')
        cls.group_pos_user = cls.env.ref('point_of_sale.group_pos_user')

        cls.vendedor_1 = cls.env['res.users'].create({
            'name': 'Vendedor Uno',
            'login': 'vendedor_uno_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id, cls.group_pos_user.id])],
        })
        cls.vendedor_2 = cls.env['res.users'].create({
            'name': 'Vendedor Dos',
            'login': 'vendedor_dos_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id, cls.group_pos_user.id])],
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

    def test_vendedor_puede_leer_su_propio_contacto(self):
        # res.users.name (y otros campos) son related a partner_id.* -- si
        # esta regla no deja leer el res.partner propio del vendedor cuando
        # nadie lo puso como "Salesperson" de si mismo (caso normal: ese
        # campo es para clientes asignados, no para la propia ficha), toda
        # lectura de res.users para ese usuario se rompe en cascada (afecta
        # por ejemplo abrir una sesion de POS, que necesita leer el cashier
        # actual via res.users).
        self.assertFalse(self.vendedor_1.partner_id.user_id)
        contacto_propio = self.env['res.partner'].with_user(self.vendedor_1).browse(self.vendedor_1.partner_id.id)
        self.assertEqual(contacto_propio.name, 'Vendedor Uno')

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

    def test_vendedor_no_puede_crear_clientes(self):
        with self.assertRaises(AccessError):
            self.env['res.partner'].with_user(self.vendedor_1).create({
                'name': 'Cliente Nuevo Intentado Por Vendedor',
            })

    def test_vendedor_no_puede_editar_ni_su_propio_cliente(self):
        partner_1 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor 1',
            'user_id': self.vendedor_1.id,
        })
        with self.assertRaises(AccessError):
            partner_1.with_user(self.vendedor_1).write({'phone': '123456'})

    def test_vendedor_no_puede_editar_ni_con_otro_grupo_que_de_permiso_de_escritura(self):
        # Prueba que el bloqueo de escritura es real (domain imposible en
        # rule_reparto_partner_vendedor_no_write), no una casualidad de que
        # el ACL base de group_user deniegue write -- si a un vendedor se le
        # suma en el futuro un grupo que SI de permiso de escritura sobre
        # res.partner (ej. Contact Creation), la regla de este modulo debe
        # seguir bloqueando igual.
        group_partner_manager = self.env.ref('base.group_partner_manager')
        vendedor_con_permiso_extra = self.env['res.users'].create({
            'name': 'Vendedor Con Permiso Extra',
            'login': 'vendedor_permiso_extra_test',
            'group_ids': [(6, 0, [self.group_internal.id, self.group_vendedor.id, group_partner_manager.id])],
        })
        partner_1 = self.env['res.partner'].create({
            'name': 'Cliente de Vendedor Con Permiso Extra',
            'user_id': vendedor_con_permiso_extra.id,
        })
        with self.assertRaises(AccessError):
            partner_1.with_user(vendedor_con_permiso_extra).write({'phone': '123456'})

    def test_vendedor_ve_solo_sus_propios_pedidos_pos(self):
        order_1 = self._create_minimal_pos_order(self.vendedor_1)
        order_2 = self._create_minimal_pos_order(self.vendedor_2)

        found_by_vendedor_1 = self.env['pos.order'].with_user(self.vendedor_1).search([
            ('id', 'in', [order_1.id, order_2.id]),
        ])
        self.assertEqual(found_by_vendedor_1, order_1)

    def test_vendedor_no_puede_borrar_pedido_de_otro_vendedor(self):
        order_de_vendedor_2 = self._create_minimal_pos_order(self.vendedor_2, state='cancel')

        with self.assertRaises(AccessError):
            order_de_vendedor_2.with_user(self.vendedor_1).unlink()

    def _create_minimal_pos_order(self, user, state='draft'):
        # pos.order.create() exige vals['session_id'] de una sesion abierta
        # (ver PosOrder._complete_values_from_session en point_of_sale) --
        # armar una sesion completa es innecesario para un test de regla de
        # acceso, asi que se inserta la fila directo por SQL con las
        # columnas NOT NULL reales de la tabla (company_id, name,
        # amount_tax, amount_total, amount_paid, amount_return). state se
        # fija explicito porque el default 'draft' lo aplica el ORM en
        # create(), no el schema -- sin esto quedaria NULL.
        self.env.cr.execute(
            """
            INSERT INTO pos_order (company_id, name, amount_tax, amount_total, amount_paid, amount_return, user_id, state)
            VALUES (%s, %s, 0, 0, 0, 0, %s, %s)
            RETURNING id
            """,
            (self.env.company.id, 'Test Order', user.id, state),
        )
        order_id = self.env.cr.fetchone()[0]
        return self.env['pos.order'].browse(order_id)
