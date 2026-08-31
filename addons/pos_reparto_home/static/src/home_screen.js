import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

export class RepartoHomeScreen extends Component {
    static template = "pos_reparto_home.HomeScreen";
    static props = { ...standardActionServiceProps };

    setup() {
        this.actionService = useService("action");
        this.menuService = useService("menu");
        this.orm = useService("orm");
        this.state = useState({ tiles: [], loading: true, error: false });
        onWillStart(async () => {
            try {
                this.state.tiles = await this.orm.call("ir.ui.menu", "get_reparto_home_tiles", []);
            } catch {
                this.state.error = true;
            }
            this.state.loading = false;
        });
    }

    onTileClick(tile) {
        // doAction por si solo no alcanza: el navbar de arriba (submenus del
        // modulo, ej. Ventas) depende del "currentApp" del menu service, que
        // solo se actualiza via onActionReady -> setCurrentMenu. Sin esto el
        // navbar se queda mostrando la app anterior (o vacio).
        this.actionService.doAction(tile.action_id, {
            clearBreadcrumbs: true,
            onActionReady: () => this.menuService.setCurrentMenu(tile.id),
        });
    }
}

registry.category("actions").add("pos_reparto_home.home_screen", RepartoHomeScreen);
