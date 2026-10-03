{
    'name': 'POS Reparto - Branding',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Oculta apps sin uso y aplica la marca de la distribuidora: color de la barra superior y logo',
    'depends': ['web', 'project', 'spreadsheet_dashboard', 'utm', 'point_of_sale', 'sale'],
    'data': [
        'data/hide_unused_menus.xml',
        'data/restrict_apps_menu.xml',
        'data/company_branding.xml',
    ],
    'assets': {
        'web._assets_primary_variables': [
            'pos_reparto_branding/static/src/scss/navbar_colors.scss',
        ],
        'point_of_sale._assets_pos': [
            'pos_reparto_branding/static/src/scss/ticket_logo.scss',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
