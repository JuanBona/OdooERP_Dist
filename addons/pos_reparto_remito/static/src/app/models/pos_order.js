import { patch } from "@web/core/utils/patch";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

// Este sistema no factura (el remito interno reemplaza al comprobante). El POS tilda
// "Recibo/Factura" solo cuando el cliente es una empresa, y esa factura despues falla
// por tipo de documento fiscal: se conserva lo que el usuario haya elegido.
patch(PosOrder.prototype, {
    setPartner(partner) {
        const toInvoice = this.isToInvoice();
        super.setPartner(...arguments);
        this.setToInvoice(toInvoice);
    },
});
