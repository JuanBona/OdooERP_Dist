{
    'name': 'POS Reparto - Descuentos por Volumen',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Escala de descuento por cantidad por producto (RF-PV-09), aviso de tramos en POS y override manual restringido a Administración/Gerencia',
    'depends': ['point_of_sale', 'pos_reparto_security', 'pos_reparto_pricelist'],
    'data': [
        'security/ir.model.access.csv',
        'views/product_template_views.xml',
        'views/descuento_volumen_menu.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_reparto_descuento_volumen/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
