import base64
import io

from PIL import Image

from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestMarcaEmpresa(TransactionCase):

    def test_la_empresa_tiene_el_logo_de_la_distribuidora(self):
        empresa = self.env.ref('base.main_company')
        imagen = Image.open(io.BytesIO(base64.b64decode(empresa.logo)))
        self.assertEqual(imagen.size, (472, 1024), 'Se esperaba el logo de Rincón del Sur, no el de Odoo')

    def test_el_ticket_no_ofrece_factura(self):
        """Este sistema no factura: el ticket del POS no debe decir '¿Necesita factura?' con un QR."""
        self.assertFalse(self.env.ref('base.main_company').point_of_sale_use_ticket_qr_code)

    def test_aplicar_la_marca_es_repetible(self):
        empresa = self.env.ref('base.main_company')
        empresa.point_of_sale_use_ticket_qr_code = True
        self.env['res.company']._reparto_aplicar_marca()
        self.assertFalse(empresa.point_of_sale_use_ticket_qr_code)
