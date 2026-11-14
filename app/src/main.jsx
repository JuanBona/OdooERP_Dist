import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./estetica.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

// App instalable y usable sin señal (solo en el build real, no en desarrollo).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
