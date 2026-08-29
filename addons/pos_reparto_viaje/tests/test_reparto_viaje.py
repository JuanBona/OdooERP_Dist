from odoo import fields
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoViaje(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_internal = cls.env.ref('base.group_user')
        cls.group_vendedor = cls.env.ref('pos_reparto_security.group_reparto_vendedor')
        cls.group_adminop = cls.env.ref('pos_reparto_security.group_reparto_adminop')

        cls.chofer_1 = cls.env['res.users'].create({
            'name': 'Chofer Viaje Uno',
            'login': 'chofer_viaje_uno_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.chofer_2 = cls.env['res.users'].create({
            'name': 'Chofer Viaje Dos',
            'login': 'chofer_viaje_dos_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.admin_op = cls.env['res.users'].create({
            'name': 'Admin Operativa Viaje Test',
            'login': 'adminop_viaje_test',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_adminop.id])],
        })

        cls.pos_config = cls.env['pos.config'].search([], limit=1)
        assert cls.pos_config, 'Se necesita al menos un pos.config existente en la base para estos tests.'

        if not cls.pos_config.current_session_id:
            cls.pos_config.open_ui()
        cls.session = cls.pos_config.current_session_id

        # user_id (Vendedor) = chofer_1: la regla de pos_reparto_security que
        # restringe res.partner a "solo mis clientes" exige esto para que un
        # chofer pueda leer partner_id.name de las paradas de su propio viaje
        # (ver test_get_mi_viaje_hoy_devuelve_paradas_propias).
        cls.cliente_a = cls.env['res.partner'].create({'name': 'Cliente Viaje A', 'user_id': cls.chofer_1.id})
        cls.cliente_b = cls.env['res.partner'].create({'name': 'Cliente Viaje B', 'user_id': cls.chofer_1.id})

    def _crear_viaje(self, chofer, fecha, partners):
        return self.env['reparto.viaje'].create({
            'fecha': fecha,
            'chofer_id': chofer.id,
            'pos_config_id': self.pos_config.id,
            'parada_ids': [(0, 0, {'partner_id': p.id}) for p in partners],
        })

    def test_constraint_un_viaje_por_chofer_y_fecha(self):
        hoy = fields.Date.today()
        self._crear_viaje(self.chofer_1, hoy, [self.cliente_a])
        with self.assertRaises(Exception):
            self._crear_viaje(self.chofer_1, hoy, [self.cliente_b])

    def test_mismo_chofer_distinta_fecha_no_rompe_constraint(self):
        hoy = fields.Date.today()
        manana = fields.Date.add(hoy, days=1)
        self._crear_viaje(self.chofer_1, hoy, [self.cliente_a])
        viaje_2 = self._crear_viaje(self.chofer_1, manana, [self.cliente_b])
        self.assertTrue(viaje_2)

    def test_progreso_sin_paradas_es_cero(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [])
        self.assertEqual(viaje.paradas_totales, 0)
        self.assertEqual(viaje.progreso, 0.0)

    def test_progreso_computa_porcentaje_de_visitadas(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a, self.cliente_b])
        viaje.parada_ids[0].visitado = True
        self.assertEqual(viaje.paradas_totales, 2)
        self.assertEqual(viaje.paradas_completadas, 1)
        self.assertEqual(viaje.progreso, 50.0)

    def test_get_mi_viaje_hoy_sin_viaje_asignado(self):
        resultado = self.env['reparto.viaje'].with_user(self.chofer_2).get_mi_viaje_hoy()
        self.assertFalse(resultado)

    def test_get_mi_viaje_hoy_devuelve_paradas_propias(self):
        self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a, self.cliente_b])
        resultado = self.env['reparto.viaje'].with_user(self.chofer_1).get_mi_viaje_hoy()
        self.assertTrue(resultado)
        nombres = {p['partner_name'] for p in resultado['paradas']}
        self.assertEqual(nombres, {'Cliente Viaje A', 'Cliente Viaje B'})

    def test_action_abrir_pos_agrega_partner_id_a_la_url(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]
        action = parada.with_user(self.chofer_1).action_abrir_pos()
        self.assertEqual(action['type'], 'ir.actions.act_url')
        self.assertIn(f'reparto_partner_id={self.cliente_a.id}', action['url'])

    def test_chofer_no_ve_viaje_de_otro_chofer(self):
        self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_2).search([])
        self.assertFalse(viajes_vistos)

    def test_chofer_no_ve_viaje_de_otra_fecha(self):
        ayer = fields.Date.subtract(fields.Date.today(), days=1)
        self._crear_viaje(self.chofer_1, ayer, [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_1).search([])
        self.assertFalse(viajes_vistos)

    def test_chofer_ve_su_propio_viaje_de_hoy(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_1).search([])
        self.assertEqual(viajes_vistos, viaje)

    def test_admin_operativa_ve_todos_los_viajes(self):
        self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        self._crear_viaje(self.chofer_2, fields.Date.today(), [self.cliente_b])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.admin_op).search([])
        self.assertEqual(len(viajes_vistos), 2)

    def test_chofer_no_puede_crear_viaje(self):
        with self.assertRaises(Exception):
            self.env['reparto.viaje'].with_user(self.chofer_1).create({
                'fecha': fields.Date.today(),
                'chofer_id': self.chofer_1.id,
                'pos_config_id': self.pos_config.id,
            })

    def _crear_pedido(self, chofer, partner, fecha_order=None):
        return self.env['pos.order'].create({
            'session_id': self.session.id,
            'config_id': self.pos_config.id,
            'partner_id': partner.id,
            'user_id': chofer.id,
            'date_order': fecha_order or fields.Datetime.now(),
            'amount_total': 0,
            'amount_tax': 0,
            'amount_paid': 0,
            'amount_return': 0,
            'lines': [],
        })

    def test_auto_tick_marca_parada_visitada_al_crear_pedido(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]
        pedido = self._crear_pedido(self.chofer_1, self.cliente_a)
        self.assertTrue(parada.visitado)
        self.assertEqual(parada.pedido_id, pedido)

    def test_pedido_a_cliente_fuera_del_viaje_no_hace_nada(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        self._crear_pedido(self.chofer_1, self.cliente_b)
        self.assertFalse(viaje.parada_ids[0].visitado)

    def test_segundo_pedido_al_mismo_cliente_no_pisa_la_parada_ya_visitada(self):
        viaje = self._crear_viaje(self.chofer_1, fields.Date.today(), [self.cliente_a])
        parada = viaje.parada_ids[0]
        primer_pedido = self._crear_pedido(self.chofer_1, self.cliente_a)
        self._crear_pedido(self.chofer_1, self.cliente_a)
        self.assertEqual(parada.pedido_id, primer_pedido)

    def test_auto_tick_usa_fecha_del_pedido_no_fecha_de_sincronizacion(self):
        ayer = fields.Date.subtract(fields.Date.today(), days=1)
        viaje = self._crear_viaje(self.chofer_1, ayer, [self.cliente_a])
        fecha_ayer_datetime = fields.Datetime.to_datetime(ayer)
        self._crear_pedido(self.chofer_1, self.cliente_a, fecha_order=fecha_ayer_datetime)
        self.assertTrue(viaje.parada_ids[0].visitado)
