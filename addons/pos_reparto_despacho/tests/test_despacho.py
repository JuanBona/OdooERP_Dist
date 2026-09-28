from datetime import timedelta

from odoo import fields
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestSeleccionPedidos(DespachoCase):

    def _despacho(self, fecha=None):
        return self.env['reparto.despacho'].create({'fecha': fecha or fields.Date.context_today(self.env.user)})

    def test_numero_secuencial(self):
        despacho = self._despacho()
        self.assertTrue(despacho.name.startswith('DESP/'))
        self.assertEqual(despacho.state, 'borrador')

    def test_pendientes_incluye_pedidos_con_picking_sin_despachar(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 1.0, 100.0)])
        despacho = self._despacho()
        self.assertIn(pedido, despacho._pedidos_pendientes())

    def test_pendientes_excluye_pedidos_de_fecha_posterior(self):
        manana = fields.Datetime.now() + timedelta(days=2)
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1,
                                    [(self.producto_a, 1.0, 100.0)], date_order=manana)
        despacho = self._despacho()
        self.assertNotIn(pedido, despacho._pedidos_pendientes())

    def test_pendientes_incluye_atrasados(self):
        ayer = fields.Datetime.now() - timedelta(days=3)
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1,
                                    [(self.producto_a, 1.0, 100.0)], date_order=ayer)
        despacho = self._despacho()
        self.assertIn(pedido, despacho._pedidos_pendientes())

    def test_pendientes_excluye_pedidos_ya_despachados(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 1.0, 100.0)])
        otro = self._despacho()
        pedido.sudo().despacho_id = otro
        self.assertNotIn(pedido, self._despacho()._pedidos_pendientes())
