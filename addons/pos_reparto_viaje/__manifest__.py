{
    'name': 'POS Reparto - Viaje (Hoja de Ruta)',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Hoja de ruta diaria por chofer (checklist de clientes a visitar) para el proyecto Reparto',
    'depends': ['point_of_sale', 'pos_reparto_security'],
    'data': [
        'security/ir.model.access.csv',
        'security/reparto_viaje_rules.xml',
        'views/reparto_viaje_views.xml',
        'data/viaje_menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_reparto_viaje/static/src/viaje_screen.scss',
            'pos_reparto_viaje/static/src/viaje_screen.js',
            'pos_reparto_viaje/static/src/viaje_screen.xml',
        ],
        'point_of_sale._assets_pos': [
            'pos_reparto_viaje/static/src/app/services/pos_store.js',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
