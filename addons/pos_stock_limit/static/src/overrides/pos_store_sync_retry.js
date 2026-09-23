import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

// El core solo reintenta al recibir el evento `online` del navegador. Con señal débil o
// servidor caído el navegador sigue "online" y las órdenes quedan sin sincronizar hasta
// reabrir la sesión, así que reintentamos mientras haya órdenes pendientes.
const SYNC_RETRY_MS = 15000;

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        setInterval(() => {
            const { create, write } = this.pendingOrder;
            if (navigator.onLine && (create.size || write.size)) {
                this.data.checkConnectivity();
            }
        }, SYNC_RETRY_MS);
    },
});
