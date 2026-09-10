from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestProductStockFilter(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pricelist = cls.env['product.pricelist'].search([
            ('company_id', 'in', [cls.env.company.id, False]),
            ('currency_id', '=', cls.env.company.currency_id.id),
        ], limit=1)
        cls.warehouse = cls.env.ref('stock.warehouse0')
        cls.camion_location = cls.env['stock.location'].create({
            'name': 'Test Camion Location',
            'location_id': cls.warehouse.lot_stock_id.id,
            'usage': 'internal',
        })
        cls.picking_type = cls.env['stock.picking.type'].create({
            'name': 'Test Carga Camion',
            'code': 'outgoing',
            'sequence_code': 'TCAM',
            'warehouse_id': cls.warehouse.id,
            'default_location_src_id': cls.camion_location.id,
            'default_location_dest_id': cls.env.ref('stock.stock_location_customers').id,
        })
        cls.config = cls.env['pos.config'].create({
            'name': 'Test Camion POS',
            'picking_type_id': cls.picking_type.id,
            'pricelist_id': cls.pricelist.id,
            'available_pricelist_ids': [(6, 0, cls.pricelist.ids)],
        })

        cls.producto_con_stock = cls.env['product.product'].create({
            'name': 'Test Con Stock',
            'is_storable': True,
            'available_in_pos': True,
        })
        cls.env['stock.quant']._update_available_quantity(
            cls.producto_con_stock, cls.camion_location, 10,
        )

        cls.producto_sin_stock = cls.env['product.product'].create({
            'name': 'Test Sin Stock',
            'is_storable': True,
            'available_in_pos': True,
        })

        cls.producto_servicio = cls.env['product.product'].create({
            'name': 'Test Servicio',
            'is_storable': False,
            'available_in_pos': True,
        })

    def _visible_template_ids(self):
        domain = self.env['product.template']._load_pos_data_domain({}, self.config)
        return set(self.env['product.template'].search(domain).ids)

    def test_producto_con_stock_en_el_camion_aparece(self):
        self.assertIn(self.producto_con_stock.product_tmpl_id.id, self._visible_template_ids())

    def test_producto_sin_stock_en_el_camion_no_aparece(self):
        self.assertNotIn(self.producto_sin_stock.product_tmpl_id.id, self._visible_template_ids())

    def test_producto_no_rastreado_siempre_aparece(self):
        self.assertIn(self.producto_servicio.product_tmpl_id.id, self._visible_template_ids())
