import { patch } from "@web/core/utils/patch";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";

const UMBRAL_STOCK_BAJO = 10;

/**
 * Cuánto queda del stock del camión (foto de la sesión, ver
 * pos_stock_limit/models/product_template.py) después de restar lo que ya
 * está cargado de este mismo producto en el pedido actual. Puramente
 * informativo — el bloqueo real de sobreventa sigue siendo el guard de
 * pos_order.py al cobrar, esto no lo reemplaza.
 */
patch(Orderline.prototype, {
    get repartoStockRestante() {
        const line = this.props.line;
        const template = line.product_id?.product_tmpl_id;
        if (!template?.is_storable) {
            return null;
        }
        const tmplId = template.id;
        const enElPedido = (line.order_id?.lines || [])
            .filter((l) => l.product_id?.product_tmpl_id?.id === tmplId)
            .reduce((sum, l) => sum + (l.qty || 0), 0);
        return (template.reparto_stock_disponible ?? 0) - enElPedido;
    },
    get repartoStockRestanteClass() {
        const restante = this.repartoStockRestante;
        if (restante === null) {
            return "";
        }
        if (restante <= 0) {
            return "text-danger fw-bolder";
        }
        return restante <= UMBRAL_STOCK_BAJO ? "text-warning" : "text-muted";
    },
});
