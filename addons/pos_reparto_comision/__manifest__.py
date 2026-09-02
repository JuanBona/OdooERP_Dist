{
    'name': 'POS Reparto - Comisión de Vendedor',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Comisión de vendedor sobre el cobro al cliente (RF-GV-03) para el proyecto Reparto',
    'depends': ['point_of_sale', 'account', 'pos_reparto_security'],
    'data': [
        'security/ir.model.access.csv',
        'views/res_users_views.xml',
        'views/comision_linea_views.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
