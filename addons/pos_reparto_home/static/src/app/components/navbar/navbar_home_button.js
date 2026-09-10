import { patch } from "@web/core/utils/patch";
import { Navbar } from "@point_of_sale/app/components/navbar/navbar";

// El boton nativo "Backend" del menu hamburguesa (navbar.xml del core) llama
// a pos.closePos(), que desloguea al cajero (resetCashier()) y solo navega
// si el sync de pedidos pendientes termina bien - no sirve para "ir y volver"
// rapido a mitad de turno. Este boton solo cambia de pantalla, dejando la
// sesion de POS y los pedidos sin sincronizar tal cual quedan (mismo
// comportamiento que ya tiene hoy el boton "Atras" del navegador).
patch(Navbar.prototype, {
    goHome() {
        // menuService (web.assets_backend) guarda la ultima app visitada en
        // sessionStorage bajo "menu_id" y /odoo la restaura al entrar - sin
        // esto, "volver a Inicio" te deja de nuevo en Punto de Venta en vez
        // de la grilla. Se limpia a mano (no hay RPC: tiene que andar offline
        // igual que el resto del POS) para que /odoo caiga en la app de menor
        // secuencia, que es "Inicio" (sequence=1, ver data/home_menu.xml).
        window.sessionStorage.removeItem("menu_id");
        window.location.href = "/odoo";
    },
});
