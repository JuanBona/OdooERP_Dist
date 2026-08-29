{
    'name': 'POS Reparto - Remito Interno',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Genera y envía automáticamente el remito interno al confirmar cada venta de camión',
    'depends': ['point_of_sale', 'pos_reparto_security'],
    'data': [
        'data/remito_sequence.xml',
        'report/remito_report.xml',
        'report/remito_template.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
