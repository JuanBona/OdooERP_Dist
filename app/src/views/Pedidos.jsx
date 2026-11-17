import { Icon, Avatar } from "./icons.jsx";
import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { ESTADOS, camionesDeSemana, diaSemana, fechaCorta, feriadoDe, fmt, hoyISO, lunesDe, nombreCamion, puede, sumarDias } from "../lib/reglas";
import { ChipCuenta, ChipEstado, fechaHora } from "./ui.jsx";
import { PedidoRow } from "./Inicio.jsx";
import logo from "../assets/logo.jpg";
import { descartar, useConexion } from "../lib/offline";

// Semana de entrega que se muestra al abrir: la del lunes (el domingo ya se mira la que viene).
export const semanaDeHoy = () => { const h = hoyISO(); return lunesDe(diaSemana(h) === 7 ? sumarDias(h, 1) : h); };
const activos = ps => ps.filter(p => p.estado !== "anulado" && p.estado !== "rechazado");

// Resumen de un grupo de pedidos para la lista de Pedidos: total y cuántos faltan entregar o autorizar.
function resumenPedidos(ps) {
  const a = activos(ps);
  const faltan = a.filter(p => p.estado !== "entregado").length;
  const porAut = a.filter(p => p.estado === "porAutorizar").length;
  return {
    arriba: fmt(a.reduce((s, p) => s + p.total, 0)),
    abajo: <>{a.length} {a.length === 1 ? "pedido" : "pedidos"}{faltan ? ` · ${faltan} sin entregar` : ""}{porAut > 0 && <b style={{ color: "var(--aut)" }}> · {porAut} por autorizar</b>}</>,
  };
}

// Renglón desplegable: nombre, resumen a la derecha, y al tocarlo se abre su contenido.
export function Fila({ icono, titulo, sub, arriba, abajo, abierto, onToggle, children }) {
  return (
    <>
      <div className="list-item" role="button" tabIndex={0} aria-expanded={abierto} onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
        <div className="avatar" style={{ color: "var(--brand)", background: "var(--surface2)" }}><Icon n={icono} s={18} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><b>{titulo}</b><div className="muted">{sub}</div></div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800 }}>{arriba}</div>
          <div className="muted">{abajo}</div>
        </div>
        <span className="muted" aria-hidden="true">{abierto ? "▾" : "▸"}</span>
      </div>
      {abierto && children}
    </>
  );
}

// Autorizar de una vez todos los pedidos de un camión que esperan aprobación (Administración y Gerencia).
function AutorizarTodos({ ps }) {
  const { db, user, toast } = useApp();
  const pend = puede.autorizar(user) ? ps.filter(p => p.estado === "porAutorizar") : [];
  if (!pend.length) return null;
  const conDeuda = pend.filter(p => db.clientes.find(c => c.id === p.clienteId)?.saldo < 0).length;
  const autorizar = async () => {
    try { const n = await api.autorizarPedidos(user, pend.map(p => p.id)); toast(n === 1 ? "1 pedido autorizado y enviado a depósito" : `${n} pedidos autorizados y enviados a depósito`); } catch (e) { toast(e.message); }
  };
  return (
    <div className="row between" style={{ padding: "8px 4px", flexWrap: "wrap" }}>
      <span className="muted">{pend.length} por autorizar{conDeuda ? ` · ${conDeuda} de clientes que deben` : ""}</span>
      <button className="btn sm" onClick={autorizar}><Icon n="check" s={16} /> Autorizar todos ({pend.length})</button>
    </div>
  );
}

// Los 5 camiones (martes a sábado) de un vendedor para la semana mostrada.
//   resumen(ps) → { arriba, abajo }   renderItem(p) → pedido en la lista   acciones(ps) → botones del camión
export function Camiones({ nombre, ps, dias, clave, abierto, toggle, anidado, resumen, renderItem, acciones, vacio = "No hay pedidos en este camión." }) {
  const { db } = useApp();
  const hoy = hoyISO();
  return dias.map(f => {
    const delDia = ps.filter(p => p.fechaEntrega === f);
    return (
      <div key={f} style={anidado ? { paddingLeft: 14, borderLeft: "3px solid var(--line)", marginLeft: 6 } : null}>
        <Fila icono="camion" titulo={`${nombreCamion(f)} ${nombre}`} sub={<>{fechaCorta(f)}{f === hoy ? " · hoy" : ""}{feriadoDe(db.feriados, f) && <b style={{ color: "var(--danger)" }}> · ⚠ Feriado: {feriadoDe(db.feriados, f).nombre}</b>}</>}
          {...resumen(delDia)} abierto={abierto(clave + "|" + f)} onToggle={() => toggle(clave + "|" + f)}>
          {acciones?.(delDia)}
          {delDia.length ? delDia.map(renderItem) : <div className="empty">{vacio}</div>}
        </Fila>
      </div>
    );
  });
}

// Un renglón por vendedor; al abrirlo aparecen sus 5 camiones. Si hay pedidos sin vendedor, aparece "Sin vendedor".
export function PorVendedor({ ps, dias, abierto, toggle, ...resto }) {
  const { db } = useApp();
  const vendedores = db.usuarios.filter(u => u.rol === "vendedor");
  const conocidos = new Set(vendedores.map(v => v.id));
  const grupos = [
    ...vendedores.map(v => ({ clave: String(v.id), nombre: v.nombre, ps: ps.filter(p => p.vendedorId === v.id) })),
    ...(ps.some(p => !conocidos.has(p.vendedorId)) ? [{ clave: "sin", nombre: "Sin vendedor", ps: ps.filter(p => !conocidos.has(p.vendedorId)) }] : []),
  ];
  return grupos.map(g => (
    <Fila key={g.clave} icono="clientes" titulo={g.nombre} sub="5 camiones de la semana" {...resto.resumen(g.ps)} abierto={abierto("v|" + g.clave)} onToggle={() => toggle("v|" + g.clave)}>
      <Camiones nombre={g.nombre} ps={g.ps} dias={dias} clave={g.clave} abierto={abierto} toggle={toggle} anidado {...resto} />
    </Fila>
  ));
}

// Flechas para ir a la semana anterior o siguiente.
export function SemanaNav({ semana, setSemana }) {
  const dias = camionesDeSemana(semana);
  return (
    <div className="row between" style={{ marginBottom: 12 }}>
      <button className="btn sec sm" aria-label="Semana anterior" onClick={() => setSemana(sumarDias(semana, -7))}><Icon n="atras" s={16} /></button>
      <div style={{ textAlign: "center" }}>
        <b>Entregas del {fechaCorta(dias[0])} al {fechaCorta(dias[4])}</b>
        <div className="muted">{semana === semanaDeHoy() ? "Esta semana" : <button className="btn sec sm" style={{ marginTop: 4 }} onClick={() => setSemana(semanaDeHoy())}>Volver a esta semana</button>}</div>
      </div>
      <button className="btn sec sm" aria-label="Semana siguiente" onClick={() => setSemana(sumarDias(semana, 7))}><Icon n="atras" s={16} style={{ transform: "rotate(180deg)" }} /></button>
    </div>
  );
}

// Abrir y cerrar renglones (se recuerda cuáles están abiertos mientras se está en la pantalla).
export function useAbiertos() {
  const [abiertos, setAbiertos] = useState({});
  return [k => !!abiertos[k], k => setAbiertos(a => ({ ...a, [k]: !a[k] }))];
}

export function Pedidos() {
  const { db, user, params, go } = useApp();
  const [estado, setEstado] = useState(params.estado || "");
  const [q, setQ] = useState("");
  const [lista, setLista] = useState(!!params.estado); // lista plana de todas las semanas (si vienen de un aviso de Inicio)
  const [semana, setSemana] = useState(semanaDeHoy);
  const [abierto, toggle] = useAbiertos();

  const esVendedor = user.rol === "vendedor";
  const mios = esVendedor ? db.pedidos.filter(p => p.vendedorId === user.id) : db.pedidos;
  const filtrados = mios.filter(p => (!estado || p.estado === estado) &&
    (!q || db.clientes.find(c => c.id === p.clienteId)?.nombre.toLowerCase().includes(q.toLowerCase()) || String(p.id) === q));
  const plana = lista || !!q; // buscando se ven todos los resultados, sin importar la semana

  const dias = camionesDeSemana(semana);
  const enSemana = filtrados.filter(p => dias.includes(p.fechaEntrega));
  const fuera = filtrados.length - enSemana.length;
  const comun = { dias, abierto, toggle, resumen: resumenPedidos, renderItem: p => <PedidoRow key={p.id} p={p} />, acciones: ps => <AutorizarTodos ps={ps} /> };

  return (
    <>
      <div className="row between" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <h1>{esVendedor ? "Mis pedidos" : "Pedidos"}</h1>
        {puede.administrar(user) && <button className="btn sec sm" onClick={() => go("feriados")}><Icon n="alerta" s={15} /> Feriados y cambios de ruta</button>}
      </div>
      <div className="filters">
        <input type="search" placeholder="Buscar cliente o número…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {!q && <button className="btn sec" onClick={() => setLista(!lista)}>{lista ? "Ver por camión" : "Ver como lista"}</button>}
      </div>
      <Bandeja />
      {plana ? (
        <div className="card">{filtrados.length ? filtrados.map(p => <PedidoRow key={p.id} p={p} />) : <div className="empty">No hay pedidos con ese filtro.</div>}</div>
      ) : (
        <>
          <SemanaNav semana={semana} setSemana={setSemana} />
          <div className="card">
            {esVendedor
              ? <Camiones nombre={user.nombre} ps={enSemana} clave="yo" {...comun} />
              : <PorVendedor ps={enSemana} {...comun} />}
          </div>
          {fuera > 0 && <p className="muted" style={{ marginTop: 10 }}>Hay {fuera} {fuera === 1 ? "pedido" : "pedidos"} en otras semanas. Cambiá de semana con las flechas o tocá “Ver como lista”.</p>}
        </>
      )}
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
        const esCobro = o.tipo === "cobro";
        const bultos = esCobro ? 0 : o.data.items.reduce((s, i) => s + i.cant, 0);
        return (
          <div key={o.uid} className="list-item" style={{ cursor: "default" }}>
            <div className="avatar" style={{ color: "var(--pend)", background: "var(--pend-bg)" }}><Icon n="sinSenal" s={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><b>{c?.nombre}</b><div className="muted">{esCobro ? `Cobro ${o.data.medio} $ ${o.data.monto.toLocaleString("es-AR")}` : `${bultos} ${bultos === 1 ? "bulto" : "bultos"}`} · cargado {fechaHora(o.creado)}</div>
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
  const [nuevaFecha, setNuevaFecha] = useState(null); // camión: fecha elegida mientras se cambia
  const p = db.pedidos.find(x => x.id === params.id);
  if (!p) return <div className="empty">Pedido no encontrado.</div>;
  const c = db.clientes.find(x => x.id === p.clienteId);
  const v = db.usuarios.find(x => x.id === p.vendedorId);
  const idx = PASOS.findIndex(s => s[0] === p.estado);
  const accion = async (estado, txt) => { try { await api.cambiarEstado(user, p.id, estado, txt); toast(txt); setConfirmar(null); } catch (e) { toast(e.message); } };
  const admin = puede.administrar(user);
  const cambiarCamion = async () => {
    const dow = diaSemana(nuevaFecha);
    if (dow < 2 || dow > 6) return toast("Los camiones salen de martes a sábado");
    try { await api.cambiarFechaEntrega(user, p.id, nuevaFecha); toast("Camión cambiado"); setNuevaFecha(null); } catch (e) { toast(e.message); }
  };

  return (
    <>
      <button className="btn sm sec" onClick={() => go("pedidos")}><Icon n="atras" s={16} /> Pedidos</button>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between" style={{ flexWrap: "wrap" }}>
          <div><div className="eyebrow">Pedido #{p.id}</div><h1>{c.nombre}</h1>
            <p className="muted">{p.fecha} · {c.dir}{v ? " · Vendedor: " + v.nombre : ""}</p>
            {p.fechaEntrega && (
              <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                <span className="chip st-preparado"><Icon n="camion" s={14} /> {nombreCamion(p.fechaEntrega)} {fechaCorta(p.fechaEntrega)}</span>
                {feriadoDe(db.feriados, p.fechaEntrega) && <span className="chip warn">⚠ Feriado: {feriadoDe(db.feriados, p.fechaEntrega).nombre}</span>}
                {puede.cambiarCamion(user, p) && nuevaFecha === null && <button className="btn sec sm" onClick={() => setNuevaFecha(p.fechaEntrega)}>Cambiar camión</button>}
              </div>
            )}
            {nuevaFecha !== null && (
              <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
                <input type="date" aria-label="Fecha del camión" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} style={{ width: "auto" }} />
                <span className="muted">{nuevaFecha ? nombreCamion(nuevaFecha) : ""}</span>
                {feriadoDe(db.feriados, nuevaFecha) && <span className="chip warn">⚠ El {fechaCorta(nuevaFecha)} es feriado ({feriadoDe(db.feriados, nuevaFecha).nombre}). Tené cuidado.</span>}
                <button className="btn sm" onClick={cambiarCamion} disabled={!nuevaFecha}>Guardar</button>
                <button className="btn sec sm" onClick={() => setNuevaFecha(null)}>Cancelar</button>
              </div>
            )}
          </div>
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
