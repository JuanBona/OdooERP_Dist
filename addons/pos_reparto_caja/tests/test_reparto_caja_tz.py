from datetime import date

from odoo.addons.pos_reparto_security.tests.common import TZ_AR, reloj_congelado
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoCajaTz(TransactionCase):
    """Gastos y rendiciones se fechan con el día de Argentina."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_ar = cls.env['res.users'].create({
            'name': 'Usuario AR Caja', 'login': 'usuario_ar_caja_test', 'tz': TZ_AR,
        })

    def test_fecha_por_defecto_del_gasto_es_la_de_argentina(self):
        with reloj_congelado():
            fecha = self.env['reparto.caja.gasto'].with_user(self.user_ar).default_get(['fecha'])['fecha']
        self.assertEqual(fecha, date(2026, 10, 3))

    def test_fecha_por_defecto_de_la_rendicion_es_la_de_argentina(self):
        with reloj_congelado():
            fecha = self.env['reparto.caja.rendicion'].with_user(self.user_ar).default_get(['fecha'])['fecha']
        self.assertEqual(fecha, date(2026, 10, 3))
