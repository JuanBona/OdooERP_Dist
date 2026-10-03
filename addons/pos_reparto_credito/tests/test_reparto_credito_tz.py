from datetime import date

from odoo import Command
from odoo.addons.pos_reparto_security.tests.common import TZ_AR, reloj_congelado
from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestRepartoCreditoTz(TransactionCase):
    """Los días sin pago se cuentan contra el "hoy" de Argentina, no el de UTC."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        receivable = cls.env['account.account'].search([
            ('account_type', '=', 'asset_receivable'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        income = cls.env['account.account'].search([
            ('account_type', '=', 'income'),
            ('company_ids', 'in', cls.env.company.id),
        ], limit=1)
        cls.partner = cls.env['res.partner'].create({
            'name': 'Cliente Credito Tz',
            'property_account_receivable_id': receivable.id,
        })
        move = cls.env['account.move'].create({
            'move_type': 'entry',
            'date': date(2026, 10, 1),
            'line_ids': [
                Command.create({'account_id': receivable.id, 'partner_id': cls.partner.id,
                                'debit': 1000.0, 'credit': 0.0, 'name': 'Deuda Tz'}),
                Command.create({'account_id': income.id, 'debit': 0.0, 'credit': 1000.0, 'name': 'Contra'}),
            ],
        })
        move.action_post()
        cls.user_ar = cls.env['res.users'].create({
            'name': 'Usuario AR Credito', 'login': 'usuario_ar_credito_test', 'tz': TZ_AR,
        })
        cls.user_sin_tz = cls.env['res.users'].create({
            'name': 'Usuario Sin Tz Credito', 'login': 'usuario_sin_tz_credito_test', 'tz': False,
        })

    def _dias_sin_pago(self, user):
        partner = self.partner.with_user(user).sudo()
        partner._compute_credito_fields()
        return partner.credito_dias_sin_pago

    def test_dias_sin_pago_a_las_23hs_argentina(self):
        # Deuda del 1/10; hoy en AR es 3/10 (aunque en UTC ya sea 4/10) -> 2 días
        with reloj_congelado():
            self.assertEqual(self._dias_sin_pago(self.user_ar), 2)

    def test_usuario_sin_tz_cuenta_un_dia_de_mas(self):
        """Documenta el riesgo que cubre la tz única: sin tz el cálculo salta un día."""
        with reloj_congelado():
            self.assertEqual(self._dias_sin_pago(self.user_sin_tz), 3)
