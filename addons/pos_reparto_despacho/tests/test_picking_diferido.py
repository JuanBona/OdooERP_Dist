from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestPickingDiferido(DespachoCase):

    def test_camion_diferido_no_descuenta_stock_al_vender(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        self.assertTrue(pedido.picking_ids, "El pedido debe tener su picking (stock comprometido)")
        self.assertNotIn(pedido.picking_ids.state, ('done', 'cancel'))
        self.assertEqual(self._stock(self.producto_a), 50.0)

    def test_config_no_diferida_descuenta_como_siempre(self):
        self.config1.reparto_despacho_diferido = False
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        self.assertEqual(pedido.picking_ids.state, 'done')
        self.assertEqual(self._stock(self.producto_a), 47.0)

    def test_config_nueva_no_difiere_por_defecto(self):
        self.assertFalse(self.env['pos.config'].create({'name': 'X'}).reparto_despacho_diferido)

    def test_picking_de_cierre_de_sesion_no_se_difiere(self):
        # update_stock_at_closing: el core arma el picking con las líneas de toda la sesión,
        # sin pasar por _create_order_picking. Ese picking no tiene dueño: debe validarse.
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        picking_type = self.config1.picking_type_id
        picking = self.env['stock.picking']._create_picking_from_pos_order_lines(
            picking_type.default_location_dest_id.id, pedido.lines, picking_type)
        self.assertEqual(picking.state, 'done')
        self.assertEqual(self._stock(self.producto_a), 47.0)

    def test_picking_diferido_se_puede_validar_despues_y_descuenta(self):
        pedido = self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        self.assertEqual(self._stock(self.producto_a), 50.0)
        pedido.picking_ids.with_context(skip_immediate=True, skip_backorder=True, skip_sms=True).button_validate()
        self.assertEqual(pedido.picking_ids.state, 'done')
        self.assertEqual(self._stock(self.producto_a), 47.0)
