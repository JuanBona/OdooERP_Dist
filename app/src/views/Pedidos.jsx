import { Icon, Avatar } from "./icons.jsx";
import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { ESTADOS, fmt, puede } from "../lib/reglas";
import { ChipCuenta, ChipEstado, fechaHora } from "./ui.jsx";
import { PedidoRow } from "./Inicio.jsx";
import logo from "../assets/logo.jpg";
import { descartar, useConexion } from "../lib/offline";

export function Pedidos() {
  const { db, user, params } = useApp();
  const [estado, setEstado] = useState(params.estado || "");
  const [q, setQ] = useState("");
  let list = user.rol === "vendedor" ? db.pedidos.filter(p => p.vendedorId === user.id) : db.pedidos;
  list = list.filter(p => (!estado || p.estado === estado) &&
    (!q || db.clientes.find(c => c.id === p.clienteId)?.nombre.toLowerCase().includes(q.toLowerCase()) || String(p.id) === q));
  return (
    <>
      <h1 style={{ marginBottom: 12 }}>{user.rol === "vendedor" ? "Mis pedidos" : "Pedidos"}</h1>
      <div className="filters">
        <input type="search" placeholder="Buscar cliente o número…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <Bandeja />
      <div className="card">{list.length ? list.map(p => <PedidoRow key={p.id} p={p} />) : <div className="empty">No hay pedidos con ese filtro.</div>}</div>
    </>
  );
}

// Pedidos cargados sin señal que todavía no llegaron al sistema.
function Bandeja() {
  const { db, user } = useApp();
  const { outbox } = useConexion();
  const mios = outbox.filter(o => o.user.id === user.id);
  if (!mios.length) return null;
  return (
    <div className="card" style={{ marginBottom: 12, borderColor: "var(--pend)" }}>
      <h2>Esperando señal para enviarse</h2>
      {mios.map(o => {
        const c = db.clientes.find(x => x.id === o.data.clienteId);
        const bultos = o.data.items.reduce((s, i) => s + i.cant, 0);
        return (
          <div key={o.uid} className="list-item" style={{ cursor: "default" }}>
            <div className="avatar" style={{ color: "var(--pend)", background: "var(--pend-bg)" }}><Icon n="sinSenal" s={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><b>{c?.nombre}</b><div className="muted">{bultos} {bultos === 1 ? "bulto" : "bultos"} · cargado {fechaHora(o.creado)}</div>
              {o.error && <div className="chip warn" style={{ marginTop: 4 }}>No se pudo enviar: {o.error}</div>}</div>
            {o.error ? <button className="btn sec sm" onClick={() => descartar(o.uid)}>Descartar</button> : <span className="chip st-pendiente">Pendiente de envío</span>}
          </div>
        );
      })}
    </div>
  );
}

const PASOS =[["porAutorizar", "Autorización"], ["pendiente", "Depósito"], ["preparando", "Preparando"], ["preparado", "Listo"], ["enReparto", "En reparto"], ["entregado", "Entregado"]];

export function PedidoDetalle() {
  const { db, user, go, params, toast } = useApp();
  const [confirmar, setConfirmar] = useState(null);
  const p = db.pedidos.find(x => x.id === params.id);
  if (!p) return <div className="empty">Pedido no encontrado.</div>;
  const c = db.clientes.find(x => x.id === p.clienteId);
  const v = db.usuarios.find(x => x.id === p.vendedorId);
  const idx = PASOS.findIndex(s => s[0] === p.estado);
  const accion = async (estado, txt) => { try { await api.cambiarEstado(user, p.id, estado, txt); toast(txt); setConfirmar(null); } catch (e) { toast(e.message); } };
  const admin = puede.administrar(user);

  return (
    <>
      <button className="btn sm sec" onClick={() => go("pedidos")}><Icon n="atras" s={16} /> Pedidos</button>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between" style={{ flexWrap: "wrap" }}>
          <div><div className="eyebrow">Pedido #{p.id}</div><h1>{c.nombre}</h1>
            <p className="muted">{p.fecha} · {c.dir}{v ? " · Vendedor: " + v.nombre : ""}</p></div>
          <div style={{ textAlign: "right" }}><ChipEstado e={p.estado} /><div style={{ marginTop: 6 }}><ChipCuenta c={c} /></div></div>
        </div>
        {!["anulado", "rechazado"].includes(p.estado) && (
          <div className="timeline">{PASOS.map(([k, l], i) => <span key={k} className={i <= idx ? "on" : ""}>{l}</span>)}</div>
        )}
        <div className="tw" style={{ overflowX: "auto" }}>
          <table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Desc.</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>{p.lineas.map((l, i) => <tr key={i}><td>{l.nombre}{l.manual && <span className="muted"> (manual)</span>}</td><td>{l.cant}</td><td>{fmt(l.precio)}</td><td>{l.pct ? l.pct + "%" : "—"}</td><td style={{ textAlign: "right" }}>{fmt(l.total)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="row between" style={{ fontSize: 19, fontWeight: 850, marginTop: 10 }}><span>Total</span><span>{fmt(p.total)}</span></div>
        {p.obs && <p className="muted" style={{ marginTop: 8 }}><Icon n="nota" s={15} style={{ verticalAlign: "-2px" }} /> {p.obs}</p>}

        <div className="row" style={{ flexWrap: "wrap", marginTop: 16 }}>
          {p.estado === "porAutorizar" && puede.autorizar(user) && <button className="btn" onClick={() => accion("pendiente", "Autorizado y enviado a depósito")}><Icon n="check" s={17} /> Autorizar</button>}
          {["preparado", "enReparto", "entregado"].includes(p.estado) && <button className="btn sec" onClick={() => window.print()}><Icon n="imprimir" s={17} /> Imprimir remito</button>}
          {admin && p.estado === "preparado" && <button className="btn brand" onClick={() => accion("enReparto", "Salió en reparto")}><Icon n="camion" s={17} /> Salió en reparto</button>}
          {admin && p.estado === "enReparto" && <>
            <button className="btn" onClick={() => accion("entregado", "Entregado")}>Entregado</button>
            <button className="btn dngr" onClick={() => setConfirmar("rechazado")}>Rechazado</button>
          </>}
          {admin && ["porAutorizar", "pendiente", "preparando", "preparado"].includes(p.estado) && <button className="btn sec" onClick={() => setConfirmar("anulado")}>Anular</button>}
        </div>
        {confirmar && (
          <div className="card" style={{ marginTop: 12, background: "var(--danger-bg)" }}>
            <b>{confirmar === "anulado" ? `¿Anular el pedido #${p.id}?` : `¿El cliente rechazó el pedido #${p.id}?`}</b>
            <p className="muted">La mercadería vuelve al stock. El pedido no se borra, queda archivado.</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sec sm" onClick={() => setConfirmar(null)}>No</button>
              <button className="btn dngr sm" onClick={() => accion(confirmar, confirmar === "anulado" ? "Anulado" : "Rechazado por el cliente")}>Sí, confirmar</button>
            </div>
          </div>
        )}
      </div>

      <div className="sec-h"><h2>Historial</h2></div>
      <div className="card">{p.historial.map((h, i) => <div key={i} className="audit" style={{ marginBottom: 6 }}><b>{h.txt}</b> · {h.usuario} · {fechaHora(h.fecha)}</div>)}</div>

      <Remito p={p} c={c} v={v} />
    </>
  );
}

function Remito({ p, c, v }) {
  return (
    <div className="print-only">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6mm" }}>
        <img src={logo} alt="" style={{ height: "18mm" }} />
        <div style={{ textAlign: "right" }}><div style={{ fontSize: "16pt", fontWeight: 700 }}>REMITO INTERNO</div><div>N° R-{String(p.id).padStart(8, "0")}</div><div>Fecha: {p.fecha}</div><div style={{ fontSize: "9pt" }}>Documento no válido como factura</div></div>
      </div>
      <div style={{ marginBottom: "5mm", lineHeight: 1.6 }}>
        <div><b>Cliente:</b> {c.nombre} (#{c.codigo})</div><div><b>Dirección:</b> {c.dir} {c.localidad}</div>
        {c.cuit && <div><b>CUIT:</b> {c.cuit}</div>}{v && <div><b>Vendedor:</b> {v.nombre}</div>}
      </div>
      <table><thead><tr><th>Cant.</th><th>Producto</th><th>Precio</th><th>Desc.</th><th>Total</th></tr></thead>
        <tbody>{p.lineas.map((l, i) => <tr key={i}><td>{l.cant}</td><td>{l.nombre}</td><td>{fmt(l.precio)}</td><td>{l.pct ? l.pct + "%" : ""}</td><td>{fmt(l.total)}</td></tr>)}
          <tr><td colSpan="4" style={{ textAlign: "right" }}><b>TOTAL</b></td><td><b>{fmt(p.total)}</b></td></tr></tbody>
      </table>
      {p.obs && <p style={{ marginTop: "4mm" }}>Obs.: {p.obs}</p>}
      <div style={{ marginTop: "20mm", display: "flex", justifyContent: "space-between" }}><span>Firma y aclaración</span><span>Recibí conforme</span></div>
    </div>
  );
}
