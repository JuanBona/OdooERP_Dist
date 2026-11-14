import React from "react";
import { useApp } from "../App.jsx";
import { fmt, hoyISO, tieneAlerta } from "../lib/reglas";
import { ChipCuenta, ChipEstado, ProdImg } from "./ui.jsx";

export const misClientes = (db, user) =>
  user.rol === "vendedor" ? db.clientes.filter(c => c.vendedorId === user.id || c.vendedorId == null) : db.clientes;

export default function Inicio() {
  const { db, user, go } = useApp();
  const hoy = hoyISO();
  const peds = user.rol === "vendedor" ? db.pedidos.filter(p => p.vendedorId === user.id) : db.pedidos;
  const deHoy = peds.filter(p => p.fecha === hoy && p.estado !== "anulado");
  const alertas = misClientes(db, user).filter(tieneAlerta);
  const cuenta = e => db.pedidos.filter(p => p.estado === e).length;
  const bajos = db.productos.filter(p => p.activo && p.stock <= p.stockMin);

  return (
    <>
      <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div><h1>Hola, {user.nombre}</h1><p className="muted">{new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</p></div>
        {user.rol !== "deposito" && <button className="btn" onClick={() => go("clientes")}>＋ Nuevo pedido</button>}
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="num">{deHoy.length}</div><div className="lbl">Pedidos de hoy</div></div>
        <div className="card kpi"><div className="num">{fmt(deHoy.reduce((s, p) => s + p.total, 0))}</div><div className="lbl">Vendido hoy</div></div>
        {user.rol !== "vendedor" && <>
          <div className="card kpi" style={{ cursor: "pointer" }} onClick={() => go("pedidos", { estado: "porAutorizar" })}>
            <div className="num" style={{ color: "var(--aut)" }}>{cuenta("porAutorizar")}</div><div className="lbl">Por autorizar</div></div>
          <div className="card kpi" style={{ cursor: "pointer" }} onClick={() => go("deposito")}>
            <div className="num" style={{ color: "var(--pend)" }}>{cuenta("pendiente") + cuenta("preparando")}</div><div className="lbl">En depósito</div></div>
          <div className="card kpi"><div className="num" style={{ color: "var(--listo)" }}>{cuenta("preparado")}</div><div className="lbl">Listos para salir</div></div>
        </>}
        <div className="card kpi"><div className="num" style={{ color: "var(--prep)" }}>{alertas.length}</div><div className="lbl">Clientes con alerta de pago</div></div>
      </div>

      {alertas.length > 0 && <>
        <div className="sec-h"><h2>⚠ Más de 15 días sin pagar</h2></div>
        <div className="card">
          {alertas.slice(0, 8).map(c => (
            <div key={c.id} className="list-item" onClick={() => go("cliente", { id: c.id })}>
              <div className="avatar">{c.nombre.slice(0, 2)}</div>
              <div style={{ flex: 1, minWidth: 0 }}><b>{c.nombre}</b><div className="muted">{c.dir}</div></div>
              <ChipCuenta c={c} />
            </div>
          ))}
        </div>
      </>}

      <div className="sec-h"><h2>{user.rol === "vendedor" ? "Mis últimos pedidos" : "Últimos pedidos"}</h2>
        <button className="btn sec sm" onClick={() => go("pedidos")}>Ver todos</button></div>
      <div className="card">
        {peds.length === 0 && <div className="empty">Todavía no hay pedidos. Tocá “Nuevo pedido” para cargar el primero.</div>}
        {peds.slice(0, 6).map(p => <PedidoRow key={p.id} p={p} />)}
      </div>

      {user.rol !== "vendedor" && bajos.length > 0 && <>
        <div className="sec-h"><h2>Poco stock</h2><button className="btn sec sm" onClick={() => go("articulos")}>Ver artículos</button></div>
        <div className="card">
          {bajos.slice(0, 6).map(p => (
            <div key={p.id} className="list-item" style={{ cursor: "default" }}>
              <ProdImg p={p} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}><b>{p.nombre}</b><div className="muted">Mínimo: {p.stockMin}</div></div>
              <span className="chip warn">{p.stock} u.</span>
            </div>
          ))}
        </div>
      </>}
    </>
  );
}

export function PedidoRow({ p }) {
  const { db, go } = useApp();
  const c = db.clientes.find(x => x.id === p.clienteId);
  const v = db.usuarios.find(x => x.id === p.vendedorId);
  return (
    <div className="list-item" onClick={() => go("pedido", { id: p.id })}>
      <div className="avatar">#{p.id}</div>
      <div style={{ flex: 1, minWidth: 0 }}><b>{c?.nombre}</b><div className="muted">{p.fecha}{v ? " · " + v.nombre : ""}</div></div>
      <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800 }}>{fmt(p.total)}</div><ChipEstado e={p.estado} /></div>
    </div>
  );
}
