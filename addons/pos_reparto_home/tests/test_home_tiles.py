from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoHomeTiles(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_internal = cls.env.ref('base.group_user')
        cls.group_pos_user = cls.env.ref('point_of_sale.group_pos_user')
        cls.group_stock_user = cls.env.ref('stock.group_stock_user')
        cls.group_sale_all_leads = cls.env.ref('sales_team.group_sale_salesman_all_leads')

        cls.vendedor = cls.env['res.users'].create({
            'name': 'Test Vendedor Tiles',
            'login': 'test_vendedor_tiles',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_pos_user.id])],
        })
        cls.gerencia = cls.env['res.users'].create({
            'name': 'Test Gerencia Tiles',
            'login': 'test_gerencia_tiles',
            'group_ids': [(6, 0, [
                cls.group_internal.id,
                cls.group_pos_user.id,
                cls.group_stock_user.id,
                cls.group_sale_all_leads.id,
            ])],
        })

    def test_vendedor_ve_pos_y_contactos(self):
        tiles = self.env['ir.ui.menu'].with_user(self.vendedor).get_reparto_home_tiles()
        names = {tile['name'] for tile in tiles}
        self.assertEqual(names, {'Point of Sale', 'Contacts'})

    def test_gerencia_ve_ventas_pos_inventario_contactos(self):
        tiles = self.env['ir.ui.menu'].with_user(self.gerencia).get_reparto_home_tiles()
        names = {tile['name'] for tile in tiles}
        self.assertEqual(names, {'Sales', 'Point of Sale', 'Inventory', 'Contacts'})

    def test_discuss_todo_apps_settings_nunca_aparecen(self):
        tiles = self.env['ir.ui.menu'].with_user(self.gerencia).get_reparto_home_tiles()
        names = {tile['name'] for tile in tiles}
        for excluded in ('Discuss', 'To-do', 'Apps', 'Settings'):
            self.assertNotIn(excluded, names)

    def test_inicio_no_aparece_en_su_propia_grilla(self):
        tiles = self.env['ir.ui.menu'].with_user(self.gerencia).get_reparto_home_tiles()
        names = {tile['name'] for tile in tiles}
        self.assertNotIn('Inicio', names)

    def test_tile_trae_action_id_resuelto_y_valido(self):
        tiles = self.env['ir.ui.menu'].with_user(self.vendedor).get_reparto_home_tiles()
        pos_tile = next(t for t in tiles if t['name'] == 'Point of Sale')
        self.assertTrue(pos_tile['action_id'])
        action = self.env['ir.actions.act_window'].browse(pos_tile['action_id'])
        self.assertTrue(action.exists())

    def test_tile_trae_icono(self):
        tiles = self.env['ir.ui.menu'].with_user(self.vendedor).get_reparto_home_tiles()
        pos_tile = next(t for t in tiles if t['name'] == 'Point of Sale')
        self.assertTrue(pos_tile['web_icon_data'])
