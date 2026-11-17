import React from "react";

// Íconos de línea simples (estilo Lucide, dibujados acá para no sumar dependencias).
const P = {
  inicio: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  clientes: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 3.6a3.5 3.5 0 0 1 0 6.8",
  catalogo: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  pedidos: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  deposito: "M3 8l9-5 9 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 8h18M8 20v-7h8v7",
  calc: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01M16 18h.01",
  hoja: "M9 20 3 17V4l6 3 6-3 6 3v13l-6-3zM9 7v13M15 4v13",
  caja: "M3 7h18v12H3zM3 11h18M16 15h2M7 7V5h10v2",
  resumen: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  articulos: "M20 7 12 3 4 7v10l8 4 8-4zM4 7l8 4 8-4M12 11v10",
  usuarios: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  salir: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3",
  luna: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  sol: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  mas: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  alerta: "M12 3 2 20h20zM12 10v4M12 17.5v.01",
  imprimir: "M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z",
  camion: "M1 4h14v11H1zM15 8h4l3 3v4h-7M5.5 18.5a1.5 1.5 0 1 0 0-.01M18.5 18.5a1.5 1.5 0 1 0 0-.01",
  camara: "M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  check: "M4 12.5 9 17.5 20 6.5",
  atras: "M15 18l-6-6 6-6",
  plata: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01",
  nota: "M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h5",
  oferta: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01",
  lapiz: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  sinSenal: "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4-2.6M19 12.9a10 10 0 0 0-2.3-1.6M12 20h.01",
  buscar: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
};

export function Icon({ n, s = 20, className = "", style }) {
  return (
    <svg className={"ico " + className} style={style} width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[n]} />
    </svg>
  );
}

// Avatar con color estable según el nombre.
const TONOS = ["#C03028", "#1E5FBF", "#1B7F46", "#B98A00", "#6B21A8", "#0E7490", "#C15E08", "#8E211B"];
export function Avatar({ txt }) {
  const t = String(txt || "?");
  let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const col = TONOS[h % TONOS.length];
  const ini = t.startsWith("#") ? t : t.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return <div className="avatar" style={{ background: col + "1f", color: col }}>{ini}</div>;
}
