import base64

from odoo import api, models
from odoo.tools import file_open


class ResCompany(models.Model):
    _inherit = 'res.company'

    @api.model
    def _reparto_aplicar_marca(self):
        """Logo de la distribuidora (login, remito, ticket) y ticket del POS sin la oferta de factura.

        Se corre con cada instalacion/actualizacion del modulo (ver data/company_branding.xml): es
        idempotente, y un logo cargado a mano se reemplaza por el de la distribuidora."""
        empresa = self.env.ref('base.main_company', raise_if_not_found=False)
        if not empresa:
            return
        with file_open('pos_reparto_branding/static/src/img/logo_rincon_del_sur.png', 'rb') as archivo:
            logo = base64.b64encode(archivo.read())
        # El sistema no factura: el QR del ticket ("¿Necesita factura?") lleva a un portal que no se usa.
        empresa.write({'logo': logo, 'point_of_sale_use_ticket_qr_code': False})
