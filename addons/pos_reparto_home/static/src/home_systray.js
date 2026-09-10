import { Component, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

// Boton fijo en la barra superior para volver a "Inicio" desde cualquier
// pantalla del backend (Clientes, Inventario, Ventas, Viajes, Comisiones...).
// Las tiles de pos_reparto_home navegan con clearBreadcrumbs=true (ver
// home_screen.js), asi que una vez adentro de una app no queda ningun
// breadcrumb que lleve de vuelta a Inicio - este boton es el unico camino.
export class RepartoHomeSystrayItem extends Component {
    static template = "pos_reparto_home.SystrayHomeButton";
    static props = {};

    setup() {
        this.menuService = useService("menu");
        this.orm = useService("orm");
        this.homeMenuId = null;
        onWillStart(async () => {
            const [, menuId] = await this.orm.call("ir.model.data", "check_object_reference", [
                "pos_reparto_home",
                "menu_reparto_home",
            ]);
            this.homeMenuId = menuId;
        });
    }

    goHome() {
        if (this.homeMenuId) {
            this.menuService.selectMenu(this.homeMenuId);
        }
    }
}

registry
    .category("systray")
    .add("pos_reparto_home.home_button", { Component: RepartoHomeSystrayItem }, { sequence: 1 });
