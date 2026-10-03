from datetime import date

from odoo.addons.pos_reparto_security.tests.common import TZ_AR, reloj_congelado
from odoo.tests.common import TransactionCase, tagged

HOY_AR = date(2026, 10, 3)   # 23:00 en Argentina
HOY_UTC = date(2026, 10, 4)  # 02:00 en UTC


@tagged('post_install', '-at_install')
class TestRepartoViajeTz(TransactionCase):
    """"Hoy" del viaje se calcula en la zona horaria del usuario (Argentina), no en UTC."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        grupos = [
            cls.env.ref('base.group_user').id,
            cls.env.ref('pos_reparto_security.group_reparto_vendedor').id,
        ]
        cls.chofer = cls.env['res.users'].create({
            'name': 'Chofer Tz', 'login': 'chofer_tz_test', 'tz': TZ_AR,
            'group_ids': [(6, 0, grupos)],
        })
        cls.chofer_sin_tz = cls.env['res.users'].create({
            'name': 'Chofer Sin Tz', 'login': 'chofer_sin_tz_test', 'tz': False,
            'group_ids': [(6, 0, grupos)],
        })
        cls.pos_config = cls.env['pos.config'].search([], limit=1)
        cls.cliente = cls.env['res.partner'].create({
            'name': 'Cliente Tz', 'user_id': cls.chofer.id,
        })
        cls.cliente_sin_tz = cls.env['res.partner'].create({
            'name': 'Cliente Sin Tz', 'user_id': cls.chofer_sin_tz.id,
        })

    def _viaje(self, chofer, fecha, cliente):
        return self.env['reparto.viaje'].create({
            'fecha': fecha, 'chofer_id': chofer.id,
            'pos_config_id': self.pos_config.id,
            'parada_ids': [(0, 0, {'partner_id': cliente.id})],
        })

    def test_viaje_de_hoy_a_las_23hs_argentina(self):
        viaje = self._viaje(self.chofer, HOY_AR, self.cliente)
        with reloj_congelado():
            datos = self.env['reparto.viaje'].with_user(self.chofer).get_mi_viaje_hoy()
        self.assertTrue(datos, 'A las 23hs AR el chofer debe ver el viaje del día de hoy (AR)')
        self.assertEqual(datos['id'], viaje.id)
        self.assertEqual(datos['fecha'], '2026-10-03')

    def test_viaje_de_manana_utc_no_es_hoy_para_el_chofer(self):
        self._viaje(self.chofer, HOY_UTC, self.cliente)
        with reloj_congelado():
            datos = self.env['reparto.viaje'].with_user(self.chofer).get_mi_viaje_hoy()
        self.assertFalse(datos, 'El viaje del 4/10 todavía no es "hoy" a las 23hs del 3/10 AR')

    def test_regla_del_vendedor_ve_el_viaje_de_hoy_ar(self):
        viaje = self._viaje(self.chofer, HOY_AR, self.cliente)
        with reloj_congelado():
            visibles = self.env['reparto.viaje'].with_user(self.chofer).search([('id', '=', viaje.id)])
        self.assertEqual(visibles, viaje)

    def test_fecha_por_defecto_en_tz_del_usuario(self):
        with reloj_congelado():
            fecha = self.env['reparto.viaje'].with_user(self.chofer).default_get(['fecha'])['fecha']
        self.assertEqual(fecha, HOY_AR)

    def test_usuario_sin_tz_cae_en_utc(self):
        """Documenta el riesgo que cubre la tz única: sin tz el 'hoy' salta al día siguiente."""
        with reloj_congelado():
            fecha = self.env['reparto.viaje'].with_user(self.chofer_sin_tz).default_get(['fecha'])['fecha']
        self.assertEqual(fecha, HOY_UTC)

    def test_usuarios_nuevos_heredan_la_tz_por_defecto(self):
        """El default de res.partner.tz (fijado por carga_inicial) lo hereda todo usuario nuevo."""
        self.env['ir.default'].set('res.partner', 'tz', TZ_AR)
        nuevo = self.env['res.users'].create({'name': 'Nuevo Tz', 'login': 'nuevo_tz_test'})
        self.assertEqual(nuevo.tz, TZ_AR)

    def test_nombre_legible_del_viaje(self):
        viaje = self._viaje(self.chofer, HOY_AR, self.cliente)
        self.assertEqual(viaje.display_name, 'Chofer Tz - 2026-10-03')
