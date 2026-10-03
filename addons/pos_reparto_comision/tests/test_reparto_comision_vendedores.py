from odoo.exceptions import AccessError
from odoo.tests.common import TransactionCase, tagged
from odoo.tools.safe_eval import safe_eval


@tagged('post_install', '-at_install')
class TestMenuVendedores(TransactionCase):
    """Gerencia carga el % de comisión y la marca de externo sin tocar claves ni permisos."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        interno = cls.env.ref('base.group_user')
        cls.gerencia = cls.env['res.users'].create({
            'name': 'Gerencia Vendedores Test', 'login': 'gerencia_vend_test',
            'group_ids': [(6, 0, [interno.id, cls.env.ref('pos_reparto_security.group_reparto_gerencia').id])],
        })
        cls.vendedor = cls.env['res.users'].create({
            'name': 'Vendedor Vend Test', 'login': 'vendedor_vend_test',
            'group_ids': [(6, 0, [interno.id, cls.env.ref('pos_reparto_security.group_reparto_vendedor').id])],
        })
        cls.externo = cls.env['res.users'].create({
            'name': 'Externo Vend Test', 'login': 'externo_vend_test', 'reparto_es_externo': True,
        })

    def test_gerencia_carga_el_porcentaje_de_un_vendedor(self):
        self.vendedor.with_user(self.gerencia).write({'reparto_comision_pct': 7.5})
        self.assertEqual(self.vendedor.sudo().reparto_comision_pct, 7.5)

    def test_gerencia_marca_a_un_vendedor_como_externo(self):
        self.vendedor.with_user(self.gerencia).write({'reparto_es_externo': True})
        self.assertTrue(self.vendedor.sudo().reparto_es_externo)

    def test_gerencia_no_puede_cambiar_el_login(self):
        with self.assertRaises(AccessError):
            self.vendedor.with_user(self.gerencia).write({'login': 'otro_login'})

    def test_gerencia_no_puede_darse_permisos(self):
        grupo_admin = self.env.ref('base.group_system')
        with self.assertRaises(AccessError):
            self.gerencia.with_user(self.gerencia).write({'group_ids': [(4, grupo_admin.id)]})

    def test_gerencia_no_puede_cambiar_el_camion_ni_la_clave(self):
        with self.assertRaises(AccessError):
            self.vendedor.with_user(self.gerencia).write({'password': 'nueva-clave-123'})

    def test_gerencia_sigue_pudiendo_editar_sus_preferencias(self):
        self.gerencia.with_user(self.gerencia).write({'tz': 'America/Argentina/Buenos_Aires'})
        self.assertEqual(self.gerencia.tz, 'America/Argentina/Buenos_Aires')

    def test_un_vendedor_no_puede_cargar_su_comision(self):
        with self.assertRaises(AccessError):
            self.vendedor.with_user(self.vendedor).write({'reparto_comision_pct': 99.0})

    def test_gerencia_no_puede_crear_ni_borrar_usuarios(self):
        with self.assertRaises(AccessError):
            self.env['res.users'].with_user(self.gerencia).create({'name': 'X', 'login': 'x_test_ger'})
        with self.assertRaises(AccessError):
            self.vendedor.with_user(self.gerencia).unlink()

    def test_menu_vendedores_solo_para_gerencia(self):
        menu = self.env.ref('pos_reparto_comision.menu_reparto_vendedores')
        Menu = self.env['ir.ui.menu']
        self.assertIn(menu.id, Menu.with_user(self.gerencia)._visible_menu_ids())
        self.assertNotIn(menu.id, Menu.with_user(self.vendedor)._visible_menu_ids())

    def test_la_lista_trae_vendedores_y_externos(self):
        accion = self.env.ref('pos_reparto_comision.action_reparto_vendedores')
        encontrados = self.env['res.users'].with_user(self.gerencia).search(safe_eval(accion.domain))
        self.assertIn(self.vendedor, encontrados)
        self.assertIn(self.externo, encontrados)
        self.assertNotIn(self.gerencia, encontrados)
