from odoo import api, fields, models, tools


class RepartoCuentaCorrienteMovimiento(models.Model):
    _name = 'reparto.cuenta.corriente.movimiento'
    _description = 'Movimiento de cuenta corriente (pedido a crédito o pago)'
    _auto = False
    _order = 'partner_id, fecha, id'

    partner_id = fields.Many2one('res.partner', string='Cliente', readonly=True)
    vendedor_id = fields.Many2one('res.users', string='Vendedor', readonly=True)
    fecha = fields.Date(string='Fecha', readonly=True)
    tipo = fields.Selection(
        [('pedido', 'Pedido'), ('pago', 'Pago')],
        string='Tipo', readonly=True,
    )
    referencia = fields.Char(string='Referencia', readonly=True)
    debe = fields.Monetary(string='Debe', currency_field='currency_id', readonly=True)
    haber = fields.Monetary(string='Haber', currency_field='currency_id', readonly=True)
    saldo = fields.Monetary(string='Saldo', currency_field='currency_id', readonly=True)
    currency_id = fields.Many2one(
        'res.currency', string='Moneda', compute='_compute_currency_id',
    )

    @api.depends()
    def _compute_currency_id(self):
        currency = self.env.company.currency_id
        for movimiento in self:
            movimiento.currency_id = currency

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        query = """
            CREATE VIEW %s AS (
                SELECT
                    m.id, m.partner_id, m.vendedor_id, m.fecha, m.tipo, m.referencia,
                    m.debe, m.haber,
                    SUM(m.debe - m.haber) OVER (
                        PARTITION BY m.partner_id ORDER BY m.fecha, m.id
                    ) AS saldo
                FROM (
                    SELECT
                        aml.id AS id, aml.partner_id AS partner_id,
                        rp.user_id AS vendedor_id, aml.date AS fecha,
                        'pedido' AS tipo, am.name AS referencia,
                        (aml.debit - aml.credit) AS debe, 0.0 AS haber
                    FROM account_move_line aml
                    JOIN account_move am ON am.id = aml.move_id
                    -- account_move_line.account_type es un related no almacenado
                    -- (no existe columna real en la tabla), por eso se joinea
                    -- account_account en vez de filtrar aml.account_type.
                    JOIN account_account aa ON aa.id = aml.account_id
                    JOIN res_partner rp ON rp.id = aml.partner_id
                    WHERE aa.account_type = 'asset_receivable'
                      AND am.state = 'posted'
                      -- Excluye el asiento que account.payment genera solo al
                      -- postearse: ese asiento tiene su propia línea en la
                      -- cuenta por cobrar, que duplicaría el mismo pago ya
                      -- representado abajo por la rama UNION de account_payment
                      -- (como fila "pago"). Sin este filtro, un pago posteado
                      -- aparecería dos veces (una como "pedido" haber, otra
                      -- como "pago").
                      AND am.origin_payment_id IS NULL
                      AND aml.partner_id IS NOT NULL

                    UNION ALL

                    SELECT
                        -ap.id AS id, ap.partner_id AS partner_id,
                        rp.user_id AS vendedor_id, ap.date AS fecha,
                        'pago' AS tipo, ap.name AS referencia,
                        0.0 AS debe, ap.amount AS haber
                    FROM account_payment ap
                    JOIN res_partner rp ON rp.id = ap.partner_id
                    WHERE ap.payment_type = 'inbound'
                      AND ap.state IN ('in_process', 'paid')
                      AND ap.partner_id IS NOT NULL
                ) m
            )
        """ % self._table
        self.env.cr.execute(query)
