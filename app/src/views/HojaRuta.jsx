import React, { useEffect } from "react";
import { Avatar, Icon } from "./icons.jsx";
import { useApp } from "../App.jsx";
import { ChipCuenta } from "./ui.jsx";
import { useConexion } from "../lib/offline";
import { useRestaurarScroll, useVista } from "../lib/vista";
import { DIAS_VISITA, clientesDelDia, diaSemana, fechaCorta, feriadoDe, habilVecino, hoyISO, isoLocal, nombreDia, proximoHabil } from "../lib/reglas";

const cap = t => t.charAt(0).toUpperCase() + t.slice(1);

// Hoja de ruta del vendedor: los clientes que le toca visitar ese día (según el día de visita de cada cliente y
// los cambios por feriado). Al tocar un cliente se abre su ficha, con la deuda, para tomarle el pedido.
export default function HojaRuta() {
  const { db, user, go, setCart, params } = useApp();
  const { outbox } = useConexion();
  const hoy = hoyISO();
  const [fecha, setFecha] = useVista("hoja.fecha", () => proximoHabil(hoy)); // sábado y domingo muestran el lunes
  // Al volver de un cliente o de un pedido queda en el mismo día y en el mismo lugar; entrando de cero, en hoy.
  useRestaurarScroll("hoja", params.volver);
  useEffect(() => { if (!params.volver) setFecha(proximoHabil(hoy)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mios = db.clientes.filter(c => c.vendedorId === user.id);
  const delDia = clientesDelDia(mios, fecha, db.excepciones)
    .sort((a, b) => (a.localidad || "").localeCompare(b.localidad || "") || a.nombre.localeCompare(b.nombre));
  const sinDia = mios.filter(c => !DIAS_VISITA.includes(c.dia)).length;
  const feriado = feriadoDe(db.feriados, fecha);
  const cambios = db.excepciones.filter(e => (e.desde === fecha || e.hasta === fecha) && (e.vendedorId == null || e.vendedorId === user.id));

  // Con pedido: ya se le cargó uno ese día (que no esté anulado), o quedó guardado sin señal esperando enviarse.
  const conPedido = c => db.pedidos.some(p => p.clienteId === c.id && p.fecha === fecha && p.estado !== "anulado")
    || outbox.some(o => o.user?.id === user.id && (o.tipo || "pedido") === "pedido" && o.data?.clienteId === c.id && isoLocal(new Date(o.creado)) === fecha);
  const cargados = delDia.filter(conPedido).length;
  // Los que faltan visitar arriba; los que ya tienen pedido, abajo y apagados.
  const porVisitar = delDia.filter(c => !conPedido(c)), yaCargados = delDia.filter(conPedido);
  const pedido = c => { setCart({ clienteId: c.id, items: {}, manual: {}, obs: "", origen: "hoja" }); go("catalogo"); }; // al terminar la venta vuelve acá

  return (
    <>
      <h1 style={{ marginBottom: 12 }}>Hoja de ruta</h1>
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="btn sec sm" aria-label="Día anterior" onClick={() => setFecha(habilVecino(fecha, -1))}><Icon n="atras" s={16} /></button>
        <div style={{ textAlign: "center" }}>
          <b>{cap(nombreDia(fecha))} {fechaCorta(fecha)}</b>
          <div className="muted">{fecha === hoy ? "Hoy" : fecha === proximoHabil(hoy) && diaSemana(hoy) > 5 ? "Próximo día de visita" : <button className="btn sec sm" style={{ marginTop: 4 }} onClick={() => setFecha(proximoHabil(hoy))}>Volver a hoy</button>}</div>
        </div>
        <button className="btn sec sm" aria-label="Día siguiente" onClick={() => setFecha(habilVecino(fecha, 1))}><Icon n="atras" s={16} style={{ transform: "rotate(180deg)" }} /></button>
      </div>

      {feriado && <p className="chip warn" style={{ display: "block", borderRadius: 9, padding: 10, marginBottom: 10 }}>Este día es feriado: {feriado.nombre}.</p>}
      {cambios.map(e => (
        <p key={e.id} className="chip alerta" style={{ display: "block", borderRadius: 9, padding: 10, marginBottom: 10 }}>
          Cambio de ruta: las visitas del {nombreDia(e.desde)} {fechaCorta(e.desde)} pasan al {nombreDia(e.hasta)} {fechaCorta(e.hasta)}{e.motivo ? " (" + e.motivo + ")" : ""}.
        </p>
      ))}

      <div className="sec-h" style={{ marginTop: 6 }}>
        <h2>{porVisitar.length} {porVisitar.length === 1 ? "cliente por visitar" : "clientes por visitar"}</h2>
        {delDia.length > 0 && <span className="muted">{cargados} de {delDia.length} con pedido cargado</span>}
      </div>
      <div className="card">
        {delDia.length === 0 && <div className="empty">No tenés clientes para visitar este día.</div>}
        {delDia.length > 0 && porVisitar.length === 0 && <div className="empty">Ya cargaste el pedido de todos. 🎉</div>}
        {porVisitar.map(c => <ClienteFila key={c.id} c={c} cargado={false} onPedido={pedido} />)}
      </div>

      {yaCargados.length > 0 && <>
        <div className="sec-h"><h2>Ya con pedido</h2><span className="muted">{yaCargados.length}</span></div>
        <div className="card">{yaCargados.map(c => <ClienteFila key={c.id} c={c} cargado onPedido={pedido} />)}</div>
      </>}

      {sinDia > 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          Tenés {sinDia} {sinDia === 1 ? "cliente" : "clientes"} sin día de visita asignado, por eso no aparecen acá. Asignáselo desde <a href="#clientes" onClick={e => { e.preventDefault(); go("clientes"); }}>Clientes</a>.
        </p>
      )}
    </>
  );
}

// Un cliente de la hoja. Los que ya tienen pedido quedan apagados y sin el botón de pedido (siguen abriendo la ficha).
function ClienteFila({ c, cargado, onPedido }) {
  const { go } = useApp();
  return (
    <div className="list-item" style={cargado ? { opacity: 0.55 } : null} onClick={() => go("cliente", { id: c.id, desde: "hoja" })}>
      <Avatar txt={c.nombre} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{c.nombre}</b>
        <div className="muted">{c.dir}{c.localidad ? " · " + c.localidad : ""}</div>
        <div style={{ marginTop: 4 }}><ChipCuenta c={c} /></div>
      </div>
      <div style={{ textAlign: "right" }}>
        {cargado
          ? <span className="chip st-entregado">✓ Pedido cargado</span>
          : <button className="btn sm" onClick={e => { e.stopPropagation(); onPedido(c); }}><Icon n="mas" s={15} /> Pedido</button>}
      </div>
    </div>
  );
}
