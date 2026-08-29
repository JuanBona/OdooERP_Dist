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
                this.setPartnerToCurrentOrder(partner);
            }
        }
    },
});
