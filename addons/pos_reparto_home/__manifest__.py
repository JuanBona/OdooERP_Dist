{
    'name': 'POS Reparto - Pantalla de Inicio',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Pantalla de inicio con cuadraditos tactiles por rol, reemplaza el landing de Discuss',
    'depends': ['web', 'contacts', 'pos_reparto_branding', 'point_of_sale'],
    'data': [
        'data/home_menu.xml',
        'data/rename_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'pos_reparto_home/static/src/home_screen.scss',
            'pos_reparto_home/static/src/home_screen.js',
            'pos_reparto_home/static/src/home_screen.xml',
            'pos_reparto_home/static/src/home_systray.js',
            'pos_reparto_home/static/src/home_systray.xml',
        ],
        'point_of_sale._assets_pos': [
            'pos_reparto_home/static/src/app/components/navbar/navbar_home_button.js',
            'pos_reparto_home/static/src/app/components/navbar/navbar_home_button.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
