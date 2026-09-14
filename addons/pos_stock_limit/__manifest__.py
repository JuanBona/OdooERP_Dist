{
    'name': 'POS Stock Limit',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Blocks POS orders that request more quantity than is available at the order source location',
    'depends': ['point_of_sale', 'stock'],
    'data': [
        'data/product_defaults.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_stock_limit/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
