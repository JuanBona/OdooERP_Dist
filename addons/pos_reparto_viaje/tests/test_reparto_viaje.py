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

        cls.cliente_a = cls.env['res.partner'].create({'name': 'Cliente Viaje A'})
        cls.cliente_b = cls.env['res.partner'].create({'name': 'Cliente Viaje B'})

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
