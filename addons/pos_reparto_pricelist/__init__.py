from . import models


def apply_pricelist_defaults_to_existing_configs(env):
    """Backfill pos.config records that existed before this module was installed,
    so nobody has to repeat the manual "Listas de precios flexibles" toggle."""
    configs = env['pos.config'].search([('use_pricelist', '=', False)])
    for config in configs:
        pricelists = env['product.pricelist'].search([
            ('company_id', 'in', [config.company_id.id, False]),
        ])
        if not pricelists:
            continue
        config.write({
            'use_pricelist': True,
            'available_pricelist_ids': [(6, 0, pricelists.ids)],
            'pricelist_id': pricelists[0].id,
        })
