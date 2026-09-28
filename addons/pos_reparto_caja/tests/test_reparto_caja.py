from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError, UserError
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoCaja(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.receivable_account = cls.env['account.account'].search([
            ('account_type', '=', 'asset_receivable'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        cls.income_account = cls.env['account.account'].search([
            ('account_type', '=', 'income'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)

        cls.journal_efectivo = cls.env['account.journal'].create({
            'name': 'Caja Efectivo Test',
            'type': 'cash',
            'code': 'ZCEF',
        })
        cls.journal_transferencia = cls.env['account.journal'].create({
            'name': 'Caja Transferencia Test',
            'type': 'bank',
            'code': 'ZCTR',
        })
        cls.metodo_efectivo = cls.env['pos.payment.method'].create({
            'name': 'Efectivo Test Caja',
            'type': 'cash',
            'journal_id': cls.journal_efectivo.id,
            'company_id': cls.env.company.id,
        })
        cls.metodo_debito = cls.env['pos.payment.method'].create({
            'name': 'Débito Test Caja',
            'type': 'bank',
            'journal_id': cls.journal_transferencia.id,
            'company_id': cls.env.company.id,
        })
        cls.pos_config = cls.env['pos.config'].create({'name': 'Camión Test Caja'})
        cls.pos_session = cls.env['pos.session'].create({'config_id': cls.pos_config.id})
        cls.product = cls.env['product.product'].create({
            'name': 'Producto Test Caja',
            'type': 'consu',
            'is_storable': False,
            'list_price': 100.0,
            'available_in_pos': True,
        })

    def _crear_vendedor(self, name, pct=10.0):
        group_vendedor = self.env.ref('pos_reparto_security.group_reparto_vendedor')
        group_internal = self.env.ref('base.group_user')
        vendedor = self.env['res.users'].create({
            'name': name,
            'login': name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        vendedor.sudo().reparto_comision_pct = pct
        return vendedor

    def _crear_administracion(self, name):
        group = self.env.ref('pos_reparto_security.group_reparto_adminop')
        group_internal = self.env.ref('base.group_user')
        return self.env['res.users'].create({
            'name': name,
            'login': name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group.id])],
        })

    def _crear_gerente(self, name):
        group = self.env.ref('pos_reparto_security.group_reparto_gerencia')
        group_internal = self.env.ref('base.group_user')
        return self.env['res.users'].create({
            'name': name,
            'login': name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group.id])],
        })

    def _crear_partner(self, name, vendedor=None):
        vals = {'name': name, 'property_account_receivable_id': self.receivable_account.id}
        if vendedor:
            vals['user_id'] = vendedor.id
        return self.env['res.partner'].create(vals)

    def _crear_orden_pagada(self, partner, metodo_pago, monto):
        with patch.object(
            self.env['pos.order'].__class__,
            '_check_stock_availability',
            return_value=None,
            create=True,
        ), patch.object(
            self.env['pos.order'].__class__,
            '_reparto_check_override_manual',
            return_value=None,
            create=True,
        ):
            orden = self.env['pos.order'].create({
                'session_id': self.pos_session.id,
                'partner_id': partner.id,
                'lines': [(0, 0, {
                    'product_id': self.product.id,
                    'qty': 1,
                    'price_unit': monto,
                    'price_subtotal': monto,
                    'price_subtotal_incl': monto,
                })],
                'amount_total': monto,
                'amount_tax': 0.0,
                'amount_paid': monto,
                'amount_return': 0.0,
                'payment_ids': [(0, 0, {
                    'payment_method_id': metodo_pago.id,
                    'amount': monto,
                })],
            })
        orden.write({'state': 'paid'})
        return orden

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

    def _crear_y_conciliar_pago(self, partner, receivable_line, monto, journal):
        # pos_reparto_credito ya concilia el pago contra receivable_line
        # solo, dentro de account.payment.action_post() -- no hace falta
        # (y ahora rompe) llamar reconcile() de nuevo a mano aca.
        payment = self.env['account.payment'].create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': monto,
            'date': fields.Date.today(),
            'journal_id': journal.id,
        })
        payment.action_post()
        return payment

    def test_linea_venta_directa_efectivo_se_clasifica_como_caja_efectivo(self):
        vendedor = self._crear_vendedor('Vendedor Caja Efectivo')
        partner = self._crear_partner('Cliente Caja Efectivo', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 500.0)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(linea.caja, 'efectivo')
        self.assertEqual(linea.medio_pago, 'Efectivo Test Caja')

    def test_linea_venta_directa_debito_se_clasifica_como_caja_transferencia(self):
        vendedor = self._crear_vendedor('Vendedor Caja Transferencia')
        partner = self._crear_partner('Cliente Caja Transferencia', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_debito, 500.0)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(linea.caja, 'transferencia')
        self.assertEqual(linea.medio_pago, 'Débito Test Caja')

    def test_linea_cobro_credito_efectivo_se_clasifica_como_caja_efectivo(self):
        vendedor = self._crear_vendedor('Vendedor Cobro Efectivo')
        partner = self._crear_partner('Cliente Cobro Efectivo', vendedor)
        receivable = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today())
        pago = self._crear_y_conciliar_pago(partner, receivable, 1000.0, self.journal_efectivo)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(linea.caja, 'efectivo')
        self.assertEqual(linea.medio_pago, 'Caja Efectivo Test')

    def test_linea_cobro_credito_transferencia_se_clasifica_como_caja_transferencia(self):
        vendedor = self._crear_vendedor('Vendedor Cobro Transferencia')
        partner = self._crear_partner('Cliente Cobro Transferencia', vendedor)
        receivable = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today())
        pago = self._crear_y_conciliar_pago(partner, receivable, 1000.0, self.journal_transferencia)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(linea.caja, 'transferencia')
        self.assertEqual(linea.medio_pago, 'Caja Transferencia Test')

    def test_linea_recien_creada_no_tiene_rendicion(self):
        vendedor = self._crear_vendedor('Vendedor Sin Rendir')
        partner = self._crear_partner('Cliente Sin Rendir', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 500.0)
        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertFalse(linea.rendicion_id)

    def test_rendicion_calcula_monto_esperado_por_caja_al_crear(self):
        vendedor = self._crear_vendedor('Vendedor Rendicion Esperado')
        partner = self._crear_partner('Cliente Rendicion Esperado', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        self._crear_orden_pagada(partner, self.metodo_debito, 200.0)

        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})

        self.assertEqual(rendicion.monto_esperado_efectivo, 300.0)
        self.assertEqual(rendicion.monto_esperado_transferencia, 200.0)

    def test_action_rendir_marca_lineas_pendientes_del_vendedor(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Marca')
        partner = self._crear_partner('Cliente Rendir Marca', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})

        rendicion.write({'monto_recibido_efectivo': 300.0, 'monto_recibido_transferencia': 0.0})
        rendicion.action_rendir()

        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(linea.rendicion_id, rendicion)
        self.assertEqual(rendicion.state, 'rendido')
        self.assertTrue(rendicion.rendido_uid)
        self.assertTrue(rendicion.rendido_fecha)

    def test_action_rendir_no_toca_lineas_de_otro_vendedor(self):
        vendedor_1 = self._crear_vendedor('Vendedor Rendir Uno')
        vendedor_2 = self._crear_vendedor('Vendedor Rendir Dos')
        partner_1 = self._crear_partner('Cliente Rendir Uno', vendedor_1)
        partner_2 = self._crear_partner('Cliente Rendir Dos', vendedor_2)
        self._crear_orden_pagada(partner_1, self.metodo_efectivo, 100.0)
        orden_2 = self._crear_orden_pagada(partner_2, self.metodo_efectivo, 150.0)

        rendicion_1 = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor_1.id})
        rendicion_1.write({'monto_recibido_efectivo': 100.0, 'monto_recibido_transferencia': 0.0})
        rendicion_1.action_rendir()

        linea_2 = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden_2.payment_ids[0].id),
        ])
        self.assertFalse(linea_2.rendicion_id)

    def test_action_rendir_incluye_lineas_nuevas_hasta_el_momento_de_ejecutar(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Tardio')
        partner = self._crear_partner('Cliente Rendir Tardio', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 100.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})
        # Cobra algo más después de crear el borrador, antes de apretar Rendir.
        orden_tardia = self._crear_orden_pagada(partner, self.metodo_efectivo, 50.0)

        rendicion.write({'monto_recibido_efectivo': 150.0, 'monto_recibido_transferencia': 0.0})
        rendicion.action_rendir()

        linea_tardia = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden_tardia.payment_ids[0].id),
        ])
        self.assertEqual(linea_tardia.rendicion_id, rendicion)

    def test_action_rendir_falla_si_ya_esta_rendida(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Doble')
        partner = self._crear_partner('Cliente Rendir Doble', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 100.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})
        rendicion.write({'monto_recibido_efectivo': 100.0, 'monto_recibido_transferencia': 0.0})
        rendicion.action_rendir()

        with self.assertRaises(UserError):
            rendicion.action_rendir()

    def test_diferencia_efectivo_y_transferencia_se_calculan(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Diferencia')
        partner = self._crear_partner('Cliente Rendir Diferencia', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})

        rendicion.write({'monto_recibido_efectivo': 280.0, 'monto_recibido_transferencia': 0.0})

        self.assertEqual(rendicion.diferencia_efectivo, -20.0)
        self.assertEqual(rendicion.diferencia_transferencia, 0.0)

    def test_vendedor_no_puede_leer_rendiciones(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Sin Acceso')
        with self.assertRaises(AccessError):
            self.env['reparto.caja.rendicion'].with_user(vendedor).search([])

    def test_administracion_puede_crear_y_rendir(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Admin')
        partner = self._crear_partner('Cliente Rendir Admin', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 100.0)
        admin = self._crear_administracion('Admin Rendir')

        rendicion = self.env['reparto.caja.rendicion'].with_user(admin).create({
            'vendedor_id': vendedor.id,
        })
        rendicion.with_user(admin).write({
            'monto_recibido_efectivo': 100.0, 'monto_recibido_transferencia': 0.0,
        })
        rendicion.with_user(admin).action_rendir()
        self.assertEqual(rendicion.state, 'rendido')

    def test_gerencia_puede_leer_pero_no_escribir_rendicion(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Gerencia')
        gerente = self._crear_gerente('Gerente Rendir Lectura')
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})

        leida = self.env['reparto.caja.rendicion'].with_user(gerente).browse(rendicion.id)
        self.assertEqual(leida.vendedor_id, vendedor)
        with self.assertRaises(AccessError):
            leida.write({'monto_recibido_efectivo': 10.0})

    def test_gerencia_no_puede_ejecutar_action_rendir(self):
        vendedor = self._crear_vendedor('Vendedor Rendir Gerencia Accion')
        partner = self._crear_partner('Cliente Rendir Gerencia Accion', vendedor)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 100.0)
        gerente = self._crear_gerente('Gerente Rendir Accion')
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})
        rendicion.write({'monto_recibido_efectivo': 100.0, 'monto_recibido_transferencia': 0.0})

        with self.assertRaises(AccessError):
            rendicion.with_user(gerente).action_rendir()

        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertFalse(linea.rendicion_id)
        self.assertEqual(rendicion.state, 'borrador')

    def test_gasto_requiere_monto_positivo(self):
        vendedor = self._crear_vendedor('Vendedor Gasto Invalido')
        with self.assertRaises(Exception):
            self.env['reparto.caja.gasto'].create({
                'caja': 'efectivo',
                'monto': -50.0,
                'vendedor_id': vendedor.id,
                'motivo': 'Prueba monto invalido',
            })

    def test_gasto_se_crea_con_motivo_y_vendedor(self):
        vendedor = self._crear_vendedor('Vendedor Gasto Valido')
        gasto = self.env['reparto.caja.gasto'].create({
            'caja': 'efectivo',
            'monto': 100.0,
            'vendedor_id': vendedor.id,
            'motivo': 'Compra personal en la calle',
        })
        self.assertEqual(gasto.registrado_uid, self.env.user)

    def test_vendedor_no_puede_crear_gasto(self):
        vendedor = self._crear_vendedor('Vendedor Gasto Sin Acceso')
        with self.assertRaises(AccessError):
            self.env['reparto.caja.gasto'].with_user(vendedor).create({
                'caja': 'efectivo',
                'monto': 100.0,
                'vendedor_id': vendedor.id,
                'motivo': 'Intento no autorizado',
            })

    def test_gerencia_puede_crear_gasto(self):
        vendedor = self._crear_vendedor('Vendedor Gasto Gerencia')
        gerente = self._crear_gerente('Gerente Gasto Crea')
        gasto = self.env['reparto.caja.gasto'].with_user(gerente).create({
            'caja': 'transferencia',
            'monto': 250.0,
            'vendedor_id': vendedor.id,
            'motivo': 'Adelanto de gerencia',
        })
        self.assertEqual(gasto.caja, 'transferencia')

    def _rendir_todo_pendiente(self, vendedor, monto_efectivo, monto_transferencia):
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': vendedor.id})
        rendicion.write({
            'monto_recibido_efectivo': monto_efectivo,
            'monto_recibido_transferencia': monto_transferencia,
        })
        rendicion.action_rendir()
        return rendicion

    def test_saldo_caja_suma_rendiciones_confirmadas_menos_gastos(self):
        dashboard = self.env['reparto.caja.dashboard'].create({})
        saldo_efectivo_inicial = dashboard.saldo_efectivo
        saldo_transferencia_inicial = dashboard.saldo_transferencia

        vendedor = self._crear_vendedor('Vendedor Saldo Dashboard')
        partner = self._crear_partner('Cliente Saldo Dashboard', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        self._crear_orden_pagada(partner, self.metodo_debito, 200.0)
        self._rendir_todo_pendiente(vendedor, 300.0, 200.0)

        self.env['reparto.caja.gasto'].create({
            'caja': 'efectivo', 'monto': 50.0,
            'vendedor_id': vendedor.id, 'motivo': 'Gasto de prueba dashboard',
        })

        dashboard_2 = self.env['reparto.caja.dashboard'].create({})
        self.assertEqual(dashboard_2.saldo_efectivo, saldo_efectivo_inicial + 300.0 - 50.0)
        self.assertEqual(dashboard_2.saldo_transferencia, saldo_transferencia_inicial + 200.0)

    def test_saldo_caja_ignora_rendicion_en_borrador(self):
        dashboard = self.env['reparto.caja.dashboard'].create({})
        saldo_inicial = dashboard.saldo_efectivo

        vendedor = self._crear_vendedor('Vendedor Saldo Borrador')
        partner = self._crear_partner('Cliente Saldo Borrador', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 400.0)
        self.env['reparto.caja.rendicion'].create({
            'vendedor_id': vendedor.id, 'monto_recibido_efectivo': 400.0,
        })  # no se llama action_rendir: sigue en borrador

        dashboard_2 = self.env['reparto.caja.dashboard'].create({})
        self.assertEqual(dashboard_2.saldo_efectivo, saldo_inicial)

    def test_dashboard_accion_existe(self):
        action = self.env.ref('pos_reparto_caja.action_reparto_caja_dashboard')
        self.assertEqual(action.res_model, 'reparto.caja.dashboard')

    def _crear_externo(self, name):
        externo = self._crear_vendedor(name, pct=10.0)
        externo.sudo().reparto_es_externo = True
        return externo

    def test_lineas_de_externo_no_entran_al_esperado_de_la_rendicion(self):
        externo = self._crear_externo('Externo Sin Esperado')
        partner = self._crear_partner('Cliente Externo Sin Esperado', externo)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        self._crear_orden_pagada(partner, self.metodo_debito, 200.0)

        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': externo.id})

        self.assertEqual(rendicion.monto_esperado_efectivo, 0.0)
        self.assertEqual(rendicion.monto_esperado_transferencia, 0.0)

    def test_action_rendir_no_marca_lineas_de_externo(self):
        externo = self._crear_externo('Externo Sin Rendir')
        partner = self._crear_partner('Cliente Externo Sin Rendir', externo)
        orden = self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        rendicion = self.env['reparto.caja.rendicion'].create({'vendedor_id': externo.id})

        rendicion.action_rendir()

        linea = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertFalse(linea.rendicion_id)

    def test_saldo_caja_suma_lo_cobrado_por_un_externo_sin_rendicion(self):
        dashboard = self.env['reparto.caja.dashboard'].create({})
        saldo_efectivo_inicial = dashboard.saldo_efectivo
        saldo_transferencia_inicial = dashboard.saldo_transferencia

        externo = self._crear_externo('Externo Saldo')
        partner = self._crear_partner('Cliente Externo Saldo', externo)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)
        self._crear_orden_pagada(partner, self.metodo_debito, 200.0)

        dashboard_2 = self.env['reparto.caja.dashboard'].create({})
        self.assertEqual(dashboard_2.saldo_efectivo, saldo_efectivo_inicial + 300.0)
        self.assertEqual(dashboard_2.saldo_transferencia, saldo_transferencia_inicial + 200.0)

    def test_saldo_caja_de_vendedor_normal_sigue_igual_hasta_rendir(self):
        dashboard = self.env['reparto.caja.dashboard'].create({})
        saldo_inicial = dashboard.saldo_efectivo

        vendedor = self._crear_vendedor('Vendedor Normal Saldo')
        partner = self._crear_partner('Cliente Normal Saldo', vendedor)
        self._crear_orden_pagada(partner, self.metodo_efectivo, 300.0)

        dashboard_2 = self.env['reparto.caja.dashboard'].create({})
        self.assertEqual(dashboard_2.saldo_efectivo, saldo_inicial)
