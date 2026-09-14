from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    reparto_stock_disponible = fields.Float(
        string="Stock disponible (camión)",
        compute='_compute_reparto_stock_disponible',
        help="Foto de qty_available en la ubicación de origen del POS que "
             "está cargando los datos — se recalcula con el contexto de "
             "ubicación que setea _load_pos_data_read de este módulo.",
    )

    def _compute_reparto_stock_disponible(self):
        for product in self:
            product.reparto_stock_disponible = product.qty_available if product.is_storable else 0.0

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

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)
        return fields_list + ['reparto_stock_disponible']

    @api.model
    def _load_pos_data_read(self, records, config):
        # Mismo criterio de ubicación que _load_pos_data_domain: sin esto,
        # reparto_stock_disponible se computaria con qty_available sin
        # contexto de ubicacion (suma todas las ubicaciones, no solo el
        # camion de esta sesion de POS).
        location = config.picking_type_id.default_location_src_id
        if location and location.usage == 'internal':
            records = records.with_context(location=location.id)
        return super()._load_pos_data_read(records, config)
