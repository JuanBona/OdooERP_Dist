from datetime import date, datetime

from odoo.addons.pos_reparto_security.tests.common import TZ_AR, reloj_congelado
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestDespachoTz(DespachoCase):
    """El día de despacho es el día de Argentina, no el de UTC."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user_ar = cls.env['res.users'].create({
            'name': 'Usuario AR Despacho', 'login': 'usuario_ar_despacho_test', 'tz': TZ_AR,
        })

    def test_pedido_de_las_22hs_argentina_sale_el_mismo_dia_ar(self):
        # 01:30 UTC del 4/10 = 22:30 del 3/10 en Argentina
        pedido = self._crear_pedido(
            self.config1, self.session1, self.cliente1, [(self.producto_a, 1, 100.0)],
            date_order=datetime(2026, 10, 4, 1, 30, 0))
        self.assertEqual(pedido.with_user(self.user_ar).sudo()._reparto_fecha_despacho(), date(2026, 10, 3))

    def test_pedido_ship_later_usa_la_fecha_de_entrega(self):
        pedido = self._crear_pedido(
            self.config1, self.session1, self.cliente1, [(self.producto_a, 1, 100.0)],
            date_order=datetime(2026, 10, 4, 1, 30, 0))
        pedido.shipping_date = date(2026, 10, 7)
        self.assertEqual(pedido.with_user(self.user_ar).sudo()._reparto_fecha_despacho(), date(2026, 10, 7))

    def test_fecha_del_listado_por_defecto_es_la_de_argentina(self):
        with reloj_congelado():
            fecha = self.env['reparto.despacho'].with_user(self.user_ar).sudo().default_get(['fecha'])['fecha']
        self.assertEqual(fecha, date(2026, 10, 3))
