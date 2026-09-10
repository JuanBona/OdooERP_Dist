{
    'name': 'POS Reparto - Seguridad de Roles',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Grupos de seguridad y reglas de visibilidad para los 4 roles del proyecto Reparto (Vendedor, Depósito, Admin Operativa, Gerencia)',
    'depends': ['point_of_sale', 'stock', 'sale_management', 'account'],
    'data': [
        'security/reparto_groups.xml',
        'security/reparto_admin_user.xml',
        'security/reparto_partner_rules.xml',
        'security/reparto_pos_order_rules.xml',
        'data/reparto_stock_config.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
