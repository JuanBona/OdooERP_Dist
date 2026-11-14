import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api/demo";
import { fmt, puede } from "../lib/reglas";
import { fechaHora } from "./ui.jsx";

export const CATS_GASTO = ["Combustible", "Peaje", "Comida", "Repuestos", "Mercadería", "Otros"];
const MEDIOS = ["Efectivo", "Transferencia", "Cheque"];

// Cuentas de una sesión de caja.
export function cuentasCaja(db, caja) {
  const cobros = db.cobros.filter(c => c.cajaId === caja.id);
  const gastos = db.gastos.filter(g => g.cajaId === caja.id);
  const porMedio = m => cobros.filter(c => c.medio === m).reduce((s, c) => s + c.monto, 0);
  const gastoEf = gastos.filter(g => g.medio === "Efectivo").reduce((s, g) => s + g.monto, 0);
  const esperado = caja.fondo + porMedio("Efectivo") - gastoEf;
  return {
    cobros, gastos, esperado,
    efectivo: porMedio("Efectivo"), transferencia: porMedio("Transferencia"), cheque: porMedio("Cheque"),
    totalCobrado: cobros.reduce((s, c) => s + c.monto, 0), totalGastos: gastos.reduce((s, g) => s + g.monto, 0), gastoEf,
    diferencia: caja.contado == null ? null : caja.contado - esperado,
  };
}

const Dif = ({ d }) => d === 0 ? <span className="chip st-entregado">Cuadra</span>
  : d > 0 ? <span className="chip st-preparado">Sobran {fmt(d)}</span> : <span className="chip warn">Faltan {fmt(-d)}</span>;

export default function Caja() {
  const { db, user } = useApp();
  const caja = api.cajaAbierta(user.id);
  const porRecibir = puede.administrar(user) ? db.cajas.filter(c => c.estado === "cerrada") : [];
  const historial = db.cajas.filter(c => c.estado !== "abierta" && (puede.administrar(user) || c.usuarioId === user.id));
  return (
    <>
      <h1>Caja</h1>
      <p className="muted" style={{ marginBottom: 14 }}>Abrís la caja al empezar, cargás cobros y gastos, y al final contás el efectivo y la cerrás. Administración recibe la rendición.</p>
      {caja ? <CajaAbierta caja={caja} /> : <AbrirCaja />}
      {porRecibir.length > 0 && <>
        <div className="sec-h"><h2>Rendiciones por recibir</h2></div>
        <div className="card">{porRecibir.map(c => <FilaCaja key={c.id} caja={c} recibir />)}</div>
      </>}
      {historial.length > 0 && <>
        <div className="sec-h"><h2>Cajas anteriores</h2></div>
        <div className="card">{historial.filter(c => c.estado === "rendida" || !puede.administrar(user)).map(c => <FilaCaja key={c.id} caja={c} />)}</div>
      </>}
    </>
  );
}

function AbrirCaja() {
  const { user, toast } = useApp();
  const [fondo, setFondo] = useState("");
  return (
    <div className="card">
      <h2>Tu caja está cerrada</h2>
      <p className="muted" style={{ marginBottom: 12 }}>Poné con cuánto efectivo salís (el cambio). Si no llevás, dejalo en 0.</p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <input id="fondo" type="number" inputMode="numeric" placeholder="Fondo inicial $" value={fondo} onChange={e => setFondo(e.target.value)} style={{ maxWidth: 220 }} />
        <button className="btn" onClick={() => { api.abrirCaja(user, fondo); toast("Caja abierta"); }}>Abrir caja</button>
      </div>
    </div>
  );
}

function CajaAbierta({ caja }) {
  const { db, user, toast } = useApp();
  const [gasto, setGasto] = useState(false);
  const [cerrar, setCerrar] = useState(false);
  const k = cuentasCaja(db, caja);
  const movs = [
    ...k.cobros.map(c => ({ hora: c.hora, txt: db.clientes.find(x => x.id === c.clienteId)?.nombre, sub: "Cobro · " + c.medio, monto: c.monto })),
    ...k.gastos.map(g => ({ hora: g.hora, txt: g.categoria + (g.detalle ? " · " + g.detalle : ""), sub: "Gasto · " + g.medio, monto: -g.monto })),
  ].sort((a, b) => b.hora.localeCompare(a.hora));

  return (
    <>
      <div className="card">
        <div className="row between" style={{ flexWrap: "wrap" }}>
          <div><span className="chip st-entregado">● Abierta</span> <span className="muted">desde {fechaHora(caja.abierta)}</span></div>
          <div className="row"><button className="btn sec sm" onClick={() => setGasto(true)}>− Cargar gasto</button><button className="btn sm" onClick={() => setCerrar(true)}>Cerrar caja</button></div>
        </div>
        <div className="grid g3" style={{ marginTop: 14 }}>
          <div className="kpi"><div className="num">{fmt(k.esperado)}</div><div className="lbl">Efectivo que tendrías que tener</div></div>
          <div className="kpi"><div className="num" style={{ fontSize: 22 }}>{fmt(k.totalCobrado)}</div><div className="lbl">Cobrado hoy</div></div>
          <div className="kpi"><div className="num" style={{ fontSize: 22 }}>{fmt(k.totalGastos)}</div><div className="lbl">Gastos</div></div>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>Fondo {fmt(caja.fondo)} + efectivo cobrado {fmt(k.efectivo)} − gastos en efectivo {fmt(k.gastoEf)} · Transferencias {fmt(k.transferencia)} · Cheques {fmt(k.cheque)}</div>
      </div>
      <div className="sec-h"><h2>Movimientos</h2></div>
      <div className="card">
        {movs.length === 0 && <div className="empty">Todavía no hay cobros ni gastos. Los cobros se cargan desde la ficha de cada cliente.</div>}
        {movs.map((m, i) => (
          <div key={i} className="list-item" style={{ cursor: "default" }}>
            <div style={{ flex: 1, minWidth: 0 }}><b>{m.txt}</b><div className="muted">{m.sub} · {fechaHora(m.hora)}</div></div>
            <b style={{ color: m.monto < 0 ? "var(--danger)" : "var(--entr)" }}>{m.monto < 0 ? "− " : "+ "}{fmt(Math.abs(m.monto))}</b>
          </div>
        ))}
      </div>
      {gasto && <ModalGasto onClose={() => setGasto(false)} />}
      {cerrar && <ModalCerrar k={k} onClose={() => setCerrar(false)} onOk={(contado, obs) => { api.cerrarCaja(user, contado, obs); toast("Caja cerrada. Queda para que Administración la reciba."); setCerrar(false); }} />}
    </>
  );
}

function ModalGasto({ onClose }) {
  const { user, toast } = useApp();
  const [f, setF] = useState({ categoria: "Combustible", monto: "", medio: "Efectivo", detalle: "" });
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Cargar gasto</h2>
        <div className="grid g2">
          <div className="field"><label htmlFor="g-c">Tipo</label><select id="g-c" value={f.categoria} onChange={e => set("categoria", e.target.value)}>{CATS_GASTO.map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="g-m">Monto</label><input id="g-m" type="number" inputMode="numeric" value={f.monto} onChange={e => set("monto", e.target.value)} /></div>
          <div className="field"><label htmlFor="g-me">Pagado con</label><select id="g-me" value={f.medio} onChange={e => set("medio", e.target.value)}>{MEDIOS.map(m => <option key={m}>{m}</option>)}</select></div>
          <div className="field"><label htmlFor="g-d">Detalle</label><input id="g-d" value={f.detalle} onChange={e => set("detalle", e.target.value)} placeholder="Opcional" /></div>
        </div>
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => { if (!(+f.monto > 0)) return toast("Poné el monto"); api.registrarGasto(user, f); toast("Gasto cargado"); onClose(); }}>Guardar gasto</button></div>
      </div>
    </div>
  );
}

function ModalCerrar({ k, onClose, onOk }) {
  const [contado, setContado] = useState("");
  const [obs, setObs] = useState("");
  const d = contado === "" ? null : Math.round(+contado) - k.esperado;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Cerrar caja</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Contá el efectivo que tenés y escribilo. El sistema lo compara con lo que debería haber: <b>{fmt(k.esperado)}</b>.</p>
        <div className="field"><label htmlFor="cc-c">Efectivo contado</label><input id="cc-c" type="number" inputMode="numeric" value={contado} onChange={e => setContado(e.target.value)} /></div>
        {d !== null && <div style={{ marginBottom: 12 }}><Dif d={d} /></div>}
        {d !== null && d !== 0 && <div className="field"><label htmlFor="cc-o">¿Por qué no cuadra?</label><input id="cc-o" value={obs} onChange={e => setObs(e.target.value)} placeholder="Ej: le di cambio de más a un cliente" /></div>}
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" style={{ flex: 1 }} disabled={contado === ""} onClick={() => onOk(contado, obs)}>Cerrar y rendir</button></div>
      </div>
    </div>
  );
}

function FilaCaja({ caja, recibir }) {
  const { db, user, toast } = useApp();
  const [abierta, setAbierta] = useState(false);
  const u = db.usuarios.find(x => x.id === caja.usuarioId);
  const k = cuentasCaja(db, caja);
  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div className="list-item" onClick={() => setAbierta(!abierta)} style={{ borderBottom: 0 }}>
        <div className="avatar">{u?.nombre.slice(0, 2)}</div>
        <div style={{ flex: 1, minWidth: 0 }}><b>{u?.nombre}</b><div className="muted">{fechaHora(caja.abierta)} → {fechaHora(caja.cerrada)}{caja.recibidaPor ? " · recibió " + caja.recibidaPor : ""}</div></div>
        <div style={{ textAlign: "right" }}><b>{fmt(caja.contado)}</b><div><Dif d={k.diferencia} /></div></div>
      </div>
      {abierta && (
        <div style={{ padding: "0 4px 12px" }} className="muted">
          Fondo {fmt(caja.fondo)} · Efectivo cobrado {fmt(k.efectivo)} · Transferencias {fmt(k.transferencia)} · Cheques {fmt(k.cheque)} · Gastos {fmt(k.totalGastos)} · Esperado {fmt(k.esperado)} · Contado {fmt(caja.contado)}
          {caja.obs && <div>📝 {caja.obs}</div>}
        </div>
      )}
      {recibir && <div style={{ padding: "0 4px 12px" }}><button className="btn sm" onClick={() => { api.recibirRendicion(user, caja.id); toast("Rendición recibida"); }}>✓ Recibí la plata</button></div>}
    </div>
  );
}
