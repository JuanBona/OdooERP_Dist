import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

export class RepartoHomeScreen extends Component {
    static template = "pos_reparto_home.HomeScreen";
    static props = { ...standardActionServiceProps };

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.state = useState({ tiles: [], loading: true });
        onWillStart(async () => {
            this.state.tiles = await this.orm.call("ir.ui.menu", "get_reparto_home_tiles", []);
            this.state.loading = false;
        });
    }

    onTileClick(tile) {
        this.actionService.doAction(tile.action_id, { clearBreadcrumbs: true });
    }
}

registry.category("actions").add("pos_reparto_home.home_screen", RepartoHomeScreen);
