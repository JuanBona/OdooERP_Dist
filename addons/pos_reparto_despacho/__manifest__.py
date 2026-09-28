{
    'name': 'POS Reparto - Listado de Despacho',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Listado de despacho por fecha (por camión y por cliente) con descuento de stock al confirmar (RF-A03)',
    'depends': ['point_of_sale', 'stock', 'pos_reparto_security', 'pos_reparto_viaje'],
    'data': [
        'security/ir.model.access.csv',
        'data/despacho_sequence.xml',
        'report/despacho_report.xml',
        'report/despacho_template.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
