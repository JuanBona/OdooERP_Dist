from odoo import api, fields, models


class IrRule(models.Model):
    _inherit = 'ir.rule'

    @api.model
    def _eval_context(self):
        """Agrega 'today' al contexto de evaluacion de dominios de ir.rule.

        ir.rule._eval_context() (base) solo expone user/company_id/company_ids;
        no expone context_today() ni ningun helper de fecha (a diferencia de los
        dominios de vistas, que se evaluan con un interprete distinto). Sin este
        agregado, un domain_force que use context_today() falla al cargar el
        modulo con NameError. Mismo patron que odoo/addons/website/models/ir_rule.py
        usa para agregar 'website' al contexto.
        """
        result = super()._eval_context()
        result['today'] = fields.Date.context_today(self)
        return result
