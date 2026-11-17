import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./estetica.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

// App instalable y usable sin señal (solo en el build real, no en desarrollo).
// Cuando hay una versión nueva se avisa a la app para que ofrezca actualizar. No se recarga sola: se perdería
// un pedido a medio cargar.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(reg => {
    const avisar = () => window.dispatchEvent(new Event("rds-version-nueva"));
    if (reg.waiting) avisar();
    reg.addEventListener("updatefound", () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener("statechange", () => { if (nuevo.state === "installed" && navigator.serviceWorker.controller) avisar(); });
    });
    // Una tablet que queda abierta todo el día también se entera: se busca al volver a la app y cada media hora.
    const buscar = () => reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buscar(); });
    setInterval(buscar, 30 * 60 * 1000);
  }).catch(() => {});
}
