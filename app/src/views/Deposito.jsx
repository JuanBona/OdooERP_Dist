import { Icon, Avatar } from "./icons.jsx";
import React, { useEffect } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { camionesDeSemana } from "../lib/reglas";
import { ChipEstado } from "./ui.jsx";
import { PorVendedor, SemanaNav, semanaDeHoy, useAbiertos } from "./Pedidos.jsx";
import { useRestaurarScroll, useVista } from "../lib/vista";

// Cuándo se autorizó el pedido (lo que carga Administración entra ya autorizado: cuenta cuando se cargó).
const cuandoEntro = p => new Date([...p.historial].reverse().find(h => h.txt.startsWith("Autorizado"))?.fecha || p.creado).getTime();
const porPreparar = p => ["pendiente", "preparando"].includes(p.estado);

// Los que faltan juntar primero, el más viejo arriba; los ya listos al final.
const ordenDeposito = (a, b) => (porPreparar(b) - porPreparar(a)) || (cuandoEntro(a) - cuandoEntro(b)) || (a.id - b.id);

function Item({ p }) {
  const { db, go } = useApp();
  const c = db.clientes.find(x => x.id === p.clienteId);
  const bultos = p.lineas.reduce((s, l) => s + l.cant, 0);
  return (
    <div className="list-item" onClick={() => go("depoPedido", { id: p.id })}>
      <Avatar txt={"#" + p.id} />
      <div style={{ flex: 1, minWidth: 0 }}><b>{c.nombre}</b><div className="muted">{c.localidad || c.dir}{c.dia ? " · " + c.dia : ""} · {bultos} {bultos === 1 ? "bulto" : "bultos"}</div></div>
      <div style={{ textAlign: "right" }}><ChipEstado e={p.estado} />{p.estado === "preparando" && <div className="muted">{p.hechos.length}/{p.lineas.length}</div>}</div>
    </div>
  );
}

// Depósito no maneja plata: en cada renglón solo se ve cuánto hay para juntar y cuánto está listo.
function resumenDeposito(ps) {
  const faltan = ps.filter(porPreparar).length, listos = ps.filter(p => p.estado === "preparado").length;
  return { arriba: faltan ? `${faltan} por preparar` : "Al día", abajo: `${listos} ${listos === 1 ? "listo" : "listos"} para salir` };
}

export function Deposito() {
  const { db, params } = useApp();
  const [semana, setSemana] = useVista("deposito.semana", semanaDeHoy);
  const [abierto, toggle] = useAbiertos("deposito");
  // Al volver de un pedido queda en la misma semana, con los mismos camiones abiertos y en el mismo lugar.
  useRestaurarScroll("deposito", params.volver);
  useEffect(() => { if (!params.volver) setSemana(semanaDeHoy()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dias = camionesDeSemana(semana);
  // Solo lo autorizado (en la base, Depósito ni siquiera ve lo que espera autorización).
  const todos = db.pedidos.filter(p => ["pendiente", "preparando", "preparado"].includes(p.estado)).sort(ordenDeposito);
  const enSemana = todos.filter(p => dias.includes(p.fechaEntrega));
  const fuera = todos.filter(p => porPreparar(p) && !dias.includes(p.fechaEntrega)).length;
  return (
    <>
      <h1>Preparación</h1>
      <p className="muted" style={{ marginBottom: 14 }}>Elegí vendedor y camión. Los pedidos están en orden: el más viejo primero. Tocá uno para empezar.</p>
      <SemanaNav semana={semana} setSemana={setSemana} />
      <div className="card">
        <PorVendedor ps={enSemana} dias={dias} abierto={abierto} toggle={toggle} resumen={resumenDeposito}
          renderItem={p => <Item key={p.id} p={p} />} vacio="No hay pedidos para preparar en este camión." />
      </div>
      {fuera > 0 && <p className="muted" style={{ marginTop: 10 }}>Hay {fuera} {fuera === 1 ? "pedido" : "pedidos"} por preparar en otras semanas. Cambiá de semana con las flechas.</p>}
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
      <button className="btn sm sec" onClick={() => go("deposito", { volver: true })}><Icon n="atras" s={16} /> Preparación</button>
      <div className="row between" style={{ margin: "12px 0", flexWrap: "wrap" }}>
        <div><div className="eyebrow">Pedido #{p.id}</div><h1>{c.nombre}</h1><p className="muted">{c.dir} {c.localidad}</p>{c.obs && <p className="muted"><Icon n="nota" s={15} style={{ verticalAlign: "-2px" }} /> {c.obs}</p>}</div>
        <ChipEstado e={p.estado} />
      </div>
      {p.lineas.map((l, i) => {
        const hecho = p.hechos.includes(i);
        return (
          <div key={i} className={"check-line" + (hecho ? " done" : "")} onClick={() => editable && Promise.resolve(api.tildar(user, p.id, i)).catch(e => toast(e.message))}>
            <div className="box">{hecho ? "✓" : ""}</div>
            <div style={{ flex: 1 }}><b style={{ fontSize: 16 }}>{l.cant} ×</b> {l.nombre}</div>
          </div>
        );
      })}
      {p.obs && <p className="muted"><Icon n="nota" s={15} style={{ verticalAlign: "-2px" }} /> {p.obs}</p>}
      {editable && <button className="btn blk" style={{ marginTop: 12, opacity: completo ? 1 : .5 }} disabled={!completo}
        onClick={async () => { try { await api.cambiarEstado(user, p.id, "preparado", "Preparado"); toast("Pedido #" + p.id + " listo para salir"); go("deposito", { volver: true }); } catch (e) { toast(e.message); } }}>
        {completo ? "✓ Pedido preparado" : `Faltan ${p.lineas.length - p.hechos.length} productos`}</button>}
      {p.estado === "preparado" && <button className="btn sec blk" style={{ marginTop: 12 }} onClick={() => go("pedido", { id: p.id, desde: "deposito" })}>Ver pedido e imprimir remito</button>}
    </>
  );
}
