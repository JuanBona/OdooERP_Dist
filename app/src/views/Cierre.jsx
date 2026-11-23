import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { calcProfit, fmt } from "../lib/reglas";
import { useGanancia } from "../lib/useGanancia";
import { calcularMes, detallePagoComision, mesActual, mesPorCerrar, nombreMes, puedeCerrarHoy, textoCierre } from "../lib/mes";

// Lo que muestra el resumen de un mes (en vivo o el que quedó guardado al cerrarlo).
export function ResumenMes({ r }) {
  const Lista = ({ filas, vacio }) => filas.length === 0 ? <div className="empty">{vacio}</div> : (
    <table><tbody>{filas.map(([a, b, c], i) => <tr key={i}><td className="muted" style={{ width: 28 }}>{i + 1}</td><td>{a}</td><td style={{ textAlign: "right" }}>{b}</td><td style={{ textAlign: "right" }}><b>{c}</b></td></tr>)}</tbody></table>
  );
  return (
    <>
      <div className="grid g3" style={{ marginBottom: 8 }}>
        <div className="card kpi"><div className="num">{fmt(r.facturacion)}</div><div className="lbl">Facturación · {r.pedidos} {r.pedidos === 1 ? "pedido" : "pedidos"}</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--entr)" }}>{fmt(r.cobrado)}</div><div className="lbl">Cobrado</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--danger)" }}>{fmt(r.gastado)}</div><div className="lbl">Gastos del mes</div></div>
        <div className="card kpi"><div className="num">{fmt(r.comisiones)}</div><div className="lbl">Comisiones de vendedores</div></div>
        <div className="card kpi" style={{ borderColor: "var(--brand)" }}><div className="num">{fmt(r.profit)}</div><div className="lbl">Profit (ganancia {fmt(r.ganancia)} − gastos − comisiones)</div></div>
        <div className="card kpi" style={{ borderColor: "var(--brand)" }}><div className="num">{r.pctGanancia}%</div><div className="lbl">% de ganancia (profit sobre lo cobrado)</div></div>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card" style={{ overflowX: "auto" }}><h2>10 productos más vendidos</h2>
          <Lista vacio="Sin ventas." filas={r.topProductos.map(p => [p.nombre, p.total ? fmt(p.total) : "", p.cant + " u."])} /></div>
        <div className="card" style={{ overflowX: "auto" }}><h2>10 mejores clientes</h2>
          <Lista vacio="Sin ventas." filas={r.topClientes.map(c => [c.nombre, c.pedidos + (c.pedidos === 1 ? " pedido" : " pedidos"), fmt(c.valor)])} /></div>
      </div>
    </>
  );
}

export default function Cierre() {
  const { db, user, go, toast, params } = useApp();
  const mes = params.mes || mesPorCerrar(db) || mesActual();
  const guardado = (db.cierres || []).find(c => c.mes === mes);
  const [porFuera, setPorFuera] = useState({}); // vendedores arreglados sin pasar por la caja
  const [ocupado, setOcupado] = useState(false);
  const g = useGanancia(db, mes, !guardado);

  if (guardado) return (
    <>
      <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div><h1>Cierre de {nombreMes(mes)}</h1><p className="muted">Cerrado el {new Date(guardado.hora).toLocaleString("es-AR")}{guardado.usuario ? " por " + guardado.usuario : ""}.</p></div>
        <button className="btn sec sm" onClick={() => go("resumen")}>Volver</button>
      </div>
      <ResumenMes r={guardado.resumen} />
      <div className="sec-h"><h2>Comisiones pagadas</h2></div>
      <div className="card" style={{ overflowX: "auto" }}><table><thead><tr><th>Vendedor</th><th>Cobrado</th><th>Comisión</th><th>Cómo</th></tr></thead>
        <tbody>{guardado.resumen.vendedores.map(v => <tr key={v.id}><td>{v.nombre} <span className="muted">({v.pct}%)</span></td><td>{fmt(v.cobrado)}</td><td><b>{fmt(v.comision)}</b></td><td>{v.como || "—"}</td></tr>)}</tbody></table></div>
    </>
  );

  if (!g) return <div className="empty">Calculando el resumen del mes…</div>;
  const r = calcularMes(db, mes, calcProfit(db, mes, g));
  const pendientes = r.vendedores.filter(v => v.falta > 0 && !porFuera[v.id]);
  const habilitado = mes < mesActual() || puedeCerrarHoy();
  const accion = async f => { if (ocupado) return; setOcupado(true); try { await f(); } catch (e) { toast(e.message); } finally { setOcupado(false); } };

  const pagar = (v, caja) => accion(async () => {
    await api.movCaja(user, { tipo: "egreso", concepto: "Pago de comisiones", monto: v.falta, persona: v.nombre, detalle: detallePagoComision(mes), vendedorId: v.id, caja });
    toast(`Comisión de ${v.nombre} pagada (${caja === "efectivo" ? "efectivo" : "transferencia"}).`);
  });
  const cerrar = () => accion(async () => {
    if (!confirm(`¿Cerrar ${nombreMes(mes)}? A las 12 de la noche comisiones, facturación, profit y gastos arrancan de 0. Ofertas, descuentos y configuración no cambian.`)) return;
    const resumen = { ...r, vendedores: r.vendedores.map(v => ({ ...v, como: v.comision === 0 ? "Sin comisión" : porFuera[v.id] && v.falta > 0 ? "Por otro medio" : "Desde las cajas" })) };
    await api.cerrarMes(user, mes, resumen);
    toast(`${nombreMes(mes)} cerrado. A las 12 de la noche arranca el mes nuevo desde 0.`);
  });

  return (
    <>
      <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div><h1>Cierre de {nombreMes(mes)}</h1><p className="muted">1) Arreglar con los vendedores · 2) Revisar el resumen · 3) Cerrar el mes.</p></div>
        <button className="btn sec sm" onClick={() => go("resumen")}>Volver</button>
      </div>
      {!habilitado && <div className="card" style={{ marginBottom: 12 }}>{textoCierre(mes)}. Mientras tanto podés ir viendo cómo viene.</div>}

      <div className="sec-h"><h2>1. Arreglar con los vendedores</h2></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table><thead><tr><th>Vendedor</th><th>Cobrado</th><th>Comisión</th><th>Ya pagado</th><th></th></tr></thead>
          <tbody>{r.vendedores.map(v => (
            <tr key={v.id}>
              <td>{v.nombre} <span className="muted">({v.pct}%)</span></td><td>{fmt(v.cobrado)}</td><td><b>{fmt(v.comision)}</b></td><td>{fmt(v.pagado)}</td>
              <td style={{ whiteSpace: "nowrap" }}>{v.falta === 0 ? <span className="chip st-entregado">Listo</span>
                : porFuera[v.id] ? <><span className="chip st-entregado">Por otro medio</span> <button className="btn sec sm" onClick={() => setPorFuera({ ...porFuera, [v.id]: false })}>Deshacer</button></>
                : <><button className="btn sm" disabled={ocupado || !habilitado} onClick={() => pagar(v, "efectivo")}>Pagar {fmt(v.falta)} en efectivo</button>{" "}
                  <button className="btn sec sm" disabled={ocupado || !habilitado} onClick={() => pagar(v, "transferencia")}>Por transferencia</button>{" "}
                  <button className="btn sec sm" disabled={!habilitado} onClick={() => setPorFuera({ ...porFuera, [v.id]: true })}>Lo arreglé por otro medio</button></>}</td>
            </tr>))}</tbody>
        </table>
      </div>

      <div className="sec-h"><h2>2. Resumen del mes</h2></div>
      <ResumenMes r={r} />

      <div className="sec-h"><h2>3. Cerrar el mes</h2></div>
      <div className="card">
        <p className="muted" style={{ marginBottom: 10 }}>A las 12 de la noche vuelven a 0 la comisión de los vendedores, la facturación, el profit y los gastos. Se mantienen las ofertas, los descuentos por cantidad, los clientes con sus saldos y toda la configuración.</p>
        {pendientes.length > 0 && <p style={{ marginBottom: 10 }}>Falta arreglar con: <b>{pendientes.map(v => v.nombre).join(", ")}</b>.</p>}
        <button className="btn brand" disabled={ocupado || !habilitado || pendientes.length > 0} onClick={cerrar}>Cerrar {nombreMes(mes)}</button>
      </div>
    </>
  );
}
