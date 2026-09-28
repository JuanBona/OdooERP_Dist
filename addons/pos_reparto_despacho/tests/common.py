from unittest.mock import patch

from odoo import fields
from odoo.tests.common import TransactionCase


class DespachoCase(TransactionCase):
    """Base con 2 POS de camión, productos con stock y un helper para armar pedidos con su picking."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        journal = cls.env['account.journal'].search([
            ('type', '=', 'bank'), ('company_id', '=', cls.env.company.id)], limit=1)
        cls.metodo = cls.env['pos.payment.method'].create({
            'name': 'Efectivo Test Despacho',
            'type': 'cash',
            'journal_id': journal.id,
            'company_id': cls.env.company.id,
        })
        cls.config1 = cls.env['pos.config'].create({'name': 'Camión Test Despacho 1'})
        cls.config2 = cls.env['pos.config'].create({'name': 'Camión Test Despacho 2'})
        cls.session1 = cls.env['pos.session'].create({'config_id': cls.config1.id})
        cls.session2 = cls.env['pos.session'].create({'config_id': cls.config2.id})
        cls.location = cls.config1.picking_type_id.default_location_src_id
        cls.producto_a = cls._crear_producto('Producto A Despacho')
        cls.producto_b = cls._crear_producto('Producto B Despacho')
        cls.cliente1 = cls.env['res.partner'].create({'name': 'Cliente 1 Despacho'})
        cls.cliente2 = cls.env['res.partner'].create({'name': 'Cliente 2 Despacho'})

    @classmethod
    def _crear_producto(cls, nombre, stock=50.0):
        producto = cls.env['product.product'].create({
            'name': nombre,
            'type': 'consu',
            'is_storable': True,
            'list_price': 100.0,
            'available_in_pos': True,
        })
        cls.env['stock.quant']._update_available_quantity(producto, cls.location, stock)
        return producto

    def _stock(self, producto):
        return producto.with_context(location=self.location.id).qty_available

    def _crear_pedido(self, config, session, partner, lineas, date_order=None):
        """lineas: [(producto, qty, precio_unitario)]. Crea el pedido y su picking como al sincronizar desde el POS."""
        total = sum(qty * precio for _p, qty, precio in lineas)
        with patch.object(
            self.env['pos.order'].__class__, '_check_stock_availability',
            return_value=None, create=True,
        ):
            pedido = self.env['pos.order'].create({
                'session_id': session.id,
                'partner_id': partner.id,
                'date_order': date_order or fields.Datetime.now(),
                'lines': [(0, 0, {
                    'product_id': producto.id,
                    'qty': qty,
                    'price_unit': precio,
                    'price_subtotal': qty * precio,
                    'price_subtotal_incl': qty * precio,
                }) for producto, qty, precio in lineas],
                'amount_total': total,
                'amount_tax': 0.0,
                'amount_paid': total,
                'amount_return': 0.0,
                'payment_ids': [(0, 0, {'payment_method_id': self.metodo.id, 'amount': total})],
            })
        pedido._create_order_picking()
        return pedido
