from odoo import api, models
from odoo.exceptions import UserError
from odoo.tools import float_compare

GRUPOS_OVERRIDE = (
    'pos_reparto_security.group_reparto_adminop',
    'pos_reparto_security.group_reparto_gerencia',
)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            self._reparto_check_override_manual(vals)
        return super().create(vals_list)

    def _reparto_check_override_manual(self, vals):
        cajero = self._reparto_resolver_cajero(vals)
        if not cajero:
            return
        if any(cajero.has_group(g) for g in GRUPOS_OVERRIDE):
            return

        pricelist = self._reparto_resolver_pricelist(vals)
        rounding = (pricelist.currency_id or self.env.company.currency_id).rounding

        infracciones = []
        for line in vals.get('lines') or []:
            if not (isinstance(line, (list, tuple)) and len(line) == 3 and isinstance(line[2], dict)):
                continue
            line_vals = line[2]
            product = self.env['product.product'].browse(line_vals.get('product_id'))
            qty = line_vals.get('qty') or 0.0
            price_unit = line_vals.get('price_unit')
            discount = line_vals.get('discount') or 0.0
            if not product or price_unit is None:
                continue

            if float_compare(discount, 0.0, precision_rounding=0.01) > 0:
                infracciones.append(product.display_name)
                continue

            esperado = pricelist._get_product_price(product, qty) if pricelist else product.lst_price
            if float_compare(price_unit, esperado, precision_rounding=rounding) < 0:
                infracciones.append(product.display_name)

        if infracciones:
            raise UserError(
                "Solo Administración o Gerencia pueden modificar precio o descuento de una línea.\n"
                "Líneas con override manual: %s" % ", ".join(sorted(set(infracciones)))
            )

    def _reparto_resolver_cajero(self, vals):
        if vals.get('user_id'):
            return self.env['res.users'].browse(vals['user_id'])
        if vals.get('session_id'):
            return self.env['pos.session'].browse(vals['session_id']).user_id
        return self.env.user

    def _reparto_resolver_pricelist(self, vals):
        if vals.get('pricelist_id'):
            return self.env['product.pricelist'].browse(vals['pricelist_id'])
        config_id = vals.get('config_id')
        if not config_id and vals.get('session_id'):
            config_id = self.env['pos.session'].browse(vals['session_id']).config_id.id
        if config_id:
            return self.env['pos.config'].browse(config_id).pricelist_id
        return self.env['product.pricelist']
