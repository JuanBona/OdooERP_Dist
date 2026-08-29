from odoo import fields, models


class RepartoViaje(models.Model):
    _name = 'reparto.viaje'
    _description = 'Viaje (hoja de ruta diaria de un chofer)'

    fecha = fields.Date(string='Fecha', required=True, default=fields.Date.context_today)


class RepartoViajeParada(models.Model):
    _name = 'reparto.viaje.parada'
    _description = 'Parada de un viaje (cliente a visitar)'

    viaje_id = fields.Many2one('reparto.viaje', string='Viaje', required=True, ondelete='cascade')
