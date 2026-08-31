import { patch } from "@web/core/utils/patch";
import { useEffect } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

/**
 * Cuando a la línea le falta poco (<= max(3, 20% del umbral)) para llegar
 * al próximo tramo de descuento por volumen, avisa una vez por (línea, tramo)
 * con un toast no bloqueante, para que el vendedor pueda ofrecérselo al
 * cliente. Reusa el getter repartoVolumenTramos definido en orderline.js.
 */
patch(Orderline.prototype, {
    setup() {
        super.setup();
        this.notification = useService("notification");
        this._repartoUltimoTramoAvisado = null;
        this._repartoToastTimer = null;
        if (this.props.mode === "display") {
            useEffect(
                () => {
                    this._repartoAgendarChequeoTramo();
                },
                () => [this.props.line.qty]
            );
        }
    },

    _repartoAgendarChequeoTramo() {
        clearTimeout(this._repartoToastTimer);
        this._repartoToastTimer = setTimeout(() => this._repartoChequearProximoTramo(), 400);
    },

    _repartoChequearProximoTramo() {
        const tramos = this.repartoVolumenTramos;
        if (!tramos.length) {
            return;
        }
        const qty = this.props.line.qty || 0;
        const proximo = tramos.find((t) => t.minQty > qty);
        if (!proximo) {
            this._repartoUltimoTramoAvisado = null;
            return;
        }
        const faltan = proximo.minQty - qty;
        const umbral = Math.max(3, Math.round(0.2 * proximo.minQty));
        if (faltan > 0 && faltan <= umbral) {
            if (this._repartoUltimoTramoAvisado !== proximo.minQty) {
                this._repartoUltimoTramoAvisado = proximo.minQty;
                this.notification.add(
                    _t(
                        "Con %s u más, este producto tiene %s%% de descuento",
                        faltan,
                        proximo.percent
                    ),
                    { type: "info" }
                );
            }
        } else if (faltan > umbral) {
            this._repartoUltimoTramoAvisado = null;
        }
    },
});
