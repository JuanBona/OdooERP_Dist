import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";

export class RepartoViajeScreen extends Component {
    static template = "pos_reparto_viaje.ViajeScreen";
    static props = { ...standardActionServiceProps };

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.state = useState({ viaje: false, loading: true, error: false });
        onWillStart(async () => {
            try {
                this.state.viaje = await this.orm.call("reparto.viaje", "get_mi_viaje_hoy", []);
            } catch {
                this.state.error = true;
            }
            this.state.loading = false;
        });
    }

    async onParadaClick(parada) {
        if (parada.visitado) {
            return;
        }
        const action = await this.orm.call("reparto.viaje.parada", "action_abrir_pos", [parada.id]);
        this.actionService.doAction(action);
    }
}

registry.category("actions").add("pos_reparto_viaje.viaje_screen", RepartoViajeScreen);
