import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";

// Dato extra que agrega pos.session.get_closing_control_data (ver models/pos_session.py).
ClosePosPopup.props = [...ClosePosPopup.props, "reparto_cobros_viaje?"];
