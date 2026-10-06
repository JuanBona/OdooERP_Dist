import { patch } from "@web/core/utils/patch";
import { RPCError } from "@web/core/network/rpc";
import OrderPaymentValidation from "@point_of_sale/app/utils/order_payment_validation";

// Si el servidor rechaza el pedido (p. ej. "Stock insuficiente"), el core lo deja en borrador pero
// conserva las líneas de pago cargadas con el total viejo. Al corregir la cantidad y volver a cobrar,
// quedaban dos pagos en efectivo (+total viejo y -vuelto) y así salían en el ticket. Se descartan los
// pagos manuales; los de terminal electrónica no, porque ya movieron plata real.
patch(OrderPaymentValidation.prototype, {
    handleValidationError(error) {
        const result = super.handleValidationError(...arguments);
        if (error instanceof RPCError) {
            const manuales = this.order.payment_ids.filter(
                (linea) => !linea.payment_method_id.use_payment_terminal
            );
            for (const linea of manuales) {
                this.order.removePaymentline(linea);
            }
        }
        return result;
    },
});
