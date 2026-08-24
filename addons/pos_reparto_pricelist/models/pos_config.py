from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    def _default_reparto_pricelists(self):
        return self.env['product.pricelist'].search([
            ('company_id', 'in', [self.env.company.id, False]),
        ])

    def _default_reparto_pricelist_id(self):
        return self._default_reparto_pricelists()[:1]

    use_pricelist = fields.Boolean("Use a pricelist.", default=True)
    pricelist_id = fields.Many2one(
        'product.pricelist', string='Default Pricelist',
        default=_default_reparto_pricelist_id,
        help="The pricelist used if no customer is selected or if the customer "
             "has no Sale Pricelist configured if any.")
    available_pricelist_ids = fields.Many2many(
        'product.pricelist', string='Available Pricelists',
        default=lambda self: self._default_reparto_pricelists().ids,
        help="Make several pricelists available in the Point of Sale. You can "
             "also apply a pricelist to specific customers from their contact "
             "form (in Sales tab). To be valid, this pricelist must be listed "
             "here as an available pricelist. Otherwise the default pricelist "
             "will apply.")
