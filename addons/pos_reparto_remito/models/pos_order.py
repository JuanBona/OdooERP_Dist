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
        if not self.partner_id or not self.partner_id.email:
            return
        company = self.env.company
        date_str = self.date_order.strftime('%d/%m/%Y') if self.date_order else ''
        subject = f"Remito {self.remito_number} — {company.name}"
        body = (
            f"Estimado/a {self.partner_id.name}, adjunto encontrará su remito de compra "
            f"del {date_str}. Ante cualquier consulta no dude en comunicarse con nosotros."
        )
        try:
            mail = self.env['mail.mail'].create({
                'subject': subject,
                'email_to': self.partner_id.email,
                'body_html': body,
                'attachment_ids': [(4, attachment.id)],
            })
            mail.send()
        except Exception:
            _logger.warning(
                "Failed to send remito email for order %s to %s",
                self.name,
                self.partner_id.email,
            )
