from odoo.exceptions import UserError
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestComprometido(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.config = cls.env['pos.config'].create({'name': 'Camión Test Comprometido'})
        cls.session = cls.env['pos.session'].create({'config_id': cls.config.id})
        cls.location = cls.config.picking_type_id.default_location_src_id
        cls.producto = cls.env['product.product'].create({
            'name': 'Producto Test Comprometido', 'type': 'consu',
            'is_storable': True, 'available_in_pos': True, 'list_price': 100.0,
        })
        cls.env['stock.quant']._update_available_quantity(cls.producto, cls.location, 10.0)
        cls.pedido_previo = cls.env['pos.order'].create({
            'session_id': cls.session.id,
            'lines': [(0, 0, {'product_id': cls.producto.id, 'qty': 1, 'price_unit': 100.0,
                              'price_subtotal': 100.0, 'price_subtotal_incl': 100.0})],
            'amount_total': 100.0, 'amount_tax': 0.0, 'amount_paid': 0.0, 'amount_return': 0.0,
        })
        picking = cls.env['stock.picking'].create({
            'picking_type_id': cls.config.picking_type_id.id,
            'location_id': cls.location.id,
            'location_dest_id': cls.env.ref('stock.stock_location_customers').id,
            'pos_order_id': cls.pedido_previo.id,
        })
        move = cls.env['stock.move'].create({
            'product_id': cls.producto.id, 'product_uom_qty': 4.0,
            'product_uom': cls.producto.uom_id.id,
            'location_id': cls.location.id,
            'location_dest_id': picking.location_dest_id.id,
            'picking_id': picking.id,
        })
        move._action_confirm()

    def _payload(self, qty):
        return {
            'session_id': self.session.id,
            'lines': [(0, 0, {'product_id': self.producto.id, 'qty': qty, 'price_unit': 1.0})],
        }

    def test_comprometido_suma_pickings_pendientes_de_pedidos_pos(self):
        res = self.producto._reparto_comprometido(self.location)
        self.assertEqual(res.get(self.producto.id), 4.0)

    def test_guard_bloquea_si_lo_comprometido_deja_sin_stock(self):
        # 10 fisicos - 4 comprometidos = 6 libres: pedir 7 debe bloquear
        with self.assertRaises(UserError):
            self.env['pos.order']._check_stock_availability(self._payload(7.0))

    def test_guard_permite_hasta_el_stock_libre(self):
        self.env['pos.order']._check_stock_availability(self._payload(6.0))
