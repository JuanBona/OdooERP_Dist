from odoo import api, fields, models


class PosRepartoComisionLinea(models.Model):
    _inherit = 'pos.reparto.comision.linea'

    caja = fields.Selection(
        [('efectivo', 'Efectivo'), ('transferencia', 'Transferencia')],
        string='Caja', compute='_compute_caja_medio', store=True,
    )
    medio_pago = fields.Char(string='Medio de pago', compute='_compute_caja_medio', store=True)
    rendicion_id = fields.Many2one(
        'reparto.caja.rendicion', string='Rendición', ondelete='set null',
        help='Vacío = todavía pendiente de rendir.',
    )

    @api.depends(
        'pos_payment_id.payment_method_id.journal_id.type',
        'pos_payment_id.payment_method_id.name',
        'account_payment_id.journal_id.type',
        'account_payment_id.journal_id.name',
    )
    def _compute_caja_medio(self):
        for linea in self:
            if linea.pos_payment_id:
                journal = linea.pos_payment_id.payment_method_id.journal_id
                medio = linea.pos_payment_id.payment_method_id.name
            elif linea.account_payment_id:
                journal = linea.account_payment_id.journal_id
                medio = linea.account_payment_id.journal_id.name
            else:
                journal = False
                medio = False
            linea.caja = 'efectivo' if journal and journal.type == 'cash' else 'transferencia'
            linea.medio_pago = medio
