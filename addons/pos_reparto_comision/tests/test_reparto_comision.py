from datetime import timedelta
from unittest.mock import patch

from odoo import Command, fields
from odoo.exceptions import AccessError
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoComision(TransactionCase):

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
        cls.metodo_efectivo = cls.env['pos.payment.method'].create({
            'name': 'Efectivo Test Comisión',
            'type': 'cash',
            'journal_id': cls.bank_journal.id,
            'company_id': cls.env.company.id,
        })
        cls.metodo_cuenta_corriente = cls.env['pos.payment.method'].create({
            'name': 'Cuenta Corriente Test Comisión',
            'type': 'pay_later',
            'company_id': cls.env.company.id,
        })
        cls.pos_config = cls.env['pos.config'].create({'name': 'Camión Test Comisión'})
        cls.pos_session = cls.env['pos.session'].create({
            'config_id': cls.pos_config.id,
        })
        cls.product = cls.env['product.product'].create({
            'name': 'Producto Test Comisión',
            'type': 'consu',
            'list_price': 100.0,
            'available_in_pos': True,
        })

    def _crear_vendedor(self, name, pct=0.0, login=None):
        group_vendedor = self.env.ref('pos_reparto_security.group_reparto_vendedor')
        group_internal = self.env.ref('base.group_user')
        vendedor = self.env['res.users'].create({
            'name': name,
            'login': login or name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group_vendedor.id])],
        })
        vendedor.sudo().reparto_comision_pct = pct
        return vendedor

    def _crear_gerente(self, name, login=None):
        group_gerencia = self.env.ref('pos_reparto_security.group_reparto_gerencia')
        group_internal = self.env.ref('base.group_user')
        return self.env['res.users'].create({
            'name': name,
            'login': login or name.lower().replace(' ', '_') + '_test',
            'group_ids': [(6, 0, [group_internal.id, group_gerencia.id])],
        })

    def _crear_partner(self, name, vendedor=None):
        vals = {'name': name, 'property_account_receivable_id': self.receivable_account.id}
        if vendedor:
            vals['user_id'] = vendedor.id
        return self.env['res.partner'].create(vals)

    def _crear_orden(self, partner, metodo_pago, monto):
        with patch.object(
            self.env['pos.order'].__class__,
            '_check_stock_availability',
            return_value=None,
            create=True,
        ):
            return self.env['pos.order'].create({
                'session_id': self.pos_session.id,
                'partner_id': partner.id if partner else False,
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

    def _crear_y_conciliar_pago(self, partner, receivable_line, monto, fecha):
        payment = self.env['account.payment'].create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': partner.id,
            'amount': monto,
            'date': fecha,
            'journal_id': self.bank_journal.id,
        })
        payment.action_post()
        payment_line = payment.move_id.line_ids.filtered(
            lambda l: l.account_id == self.receivable_account
        )
        (payment_line + receivable_line).reconcile()
        return payment

    def test_campo_comision_no_visible_para_vendedor(self):
        self._crear_vendedor('Vendedor Sin Acceso Comision')
        vendedor = self.env['res.users'].search([('login', '=', 'vendedor_sin_acceso_comision_test')])
        campos = self.env['res.users'].with_user(vendedor).fields_get()
        self.assertNotIn('reparto_comision_pct', campos)

    def test_campo_comision_visible_para_gerencia(self):
        gerente = self._crear_gerente('Gerente Con Acceso Comision')
        campos = self.env['res.users'].with_user(gerente).fields_get()
        self.assertIn('reparto_comision_pct', campos)

    def test_comision_monto_se_calcula_del_monto_y_pct(self):
        vendedor = self._crear_vendedor('Vendedor Comision Compute', pct=5.0)
        partner = self._crear_partner('Cliente Comision Compute', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 1000.0)
        linea = self.env['pos.reparto.comision.linea'].create({
            'vendedor_id': vendedor.id,
            'partner_id': partner.id,
            'fecha': fields.Date.today(),
            'origen': 'venta_directa',
            'monto_cobrado': 1000.0,
            'comision_pct': 5.0,
            'pos_payment_id': orden.payment_ids[0].id,
        })
        self.assertEqual(linea.comision_monto, 50.0)

    def test_linea_requiere_exactamente_un_origen(self):
        vendedor = self._crear_vendedor('Vendedor Comision Origen', pct=5.0)
        partner = self._crear_partner('Cliente Comision Origen', vendedor)
        with self.assertRaises(Exception):
            self.env['pos.reparto.comision.linea'].create({
                'vendedor_id': vendedor.id,
                'partner_id': partner.id,
                'fecha': fields.Date.today(),
                'origen': 'venta_directa',
                'monto_cobrado': 1000.0,
                'comision_pct': 5.0,
            })

    def test_no_se_duplica_linea_para_el_mismo_pago_pos(self):
        vendedor = self._crear_vendedor('Vendedor Comision Dup Pos', pct=5.0)
        partner = self._crear_partner('Cliente Comision Dup Pos', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 1000.0)
        pago = orden.payment_ids[0]
        vals = {
            'vendedor_id': vendedor.id,
            'partner_id': partner.id,
            'fecha': fields.Date.today(),
            'origen': 'venta_directa',
            'monto_cobrado': 1000.0,
            'comision_pct': 5.0,
            'pos_payment_id': pago.id,
        }
        self.env['pos.reparto.comision.linea'].create(vals)
        with self.assertRaises(Exception):
            self.env['pos.reparto.comision.linea'].create(vals)

    def test_pedido_efectivo_pagado_genera_linea_venta_directa(self):
        vendedor = self._crear_vendedor('Vendedor Comision Cash', pct=10.0)
        partner = self._crear_partner('Cliente Comision Cash', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)

        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas.vendedor_id, vendedor)
        self.assertEqual(lineas.origen, 'venta_directa')
        self.assertEqual(lineas.monto_cobrado, 500.0)
        self.assertEqual(lineas.comision_pct, 10.0)
        self.assertEqual(lineas.comision_monto, 50.0)

    def test_pedido_a_credito_no_genera_linea_al_pagar(self):
        vendedor = self._crear_vendedor('Vendedor Comision Credito Pedido', pct=10.0)
        partner = self._crear_partner('Cliente Comision Credito Pedido', vendedor)
        orden = self._crear_orden(partner, self.metodo_cuenta_corriente, 500.0)

        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 0)

    def test_pedido_sin_vendedor_asignado_no_genera_linea(self):
        partner = self._crear_partner('Cliente Comision Sin Vendedor')
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)

        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 0)

    def test_pedido_pagado_dos_veces_no_duplica_linea(self):
        vendedor = self._crear_vendedor('Vendedor Comision Idempotente', pct=10.0)
        partner = self._crear_partner('Cliente Comision Idempotente', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)

        orden.write({'state': 'paid'})
        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('pos_payment_id', '=', orden.payment_ids[0].id),
        ])
        self.assertEqual(len(lineas), 1)

    def test_pago_de_credito_genera_linea_cobro_credito(self):
        vendedor = self._crear_vendedor('Vendedor Comision Cobro', pct=8.0)
        partner = self._crear_partner('Cliente Comision Cobro', vendedor)
        linea_deuda = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=10))

        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 1000.0, fields.Date.today())

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(len(lineas), 1)
        self.assertEqual(lineas.vendedor_id, vendedor)
        self.assertEqual(lineas.origen, 'cobro_credito')
        self.assertEqual(lineas.monto_cobrado, 1000.0)
        self.assertEqual(lineas.comision_pct, 8.0)
        self.assertEqual(lineas.comision_monto, 80.0)

    def test_pago_parcial_genera_linea_proporcional(self):
        vendedor = self._crear_vendedor('Vendedor Comision Parcial', pct=10.0)
        partner = self._crear_partner('Cliente Comision Parcial', vendedor)
        linea_deuda = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=10))

        pago_1 = self._crear_y_conciliar_pago(partner, linea_deuda, 300.0, fields.Date.today() - timedelta(days=5))
        pago_2 = self._crear_y_conciliar_pago(partner, linea_deuda, 700.0, fields.Date.today())

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', 'in', (pago_1 | pago_2).ids),
        ], order='fecha asc')
        self.assertEqual(len(lineas), 2)
        self.assertEqual(lineas[0].monto_cobrado, 300.0)
        self.assertEqual(lineas[0].comision_monto, 30.0)
        self.assertEqual(lineas[1].monto_cobrado, 700.0)
        self.assertEqual(lineas[1].comision_monto, 70.0)

    def test_pago_sin_vendedor_asignado_no_genera_linea(self):
        partner = self._crear_partner('Cliente Comision Cobro Sin Vendedor')
        linea_deuda = self._crear_linea_por_cobrar(partner, 500.0, fields.Date.today() - timedelta(days=3))

        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 500.0, fields.Date.today())

        lineas = self.env['pos.reparto.comision.linea'].search([
            ('account_payment_id', '=', pago.id),
        ])
        self.assertEqual(len(lineas), 0)

    def test_cambiar_pct_no_afecta_lineas_ya_creadas(self):
        vendedor = self._crear_vendedor('Vendedor Comision Cambio Pct', pct=5.0)
        partner = self._crear_partner('Cliente Comision Cambio Pct', vendedor)
        linea_deuda = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=10))
        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 1000.0, fields.Date.today())

        vendedor.sudo().reparto_comision_pct = 20.0

        linea = self.env['pos.reparto.comision.linea'].search([('account_payment_id', '=', pago.id)])
        self.assertEqual(linea.comision_pct, 5.0)
        self.assertEqual(linea.comision_monto, 50.0)

    def test_anular_pago_borra_su_linea_de_comision(self):
        vendedor = self._crear_vendedor('Vendedor Comision Anular', pct=10.0)
        partner = self._crear_partner('Cliente Comision Anular', vendedor)
        linea_deuda = self._crear_linea_por_cobrar(partner, 500.0, fields.Date.today() - timedelta(days=3))
        pago = self._crear_y_conciliar_pago(partner, linea_deuda, 500.0, fields.Date.today())

        self.assertEqual(
            len(self.env['pos.reparto.comision.linea'].search([('account_payment_id', '=', pago.id)])), 1
        )

        pago.action_draft()

        self.assertEqual(
            len(self.env['pos.reparto.comision.linea'].search([('account_payment_id', '=', pago.id)])), 0
        )

    def test_vendedor_no_puede_leer_lineas_de_comision(self):
        vendedor = self._crear_vendedor('Vendedor Comision Sin Acceso Modelo', pct=10.0)
        partner = self._crear_partner('Cliente Comision Sin Acceso Modelo', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)
        orden.write({'state': 'paid'})

        with self.assertRaises(AccessError):
            self.env['pos.reparto.comision.linea'].with_user(vendedor).search([])

    def test_gerencia_puede_leer_lineas_de_comision(self):
        vendedor = self._crear_vendedor('Vendedor Comision Con Acceso Modelo', pct=10.0)
        gerente = self._crear_gerente('Gerente Comision Con Acceso Modelo')
        partner = self._crear_partner('Cliente Comision Con Acceso Modelo', vendedor)
        orden = self._crear_orden(partner, self.metodo_efectivo, 500.0)
        orden.write({'state': 'paid'})

        lineas = self.env['pos.reparto.comision.linea'].with_user(gerente).search([
            ('partner_id', '=', partner.id),
        ])
        self.assertEqual(len(lineas), 1)

    def test_accion_comisiones_existe_y_apunta_al_modelo(self):
        action = self.env.ref('pos_reparto_comision.action_reparto_comision_lineas')
        self.assertEqual(action.res_model, 'pos.reparto.comision.linea')
