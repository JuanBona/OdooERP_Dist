{
    'name': 'POS Reparto - Cajas, Rendición y Gastos',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Saldo de caja de empresa (Efectivo/Transferencia), rendición diaria de vendedores y gastos (RF-G01, RF-G03, RF-A05)',
    'depends': ['point_of_sale', 'account', 'pos_reparto_security', 'pos_reparto_comision'],
    'data': [
        'security/ir.model.access.csv',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
