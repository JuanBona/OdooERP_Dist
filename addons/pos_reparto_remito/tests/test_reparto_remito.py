from unittest.mock import patch

from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoRemito(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pos_config = cls.env['pos.config'].create({'name': 'Camión Test'})
        cls.pos_session = cls.env['pos.session'].create({
            'config_id': cls.pos_config.id,
        })
        cls.product = cls.env['product.product'].create({
            'name': 'Producto Test',
            'type': 'consu',
            'list_price': 100.0,
            'available_in_pos': True,
        })
        cls.partner_con_email = cls.env['res.partner'].create({
            'name': 'Cliente Con Email',
            'email': 'cliente@test.com',
        })
        cls.partner_sin_email = cls.env['res.partner'].create({
            'name': 'Cliente Sin Email',
        })

    def _make_order(self, partner=None):
        # Bypass pos_stock_limit: this test is not about stock availability
        with patch.object(
            self.env['pos.order'].__class__,
            '_check_stock_availability',
            return_value=None,
        ):
            return self.env['pos.order'].create({
                'session_id': self.pos_session.id,
                'partner_id': partner.id if partner else False,
                'lines': [(0, 0, {
                    'product_id': self.product.id,
                    'qty': 2,
                    'price_unit': 100.0,
                    'price_subtotal': 200.0,
                    'price_subtotal_incl': 200.0,
                })],
                'amount_total': 200.0,
                'amount_tax': 0.0,
                'amount_paid': 200.0,
                'amount_return': 0.0,
            })

    def test_remito_number_asignado(self):
        order = self._make_order()
        with patch.object(type(order), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order._generate_remito()
        self.assertTrue(order.remito_number)
        self.assertTrue(order.remito_number.startswith('R-'))

    def test_secuencia_correlativa(self):
        order1 = self._make_order()
        order2 = self._make_order()
        with patch.object(type(order1), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order1._generate_remito()
        with patch.object(type(order2), '_render_remito_pdf', return_value=b'%PDF-fake'):
            order2._generate_remito()
        num1 = int(order1.remito_number.split('-')[-1])
        num2 = int(order2.remito_number.split('-')[-1])
        self.assertEqual(num2, num1 + 1)
