{
    'name': 'POS Reparto - Branding',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Oculta apps sin uso y aplica el color de marca a la barra superior del backend',
    'depends': ['web', 'project', 'spreadsheet_dashboard', 'utm'],
    'data': [
        'data/hide_unused_menus.xml',
    ],
    'assets': {
        'web._assets_primary_variables': [
            'pos_reparto_branding/static/src/scss/navbar_colors.scss',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
