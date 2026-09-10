from odoo import api, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    @api.model
    def _load_pos_data_domain(self, data, config):
        # Esto es lo que arma la grilla real del POS (product.product tiene
        # su propio _load_pos_data_domain pero ese solo resuelve variantes
        # de los templates que ya pasaron este filtro - filtrar ahi solo no
        # alcanza, la grilla se sigue armando con el catalogo completo).
        #
        # El bloqueo de sobreventa (pos_order.py) ya evita cobrar mas de lo
        # que hay en el camion, pero eso solo avisa recien al pagar. Ademas
        # hay que evitar que el vendedor vea/toque en la grilla productos que
        # ese camion puntual ni siquiera tiene cargados - misma ubicacion de
        # origen que usa el bloqueo (picking_type_id.default_location_src_id).
        domain = super()._load_pos_data_domain(data, config)
        location = config.picking_type_id.default_location_src_id
        if not location or location.usage != 'internal':
            return domain
        in_stock = self.env['product.template'].sudo().with_context(location=location.id).search([
            ('available_in_pos', '=', True),
            '|', ('is_storable', '=', False), ('qty_available', '>', 0),
        ])
        return domain + [('id', 'in', in_stock.ids)]
