from odoo import Command
from odoo import fields
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoViaje(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.group_internal = cls.env.ref('base.group_user')
        cls.group_vendedor = cls.env.ref('pos_reparto_security.group_reparto_vendedor')
        cls.group_adminop = cls.env.ref('pos_reparto_security.group_reparto_adminop')

        # tz explicito en los 3: sin esto, el ir.rule de reparto.viaje (que
        # calcula "today" con context_today(), ver ir_rule.py de este modulo)
        # puede terminar comparando contra la fecha en UTC en vez de
        # Argentina, y estos tests se vuelven flaky entre las 21:00 y las
        # 00:00 UTC (18-21hs Argentina) sin que el codigo tenga ningun bug.
        cls.chofer_1 = cls.env['res.users'].create({
            'name': 'Chofer Viaje Uno',
            'login': 'chofer_viaje_uno_test',
            'tz': 'America/Argentina/Buenos_Aires',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.chofer_2 = cls.env['res.users'].create({
            'name': 'Chofer Viaje Dos',
            'login': 'chofer_viaje_dos_test',
            'tz': 'America/Argentina/Buenos_Aires',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_vendedor.id])],
        })
        cls.admin_op = cls.env['res.users'].create({
            'name': 'Admin Operativa Viaje Test',
            'login': 'adminop_viaje_test',
            'tz': 'America/Argentina/Buenos_Aires',
            'group_ids': [(6, 0, [cls.group_internal.id, cls.group_adminop.id])],
        })

        cls.pos_config = cls.env['pos.config'].search([], limit=1)
        assert cls.pos_config, 'Se necesita al menos un pos.config existente en la base para estos tests.'

        if not cls.pos_config.current_session_id:
            cls.pos_config.open_ui()
        cls.session = cls.pos_config.current_session_id

        # user_id (Vendedor) = chofer_1: la regla de pos_reparto_security que
        # restringe res.partner a "solo mis clientes" exige esto para que un
        # chofer pueda leer partner_id.name de las paradas de su propio viaje
        # (ver test_get_mi_viaje_hoy_devuelve_paradas_propias).
        cls.cliente_a = cls.env['res.partner'].create({'name': 'Cliente Viaje A', 'user_id': cls.chofer_1.id})
        cls.cliente_b = cls.env['res.partner'].create({'name': 'Cliente Viaje B', 'user_id': cls.chofer_1.id})

        cls.receivable_account = cls.env['account.account'].search([
            ('account_type', '=', 'asset_receivable'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        cls.income_account = cls.env['account.account'].search([
            ('account_type', '=', 'income'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        cls.cliente_a.property_account_receivable_id = cls.receivable_account.id
        cls.cliente_b.property_account_receivable_id = cls.receivable_account.id

        # "hoy" para el ir.rule de reparto.viaje se calcula con context_today()
        # en la tz del usuario ACTUANTE (ver ir_rule.py de este modulo) --
        # context_today(record) usa record.env.user, no "record" en si mismo,
        # asi que hace falta un env atado a chofer_1 (con with_user) para que
        # tome su tz y no la del superusuario (que no tiene tz configurado).
        cls.hoy = fields.Date.context_today(cls.chofer_1.with_user(cls.chofer_1))

    def _crear_viaje(self, chofer, fecha, partners):
        return self.env['reparto.viaje'].create({
            'fecha': fecha,
            'chofer_id': chofer.id,
            'pos_config_id': self.pos_config.id,
            'parada_ids': [(0, 0, {'partner_id': p.id}) for p in partners],
        })

    def _crear_linea_por_cobrar(self, partner, monto, fecha):
        move = self.env['account.move'].create({
            'move_type': 'entry',
            'date': fecha,
            'line_ids': [
                Command.create({
                    'account_id': self.receivable_account.id,
                    'partner_id': partner.id,
                    'debit': monto,
                    'credit': 0.0,
                    'name': 'Pedido a credito de prueba',
                }),
                Command.create({
                    'account_id': self.income_account.id,
                    'debit': 0.0,
                    'credit': monto,
                    'name': 'Contrapartida de prueba',
                }),
            ],
        })
        move.action_post()
        return move.line_ids.filtered(lambda l: l.account_id == self.receivable_account)

    def test_constraint_un_viaje_por_chofer_y_fecha(self):
        hoy = self.hoy
        self._crear_viaje(self.chofer_1, hoy, [self.cliente_a])
        with self.assertRaises(Exception):
            self._crear_viaje(self.chofer_1, hoy, [self.cliente_b])

    def test_mismo_chofer_distinta_fecha_no_rompe_constraint(self):
        hoy = self.hoy
        manana = fields.Date.add(hoy, days=1)
        self._crear_viaje(self.chofer_1, hoy, [self.cliente_a])
        viaje_2 = self._crear_viaje(self.chofer_1, manana, [self.cliente_b])
        self.assertTrue(viaje_2)

    def test_progreso_sin_paradas_es_cero(self):
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [])
        self.assertEqual(viaje.paradas_totales, 0)
        self.assertEqual(viaje.progreso, 0.0)

    def test_progreso_computa_porcentaje_de_visitadas(self):
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a, self.cliente_b])
        viaje.parada_ids[0].visitado = True
        self.assertEqual(viaje.paradas_totales, 2)
        self.assertEqual(viaje.paradas_completadas, 1)
        self.assertEqual(viaje.progreso, 50.0)

    def test_get_mi_viaje_hoy_sin_viaje_asignado(self):
        resultado = self.env['reparto.viaje'].with_user(self.chofer_2).get_mi_viaje_hoy()
        self.assertFalse(resultado)

    def test_get_mi_viaje_hoy_devuelve_paradas_propias(self):
        self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a, self.cliente_b])
        resultado = self.env['reparto.viaje'].with_user(self.chofer_1).get_mi_viaje_hoy()
        self.assertTrue(resultado)
        nombres = {p['partner_name'] for p in resultado['paradas']}
        self.assertEqual(nombres, {'Cliente Viaje A', 'Cliente Viaje B'})

    def test_action_abrir_pos_agrega_partner_id_a_la_url(self):
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]
        action = parada.with_user(self.chofer_1).action_abrir_pos()
        self.assertEqual(action['type'], 'ir.actions.act_url')
        self.assertIn(f'reparto_partner_id={self.cliente_a.id}', action['url'])

    def test_chofer_no_ve_viaje_de_otro_chofer(self):
        self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_2).search([])
        self.assertFalse(viajes_vistos)

    def test_chofer_no_ve_viaje_de_otra_fecha(self):
        ayer = fields.Date.subtract(self.hoy, days=1)
        self._crear_viaje(self.chofer_1, ayer, [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_1).search([])
        self.assertFalse(viajes_vistos)

    def test_chofer_ve_su_propio_viaje_de_hoy(self):
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.chofer_1).search([])
        self.assertEqual(viajes_vistos, viaje)

    def test_admin_operativa_ve_todos_los_viajes(self):
        self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        self._crear_viaje(self.chofer_2, self.hoy, [self.cliente_b])
        viajes_vistos = self.env['reparto.viaje'].with_user(self.admin_op).search(
            [('chofer_id', 'in', [self.chofer_1.id, self.chofer_2.id])]
        )
        self.assertEqual(len(viajes_vistos), 2)

    def test_chofer_no_puede_crear_viaje(self):
        with self.assertRaises(Exception):
            self.env['reparto.viaje'].with_user(self.chofer_1).create({
                'fecha': self.hoy,
                'chofer_id': self.chofer_1.id,
                'pos_config_id': self.pos_config.id,
            })

    def _crear_pedido(self, chofer, partner, fecha_order=None):
        # Default a las 12:00 UTC de self.hoy (no fields.Datetime.now()): el
        # hook de pos_order.py trunca date_order a fecha con
        # fields.Date.to_date(), sin ajuste de tz -- usar la hora actual del
        # test podria caer del otro lado de la medianoche UTC respecto de
        # self.hoy (que si esta en hora Argentina) y romper el auto-tick.
        return self.env['pos.order'].create({
            'session_id': self.session.id,
            'config_id': self.pos_config.id,
            'partner_id': partner.id,
            'user_id': chofer.id,
            'date_order': fecha_order or fields.Datetime.to_datetime(self.hoy).replace(hour=12),
            'amount_total': 0,
            'amount_tax': 0,
            'amount_paid': 0,
            'amount_return': 0,
            'lines': [],
        })

    def test_auto_tick_marca_parada_visitada_al_crear_pedido(self):
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]
        pedido = self._crear_pedido(self.chofer_1, self.cliente_a)
        self.assertTrue(parada.visitado)
        self.assertEqual(parada.pedido_id, pedido)

    def test_pedido_a_cliente_fuera_del_viaje_no_hace_nada(self):
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        self._crear_pedido(self.chofer_1, self.cliente_b)
        self.assertFalse(viaje.parada_ids[0].visitado)

    def test_segundo_pedido_al_mismo_cliente_no_pisa_la_parada_ya_visitada(self):
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]
        primer_pedido = self._crear_pedido(self.chofer_1, self.cliente_a)
        self._crear_pedido(self.chofer_1, self.cliente_a)
        self.assertEqual(parada.pedido_id, primer_pedido)

    def test_auto_tick_usa_fecha_del_pedido_no_fecha_de_sincronizacion(self):
        ayer = fields.Date.subtract(self.hoy, days=1)
        viaje = self._crear_viaje(self.chofer_1, ayer, [self.cliente_a])
        fecha_ayer_datetime = fields.Datetime.to_datetime(ayer)
        self._crear_pedido(self.chofer_1, self.cliente_a, fecha_order=fecha_ayer_datetime)
        self.assertTrue(viaje.parada_ids[0].visitado)

    def test_filtro_hoy_de_la_vista_admin_excluye_otras_fechas(self):
        from lxml import etree
        from odoo.tools.safe_eval import safe_eval

        ayer = fields.Date.subtract(self.hoy, days=1)
        self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        self._crear_viaje(self.chofer_2, ayer, [self.cliente_b])

        search_view = self.env.ref('pos_reparto_viaje.view_reparto_viaje_search')
        arch = etree.fromstring(search_view.arch)
        filtro_hoy = arch.find(".//filter[@name='filter_hoy']")
        domain = safe_eval(
            filtro_hoy.get('domain'),
            # self.env.user (superusuario en TransactionCase) no tiene tz
            # configurado -- usamos admin_op para que context_today() calcule
            # "hoy" en la misma tz que self.hoy, igual que haria un usuario
            # real mirando este filtro desde el navegador.
            {'context_today': lambda: fields.Date.context_today(self.admin_op.with_user(self.admin_op))},
        )

        encontrados = self.env['reparto.viaje'].with_user(self.admin_op).search(domain)
        self.assertEqual(len(encontrados), 1)
        self.assertEqual(encontrados.chofer_id, self.chofer_1)

    def test_menu_viaje_es_raiz_y_solo_grupo_vendedor(self):
        menu = self.env.ref('pos_reparto_viaje.menu_reparto_viaje_chofer')
        self.assertFalse(menu.parent_id)
        self.assertEqual(menu.group_ids, self.group_vendedor)

    def test_admin_operativa_no_ve_el_menu_viaje_de_chofer(self):
        menu = self.env.ref('pos_reparto_viaje.menu_reparto_viaje_chofer')
        roots_admin = self.env['ir.ui.menu'].with_user(self.admin_op).get_user_roots()
        self.assertNotIn(menu.id, roots_admin.ids)

    def test_chofer_ve_el_menu_viaje_entre_sus_roots(self):
        menu = self.env.ref('pos_reparto_viaje.menu_reparto_viaje_chofer')
        roots_chofer = self.env['ir.ui.menu'].with_user(self.chofer_1).get_user_roots()
        self.assertIn(menu.id, roots_chofer.ids)

    def test_get_mi_viaje_hoy_incluye_deuda_por_parada(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, self.hoy)
        self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a, self.cliente_b])

        resultado = self.env['reparto.viaje'].with_user(self.chofer_1).get_mi_viaje_hoy()
        deuda_por_nombre = {p['partner_name']: p['deuda_monto'] for p in resultado['paradas']}
        self.assertEqual(deuda_por_nombre['Cliente Viaje A'], 500.0)
        self.assertEqual(deuda_por_nombre['Cliente Viaje B'], 0.0)

    def test_action_cobrar_deuda_crea_pago_y_reduce_deuda(self):
        self._crear_linea_por_cobrar(self.cliente_a, 1000.0, self.hoy)
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]

        nueva_deuda = parada.with_user(self.chofer_1).action_cobrar_deuda(400.0, 'efectivo')

        self.assertEqual(nueva_deuda, 600.0)
        self.assertEqual(self.cliente_a.credito_monto_adeudado, 600.0)

    def test_action_cobrar_deuda_marca_parada_visitada(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, self.hoy)
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]

        parada.with_user(self.chofer_1).action_cobrar_deuda(500.0, 'efectivo')

        self.assertTrue(parada.visitado)

    def test_action_cobrar_deuda_usa_diario_segun_medio(self):
        self._crear_linea_por_cobrar(self.cliente_a, 1000.0, self.hoy)
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]

        parada.with_user(self.chofer_1).action_cobrar_deuda(300.0, 'transferencia')
        parada.with_user(self.chofer_1).action_cobrar_deuda(200.0, 'efectivo')

        pagos = self.env['account.payment'].search([('partner_id', '=', self.cliente_a.id)], order='id')
        self.assertEqual(len(pagos), 2)
        self.assertEqual(pagos[0].journal_id.type, 'bank')
        self.assertEqual(pagos[1].journal_id.type, 'cash')

    def test_action_cobrar_deuda_rechaza_monto_cero(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, self.hoy)
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]

        with self.assertRaises(Exception):
            parada.with_user(self.chofer_1).action_cobrar_deuda(0.0, 'efectivo')

    def test_action_cobrar_deuda_rechaza_monto_mayor_a_la_deuda(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, self.hoy)
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]

        with self.assertRaises(Exception):
            parada.with_user(self.chofer_1).action_cobrar_deuda(600.0, 'efectivo')

    def test_action_cobrar_deuda_rechaza_parada_de_otro_chofer(self):
        self._crear_linea_por_cobrar(self.cliente_a, 500.0, self.hoy)
        viaje = self._crear_viaje(self.chofer_1, self.hoy, [self.cliente_a])
        parada = viaje.parada_ids[0]

        with self.assertRaises(Exception):
            parada.with_user(self.chofer_2).action_cobrar_deuda(100.0, 'efectivo')
