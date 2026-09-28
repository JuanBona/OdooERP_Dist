from odoo import fields
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestResumen(DespachoCase):

    def test_resumen_html_muestra_lo_que_se_despacharia(self):
        self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        despacho = self.env['reparto.despacho'].create({'fecha': fields.Date.context_today(self.env.user)})
        self.assertIn('Producto A Despacho', str(despacho.resumen_html))
        self.assertIn('Cliente 1 Despacho', str(despacho.resumen_html))
