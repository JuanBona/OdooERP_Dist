from odoo import fields
from odoo.exceptions import UserError
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestConfirmarDespacho(DespachoCase):

    def _despacho(self):
        return self.env['reparto.despacho'].create({'fecha': fields.Date.context_today(self.env.user)})

    def test_confirmar_descuenta_stock_y_marca_pedidos(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        despacho = self._despacho()
        despacho.action_confirmar()
        self.assertEqual(despacho.state, 'confirmado')
        self.assertEqual(pedido.despacho_id, despacho)
        self.assertEqual(pedido.picking_ids.state, 'done')
        self.assertEqual(self._stock(self.producto_a), 47.0)

    def test_confirmar_dos_veces_no_descuenta_dos_veces(self):
        self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        despacho = self._despacho()
        despacho.action_confirmar()
        despacho.action_confirmar()
        self.assertEqual(self._stock(self.producto_a), 47.0)

    def test_confirmar_sin_pedidos_pendientes_falla(self):
        with self.assertRaises(UserError):
            self._despacho().action_confirmar()

    def test_complementario_toma_solo_pedidos_nuevos(self):
        primero = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 2.0, 100.0)])
        d1 = self._despacho()
        d1.action_confirmar()
        segundo = self._crear_pedido(self.config2, self.session2, self.cliente2, [(self.producto_b, 4.0, 100.0)])
        d2 = self._despacho()
        d2.action_confirmar()
        self.assertEqual(d1.pedido_ids, primero)
        self.assertEqual(d2.pedido_ids, segundo)
        self.assertFalse(d1.es_complementario)
        self.assertTrue(d2.es_complementario)
        self.assertEqual(d2.numero_del_dia, 2)
        self.assertEqual(self._stock(self.producto_a), 48.0)
        self.assertEqual(self._stock(self.producto_b), 46.0)

    def test_confirmar_con_faltante_no_valida_nada(self):
        completo = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_b, 2.0, 100.0)])
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente2, [(self.producto_a, 4.0, 100.0)])
        pedido.picking_ids.move_ids.quantity = 2.0
        despacho = self._despacho()
        with self.assertRaises(UserError):
            despacho.action_confirmar()
        self.assertEqual(despacho.state, 'borrador')
        self.assertNotEqual(completo.picking_ids.state, 'done')
        self.assertEqual(self._stock(self.producto_a), 50.0)
        self.assertEqual(self._stock(self.producto_b), 50.0)

    def test_no_se_puede_borrar_un_despacho_confirmado(self):
        self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 1.0, 100.0)])
        despacho = self._despacho()
        despacho.action_confirmar()
        with self.assertRaises(UserError):
            despacho.unlink()
