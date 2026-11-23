import { Icon, Avatar } from "./icons.jsx";
import React from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { useGanancia } from "../lib/useGanancia";
import { calcProfit, fechaCorta, fmt, hoyISO, nombreCamion, cambioPendiente, puede, textoCambio, tieneAlerta } from "../lib/reglas";
import { carritoDePedido, puedeEditarPedido } from "../lib/editarPedido";
import { mesActual, mesPorCerrar, nombreMes } from "../lib/mes";
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
  const bajos = db.productos.filter(p => p.activo && p.stockContado !== false && p.stock <= p.stockMin);
  const g = useGanancia(db, hoy.slice(0, 7), puede.verFinanzas(user));
  const pr = puede.verFinanzas(user) && g ? calcProfit(db, hoy.slice(0, 7), g) : null; // profit del mes en curso (solo Gerencia)

  const porCerrar = user.rol === "gerencia" ? mesPorCerrar(db) : null;
  // Comisión que el vendedor lleva acumulada en el mes (vuelve a 0 con el mes nuevo).
  const miComision = db.cobros.filter(c => c.vendedorId === user.id && c.fecha?.startsWith(mesActual())).reduce((s, c) => s + (c.comision || 0), 0);

  return (
    <>
      {porCerrar && <div className="card" style={{ marginBottom: 14, borderColor: "var(--brand)" }}>
        <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}><b>Es hora de cerrar {nombreMes(porCerrar)}: arreglar con los vendedores y ver el resumen del mes.</b>
          <button className="btn brand" onClick={() => go("cierre", { mes: porCerrar })}>Cerrar el mes</button></div></div>}
      <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <div><h1>Hola, {user.nombre}</h1><p className="muted">{new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</p></div>
        {user.rol !== "deposito" && <button className="btn" onClick={() => go("clientes")}><Icon n="mas" s={18} /> Nuevo pedido</button>}
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        {pr && (
          <div className="card kpi" style={{ cursor: "pointer", borderColor: "var(--brand)" }} onClick={() => go("resumen")}>
            <div className="num" style={{ color: pr.profit >= 0 ? "var(--entr)" : "var(--danger)" }}>{fmt(pr.profit)}</div>
            <div className="lbl">Profit del mes</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{pr.conCostos ? `Ganancia ${fmt(pr.ganancia)} − gastos ${fmt(pr.gastos)} − comisiones ${fmt(pr.comisiones)}` : "Sin cobros de ventas con costo todavía: cargá los costos en Artículos"}</div>
          </div>
        )}
        <div className="card kpi"><div className="num">{deHoy.length}</div><div className="lbl">Pedidos de hoy</div></div>
        {user.rol === "vendedor" && <div className="card kpi"><div className="num">{fmt(miComision)}</div><div className="lbl">Mi comisión del mes</div></div>}
        {user.rol === "vendedor" && <div className="card kpi"><div className="num" style={{ color: "var(--listo)" }}>{fmt(api.aRendir(user.id))}</div><div className="lbl">Efectivo cobrado para entregar en el depósito</div></div>}
        {["admin", "gerencia"].includes(user.rol) && <div className="card kpi" style={{ cursor: "pointer" }} onClick={() => go("caja")}><div className="num">{fmt(api.saldoCaja())}</div><div className="lbl">En la caja de efectivo del depósito</div></div>}
        <div className="card kpi"><div className="num">{fmt(deHoy.reduce((s, p) => s + p.total, 0))}</div><div className="lbl">Vendido hoy</div></div>
        {user.rol !== "vendedor" && <>
          <div className="card kpi" style={{ cursor: "pointer" }} onClick={() => go("pedidos", { estado: "porAutorizar" })}>
            <div className="num" style={{ color: "var(--aut)" }}>{cuenta("porAutorizar")}</div><div className="lbl">Por autorizar</div></div>
          <div className="card kpi" style={{ cursor: "pointer" }} onClick={() => go(user.rol === "admin" ? "pedidos" : "deposito")}>
            <div className="num" style={{ color: "var(--pend)" }}>{cuenta("pendiente") + cuenta("preparando")}</div><div className="lbl">En depósito</div></div>
          <div className="card kpi"><div className="num" style={{ color: "var(--listo)" }}>{cuenta("preparado")}</div><div className="lbl">Listos para salir</div></div>
        </>}
        <div className="card kpi"><div className="num" style={{ color: "var(--prep)" }}>{alertas.length}</div><div className="lbl">Clientes con alerta de pago</div></div>
      </div>

      {alertas.length > 0 && <>
        <div className="sec-h"><h2><Icon n="alerta" s={18} style={{ color: "var(--prep)", verticalAlign: "-3px" }} /> Más de 15 días sin pagar</h2></div>
        <div className="card">
          {alertas.slice(0, 8).map(c => (
            <div key={c.id} className="list-item" onClick={() => go("cliente", { id: c.id })}>
              <Avatar txt={c?.nombre} />
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
  const { db, go, user, setCart } = useApp();
  // Lápiz para editar: solo el vendedor, en sus pedidos que siguen por autorizar.
  const editar = user.rol === "vendedor" && puedeEditarPedido(user, p);
  const c = db.clientes.find(x => x.id === p.clienteId);
  const v = db.usuarios.find(x => x.id === p.vendedorId);
  return (
    <div className="list-item" onClick={() => go("pedido", { id: p.id })}>
      <Avatar txt={"#" + p.id} />
      <div style={{ flex: 1, minWidth: 0 }}><b>{c?.nombre}</b><div className="muted">{p.fecha}{v ? " · " + v.nombre : ""}{p.fechaEntrega ? " · " + nombreCamion(p.fechaEntrega) + " " + fechaCorta(p.fechaEntrega) : ""}{p.estado === "porAutorizar" && puede.autorizar(user) && c?.saldo < 0 ? " · Debe " + fmt(-c.saldo) : ""}</div></div>
      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <div style={{ fontWeight: 800 }}>{fmt(p.total)}</div>{p.estado === "porAutorizar" && cambioPendiente(p) && <div><span className="chip warn" style={{ fontWeight: 800 }}>⚠ {textoCambio(p)}</span></div>}<ChipEstado e={p.estado} />
        {editar && <button className="btn sec sm" aria-label={"Editar pedido #" + p.id} style={{ marginTop: 4, padding: "8px 16px" }}
          onClick={e => { e.stopPropagation(); setCart(carritoDePedido(p)); go("catalogo"); }}><Icon n="lapiz" s={15} /> Editar</button>}</div>
    </div>
  );
}
