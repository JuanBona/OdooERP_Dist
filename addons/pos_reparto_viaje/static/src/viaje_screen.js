import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { AlertDialog, ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

export class RepartoViajeScreen extends Component {
    static template = "pos_reparto_viaje.ViajeScreen";
    static props = { ...standardActionServiceProps };

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.state = useState({ viaje: false, loading: true, error: false, cobro: false });
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

    onDeudaClick(parada, ev) {
        ev.stopPropagation();
        this.state.cobro = {
            paradaId: parada.id,
            partnerName: parada.partner_name,
            monto: parada.deuda_monto,
            medio: "efectivo",
        };
    }

    cancelarCobro() {
        this.state.cobro = false;
    }

    confirmarCobro() {
        const cobro = this.state.cobro;
        this.dialog.add(ConfirmationDialog, {
            title: _t("Confirmar cobro"),
            body: _t(
                "¿Confirmás cobrar $%s a %s por %s? No se puede deshacer desde acá.",
                Number(cobro.monto).toFixed(2),
                cobro.partnerName,
                cobro.medio
            ),
            confirm: () => this.ejecutarCobro(cobro),
            cancel: () => {},
        });
    }

    async ejecutarCobro(cobro) {
        try {
            const nuevaDeuda = await this.orm.call(
                "reparto.viaje.parada",
                "action_cobrar_deuda",
                [cobro.paradaId, Number(cobro.monto), cobro.medio]
            );
            const parada = this.state.viaje.paradas.find((p) => p.id === cobro.paradaId);
            parada.deuda_monto = nuevaDeuda;
            parada.visitado = true;
            this.state.cobro = false;
        } catch (error) {
            this.state.cobro = false;
            this.dialog.add(AlertDialog, {
                title: _t("No se pudo registrar el cobro"),
                body: error.data ? error.data.message : String(error),
            });
        }
    }
}

registry.category("actions").add("pos_reparto_viaje.viaje_screen", RepartoViajeScreen);
