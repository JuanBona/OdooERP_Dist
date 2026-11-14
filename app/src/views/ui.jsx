import React from "react";
import { diasSinPagar, fmt, tieneAlerta, ESTADOS, ESTADO_CLASE } from "../lib/reglas";

const COLOR = { "Almacén": "#B7950B", "Bebidas": "#C0392B", "Vinos": "#6C3483", "Destilados": "#148F77", "Vinos finos": "#7B1F3A" };

// Foto genérica por categoría hasta que el admin suba la real.
export function ProdImg({ p, size = 56, full = false }) {
  const col = COLOR[p.categoria] || "#888";
  const style = full ? { width: "100%", height: 130, borderRadius: 0 } : { width: size, height: size };
  if (p.foto) return <div className="pimg" style={style}><img src={p.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>;
  const ini = p.nombre.replace(/^(GASEOSA|GAS\.|VINO|AGUA|CERVEZA)\s+/i, "").slice(0, 2).toUpperCase();
  return (
    <div className="pimg" style={{ ...style, background: col + "22" }}>
      <svg viewBox="0 0 40 60" width={full ? 46 : size * 0.55} height={full ? 70 : size * 0.8}>
        <rect x="15" y="2" width="10" height="9" rx="2" fill={col} />
        <path d="M14 11h12l3 9v34a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4V20z" fill={col} />
        <rect x="11" y="28" width="18" height="12" rx="2" fill="#fff" />
        <text x="20" y="37" fontSize="8" fontWeight="800" textAnchor="middle" fill={col}>{ini}</text>
      </svg>
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
