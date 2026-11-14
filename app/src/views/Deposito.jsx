import React from "react";
import { useApp } from "../App.jsx";
import { api } from "../api/demo";
import { ChipEstado } from "./ui.jsx";

export function Deposito() {
  const { db, go } = useApp();
  const cola = db.pedidos.filter(p => ["pendiente", "preparando"].includes(p.estado)).reverse();
  const listos = db.pedidos.filter(p => p.estado === "preparado");
  const Item = ({ p }) => {
    const c = db.clientes.find(x => x.id === p.clienteId);
    const bultos = p.lineas.reduce((s, l) => s + l.cant, 0);
    return (
      <div className="list-item" onClick={() => go("depoPedido", { id: p.id })}>
        <div className="avatar">#{p.id}</div>
        <div style={{ flex: 1, minWidth: 0 }}><b>{c.nombre}</b><div className="muted">{c.localidad || c.dir}{c.dia ? " · " + c.dia : ""} · {bultos} {bultos === 1 ? "bulto" : "bultos"}</div></div>
        <div style={{ textAlign: "right" }}><ChipEstado e={p.estado} />{p.estado === "preparando" && <div className="muted">{p.hechos.length}/{p.lineas.length}</div>}</div>
      </div>
    );
  };
  return (
    <>
      <h1>Preparación</h1>
      <p className="muted" style={{ marginBottom: 14 }}>Pedidos para juntar, el más viejo primero. Tocá uno para empezar.</p>
      <div className="card">{cola.length ? cola.map(p => <Item key={p.id} p={p} />) : <div className="empty">No hay pedidos para preparar. 🎉</div>}</div>
      {listos.length > 0 && <><div className="sec-h"><h2>Listos para salir</h2></div><div className="card">{listos.map(p => <Item key={p.id} p={p} />)}</div></>}
    </>
  );
}

export function DepoPedido() {
  const { db, user, go, params, toast } = useApp();
  const p = db.pedidos.find(x => x.id === params.id);
  if (!p) return <div className="empty">Pedido no encontrado.</div>;
  const c = db.clientes.find(x => x.id === p.clienteId);
  const editable = ["pendiente", "preparando"].includes(p.estado);
  const completo = p.hechos.length === p.lineas.length;
  return (
    <>
      <button className="btn sm sec" onClick={() => go("deposito")}>← Preparación</button>
      <div className="row between" style={{ margin: "12px 0", flexWrap: "wrap" }}>
        <div><div className="eyebrow">Pedido #{p.id}</div><h1>{c.nombre}</h1><p className="muted">{c.dir} {c.localidad}</p>{c.obs && <p className="muted">📝 {c.obs}</p>}</div>
        <ChipEstado e={p.estado} />
      </div>
      {p.lineas.map((l, i) => {
        const hecho = p.hechos.includes(i);
        return (
          <div key={i} className={"check-line" + (hecho ? " done" : "")} onClick={() => editable && api.tildar(user, p.id, i)}>
            <div className="box">{hecho ? "✓" : ""}</div>
            <div style={{ flex: 1 }}><b style={{ fontSize: 16 }}>{l.cant} ×</b> {l.nombre}</div>
          </div>
        );
      })}
      {p.obs && <p className="muted">📝 {p.obs}</p>}
      {editable && <button className="btn blk" style={{ marginTop: 12, opacity: completo ? 1 : .5 }} disabled={!completo}
        onClick={() => { api.cambiarEstado(user, p.id, "preparado", "Preparado"); toast("Pedido #" + p.id + " listo para salir"); go("deposito"); }}>
        {completo ? "✓ Pedido preparado" : `Faltan ${p.lineas.length - p.hechos.length} productos`}</button>}
      {p.estado === "preparado" && <button className="btn sec blk" style={{ marginTop: 12 }} onClick={() => go("pedido", { id: p.id })}>Ver pedido e imprimir remito</button>}
    </>
  );
}
