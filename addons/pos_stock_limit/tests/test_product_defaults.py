from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestProductStorableDefault(TransactionCase):

    def test_default_declarado_en_ir_default(self):
        val = self.env['ir.default']._get('product.template', 'is_storable')
        self.assertTrue(val, "is_storable deberia estar como default True en ir.default")

    def test_nuevo_producto_rastrea_inventario_por_defecto(self):
        producto = self.env['product.template'].create({'name': 'Test Prod Storable Default'})
        self.assertTrue(
            producto.is_storable,
            "Un producto nuevo deberia venir con 'Rastrear inventario' tildado",
        )

    def test_sigue_siendo_editable(self):
        producto = self.env['product.template'].create({
            'name': 'Test Prod Servicio',
            'is_storable': False,
        })
        self.assertFalse(producto.is_storable)
