from collections import defaultdict

from odoo import api, models
from odoo.exceptions import UserError


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            self._check_stock_availability(vals)
        return super().create(vals_list)

    def _check_stock_availability(self, vals):
        config_id = vals.get('config_id')
        if not config_id:
            return

        location = self.env['pos.config'].browse(config_id).picking_type_id.default_location_src_id
        if not location or location.usage != 'internal':
            return

        needed = defaultdict(float)
        for line in vals.get('lines') or []:
            if isinstance(line, (list, tuple)) and len(line) == 3 and isinstance(line[2], dict):
                line_vals = line[2]
                product_id = line_vals.get('product_id')
                qty = line_vals.get('qty') or 0
                if product_id and qty > 0:
                    needed[product_id] += qty

        errors = []
        for product_id, qty in needed.items():
            product = self.env['product.product'].browse(product_id)
            available = product.with_context(location=location.id).qty_available
            if qty > available:
                errors.append(
                    "%s: pediste %s, hay %s disponibles en %s"
                    % (product.display_name, qty, available, location.display_name)
                )

        if errors:
            raise UserError("Stock insuficiente:\n" + "\n".join(errors))
