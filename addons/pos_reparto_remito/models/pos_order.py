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
        self.remito_number = self.env['ir.sequence'].next_by_code('pos.remito.reparto')
