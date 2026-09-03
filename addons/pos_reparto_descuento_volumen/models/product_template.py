from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    reparto_volumen_item_ids = fields.One2many(
        comodel_name='product.pricelist.item',
        inverse_name='product_tmpl_id',
        string="Descuentos por volumen",
        domain=lambda self: [
            ('pricelist_id', '=', self._reparto_volumen_pricelist().id),
            ('compute_price', '=', 'percentage'),
            ('min_quantity', '>', 0),
        ],
    )

    def _reparto_volumen_pricelist(self):
        """La lista de precios "Default" de la compañía. En Odoo 19 no tiene
        xmlid (product.list0 se eliminó); se resuelve por búsqueda, igual que
        en pos_reparto_pricelist."""
        return self.env['product.pricelist'].search(
            [('company_id', 'in', [self.env.company.id, False])], order='id', limit=1,
        )

    @api.model
    def _reparto_volumen_item_defaults(self):
        return {
            'pricelist_id': self._reparto_volumen_pricelist().id,
            'applied_on': '1_product',
            'compute_price': 'percentage',
            'base': 'list_price',
        }

    def write(self, vals):
        vals = self._reparto_volumen_inyectar_defaults(vals)
        return super().write(vals)

    @api.model_create_multi
    def create(self, vals_list):
        vals_list = [self._reparto_volumen_inyectar_defaults(v) for v in vals_list]
        return super().create(vals_list)

    def _reparto_volumen_inyectar_defaults(self, vals):
        """Completa pricelist/applied_on/compute_price/base en los comandos
        (0, 0, {...}) de reparto_volumen_item_ids que no los traen, para que
        el form solo tenga que pedir cantidad y %."""
        commands = vals.get('reparto_volumen_item_ids')
        if not commands:
            return vals
        defaults = self._reparto_volumen_item_defaults()
        nuevos = []
        for command in commands:
            if isinstance(command, (list, tuple)) and command[0] == 0 and isinstance(command[2], dict):
                line_vals = {**defaults, **command[2]}
                nuevos.append((0, command[1], line_vals))
            else:
                nuevos.append(command)
        return {**vals, 'reparto_volumen_item_ids': nuevos}
