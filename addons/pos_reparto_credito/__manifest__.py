{
    'name': 'POS Reparto - Alerta de Crédito',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Alerta de crédito por cliente (RF-PV-07) y pantalla de deudores para el proyecto Reparto',
    'depends': ['point_of_sale', 'account', 'pos_reparto_security'],
    'data': [
        'views/res_partner_deudores_views.xml',
    ],
    'assets': {},
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
