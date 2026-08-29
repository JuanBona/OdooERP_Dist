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
        self.flush_recordset(['remito_number'])
        self.env.cr.execute(
            'SELECT id FROM pos_order WHERE id = %s FOR UPDATE',
            (self.id,),
        )
        self.invalidate_recordset(['remito_number'])
        if self.remito_number:
            return
        self.remito_number = self.env['ir.sequence'].next_by_code('pos.remito.reparto')
        self.flush_recordset(['remito_number'])
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

    def write(self, vals):
        result = super().write(vals)
        if vals.get('state') in ('paid', 'done'):
            for order in self:
                try:
                    order._generate_remito()
                except Exception:
                    _logger.exception(
                        "Failed to generate remito for order %s", order.name
                    )
        return result

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
                'author_id': self.env.company.partner_id.id,
            })
            mail.send()
        except Exception:
            _logger.exception(
                "Failed to send remito email for order %s to %s",
                self.name,
                self.partner_id.email,
            )
