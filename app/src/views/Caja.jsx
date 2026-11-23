import { Icon, Avatar } from "./icons.jsx";
import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { fmt } from "../lib/reglas";
import { fechaHora } from "./ui.jsx";

// Caja del depósito: una sola, la manejan Administración y Gerencia.
export const CONCEPTOS_ENTRADA = ["Rendición de vendedor", "Cobro en el depósito", "Aporte del dueño", "Otro ingreso"];
export const CONCEPTOS_SALIDA = ["Pago a proveedor", "Pago de comisiones", "Sueldo / adelanto de sueldo", "Combustible", "Cambio para el reparto", "Préstamo", "Retiro del dueño", "Gasto varios"];
const VUELVE_POR_DEFECTO = ["Cambio para el reparto", "Préstamo"];
const COMO_VUELVE = ["Efectivo", "Transferencia", "Descontado del sueldo", "Otro"];

export default function Caja() {
  const { db } = useApp();
  const [modal, setModal] = useState(null); // "entrada" | "salida" | "contar" | { devolver: mov }
  const [filtro, setFiltro] = useState("");
  const saldo = api.saldoCaja();
  const pendientes = db.caja.filter(m => api.pendienteDe(m) > 0);
  const vendedores = db.usuarios.filter(u => u.rol === "vendedor").map(u => ({ u, debe: api.aRendir(u.id) })).filter(v => v.debe > 0);
  const hoy = new Date().toISOString().slice(0, 10);
  const movHoy = db.caja.filter(m => m.fecha === hoy);
  const entroHoy = movHoy.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0);
  const salioHoy = movHoy.filter(m => m.monto < 0).reduce((s, m) => s - m.monto, 0);
  const ultimoArqueo = db.arqueos[0];
  const lista = db.caja.filter(m => !filtro || (m.concepto + " " + m.persona + " " + m.detalle).toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div><h1>Caja del depósito</h1><p className="muted">El efectivo que hay en la caja: qué entra, qué sale, a quién y qué tiene que volver.</p></div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setModal("entrada")}><Icon n="mas" s={18} /> Entrada</button>
          <button className="btn dngr" onClick={() => setModal("salida")}><Icon n="menos" s={18} /> Salida</button>
          <button className="btn sec" onClick={() => setModal("contar")}>Contar caja</button>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 6 }}>
        <div className="card kpi" style={{ borderColor: "var(--brand)" }}><div className="num">{fmt(saldo)}</div><div className="lbl">Tendría que haber en la caja</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--entr)" }}>{fmt(entroHoy)}</div><div className="lbl">Entró hoy</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--danger)" }}>{fmt(salioHoy)}</div><div className="lbl">Salió hoy</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--prep)" }}>{fmt(pendientes.reduce((s, m) => s + api.pendienteDe(m), 0))}</div><div className="lbl">Afuera, tiene que volver</div></div>
        <div className="card kpi"><div className="num" style={{ color: "var(--listo)" }}>{fmt(vendedores.reduce((s, v) => s + v.debe, 0))}</div><div className="lbl">Cobrado por vendedores, sin entregar</div></div>
      </div>
      <p className="muted">{ultimoArqueo ? `Última vez que se contó: ${fechaHora(ultimoArqueo.fecha)} por ${ultimoArqueo.usuario} · ${ultimoArqueo.dif === 0 ? "cuadró" : (ultimoArqueo.dif > 0 ? "sobraron " : "faltaron ") + fmt(Math.abs(ultimoArqueo.dif))}` : "Todavía no se contó la caja."}</p>

      {vendedores.length > 0 && <>
        <div className="sec-h"><h2>Vendedores con plata para entregar</h2></div>
        <div className="card">
          {vendedores.map(({ u, debe }) => (
            <div key={u.id} className="list-item" style={{ cursor: "default" }}>
              <Avatar txt={u?.nombre} />
              <div style={{ flex: 1, minWidth: 0 }}><b>{u.nombre}</b><div className="muted">Cobró en efectivo y todavía no lo entregó</div></div>
              <b>{fmt(debe)}</b>
              <button className="btn sm" onClick={() => setModal({ rendicion: u, debe })}>Recibir</button>
            </div>
          ))}
        </div>
      </>}

      {pendientes.length > 0 && <>
        <div className="sec-h"><h2>Plata afuera que tiene que volver</h2></div>
        <div className="card">
          {pendientes.map(m => {
            const vencido = m.vuelveFecha && m.vuelveFecha < hoy;
            return (
              <div key={m.id} className="list-item" style={{ cursor: "default", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}><b>{m.persona || "Sin nombre"}</b> <span className="muted">· {m.concepto}</span>
                  <div className="muted">Salió {fechaHora(m.hora)} · {fmt(-m.monto)}{m.devoluciones.length ? ` · ya volvió ${fmt(-m.monto - api.pendienteDe(m))}` : ""}</div></div>
                <span className={"chip " + (vencido ? "warn" : "st-pendiente")}>{m.vuelveFecha ? (vencido ? "Vencido " : "Vuelve ") + m.vuelveFecha : "Sin fecha"}</span>
                <b>{fmt(api.pendienteDe(m))}</b>
                <button className="btn sm" onClick={() => setModal({ devolver: m })}>Volvió</button>
              </div>
            );
          })}
        </div>
      </>}

      <div className="sec-h"><h2>Movimientos</h2><input type="search" placeholder="Buscar persona o concepto…" value={filtro} onChange={e => setFiltro(e.target.value)} style={{ maxWidth: 260 }} /></div>
      <div className="card">
        {lista.length === 0 && <div className="empty">Sin movimientos. Usá “Entrada” o “Salida” para registrar plata que entra o sale de la caja.</div>}
        {lista.map(m => <Mov key={m.id} m={m} />)}
      </div>

      {modal === "entrada" && <ModalMov tipo="ingreso" onClose={() => setModal(null)} />}
      {modal === "salida" && <ModalMov tipo="egreso" onClose={() => setModal(null)} />}
      {modal === "contar" && <ModalContar onClose={() => setModal(null)} />}
      {modal?.devolver && <ModalDevolucion m={modal.devolver} onClose={() => setModal(null)} />}
      {modal?.rendicion && <ModalRendicion u={modal.rendicion} debe={modal.debe} onClose={() => setModal(null)} />}
    </>
  );
}

function Mov({ m }) {
  const [abierto, setAbierto] = useState(false);
  const pend = api.pendienteDe(m);
  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div className="list-item" style={{ borderBottom: 0, flexWrap: "wrap" }} onClick={() => setAbierto(!abierto)}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b>{m.concepto}</b>{m.persona && <span> · {m.persona}</span>}
          <div className="muted">{fechaHora(m.hora)} · registró {m.usuario}{m.detalle ? " · " + m.detalle : ""}</div>
        </div>
        {m.vuelve && <span className={"chip " + (pend > 0 ? "st-pendiente" : "st-entregado")}>{pend > 0 ? "Falta volver " + fmt(pend) : "Volvió todo"}</span>}
        <b style={{ color: m.monto < 0 ? "var(--danger)" : "var(--entr)", minWidth: 90, textAlign: "right" }}>{m.monto < 0 ? "− " : "+ "}{fmt(Math.abs(m.monto))}</b>
      </div>
      {abierto && m.devoluciones.length > 0 && (
        <div style={{ padding: "0 4px 10px" }}>
          {m.devoluciones.map((d, i) => <div key={i} className="audit">Volvió {fmt(d.monto)} · {d.como} · {fechaHora(d.hora)} · recibió {d.usuario}</div>)}
        </div>
      )}
    </div>
  );
}

function ModalMov({ tipo, onClose }) {
  const { user, toast } = useApp();
  const entrada = tipo === "ingreso";
  const conceptos = entrada ? CONCEPTOS_ENTRADA.filter(c => c !== "Rendición de vendedor" && c !== "Cobro en el depósito") : CONCEPTOS_SALIDA;
  const [f, setF] = useState({ concepto: conceptos[0], monto: "", persona: "", detalle: "", vuelve: VUELVE_POR_DEFECTO.includes(conceptos[0]), vuelveFecha: "" });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v, ...(k === "concepto" && !entrada ? { vuelve: VUELVE_POR_DEFECTO.includes(v) } : {}) }));
  const guardar = async () => {
    if (!entrada && !f.persona.trim()) return toast("Poné a quién se le da la plata");
    try { await api.movCaja(user, { tipo, ...f }); toast(entrada ? "Entrada registrada" : "Salida registrada"); onClose(); } catch (e) { toast(e.message); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{entrada ? "Entra plata a la caja" : "Sale plata de la caja"}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>{entrada ? "Los cobros del depósito y lo que entregan los vendedores se cargan solos. Acá va cualquier otra entrada." : "Queda registrado a quién, cuándo, por qué y quién lo cargó."}</p>
        <div className="grid g2">
          <div className="field"><label htmlFor="mv-c">Concepto</label><select id="mv-c" value={f.concepto} onChange={e => set("concepto", e.target.value)}>{conceptos.map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label htmlFor="mv-m">Monto en efectivo</label><input id="mv-m" type="number" inputMode="numeric" value={f.monto} onChange={e => set("monto", e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="mv-p">{entrada ? "De quién (opcional)" : "A quién se le da"}</label><input id="mv-p" value={f.persona} onChange={e => set("persona", e.target.value)} placeholder={entrada ? "" : "Ej: Juan (chofer), Coca-Cola, Mario"} /></div>
        <div className="field"><label htmlFor="mv-d">Detalle (opcional)</label><input id="mv-d" value={f.detalle} onChange={e => set("detalle", e.target.value)} placeholder="Ej: factura 0001-2345" /></div>
        {!entrada && <>
          <label className="row" style={{ gap: 8, marginBottom: 10 }}><input type="checkbox" style={{ width: "auto" }} checked={f.vuelve} onChange={e => set("vuelve", e.target.checked)} /> Esta plata <b>tiene que volver</b> a la caja</label>
          {f.vuelve && <div className="field"><label htmlFor="mv-f">¿Para cuándo tiene que volver?</label><input id="mv-f" type="date" value={f.vuelveFecha} onChange={e => set("vuelveFecha", e.target.value)} /></div>}
        </>}
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button><button className={"btn " + (entrada ? "" : "dngr")} style={{ flex: 1 }} onClick={guardar}>{entrada ? "Registrar entrada" : "Registrar salida"}{f.monto ? " " + fmt(f.monto) : ""}</button></div>
      </div>
    </div>
  );
}

function ModalDevolucion({ m, onClose }) {
  const { user, toast } = useApp();
  const pend = api.pendienteDe(m);
  const [monto, setMonto] = useState(pend);
  const [como, setComo] = useState("Efectivo");
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Volvió plata de {m.persona}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>{m.concepto} del {m.fecha} por {fmt(-m.monto)}. Falta que vuelva {fmt(pend)}. Puede volver en partes.</p>
        <div className="grid g2">
          <div className="field"><label htmlFor="dv-m">Cuánto volvió</label><input id="dv-m" type="number" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} /></div>
          <div className="field"><label htmlFor="dv-c">Cómo volvió</label><select id="dv-c" value={como} onChange={e => setComo(e.target.value)}>{COMO_VUELVE.map(c => <option key={c}>{c}</option>)}</select></div>
        </div>
        {como !== "Efectivo" && <p className="muted" style={{ marginBottom: 10 }}>No vuelve en efectivo: se da por devuelto pero no suma a la caja.</p>}
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1 }} onClick={async () => { try { await api.registrarDevolucion(user, m.id, monto, como); toast("Devolución registrada"); onClose(); } catch (e) { toast(e.message); } }}>Registrar devolución</button></div>
      </div>
    </div>
  );
}

function ModalRendicion({ u, debe, onClose }) {
  const { user, toast } = useApp();
  const [monto, setMonto] = useState(debe);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{u.nombre} entrega plata</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Cobró en efectivo {fmt(debe)} que todavía no entregó. Contá lo que trae.</p>
        <div className="field"><label htmlFor="rd-m">Cuánto entrega</label><input id="rd-m" type="number" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} /></div>
        {+monto !== debe && <p className="chip warn" style={{ display: "block", borderRadius: 8, padding: 8, marginBottom: 10 }}>{+monto < debe ? `Le quedan ${fmt(debe - monto)} por entregar.` : "Entrega más de lo que cobró."}</p>}
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1 }} onClick={async () => { try { await api.movCaja(user, { tipo: "ingreso", concepto: "Rendición de vendedor", monto, persona: u.nombre, vendedorId: u.id }); toast("Entrada registrada"); onClose(); } catch (e) { toast(e.message); } }}>Recibí {fmt(monto)}</button></div>
      </div>
    </div>
  );
}

function ModalContar({ onClose }) {
  const { user, toast } = useApp();
  const esperado = api.saldoCaja();
  const [contado, setContado] = useState("");
  const [motivo, setMotivo] = useState("");
  const dif = contado === "" ? null : Math.round(+contado) - esperado;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Contar la caja</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Según los movimientos tendría que haber <b>{fmt(esperado)}</b>. Contá el efectivo y escribí cuánto hay.</p>
        <div className="field"><label htmlFor="ct-c">Efectivo contado</label><input id="ct-c" type="number" inputMode="numeric" value={contado} onChange={e => setContado(e.target.value)} /></div>
        {dif !== null && <p style={{ marginBottom: 10 }}>{dif === 0 ? <span className="chip st-entregado">Cuadra</span> : dif > 0 ? <span className="chip st-preparado">Sobran {fmt(dif)}</span> : <span className="chip warn">Faltan {fmt(-dif)}</span>}</p>}
        {dif !== null && dif !== 0 && <div className="field"><label htmlFor="ct-m">¿Por qué no cuadra?</label><input id="ct-m" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Si no se sabe, poné “sin explicar”" /></div>}
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button>
          <button className="btn" style={{ flex: 1 }} disabled={contado === "" || (dif !== 0 && !motivo.trim())} onClick={async () => { try { await api.arqueo(user, contado, motivo); toast(dif === 0 ? "Caja contada: cuadra" : "Caja contada: diferencia registrada"); onClose(); } catch (e) { toast(e.message); } }}>Guardar conteo</button></div>
      </div>
    </div>
  );
}
