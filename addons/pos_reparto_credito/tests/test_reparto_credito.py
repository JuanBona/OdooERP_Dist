from datetime import timedelta

from odoo import Command, fields
from odoo.tests.common import TransactionCase, tagged
from odoo.tools.safe_eval import safe_eval


@tagged('post_install', '-at_install')
class TestRepartoCredito(TransactionCase):

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

    def test_monto_adeudado_suma_lineas_sin_conciliar(self):
        partner = self._crear_partner_credito('Cliente Deudor')
        self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=20))
        self._crear_linea_por_cobrar(partner, 500.0, fields.Date.today() - timedelta(days=5))
        self.assertEqual(partner.credito_monto_adeudado, 1500.0)

    def test_sin_deuda_monto_adeudado_es_cero(self):
        partner = self._crear_partner_credito('Cliente Al Dia')
        self.assertEqual(partner.credito_monto_adeudado, 0.0)

    def test_dias_sin_pago_usa_fecha_de_pedido_mas_viejo_si_nunca_pago(self):
        partner = self._crear_partner_credito('Cliente Sin Pagos')
        fecha_vieja = fields.Date.today() - timedelta(days=20)
        self._crear_linea_por_cobrar(partner, 1000.0, fecha_vieja)
        self._crear_linea_por_cobrar(partner, 500.0, fields.Date.today() - timedelta(days=5))
        self.assertEqual(partner.credito_fecha_pedido_mas_viejo, fecha_vieja)
        self.assertEqual(partner.credito_fecha_ultimo_pago, fecha_vieja)
        self.assertEqual(partner.credito_dias_sin_pago, 20)

    def test_sin_deuda_dias_y_fechas_son_neutros(self):
        partner = self._crear_partner_credito('Cliente Al Dia')
        self.assertEqual(partner.credito_dias_sin_pago, 0)
        self.assertFalse(partner.credito_fecha_ultimo_pago)
        self.assertFalse(partner.credito_fecha_pedido_mas_viejo)

    def test_pago_parcial_reinicia_contador_de_dias_pero_no_borra_la_deuda(self):
        partner = self._crear_partner_credito('Cliente Pago Parcial')
        linea = self._crear_linea_por_cobrar(partner, 1000.0, fields.Date.today() - timedelta(days=20))
        self._crear_y_conciliar_pago(partner, linea, 200.0, fields.Date.today() - timedelta(days=1))

        self.assertEqual(partner.credito_dias_sin_pago, 1)
        self.assertEqual(partner.credito_fecha_ultimo_pago, fields.Date.today() - timedelta(days=1))
        self.assertEqual(partner.credito_monto_adeudado, 800.0)
        self.assertEqual(
            partner.credito_fecha_pedido_mas_viejo,
            fields.Date.today() - timedelta(days=20),
        )

    def test_pago_total_deja_al_cliente_sin_deuda(self):
        partner = self._crear_partner_credito('Cliente Pago Total')
        linea = self._crear_linea_por_cobrar(partner, 300.0, fields.Date.today() - timedelta(days=20))
        self._crear_y_conciliar_pago(partner, linea, 300.0, fields.Date.today())

        self.assertEqual(partner.credito_monto_adeudado, 0.0)
        self.assertEqual(partner.credito_dias_sin_pago, 0)
