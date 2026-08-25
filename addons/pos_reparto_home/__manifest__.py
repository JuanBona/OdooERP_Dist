{
    'name': 'POS Reparto - Pantalla de Inicio',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Pantalla de inicio con cuadraditos tactiles por rol, reemplaza el landing de Discuss',
    'depends': ['web', 'pos_reparto_branding'],
    'data': [
        'data/home_menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_reparto_home/static/src/home_screen.scss',
            'pos_reparto_home/static/src/home_screen.js',
            'pos_reparto_home/static/src/home_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
