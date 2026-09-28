from odoo import http
from odoo.http import content_disposition, request


class DespachoXlsx(http.Controller):

    @http.route('/pos_reparto_despacho/xlsx/<int:despacho_id>', type='http', auth='user')
    def descargar(self, despacho_id, **kwargs):
        despacho = request.env['reparto.despacho'].browse(despacho_id).exists()
        if not despacho:
            return request.not_found()
        despacho.check_access('read')  # ACL del modelo: solo Depósito / Adm. Operativa / Gerencia
        nombre = '%s.xlsx' % despacho.name.replace('/', '-')
        return request.make_response(despacho._generar_xlsx(), headers=[
            ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            ('Content-Disposition', content_disposition(nombre)),
        ])
