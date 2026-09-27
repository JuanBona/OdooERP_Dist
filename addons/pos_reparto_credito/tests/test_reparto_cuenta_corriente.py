from datetime import timedelta

from odoo import Command, fields
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoCuentaCorriente(TransactionCase):

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
        cls.bank_journal = cls.env['account.journal'].search([
            ('type', '=', 'bank'),
            ('company_id', '=', cls.env.company.id),
        ], limit=1)

    def _crear_partner_credito(self, name):
        return self.env['res.partner'].create({
            'name': name,
            'property_account_receivable_id': self.receivable_account.id,
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

    def _crear_pago(self, partner, monto, fecha):
        payment = self.env['account.payment'].create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': monto,
            'date': fecha,
            'journal_id': self.bank_journal.id,
        })
        payment.action_post()
        return payment

    def test_pedido_a_credito_genera_fila_debe(self):
        partner = self._crear_partner_credito('Cliente Extracto Uno')
        self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today())

        movimiento = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner.id),
        ])
        self.assertEqual(len(movimiento), 1)
        self.assertEqual(movimiento.tipo, 'pedido')
        self.assertEqual(movimiento.debe, 1000.0)
        self.assertEqual(movimiento.haber, 0.0)
        self.assertEqual(movimiento.saldo, 1000.0)

    def test_pago_genera_fila_haber(self):
        partner = self._crear_partner_credito('Cliente Extracto Dos')
        self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=1))
        self._crear_pago(partner, 400.0, fields.Date.today())

        movimientos = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner.id),
        ], order='fecha, id')
        self.assertEqual(len(movimientos), 2)
        pago = movimientos.filtered(lambda m: m.tipo == 'pago')
        self.assertEqual(pago.haber, 400.0)
        self.assertEqual(pago.debe, 0.0)

    def test_saldo_acumulado_con_pedidos_y_pagos_intercalados(self):
        partner = self._crear_partner_credito('Cliente Extracto Tres')
        hoy = fields.Date.today()
        self._crear_linea_por_cobrar(partner, 1000.0, hoy - timedelta(days=10))
        self._crear_pago(partner, 300.0, hoy - timedelta(days=5))
        self._crear_linea_por_cobrar(partner, 500.0, hoy)

        movimientos = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner.id),
        ], order='fecha, id')
        saldos = movimientos.mapped('saldo')
        self.assertEqual(saldos, [1000.0, 700.0, 1200.0])

    def test_saldo_no_mezcla_clientes_distintos(self):
        partner_1 = self._crear_partner_credito('Cliente Extracto Cuatro')
        partner_2 = self._crear_partner_credito('Cliente Extracto Cinco')
        self._crear_linea_por_cobrar(partner_1, 1000.0, fields.Date.today())
        self._crear_linea_por_cobrar(partner_2, 200.0, fields.Date.today())

        movimiento_1 = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner_1.id),
        ])
        movimiento_2 = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner_2.id),
        ])
        self.assertEqual(movimiento_1.saldo, 1000.0)
        self.assertEqual(movimiento_2.saldo, 200.0)

    def test_vendedor_id_toma_el_salesperson_del_cliente(self):
        vendedor = self.env['res.users'].create({
            'name': 'Vendedor Extracto',
            'login': 'vendedor_extracto_test',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id])],
        })
        partner = self._crear_partner_credito('Cliente Con Vendedor')
        partner.user_id = vendedor
        self._crear_linea_por_cobrar(partner, 100.0, fields.Date.today())

        movimiento = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('partner_id', '=', partner.id),
        ])
        self.assertEqual(movimiento.vendedor_id, vendedor)

    def test_vendedor_solo_ve_movimientos_de_sus_clientes(self):
        group_vendedor = self.env.ref('pos_reparto_security.group_reparto_vendedor')
        group_internal = self.env.ref('base.group_user')
        vendedor_1 = self.env['res.users'].create({
            'name': 'Vendedor Extracto Uno',
            'login': 'vendedor_extracto_uno_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        vendedor_2 = self.env['res.users'].create({
            'name': 'Vendedor Extracto Dos',
            'login': 'vendedor_extracto_dos_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        cliente_1 = self._crear_partner_credito('Cliente De Vendedor Extracto 1')
        cliente_1.user_id = vendedor_1
        self._crear_linea_por_cobrar(cliente_1, 100.0, fields.Date.today())
        cliente_2 = self._crear_partner_credito('Cliente De Vendedor Extracto 2')
        cliente_2.user_id = vendedor_2
        self._crear_linea_por_cobrar(cliente_2, 100.0, fields.Date.today())

        vistos_por_vendedor_1 = self.env['reparto.cuenta.corriente.movimiento'].with_user(
            vendedor_1
        ).search([])
        self.assertIn(cliente_1, vistos_por_vendedor_1.mapped('partner_id'))
        self.assertNotIn(cliente_2, vistos_por_vendedor_1.mapped('partner_id'))

    def test_gerencia_ve_movimientos_de_todos_los_clientes(self):
        group_gerencia = self.env.ref('pos_reparto_security.group_reparto_gerencia')
        group_internal = self.env.ref('base.group_user')
        gerente = self.env['res.users'].create({
            'name': 'Gerente Extracto',
            'login': 'gerente_extracto_test',
            'group_ids': [(6, 0, [group_internal.id, group_gerencia.id])],
        })
        vendedor = self.env['res.users'].create({
            'name': 'Vendedor Extracto Tres',
            'login': 'vendedor_extracto_tres_test',
            'group_ids': [(6, 0, [group_internal.id])],
        })
        cliente_1 = self._crear_partner_credito('Cliente Extracto Seis')
        cliente_1.user_id = vendedor
        self._crear_linea_por_cobrar(cliente_1, 100.0, fields.Date.today())
        cliente_2 = self._crear_partner_credito('Cliente Extracto Siete')
        self._crear_linea_por_cobrar(cliente_2, 100.0, fields.Date.today())

        vistos_por_gerencia = self.env['reparto.cuenta.corriente.movimiento'].with_user(
            gerente
        ).search([])
        self.assertIn(cliente_1, vistos_por_gerencia.mapped('partner_id'))
        self.assertIn(cliente_2, vistos_por_gerencia.mapped('partner_id'))

    def test_filtro_por_vendedor_devuelve_solo_sus_clientes(self):
        vendedor_1 = self.env['res.users'].create({
            'name': 'Vendedor Extracto Cuatro',
            'login': 'vendedor_extracto_cuatro_test',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id])],
        })
        vendedor_2 = self.env['res.users'].create({
            'name': 'Vendedor Extracto Cinco',
            'login': 'vendedor_extracto_cinco_test',
            'group_ids': [(6, 0, [self.env.ref('base.group_user').id])],
        })
        cliente_1 = self._crear_partner_credito('Cliente Extracto Ocho')
        cliente_1.user_id = vendedor_1
        self._crear_linea_por_cobrar(cliente_1, 100.0, fields.Date.today())
        cliente_2 = self._crear_partner_credito('Cliente Extracto Nueve')
        cliente_2.user_id = vendedor_2
        self._crear_linea_por_cobrar(cliente_2, 100.0, fields.Date.today())

        filtrado = self.env['reparto.cuenta.corriente.movimiento'].search([
            ('vendedor_id', '=', vendedor_1.id),
        ])
        self.assertEqual(filtrado.mapped('partner_id'), cliente_1)

    def test_accion_cuenta_corriente_existe_y_apunta_al_modelo_correcto(self):
        action = self.env.ref('pos_reparto_credito.action_reparto_cuenta_corriente')
        self.assertEqual(action.res_model, 'reparto.cuenta.corriente.movimiento')
