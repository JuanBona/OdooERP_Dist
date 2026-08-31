from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestDescuentoVolumen(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pricelist = cls.env['product.pricelist'].search(
            [('company_id', 'in', [cls.env.company.id, False])], order='id', limit=1,
        )
        cls.product = cls.env['product.template'].create({
            'name': 'Galletitas Test',
            'list_price': 100.0,
            'type': 'consu',
            'available_in_pos': True,
        })

    def test_o2m_crea_item_con_defaults_correctos(self):
        """Crear un tramo desde el One2many del producto deja el
        product.pricelist.item bien formado sin que el usuario complete
        pricelist/applied_on/compute_price/base a mano."""
        self.product.write({
            'reparto_volumen_item_ids': [(0, 0, {
                'min_quantity': 10,
                'percent_price': 4.0,
            })],
        })
        item = self.product.reparto_volumen_item_ids
        self.assertEqual(len(item), 1)
        self.assertEqual(item.pricelist_id, self.pricelist)
        self.assertEqual(item.applied_on, '1_product')
        self.assertEqual(item.compute_price, 'percentage')
        self.assertEqual(item.base, 'list_price')
        self.assertEqual(item.min_quantity, 10)
        self.assertEqual(item.percent_price, 4.0)
        self.assertEqual(item.product_tmpl_id, self.product)

    def test_o2m_solo_devuelve_tramos_de_volumen(self):
        """El One2many filtra: un item de precio fijo sobre el mismo
        producto no aparece en reparto_volumen_item_ids."""
        self.env['product.pricelist.item'].create({
            'pricelist_id': self.pricelist.id,
            'applied_on': '1_product',
            'product_tmpl_id': self.product.id,
            'compute_price': 'fixed',
            'fixed_price': 50.0,
            'min_quantity': 0,
        })
        self.product.write({
            'reparto_volumen_item_ids': [(0, 0, {
                'min_quantity': 10,
                'percent_price': 4.0,
            })],
        })
        self.assertEqual(len(self.product.reparto_volumen_item_ids), 1)
        self.assertEqual(self.product.reparto_volumen_item_ids.compute_price, 'percentage')
