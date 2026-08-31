import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        const params = new URLSearchParams(window.location.search);
        const partnerId = params.get("reparto_partner_id");
        if (partnerId) {
            const partner = this.models["res.partner"].get(parseInt(partnerId, 10));
            if (partner) {
                // this.getOrder() puede ser undefined aca: al terminar setup(),
                // todavia no se creo ninguna orden (eso pasa recien al entrar a
                // la pantalla de venta, despues de la pantalla de login del
                // cajero). this.setPartnerToCurrentOrder() asume que ya existe
                // una orden y explota con TypeError si no. addNewOrder() es el
                // mismo metodo publico que el core usa en sus propios fallbacks
                // (ver openOrder/getEmptyOrder en pos_store.js) para crear una
                // si hace falta.
                const order = this.getOrder() || this.addNewOrder();
                order.setPartner(partner);
            }
        }
    },
});
