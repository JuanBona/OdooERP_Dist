from odoo import fields
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestListado(DespachoCase):

    def setUp(self):
        super().setUp()
        self.pedido1 = self._crear_pedido(self.config1, self.session1, self.cliente1,
                                          [(self.producto_a, 3.0, 100.0), (self.producto_b, 1.0, 100.0)])
        self._crear_pedido(self.config2, self.session2, self.cliente1, [(self.producto_a, 2.0, 100.0)])
        self._crear_pedido(self.config2, self.session2, self.cliente2, [(self.producto_b, 5.0, 100.0)])
        self.despacho = self.env['reparto.despacho'].create({'fecha': fields.Date.context_today(self.env.user)})

    def test_consolidado_por_camion(self):
        datos = self.despacho._datos_listado()
        camiones = {c['nombre']: dict(c['productos']) for c in datos['por_camion']}
        self.assertEqual(camiones['Camión Test Despacho 1'],
                         {'Producto A Despacho': 3.0, 'Producto B Despacho': 1.0})
        self.assertEqual(camiones['Camión Test Despacho 2'],
                         {'Producto A Despacho': 2.0, 'Producto B Despacho': 5.0})

    def test_consolidado_por_cliente(self):
        datos = self.despacho._datos_listado()
        clientes = {c['nombre']: dict(c['productos']) for c in datos['por_cliente']}
        self.assertEqual(clientes['Cliente 1 Despacho'],
                         {'Producto A Despacho': 5.0, 'Producto B Despacho': 1.0})
        self.assertEqual(clientes['Cliente 2 Despacho'], {'Producto B Despacho': 5.0})
        cliente1 = next(c for c in datos['por_cliente'] if c['nombre'] == 'Cliente 1 Despacho')
        self.assertEqual(cliente1['camiones'], 'Camión Test Despacho 1, Camión Test Despacho 2')

    def _productos_camion1(self):
        datos = self.despacho._datos_listado()
        return next(dict(c['productos']) for c in datos['por_camion'] if c['nombre'] == 'Camión Test Despacho 1')

    def test_listado_sale_de_los_movimientos(self):
        # Una devolución parcial previa baja la demanda del picking pendiente, no la línea del pedido.
        move = self.pedido1.picking_ids.move_ids.filtered(lambda m: m.product_id == self.producto_a)
        move.product_uom_qty = 2.0
        self.assertEqual(self._productos_camion1()['Producto A Despacho'], 2.0)

    def test_servicios_no_aparecen_en_el_listado(self):
        flete = self.env['product.product'].create({
            'name': 'Flete Despacho', 'type': 'service', 'list_price': 10.0, 'available_in_pos': True})
        self._crear_pedido(self.config1, self.session1, self.cliente2,
                           [(self.producto_a, 1.0, 100.0), (flete, 1.0, 10.0)])
        datos = self.despacho._datos_listado()
        for grupo in datos['por_camion'] + datos['por_cliente']:
            self.assertNotIn('Flete Despacho', dict(grupo['productos']))
        self.assertEqual(self._productos_camion1()['Producto A Despacho'], 4.0)

    def test_chofer_del_viaje_aparece_en_el_camion(self):
        chofer = self.env['res.users'].create({'name': 'Chofer Test Despacho', 'login': 'chofer_despacho_test'})
        self.env['reparto.viaje'].create({
            'fecha': self.despacho.fecha, 'chofer_id': chofer.id, 'pos_config_id': self.config1.id,
        })
        datos = self.despacho._datos_listado()
        camion1 = next(c for c in datos['por_camion'] if c['nombre'] == 'Camión Test Despacho 1')
        self.assertEqual(camion1['chofer'], 'Chofer Test Despacho')

    def test_reporte_html_contiene_ambas_secciones(self):
        html, _tipo = self.env['ir.actions.report']._render_qweb_html(
            'pos_reparto_despacho.action_report_despacho', self.despacho.ids)
        texto = html.decode()
        self.assertIn('Por camión', texto)
        self.assertIn('Por cliente', texto)
        self.assertIn('Producto A Despacho', texto)
        self.assertIn('Cliente 2 Despacho', texto)

    def test_despacho_confirmado_lista_solo_sus_pedidos(self):
        self.despacho.action_confirmar()
        self._crear_pedido(self.config1, self.session1, self.cliente2, [(self.producto_a, 9.0, 100.0)])
        datos = self.despacho._datos_listado()
        total = sum(c['total'] for c in datos['por_camion'])
        self.assertEqual(total, 11.0)  # 3+1+2+5, sin el pedido nuevo de 9
