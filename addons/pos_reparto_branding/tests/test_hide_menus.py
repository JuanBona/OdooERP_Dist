from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestHideUnusedMenus(TransactionCase):

    def test_unused_apps_are_hidden(self):
        hidden_menu_xml_ids = [
            'project.menu_main_pm',
            'spreadsheet_dashboard.spreadsheet_dashboard_menu_root',
            'utm.menu_link_tracker_root',
        ]
        for xml_id in hidden_menu_xml_ids:
            menu = self.env.ref(xml_id)
            self.assertFalse(
                menu.active,
                f"{xml_id} deberia estar oculto (active=False) y sigue activo",
            )

    def test_used_apps_stay_visible(self):
        # Estos xml_ids pertenecen a modulos (point_of_sale, stock, contacts,
        # sale, account) que NO estan en el `depends` de pos_reparto_branding
        # (solo web, project, spreadsheet_dashboard, utm). Se asumen presentes
        # porque este es un deployment single-tenant: la instancia de Odoo de
        # este proyecto siempre tiene instalado el stack completo de
        # POS/Ventas/Inventario/Facturacion (ver ESTADO_PROYECTO.md). No se
        # agregan como depends reales para no acoplar el modulo a apps que no
        # usa ni necesita instalar por su cuenta.
        visible_menu_xml_ids = [
            'point_of_sale.menu_point_root',
            'stock.menu_stock_root',
            'contacts.menu_contacts',
            'sale.sale_menu_root',
            'account.menu_finance',
        ]
        for xml_id in visible_menu_xml_ids:
            menu = self.env.ref(xml_id)
            self.assertTrue(
                menu.active,
                f"{xml_id} no deberia haberse tocado y quedo oculto",
            )
