import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    setPartnerToCurrentOrder(partner) {
        if (partner && partner.credito_monto_adeudado > 0) {
            const dias = partner.credito_dias_sin_pago;
            let titulo = _t("Aviso de cuenta corriente");
            if (dias >= 15) {
                titulo = _t("¡Cliente con deuda vencida!");
            } else if (dias >= 10) {
                titulo = _t("Cliente cerca del límite de crédito");
            }
            this.dialog.add(AlertDialog, {
                title: `${titulo} - ${partner.name}`,
                body: _t(
                    "Debe $%s desde hace %s día(s). Esto no impide la venta, es solo informativo.",
                    partner.credito_monto_adeudado.toFixed(2),
                    dias
                ),
            });
        }
        return super.setPartnerToCurrentOrder(...arguments);
    },
});
