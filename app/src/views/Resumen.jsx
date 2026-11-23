import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { NO_ES_GASTO, calcProfit, fmt } from "../lib/reglas";
import { useGanancia } from "../lib/useGanancia";
import { api } from "../api";

// Resumen del mes para Gerencia. No pide cargar nada nuevo: sale de pedidos, cobros y gastos.
// Todo se acumula durante el mes; el último día a las 20 h se cierra (ver Cierre.jsx) y a las 12 de la noche
// el Resumen arranca de 0 con el mes nuevo. Meses en hora local (ver lib/mes.js).
import { mesActual, mesPorCerrar, mover, nombreMes, textoCierre } from "../lib/mes";

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
  // Gastos = salidas de la caja que no vuelven (sin contar retiros del dueño).
  const gastos = db.caja.filter(m => enMes(m.fecha) && m.tipo === "egreso" && !m.vuelve && !NO_ES_GASTO.includes(m.concepto))
    .map(m => ({ categoria: m.concepto, monto: -m.monto }));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const vendido = sum(peds, p => p.total);
  const cobrado = sum(cobros, c => c.monto);
  const gastado = sum(gastos, g => g.monto);
  const comisionesPagadas = sum(db.caja.filter(m => enMes(m.fecha) && m.tipo === "egreso" && m.concepto === "Pago de comisiones"), m => -m.monto);
  const porCerrar = mesPorCerrar(db);
  const cerrado = (db.cierres || []).find(c => c.mes === mes);
  const comisiones = sum(cobros, c => c.comision || 0);
  const g = useGanancia(db, mes);
  const pr = g ? calcProfit(db, mes, g) : null; // null mientras se calcula
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
        <span className="chip st-preparado" style={{ fontSize: 14, padding: "6px 12px" }}>{cerrado ? `Cerrado el ${new Date(cerrado.hora).toLocaleString("es-AR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} hs` : textoCierre(mes)}</span>
        <div className="row"><button className="btn sec sm" aria-label="Mes anterior" disabled={api.modo === "supabase" && mes <= mover(mesActual(), -1)} title={api.modo === "supabase" && mes <= mover(mesActual(), -1) ? "La app guarda en la tablet los últimos 60 días" : ""} onClick={() => setMes(mover(mes, -1))}>‹</button>
          <b style={{ minWidth: 140, textAlign: "center" }}>{nombreMes(mes)}</b>
          <button className="btn sec sm" aria-label="Mes siguiente" disabled={mes >= mesActual()} onClick={() => setMes(mover(mes, 1))}>›</button></div>
      </div>

      {porCerrar && <div className="card" style={{ marginBottom: 12, borderColor: "var(--brand)" }}>
        <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}><b>Hay que cerrar {nombreMes(porCerrar)}: arreglar con los vendedores y ver el resumen.</b>
          <button className="btn brand" onClick={() => go("cierre", { mes: porCerrar })}>Cerrar el mes</button></div></div>}
      {cerrado && <div className="card" style={{ marginBottom: 12 }}><div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <span>Mes cerrado. Los números se siguen viendo hasta las 12 de la noche; después arranca el mes nuevo desde 0.</span>
        <button className="btn sec sm" onClick={() => go("cierre", { mes })}>Ver el cierre</button></div></div>}

      <div className="grid g3" style={{ marginBottom: 8 }}>
        <div className="card kpi"><div className="num">{fmt(vendido)}</div><div className="lbl">Vendido · {peds.length} {peds.length === 1 ? "pedido" : "pedidos"} ({entregados.length} entregados)</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--entr)" }}>{fmt(cobrado)}</div><div className="lbl">Cobrado</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--danger)" }}>{fmt(gastado)}</div><div className="lbl">Gastos</div></div>
        <div className="card kpi"><div className="num">{fmt(comisionesPagadas)}</div><div className="lbl">Comisiones ya pagadas (no son gasto: ya se restan abajo)</div></div>
        <div className="card kpi"><div className="num">{fmt(comisiones)}</div><div className="lbl">Comisiones a pagar</div></div>
        <div className="card kpi" style={{ borderColor: "var(--brand)" }}><div className="num">{fmt(cobrado - gastado - comisiones)}</div><div className="lbl">Lo que quedó (cobrado − gastos − comisiones)</div></div>
        <div className="card kpi" style={{ borderColor: "var(--brand)" }}><div className="num" style={{ color: !pr || pr.profit >= 0 ? "var(--entr)" : "var(--danger)" }}>{pr ? fmt(pr.profit) : "…"}</div><div className="lbl">Profit (ganancia − gastos − comisiones)</div></div>
        <div className="card kpi" style={{ cursor: "pointer" }} onClick={() => go("clientes")}><div className="num" style={{ color: "var(--prep)" }}>{fmt(deuda)}</div><div className="lbl">Te deben hoy (todos los clientes)</div></div>
      </div>
      <p className="muted" style={{ marginBottom: 6 }}>
        {!pr ? "Calculando la ganancia…"
          : pr.conCostos
            ? <>Ganancia {fmt(pr.ganancia)}: lo cobrado este mes ({fmt(pr.cobrado)}) con el precio y el costo de cada venta original, así un cambio de precio posterior no la altera (cada cobro paga primero las ventas más viejas del cliente). Se restan gastos {fmt(pr.gastos)} (sin pagos a proveedores, retiros del dueño ni pago de comisiones, y sin pases entre cajas) y comisiones {fmt(pr.comisiones)}.</>
            : "Todavía no hay cobros de ventas con costo cargado este mes, así que no se puede calcular la ganancia. Cargá los costos en Artículos."}
        {pr && pr.cobradoSinCosto > 0 && pr.conCostos && ` De lo cobrado, ${fmt(pr.cobradoSinCosto)} corresponde a deudas anteriores o a ventas sin costo cargado: no suma ganancia.`}
        {pr && pr.productosSinCosto > 0 && ` Faltan costos en ${pr.productosSinCosto} ${pr.productosSinCosto === 1 ? "producto" : "productos"}: lo que se vende sin costo no entra en el cálculo.`}
      </p>

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
