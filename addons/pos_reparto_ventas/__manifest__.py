{
    'name': 'POS Reparto - Ventas por Vendedor',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Reporte de ventas por vendedor (RF-A01) sobre el análisis nativo de POS, para el proyecto Reparto',
    'depends': ['point_of_sale', 'pos_reparto_security'],
    'data': [
        'security/reparto_ventas_rules.xml',
        'views/ventas_vendedor_views.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
