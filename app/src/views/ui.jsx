import React from "react";
import { diasSinPagar, fmt, tieneAlerta, ESTADOS, ESTADO_CLASE } from "../lib/reglas";

const COLOR = { "Almacén": ["#E0A526", "#B7791F"], "Bebidas": ["#E2483D", "#A8241C"], "Vinos": ["#8E44AD", "#5B2C6F"],
  "Destilados": ["#1ABC9C", "#117A65"], "Vinos finos": ["#A93250", "#6E1A33"] };

// Silueta según el tipo de producto (sale del nombre).
const SILUETA = {
  vino: "M17 2h6v10c0 2 4 4 4 9v35a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V21c0-5 4-7 4-9z",
  bidon: "M14 4h12v5h3a6 6 0 0 1 6 6v39a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V15a6 6 0 0 1 6-6h3zM29 14h-4v12h4a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2z",
  lata: "M10 6h20l2 4v42l-2 4H10l-2-4V10z",
  caja: "M6 14 20 7l14 7v32l-14 7-14-7zM6 14l14 7 14-7M20 21v32",
  botella: "M16 2h8v8l4 8v36a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V18l4-8z",
};
function tipoDe(nombre) {
  const n = nombre.toUpperCase();
  if (/VINO|MALBEC|CABERNET|BORGO|CHANDON|3\/4|CHAMP|ESPUMANTE|OPORTO|MARSALA|MARSALLA/.test(n)) return "vino";
  if (/BIDON|10 L|12 L|20 L|6L/.test(n)) return "bidon";
  if (/LATA|473|CERVEZA/.test(n)) return "lata";
  if (/HARINA|DULCE|KG|AZUCAR|YERBA|FIDEO/.test(n)) return "caja";
  return "botella";
}
const marca = nombre => nombre.replace(/^(GASEOSA|GAS\.|VINO|AGUA MINERAL|AGUA POTABLE PURIF\.|AGUA SABORIZADA|AGUA|CERVEZA|ACEITE DE|VODKA|RON|DULCE DE)\s+/i, "").split(/\s+/)[0];

// Foto genérica por categoría hasta que el admin suba la real.
export function ProdImg({ p, size = 56, full = false }) {
  const [a, b] = COLOR[p.categoria] || ["#8A8A8A", "#5A5A5A"];
  const style = full ? { width: "100%", height: 132, borderRadius: 0 } : { width: size, height: size };
  if (p.foto) return <div className="pimg" style={style}><img src={p.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>;
  const h = full ? 74 : size * 0.68;
  return (
    <div className="pimg pimg-gen" style={{ ...style, background: `radial-gradient(120% 90% at 30% 15%, ${a}, ${b})` }}>
      <svg viewBox="0 0 40 60" width={h * 0.66} height={h} style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,.25))" }}>
        <path d={SILUETA[tipoDe(p.nombre)]} fill="rgba(255,255,255,.92)" stroke="rgba(255,255,255,.6)" strokeWidth="1" />
      </svg>
      {full && <span className="pimg-marca">{marca(p.nombre)}</span>}
    </div>
  );
}

export function ChipCuenta({ c }) {
  return (
    <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {c.saldo < 0 ? <span className="chip warn">Debe {fmt(-c.saldo)}</span>
        : c.saldo > 0 ? <span className="chip st-entregado">A favor {fmt(c.saldo)}</span>
        : <span className="chip st-preparado">Al día</span>}
      {tieneAlerta(c) && <span className="chip alerta">⚠ {diasSinPagar(c) >= 999 ? "Sin pagos registrados" : diasSinPagar(c) + " días sin pagar"}</span>}
    </span>
  );
}

export const ChipEstado = ({ e }) => <span className={"chip " + ESTADO_CLASE[e]}>{ESTADOS[e]}</span>;

export const fechaHora = iso => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
