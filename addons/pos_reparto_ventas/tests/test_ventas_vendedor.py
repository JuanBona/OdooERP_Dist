from unittest.mock import patch

from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestVentasVendedor(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.metodo = cls.env['pos.payment.method'].create({
            'name': 'Efectivo Test Ventas',
            'type': 'cash',
            'journal_id': cls.env['account.journal'].search([
                ('type', '=', 'bank'), ('company_id', '=', cls.env.company.id)], limit=1).id,
            'company_id': cls.env.company.id,
        })
        cls.pos_config = cls.env['pos.config'].create({'name': 'Camión Test Ventas'})
        cls.session = cls.env['pos.session'].create({'config_id': cls.pos_config.id})
        cls.product = cls.env['product.product'].create({
            'name': 'Producto Test Ventas', 'type': 'consu',
            'list_price': 100.0, 'available_in_pos': True,
        })
        cls.vend_a = cls._crear_usuario('Vendedor A Ventas', 'pos_reparto_security.group_reparto_vendedor')
        cls.vend_b = cls._crear_usuario('Vendedor B Ventas', 'pos_reparto_security.group_reparto_vendedor')
        cls.gerente = cls._crear_usuario('Gerente Ventas', 'pos_reparto_security.group_reparto_gerencia')
        cls._crear_orden(cls.vend_a, 100.0)
        cls._crear_orden(cls.vend_b, 300.0)
        cls.env.flush_all()

    @classmethod
    def _crear_usuario(cls, name, group_xmlid):
        return cls.env['res.users'].create({
            'name': name,
            'login': name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [cls.env.ref('base.group_user').id, cls.env.ref(group_xmlid).id])],
        })

    @classmethod
    def _crear_orden(cls, usuario, monto):
        with patch.object(cls.env['pos.order'].__class__, '_check_stock_availability',
                          return_value=None, create=True):
            return cls.env['pos.order'].create({
                'session_id': cls.session.id,
                'user_id': usuario.id,
                'lines': [(0, 0, {
                    'product_id': cls.product.id, 'qty': 1, 'price_unit': monto,
                    'price_subtotal': monto, 'price_subtotal_incl': monto,
                })],
                'amount_total': monto, 'amount_tax': 0.0,
                'amount_paid': monto, 'amount_return': 0.0,
                'payment_ids': [(0, 0, {'payment_method_id': cls.metodo.id, 'amount': monto})],
            })

    def _ventas(self, usuario):
        return self.env['report.pos.order'].with_user(usuario).search(
            [('session_id', '=', self.session.id)])

    def test_vendedor_solo_ve_sus_ventas(self):
        self.assertEqual(self._ventas(self.vend_a).mapped('user_id'), self.vend_a)
        self.assertEqual(sum(self._ventas(self.vend_a).mapped('price_total')), 100.0)

    def test_gerencia_ve_ventas_de_todos(self):
        self.assertEqual(self._ventas(self.gerente).mapped('user_id'), self.vend_a | self.vend_b)

    def test_gerencia_agrupa_por_vendedor(self):
        grupos = self.env['report.pos.order'].with_user(self.gerente)._read_group(
            [('session_id', '=', self.session.id)], ['user_id'], ['price_total:sum'])
        totales = {usuario.id: total for usuario, total in grupos}
        self.assertEqual(totales, {self.vend_a.id: 100.0, self.vend_b.id: 300.0})
