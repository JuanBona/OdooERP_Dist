from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestProductStockDisplay(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pricelist = cls.env['product.pricelist'].search([
            ('company_id', 'in', [cls.env.company.id, False]),
            ('currency_id', '=', cls.env.company.currency_id.id),
        ], limit=1)
        cls.warehouse = cls.env.ref('stock.warehouse0')

        cls.camion_1_location = cls.env['stock.location'].create({
            'name': 'Test Camion 1 Location Badge',
            'location_id': cls.warehouse.lot_stock_id.id,
            'usage': 'internal',
        })
        cls.camion_1_picking_type = cls.env['stock.picking.type'].create({
            'name': 'Test Carga Camion 1 Badge',
            'code': 'outgoing',
            'sequence_code': 'TCB1',
            'warehouse_id': cls.warehouse.id,
            'default_location_src_id': cls.camion_1_location.id,
            'default_location_dest_id': cls.env.ref('stock.stock_location_customers').id,
        })
        cls.camion_1 = cls.env['pos.config'].create({
            'name': 'Test Camion 1 POS Badge',
            'picking_type_id': cls.camion_1_picking_type.id,
            'pricelist_id': cls.pricelist.id,
            'available_pricelist_ids': [(6, 0, cls.pricelist.ids)],
        })

        cls.camion_2_location = cls.env['stock.location'].create({
            'name': 'Test Camion 2 Location Badge',
            'location_id': cls.warehouse.lot_stock_id.id,
            'usage': 'internal',
        })
        cls.camion_2_picking_type = cls.env['stock.picking.type'].create({
            'name': 'Test Carga Camion 2 Badge',
            'code': 'outgoing',
            'sequence_code': 'TCB2',
            'warehouse_id': cls.warehouse.id,
            'default_location_src_id': cls.camion_2_location.id,
            'default_location_dest_id': cls.env.ref('stock.stock_location_customers').id,
        })
        cls.camion_2 = cls.env['pos.config'].create({
            'name': 'Test Camion 2 POS Badge',
            'picking_type_id': cls.camion_2_picking_type.id,
            'pricelist_id': cls.pricelist.id,
            'available_pricelist_ids': [(6, 0, cls.pricelist.ids)],
        })

        cls.producto = cls.env['product.product'].create({
            'name': 'Test Producto Badge',
            'is_storable': True,
            'available_in_pos': True,
        })
        cls.env['stock.quant']._update_available_quantity(
            cls.producto, cls.camion_1_location, 45,
        )

        cls.producto_servicio = cls.env['product.product'].create({
            'name': 'Test Servicio Badge',
            'is_storable': False,
            'available_in_pos': True,
        })

    def _leer(self, product_tmpl, config):
        records = self.env['product.template'].browse(product_tmpl.id)
        return self.env['product.template']._load_pos_data_read(records, config)[0]

    def test_campo_viaja_en_load_pos_data_fields(self):
        fields = self.env['product.template']._load_pos_data_fields(self.camion_1)
        self.assertIn('reparto_stock_disponible', fields)

    def test_stock_disponible_refleja_la_ubicacion_del_camion(self):
        self.assertEqual(
            self._leer(self.producto.product_tmpl_id, self.camion_1)['reparto_stock_disponible'], 45,
        )

    def test_stock_disponible_es_cero_en_otro_camion_sin_esas_unidades(self):
        self.assertEqual(
            self._leer(self.producto.product_tmpl_id, self.camion_2)['reparto_stock_disponible'], 0,
        )

    def test_producto_no_rastreado_es_cero(self):
        self.assertEqual(
            self._leer(self.producto_servicio.product_tmpl_id, self.camion_1)['reparto_stock_disponible'], 0,
        )

    def test_cache_no_se_reutiliza_entre_camiones_en_la_misma_transaccion(self):
        # Regresión de dos fixes relacionados: @api.depends_context('location')
        # en reparto_stock_disponible (fc93f07) y el invalidate_recordset de
        # qty_available en _load_pos_data_read (qty_available del stock core
        # sólo particiona su cache por 'warehouse_id', no por 'location' - ver
        # product.template._compute_quantities en stock/models/product.py).
        # Sin cualquiera de los dos, leer el mismo template bajo dos camiones
        # distintos EN LA MISMA transacción (mismo self.env, mismo cache de
        # campos) devuelve para el segundo camión el valor stale del primero.
        # Los otros tests de esta clase no lo detectan porque cada uno corre
        # en su propio TransactionCase con cache propio - acá hace falta leer
        # ambos camiones dentro del mismo método de test.
        tmpl = self.producto.product_tmpl_id

        primera_lectura = self._leer(tmpl, self.camion_1)['reparto_stock_disponible']
        segunda_lectura = self._leer(tmpl, self.camion_2)['reparto_stock_disponible']

        self.assertEqual(primera_lectura, 45)
        self.assertEqual(segunda_lectura, 0)
