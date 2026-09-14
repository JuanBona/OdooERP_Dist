import { patch } from "@web/core/utils/patch";
import { ProductCard } from "@point_of_sale/app/components/product_card/product_card";

const UMBRAL_STOCK_BAJO = 10;

/**
 * Badge chico con el stock disponible del camión en cada tile de la
 * grilla — foto de la sesión (ver pos_stock_limit/models/product_template.py
 * ::_load_pos_data_read), no se sincroniza en vivo entre tablets. Solo
 * para productos con seguimiento de inventario (is_storable).
 *
 * reparto_stock_disponible puede venir undefined si el dispositivo tiene
 * un cache local viejo (de antes de instalar este módulo) que todavía no
 * se resincronizó — Odoo POS no refresca automáticamente productos ya
 * cacheados solo porque se agregó un campo nuevo. Se distingue "no sé"
 * (undefined) de "confirmado en cero" (0) para no mostrar un número
 * fabricado que parezca dato real (ver nota en el manual, sección 15).
 */
patch(ProductCard.prototype, {
    get repartoMostrarStock() {
        return Boolean(this.props.product.is_storable);
    },
    get repartoStockDisponible() {
        return this.props.product.reparto_stock_disponible;
    },
    get repartoStockConocido() {
        return this.repartoStockDisponible !== undefined && this.repartoStockDisponible !== null;
    },
    get repartoStockClass() {
        if (!this.repartoStockConocido) {
            return "text-bg-light text-muted";
        }
        return this.repartoStockDisponible <= UMBRAL_STOCK_BAJO ? "text-bg-warning" : "text-bg-secondary";
    },
});
