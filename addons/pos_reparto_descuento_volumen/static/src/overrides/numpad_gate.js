import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";

/**
 * RF-PV-09: el override manual de precio y descuento en el renglón queda
 * restringido a Administración Operativa / Gerencia. El backend
 * (pos.order.create) lo bloquea de verdad; acá solo se ocultan los botones
 * para que el Vendedor no los tenga a mano.
 */
patch(ProductScreen.prototype, {
    getNumpadButtons() {
        const buttons = super.getNumpadButtons();
        const puedeOverride = !!this.pos.getCashier()?._reparto_puede_override;
        if (puedeOverride) {
            return buttons;
        }
        return buttons.map((button) =>
            ["discount", "price"].includes(button.value)
                ? { ...button, disabled: true }
                : button
        );
    },
});
