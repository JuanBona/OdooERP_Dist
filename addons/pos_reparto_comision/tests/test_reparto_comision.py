from datetime import timedelta
from unittest.mock import patch

from odoo import Command, fields
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
