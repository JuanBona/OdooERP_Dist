import { patch } from "@web/core/utils/patch";
import { user } from "@web/core/user";
import { NavBar } from "@web/webclient/navbar/navbar";

// Solo el administrador técnico ve el menú "Todas las aplicaciones" de la barra
// superior. Los roles de negocio navegan con la pantalla de Inicio (tiles) y el
// botón de Inicio de la barra (ver home_systray.js), y no deben ver la lista de apps.
patch(NavBar.prototype, {
    setup() {
        super.setup(...arguments);
        this.canSeeAllApps = user.isSystem;
    },
});
