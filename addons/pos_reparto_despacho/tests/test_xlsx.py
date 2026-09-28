import io
import zipfile

from odoo import fields
from odoo.tests.common import tagged

from .common import DespachoCase


@tagged('post_install', '-at_install')
class TestXlsx(DespachoCase):

    def test_xlsx_contiene_productos_y_clientes(self):
        self._crear_pedido(self.config1, self.session1, self.cliente1, [(self.producto_a, 3.0, 100.0)])
        despacho = self.env['reparto.despacho'].create({'fecha': fields.Date.context_today(self.env.user)})
        contenido = despacho._generar_xlsx()
        self.assertEqual(contenido[:2], b'PK')  # un .xlsx es un zip
        textos = zipfile.ZipFile(io.BytesIO(contenido)).read('xl/sharedStrings.xml').decode()
        self.assertIn('Producto A Despacho', textos)
        self.assertIn('Cliente 1 Despacho', textos)
