{
    'name': 'POS Reparto Pricelist Defaults',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Enables flexible pricelists by default on every POS config, current and future',
    'description': """
Sin este módulo, "Listas de precios flexibles" hay que activarlo a mano en cada
punto de venta (Ajustes > Punto de venta, seleccionando la tienda arriba), y
repetirlo cada vez que se crea un camión nuevo.

Este módulo hace que cualquier pos.config (existente o creado después) tenga
por defecto:
  - use_pricelist = True
  - available_pricelist_ids = todas las listas de precio de la compañía
  - pricelist_id = la primera lista de precio de la compañía (ej. "Default")

Las reglas de descuento en sí se siguen cargando una sola vez en la lista de
precios (Punto de venta > Configuración > Ajustes > Listas de precios) y
aplican automáticamente a todos los puntos de venta.
""",
    'depends': ['point_of_sale'],
    'data': [],
    'post_init_hook': 'apply_pricelist_defaults_to_existing_configs',
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
