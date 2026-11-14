import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { fmt } from "../lib/reglas";

// Resumen del mes para Gerencia. No pide cargar nada nuevo: sale de pedidos, cobros y gastos.
const mesActual = () => new Date().toISOString().slice(0, 7);
const nombreMes = m => { const s = new Date(m + "-15").toLocaleDateString("es-AR", { month: "long", year: "numeric" }); return s[0].toUpperCase() + s.slice(1); };
const mover = (m, d) => { const x = new Date(m + "-15"); x.setMonth(x.getMonth() + d); return x.toISOString().slice(0, 7); };

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
  const [mes, setMes] = useState(mesActual());
  const enMes = f => f && f.startsWith(mes);
  const peds = db.pedidos.filter(p => enMes(p.fecha) && !["anulado", "rechazado"].includes(p.estado));
  const entregados = peds.filter(p => p.estado === "entregado");
  const cobros = db.cobros.filter(c => enMes(c.fecha));
  const gastos = db.gastos.filter(g => enMes(g.fecha));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const vendido = sum(peds, p => p.total);
  const cobrado = sum(cobros, c => c.monto);
  const gastado = sum(gastos, g => g.monto);
  const comisiones = sum(cobros, c => c.comision || 0);
  const deuda = sum(db.clientes.filter(c => c.saldo < 0), c => -c.saldo);

  const vendedores = db.usuarios.filter(u => u.rol === "vendedor").map(u => ({
    u, pedidos: peds.filter(p => p.vendedorId === u.id).length,
    vendido: sum(peds.filter(p => p.vendedorId === u.id), p => p.total),
    cobrado: sum(cobros.filter(c => c.vendedorId === u.id), c => c.monto),
    comision: sum(cobros.filter(c => c.vendedorId === u.id), c => c.comision || 0),
  }));
  const prod = {};
  peds.forEach(p => p.lineas.forEach(l => { prod[l.nombre] = (prod[l.nombre] || 0) + l.cant; }));
  const topProd = Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => [n, c, c + " u."]);
  const porTipo = {};
  gastos.forEach(g => { porTipo[g.categoria] = (porTipo[g.categoria] || 0) + g.monto; });
  const deudores = db.clientes.filter(c => c.saldo < 0).sort((a, b) => a.saldo - b.saldo).slice(0, 6);

  return (
    <>
      <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div><h1>Resumen del mes</h1><p className="muted">Sale solo de lo que ya se carga: pedidos, cobros y gastos.</p></div>
        <div className="row"><button className="btn sec sm" aria-label="Mes anterior" onClick={() => setMes(mover(mes, -1))}>‹</button>
          <b style={{ minWidth: 140, textAlign: "center" }}>{nombreMes(mes)}</b>
          <button className="btn sec sm" aria-label="Mes siguiente" disabled={mes >= mesActual()} onClick={() => setMes(mover(mes, 1))}>›</button></div>
      </div>

      <div className="grid g3" style={{ marginBottom: 8 }}>
        <div className="card kpi"><div className="num">{fmt(vendido)}</div><div className="lbl">Vendido · {peds.length} {peds.length === 1 ? "pedido" : "pedidos"} ({entregados.length} entregados)</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--entr)" }}>{fmt(cobrado)}</div><div className="lbl">Cobrado</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--danger)" }}>{fmt(gastado)}</div><div className="lbl">Gastos</div></div>
        <div className="card kpi"><div className="num">{fmt(comisiones)}</div><div className="lbl">Comisiones a pagar</div></div>
        <div className="card kpi" style={{ borderColor: "var(--brand)" }}><div className="num">{fmt(cobrado - gastado - comisiones)}</div><div className="lbl">Lo que quedó (cobrado − gastos − comisiones)</div></div>
        <div className="card kpi" style={{ cursor: "pointer" }} onClick={() => go("clientes")}><div className="num" style={{ color: "var(--prep)" }}>{fmt(deuda)}</div><div className="lbl">Te deben hoy (todos los clientes)</div></div>
      </div>
      <p className="muted" style={{ marginBottom: 6 }}>No muestra ganancia sobre la mercadería porque no se carga el costo de compra. Si lo quiere, se suma un campo “costo” en Artículos.</p>

      <div className="sec-h"><h2>Por vendedor</h2></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table><thead><tr><th>Vendedor</th><th>Pedidos</th><th>Vendido</th><th>Cobrado</th><th>Comisión</th></tr></thead>
          <tbody>{vendedores.map(v => <tr key={v.u.id}><td>{v.u.nombre} <span className="muted">({v.u.comisionPct || 0}%)</span></td><td>{v.pedidos}</td><td>{fmt(v.vendido)}</td><td>{fmt(v.cobrado)}</td><td><b>{fmt(v.comision)}</b></td></tr>)}</tbody>
        </table>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card"><h2>Lo más vendido</h2><Barras data={topProd} /></div>
        <div className="card"><h2>Gastos por tipo</h2><Barras data={Object.entries(porTipo).sort((a, b) => b[1] - a[1])} /></div>
      </div>

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
    </>
  );
}
