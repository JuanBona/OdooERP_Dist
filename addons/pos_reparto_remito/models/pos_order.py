import logging
import base64

from odoo import fields, models

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    remito_number = fields.Char(string="Nº Remito", readonly=True, copy=False)

    def _render_remito_pdf(self):
        pdf_content, _ = self.env['ir.actions.report']._render_qweb_pdf(
            'pos_reparto_remito.action_report_remito', self.ids
        )
        return pdf_content

    def _generate_remito(self):
        self.ensure_one()
        self.remito_number = self.env['ir.sequence'].next_by_code('pos.remito.reparto')
        pdf_content = self._render_remito_pdf()
        attachment = self.env['ir.attachment'].create({
            'name': f'Remito-{self.remito_number}.pdf',
            'type': 'binary',
            'datas': base64.b64encode(pdf_content).decode(),
            'res_model': 'pos.order',
            'res_id': self.id,
            'mimetype': 'application/pdf',
        })
        self._send_remito_email(attachment)

    def _send_remito_email(self, attachment):
        pass
