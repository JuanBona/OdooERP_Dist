import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { fmt } from "../lib/reglas";
import { api } from "../api";

import { calcularMes, mesActual, mesEnCurso, mesPorCerrar, mover, nombreMes } from "../lib/mes";
import { ResumenMes } from "./Cierre.jsx";

// Resumen del mes para Gerencia. No pide cargar nada nuevo: sale de pedidos, cobros y gastos.
// Todo se acumula durante el mes; al cerrarlo (último día, desde las 18 h) arranca de 0.
function Barras({ data }) {
  const max = Math.max(1, ...data.map(d => d[1]));
  if (!data.length) return <div className="empty">Sin datos este mes.</div>;
  return data.map(([lb, v, txt]) => (
    <div key={lb} className="bar-row"><span className="lb" title={lb}>{lb}</span>
      <span className="tr"><span className="fl" style={{ width: (v / max * 100) + "%", display: "block" }} /></span>
      <span className="vl">{txt ?? fmt(v)}</span></div>
  ));
}

export default function Resumen() {
  const { db, go } = useApp();
  const [mes, setMes] = useState(() => mesEnCurso(db));
  const r = calcularMes(db, mes);
  const deuda = db.clientes.filter(c => c.saldo < 0).reduce((s, c) => s - c.saldo, 0);
  const deudores = db.clientes.filter(c => c.saldo < 0).sort((a, b) => a.saldo - b.saldo).slice(0, 6);
  const porCerrar = mesPorCerrar(db);
  const cerrado = (db.cierres || []).find(c => c.mes === mes);

  return (
    <>
      <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div><h1>Resumen del mes</h1><p className="muted">Sale solo de lo que ya se carga: pedidos, cobros y gastos.</p></div>
        <div className="row"><button className="btn sec sm" aria-label="Mes anterior" disabled={api.modo === "supabase" && mes <= mover(mesActual(), -1)} title={api.modo === "supabase" && mes <= mover(mesActual(), -1) ? "La app guarda en la tablet los últimos 60 días" : ""} onClick={() => setMes(mover(mes, -1))}>‹</button>
          <b style={{ minWidth: 140, textAlign: "center" }}>{nombreMes(mes)}</b>
          <button className="btn sec sm" aria-label="Mes siguiente" disabled={mes >= mesEnCurso(db)} onClick={() => setMes(mover(mes, 1))}>›</button></div>
      </div>

      {porCerrar && <div className="card" style={{ marginBottom: 12, borderColor: "var(--brand)" }}>
        <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}><b>Hay que cerrar {nombreMes(porCerrar)}: arreglar con los vendedores y ver el resumen.</b>
          <button className="btn brand" onClick={() => go("cierre", { mes: porCerrar })}>Cerrar el mes</button></div></div>}
      {cerrado && <div className="card" style={{ marginBottom: 12 }}><div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <span>Mes cerrado el {new Date(cerrado.hora).toLocaleDateString("es-AR")}.</span>
        <button className="btn sec sm" onClick={() => go("cierre", { mes })}>Ver el cierre</button></div></div>}

      <ResumenMes r={r} />
      <div className="card kpi" style={{ cursor: "pointer", marginTop: 8 }} onClick={() => go("clientes")}><div className="num" style={{ color: "var(--prep)" }}>{fmt(deuda)}</div><div className="lbl">Te deben hoy (todos los clientes)</div></div>
      <p className="muted" style={{ margin: "6px 0" }}>No muestra ganancia sobre la mercadería porque no se carga el costo de compra. Si lo quiere, se suma un campo “costo” en Artículos.</p>

      <div className="sec-h"><h2>Por vendedor</h2></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table><thead><tr><th>Vendedor</th><th>Pedidos</th><th>Vendido</th><th>Cobrado</th><th>Comisión acumulada</th></tr></thead>
          <tbody>{r.vendedores.map(v => <tr key={v.id}><td>{v.nombre} <span className="muted">({v.pct}%)</span></td><td>{v.pedidos}</td><td>{fmt(v.vendido)}</td><td>{fmt(v.cobrado)}</td><td><b>{fmt(v.comision)}</b></td></tr>)}</tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}><h2>Gastos por tipo</h2><Barras data={r.gastosPorTipo} /></div>

      <div className="sec-h"><h2>Los que más deben</h2></div>
      <div className="card">
        {deudores.length === 0 && <div className="empty">Nadie debe. 🎉</div>}
        {deudores.map(c => (
          <div key={c.id} className="list-item" onClick={() => go("cliente", { id: c.id })}>
            <div style={{ flex: 1, minWidth: 0 }}><b>{c.nombre}</b><div className="muted">Último pago: {c.ultimoPago || "—"}</div></div>
            <span className="chip warn">{fmt(-c.saldo)}</span>
          </div>
        ))}
      </div>

      {(db.cierres || []).length > 0 && <>
        <div className="sec-h"><h2>Meses cerrados</h2></div>
        <div className="card">{db.cierres.map(c => (
          <div key={c.mes} className="list-item" onClick={() => go("cierre", { mes: c.mes })}>
            <div style={{ flex: 1, minWidth: 0 }}><b>{nombreMes(c.mes)}</b><div className="muted">Facturación {fmt(c.resumen.facturacion)} · {c.resumen.pctGanancia}% de ganancia</div></div>
            <span className="chip">{fmt(c.resumen.profit)}</span>
          </div>))}</div>
      </>}
    </>
  );
}
