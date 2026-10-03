import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        const params = new URLSearchParams(window.location.search);
        const partnerId = params.get("reparto_partner_id");
        if (partnerId) {
            const id = parseInt(partnerId, 10);
            let partner = this.models["res.partner"].get(id);
            if (!partner) {
                // Odoo 19 carga los clientes bajo demanda: al abrir el POS solo hay un
                // par en memoria, asi que hay que pedirle al servidor el de la parada
                // (mismo metodo que usa la lista de clientes del POS).
                try {
                    await this.data.callRelated("res.partner", "get_new_partner", [
                        this.config.id,
                        [["id", "=", id]],
                        0,
                    ]);
                } catch (error) {
                    console.warn("reparto: no se pudo traer el cliente de la parada", error);
                }
                partner = this.models["res.partner"].get(id);
            }
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
