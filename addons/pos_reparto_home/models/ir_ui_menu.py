from odoo import api, models

_BLACKLIST_XMLIDS = [
    'mail.menu_root_discuss',
    'project_todo.menu_todo_todos',
    'base.menu_management',
    'base.menu_administration',
    'base.menu_tests',
    'pos_reparto_home.menu_reparto_home',
]


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    def _reparto_home_blacklist_ids(self):
        ids = []
        for xmlid in _BLACKLIST_XMLIDS:
            menu = self.env.ref(xmlid, raise_if_not_found=False)
            if menu:
                ids.append(menu.id)
        return ids

    def _reparto_home_resolve_action_id(self):
        """Primer action_id visible del propio menu o, si no tiene, de sus
        descendientes en orden de sequence (DFS pre-order). Muchas apps raiz
        (Sales, Contacts, Point of Sale, Inventory) tienen action=False y la
        accion real vive 1-2 niveles mas abajo."""
        self.ensure_one()
        if self.action:
            return self.action.id
        children = self.env['ir.ui.menu'].search(
            [('parent_id', '=', self.id)], order='sequence, id',
        )._filter_visible_menus()
        for child in children:
            action_id = child._reparto_home_resolve_action_id()
            if action_id:
                return action_id
        return False

    @api.model
    def get_reparto_home_tiles(self):
        blacklist_ids = self._reparto_home_blacklist_ids()
        roots = self.get_user_roots().filtered(
            lambda m: m.id not in blacklist_ids
        ).sorted('sequence')

        tiles = []
        for menu in roots:
            action_id = menu._reparto_home_resolve_action_id()
            if not action_id:
                continue
            tiles.append({
                'id': menu.id,
                'name': menu.name,
                'web_icon_data': menu.web_icon_data.decode() if menu.web_icon_data else False,
                'action_id': action_id,
            })
        return tiles
