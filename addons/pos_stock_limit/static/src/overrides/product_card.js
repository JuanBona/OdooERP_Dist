import { patch } from "@web/core/utils/patch";
import { ProductCard } from "@point_of_sale/app/components/product_card/product_card";

const UMBRAL_STOCK_BAJO = 10;

/**
 * Badge chico con el stock disponible del camión en cada tile de la
 * grilla — foto de la sesión (ver pos_stock_limit/models/product_template.py
 * ::_load_pos_data_read), no se sincroniza en vivo entre tablets. Solo
 * para productos con seguimiento de inventario (is_storable).
 */
patch(ProductCard.prototype, {
    get repartoMostrarStock() {
        return Boolean(this.props.product.is_storable);
    },
    get repartoStockDisponible() {
        return this.props.product.reparto_stock_disponible ?? 0;
    },
    get repartoStockClass() {
        return this.repartoStockDisponible <= UMBRAL_STOCK_BAJO ? "text-bg-warning" : "text-bg-secondary";
    },
});
