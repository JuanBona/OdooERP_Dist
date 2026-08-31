import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";

/**
 * Devuelve los tramos de descuento por volumen del producto de esta línea,
 * ordenados por cantidad ascendente, marcando cuál está activo según la
 * cantidad actual del renglón. Los product.pricelist.item ya viajan al POS
 * en la carga inicial, así que esto funciona offline.
 */
patch(Orderline.prototype, {
    get repartoVolumenTramos() {
        const line = this.props.line;
        const product = line.product_id;
        if (!product) {
            return [];
        }
        // Verificado en core: en el frontend POS `product.product` expone
        // `product_tmpl_id` como registro relacional de `product.template`
        // (usa `this.product_tmpl_id?.onUpdate()` en
        // point_of_sale/static/src/app/models/product_product.js), por lo que
        // `.id` es el id de la plantilla.
        const tmplId = product.product_tmpl_id?.id;
        const items = this.pos.models["product.pricelist.item"].getAll();
        const ahora = new Date();
        const tramos = items
            .filter((item) => {
                if (item.compute_price !== "percentage" || !item.min_quantity || item.min_quantity <= 0) {
                    return false;
                }
                const itemTmplId = item.product_tmpl_id?.id ?? item.product_tmpl_id;
                if (itemTmplId !== tmplId) {
                    return false;
                }
                if (item.date_start && new Date(item.date_start) > ahora) {
                    return false;
                }
                if (item.date_end && new Date(item.date_end) < ahora) {
                    return false;
                }
                return true;
            })
            .map((item) => ({ minQty: item.min_quantity, percent: item.percent_price }))
            .sort((a, b) => a.minQty - b.minQty);

        const qty = line.qty || 0;
        let activoIdx = -1;
        tramos.forEach((t, i) => {
            if (qty >= t.minQty) {
                activoIdx = i;
            }
        });
        return tramos.map((t, i) => ({ ...t, activo: i === activoIdx }));
    },
});
