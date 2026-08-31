from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestDescuentoVolumen(TransactionCase):

    def test_placeholder(self):
        self.assertTrue(True)
