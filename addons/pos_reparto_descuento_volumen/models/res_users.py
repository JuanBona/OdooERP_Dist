from odoo import api, models

GRUPOS_OVERRIDE = (
    'pos_reparto_security.group_reparto_adminop',
    'pos_reparto_security.group_reparto_gerencia',
)


class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model
    def _load_pos_data_read(self, records, config):
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            user = records[:1]
            read_records[0]['_reparto_puede_override'] = any(
                user.has_group(g) for g in GRUPOS_OVERRIDE
            )
        return read_records
