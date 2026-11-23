import { Icon, Avatar } from "./icons.jsx";
import React, { useEffect, useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { ESTADOS, bajoCosto, camionesDeSemana, diaSemana, fechaCorta, feriadoDe, fmt, hoyISO, lineasConCambio, lunesDe, nombreCamion, cambioPendiente, puede, sumarDias } from "../lib/reglas";
import { ChipCuenta, ChipEstado, fechaHora } from "./ui.jsx";
import { PedidoRow } from "./Inicio.jsx";
import logo from "../assets/logo.jpg";
import { descartar, useConexion } from "../lib/offline";
import { useRestaurarScroll, useVista } from "../lib/vista";

// Semana de entrega que se muestra al abrir: la del lunes (el domingo ya se mira la que viene).
export const semanaDeHoy = () => { const h = hoyISO(); return lunesDe(diaSemana(h) === 7 ? sumarDias(h, 1) : h); };
const activos = ps => ps.filter(p => p.estado !== "anulado" && p.estado !== "rechazado");

// Resumen de un grupo de pedidos para la lista de Pedidos: total y cuántos faltan entregar o autorizar.
function resumenPedidos(ps) {
  const a = activos(ps);
  const faltan = a.filter(p => p.estado !== "entregado").length;
  const porAut = a.filter(p => p.estado === "porAutorizar").length;
  const conPrecio = a.filter(p => p.estado === "porAutorizar" && cambioPendiente(p)).length;
  return {
    arriba: fmt(a.reduce((s, p) => s + p.total, 0)),
    abajo: <>{a.length} {a.length === 1 ? "pedido" : "pedidos"}{faltan ? ` · ${faltan} sin entregar` : ""}{porAut > 0 && <b style={{ color: "var(--aut)" }}> · {porAut} por autorizar</b>}{conPrecio > 0 && <b style={{ color: "var(--aut)" }}> · {conPrecio} con cambios a revisar</b>}</>,
  };
}

// Renglón desplegable: nombre, resumen a la derecha, y al tocarlo se abre su contenido.
export function Fila({ icono, titulo, sub, arriba, abajo, abierto, onToggle, extra, children }) {
  return (
    <>
      <div className="list-item" role="button" tabIndex={0} aria-expanded={abierto} onClick={onToggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
        <div className="avatar" style={{ color: "var(--brand)", background: "var(--surface2)" }}><Icon n={icono} s={18} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><b>{titulo}</b><div className="muted">{sub}</div></div>
        {extra && <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>{extra}</span>}
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

// Pedidos que ya aprobó Administración y están en la carga del camión (no los por autorizar, anulados ni rechazados).
const enCarga = p => ["pendiente", "preparando", "preparado", "enReparto", "entregado"].includes(p.estado);

// Ícono de la hoja de carga del camión (Administración y Gerencia).
function BotonHoja({ ps, onClick }) {
  const n = ps.filter(enCarga).length;
  return (
    <button className="btn sec sm" disabled={!n} aria-label="Imprimir hoja de carga del camión"
      title={n ? `Imprimir la hoja con la mercadería sumada de ${n} ${n === 1 ? "pedido enviado" : "pedidos enviados"} a depósito` : "Todavía no enviaste pedidos a depósito en este camión"}
      onClick={onClick}><Icon n="imprimir" s={17} /></button>
  );
}

// Hoja de carga: todos los artículos de los pedidos enviados a depósito, sumados y ordenados por nombre.
function HojaCarga({ hoja }) {
  const filas = new Map();
  hoja.ps.forEach(p => p.lineas.filter(l => l.cant > 0).forEach(l => {
    const k = l.productoId ?? l.nombre;
    const f = filas.get(k) || { nombre: l.nombre, cant: 0, costo: 0, sinCosto: false, venta: 0 };
    f.cant += l.cant; f.venta += l.total;
    if (l.costo != null) f.costo += l.costo * l.cant; else f.sinCosto = true;
    filas.set(k, f);
  }));
  const lista = [...filas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const tot = lista.reduce((t, f) => ({ cant: t.cant + f.cant, costo: t.costo + f.costo, venta: t.venta + f.venta, sinCosto: t.sinCosto || f.sinCosto }), { cant: 0, costo: 0, venta: 0, sinCosto: false });
  return (
    <div className="print-only">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6mm" }}>
        <img src={logo} alt="" style={{ height: "18mm" }} />
        <div style={{ textAlign: "right" }}><div style={{ fontSize: "16pt", fontWeight: 700 }}>HOJA DE CARGA</div><div>{hoja.titulo} · {fechaCorta(hoja.fecha)}</div><div>{hoja.ps.length} {hoja.ps.length === 1 ? "pedido" : "pedidos"} enviados a depósito</div></div>
      </div>
      <table><thead><tr><th>Artículo</th><th>Cant.</th><th>Costo unit.</th><th>Costo total</th><th>Venta total</th></tr></thead>
        <tbody>{lista.map((f, i) => <tr key={i}><td>{f.nombre}</td><td>{f.cant}</td><td>{f.sinCosto ? "—" : fmt(f.costo / f.cant)}</td><td>{f.sinCosto ? "—" : fmt(f.costo)}</td><td>{fmt(f.venta)}</td></tr>)}
          <tr><td><b>TOTAL</b></td><td><b>{tot.cant}</b></td><td></td><td><b>{fmt(tot.costo)}</b></td><td><b>{fmt(tot.venta)}</b></td></tr></tbody>
      </table>
      {tot.sinCosto && <p style={{ marginTop: "4mm", fontSize: "9pt" }}>— Artículos sin costo cargado: no suman al costo total.</p>}
    </div>
  );
}

// Autorizar de una vez todos los pedidos de un camión que esperan aprobación (Administración y Gerencia).
// Los pedidos con un cambio de precio sin resolver quedan afuera: se revisan uno por uno.
function AutorizarTodos({ ps }) {
  const { db, user, toast } = useApp();
  const todos = puede.autorizar(user) ? ps.filter(p => p.estado === "porAutorizar") : [];
  const pend = todos.filter(p => !cambioPendiente(p));
  const conPrecio = todos.length - pend.length;
  if (!todos.length) return null;
  const conDeuda = pend.filter(p => db.clientes.find(c => c.id === p.clienteId)?.saldo < 0).length;
  const autorizar = async () => {
    try {
      const n = await api.autorizarPedidos(user, pend.map(p => p.id));
      const aviso = conPrecio ? ` · ${conPrecio} quedan pendientes: tienen cambios de precio o descuento` : "";
      toast((n === 1 ? "1 pedido autorizado y enviado a depósito" : `${n} pedidos autorizados y enviados a depósito`) + aviso);
    } catch (e) { toast(e.message); }
  };
  return (
    <div className="row between" style={{ padding: "8px 4px", flexWrap: "wrap" }}>
      <span className="muted">{todos.length} por autorizar{conDeuda ? ` · ${conDeuda} de clientes que deben` : ""}{conPrecio ? ` · ${conPrecio} con cambios de precio o descuento (se revisan uno por uno)` : ""}</span>
      {pend.length > 0 && <button className="btn sm" onClick={autorizar}><Icon n="check" s={16} /> Autorizar todos ({pend.length})</button>}
    </div>
  );
}

// Los 5 camiones (martes a sábado) de un vendedor para la semana mostrada.
//   resumen(ps) → { arriba, abajo }   renderItem(p) → pedido en la lista   acciones(ps) → botones del camión
export function Camiones({ nombre, ps, dias, clave, abierto, toggle, anidado, resumen, renderItem, acciones, extra, vacio = "No hay pedidos en este camión." }) {
  const { db } = useApp();
  const hoy = hoyISO();
  return dias.map(f => {
    const delDia = ps.filter(p => p.fechaEntrega === f);
    return (
      <div key={f} style={anidado ? { paddingLeft: 14, borderLeft: "3px solid var(--line)", marginLeft: 6 } : null}>
        <Fila icono="camion" titulo={`${nombreCamion(f)} ${nombre}`} sub={<>{fechaCorta(f)}{f === hoy ? " · hoy" : ""}{feriadoDe(db.feriados, f) && <b style={{ color: "var(--danger)" }}> · ⚠ Feriado: {feriadoDe(db.feriados, f).nombre}</b>}</>}
          {...resumen(delDia)} extra={extra?.(delDia, `${nombreCamion(f)} ${nombre}`, f)} abierto={abierto(clave + "|" + f)} onToggle={() => toggle(clave + "|" + f)}>
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

// Abrir y cerrar renglones. Se recuerda cuáles están abiertos aunque se salga de la pantalla (ej.: al abrir un pedido).
export function useAbiertos(pantalla) {
  const [abiertos, setAbiertos] = useVista(pantalla + ".abiertos", {});
  return [k => !!abiertos[k], k => setAbiertos(a => ({ ...a, [k]: !a[k] }))];
}

export function Pedidos() {
  const { db, user, params, go } = useApp();
  const [estado, setEstado] = useVista("pedidos.estado", "");
  const [q, setQ] = useVista("pedidos.q", "");
  const [lista, setLista] = useVista("pedidos.lista", false); // lista plana de todas las semanas (si vienen de un aviso de Inicio)
  const [semana, setSemana] = useVista("pedidos.semana", semanaDeHoy);
  const [abierto, toggle] = useAbiertos("pedidos");
  // Al volver de un pedido queda todo como estaba (semana, camiones abiertos, filtros y scroll). Si se entra de cero
  // (por la pestaña o por un aviso de Inicio) arranca en la semana de hoy y sin filtros.
  useRestaurarScroll("pedidos", params.volver);
  useEffect(() => { if (!params.volver) { setSemana(semanaDeHoy()); setEstado(params.estado || ""); setQ(""); setLista(!!params.estado); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const esVendedor = user.rol === "vendedor";
  const mios = esVendedor ? db.pedidos.filter(p => p.vendedorId === user.id) : db.pedidos;
  const filtrados = mios.filter(p => (!estado || p.estado === estado) &&
    (!q || db.clientes.find(c => c.id === p.clienteId)?.nombre.toLowerCase().includes(q.toLowerCase()) || String(p.id) === q));
  const plana = lista || !!q; // buscando se ven todos los resultados, sin importar la semana

  const dias = camionesDeSemana(semana);
  const enSemana = filtrados.filter(p => dias.includes(p.fechaEntrega));
  const fuera = filtrados.length - enSemana.length;
  const [hoja, setHoja] = useState(null);
  useEffect(() => { if (hoja) window.print(); }, [hoja]);
  const extra = puede.administrar(user) ? (ps, titulo, f) => <BotonHoja ps={ps} onClick={() => setHoja({ titulo, fecha: f, ps: ps.filter(enCarga), n: Date.now() })} /> : undefined;
  const comun = { dias, abierto, toggle, extra, resumen: resumenPedidos, renderItem: p => <PedidoRow key={p.id} p={p} />, acciones: ps => <AutorizarTodos ps={ps} /> };

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
      {hoja && <HojaCarga hoja={hoja} />}
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

const ACCION_TXT = { propuesto: "Propuso", aprobado: "Aprobó", repuesto: "Volvió a lista", corregido: "Corrigió", quitado: "Quitó" };
const ESTADO_PRECIO = { aprobado: "Aprobado", repuesto: "Repuesto a lista", corregido: "Corregido" };
const ESTADO_DESC = { aprobado: "Descuento aprobado", quitado: "Descuento quitado" };
const hora = f => new Date(f).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const valorLog = h => (h.campo === "descuento" ? `${h.antes}% → ${h.despues}%` : `${fmt(h.antes)} → ${fmt(h.despues)}`);

// Cambios hechos por el vendedor: precio y descuento por cantidad. Administración y Gerencia los aprueban o los deshacen.
function CambiosDePrecio({ p }) {
  const { db, user, toast } = useApp();
  const [corrigiendo, setCorrigiendo] = useState(null);   // { id, precio }
  const [historial, setHistorial] = useState(null);       // id de la línea con el historial abierto
  const [corrigiendoTotal, setCorrigiendoTotal] = useState(null); // monto escrito mientras se corrige el descuento sobre el total
  const lineas = lineasConCambio(p);
  const totalPend = p.descTotalEstado === "pendiente";
  const faltan = lineas.reduce((s, l) => s + (l.precioEstado === "pendiente" ? 1 : 0) + (l.descEstado === "pendiente" ? 1 : 0), 0) + (totalPend ? 1 : 0);
  if (!lineas.length && !p.descTotalEstado) return null;
  if (!puede.autorizar(user)) {
    return faltan ? <p className="chip st-porAutorizar" style={{ display: "block", borderRadius: 9, padding: 10, marginTop: 12 }}>Hay {faltan === 1 ? "un cambio" : faltan + " cambios"} (precio o descuento) a confirmar por Administración antes de que el pedido pase a depósito.</p> : null;
  }
  const abierto = p.estado === "porAutorizar";
  const quien = id => db.usuarios.find(u => u.id === id)?.nombre || "El vendedor";
  const correr = async fn => { try { await fn(); } catch (e) { toast(e.message); } };
  const decidirPrecio = (l, accion, precio = null) => correr(async () => { await api.resolverPrecio(user, l.id, accion, precio); setCorrigiendo(null); toast("Precio resuelto"); });
  const decidirDesc = (l, accion) => correr(async () => { await api.resolverDescuento(user, l.id, accion); toast("Descuento resuelto"); });
  const decidirTotal = (accion, monto = null) => correr(async () => { await api.resolverDescuentoTotal(user, p.id, accion, monto); setCorrigiendoTotal(null); toast("Descuento resuelto"); });
  const aprobarTodos = () => correr(async () => {
    for (const l of lineas) {
      if (l.precioEstado === "pendiente") await api.resolverPrecio(user, l.id, "aprobado");
      if (l.descEstado === "pendiente") await api.resolverDescuento(user, l.id, "aprobado");
    }
    if (totalPend) await api.resolverDescuentoTotal(user, p.id, "aprobado");
    toast("Cambios aprobados");
  });
  const sumaLineas = p.lineas.reduce((s, x) => s + x.total, 0);
  const propTotal = p.logTotal?.find(h => h.accion === "propuesto")?.despues ?? p.descuentoTotal;
  const sep = { padding: "10px 0", borderTop: "1px solid rgba(0,0,0,.12)" };
  return (
    <div className="card" style={{ marginTop: 12, border: faltan ? "2px solid var(--aut)" : undefined, background: faltan ? "var(--danger-bg)" : undefined }}>
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>{faltan ? `⚠ ${quien(p.vendedorId)} hizo ${faltan === 1 ? "un cambio" : faltan + " cambios"} (precio o descuento). Resolvelo para poder autorizar el pedido.` : "Cambios resueltos"}</b>
        {faltan > 1 && abierto && <button className="btn sm sec" onClick={aprobarTodos}>Aprobar todos los cambios</button>}
      </div>
      {p.descTotalEstado && (
        <div style={sep}>
          <div><b>Descuento sobre el total</b> · {quien(p.descTotalPor)} aplicó <b>{fmt(propTotal)}</b>{sumaLineas > 0 && ` (${Math.round(propTotal / sumaLineas * 1000) / 10}% de ${fmt(sumaLineas)})`}{p.descTotalEn ? " · " + hora(p.descTotalEn) : ""}</div>
          {!totalPend && <div className="muted">{{ aprobado: "Descuento aprobado", quitado: "Descuento quitado", corregido: "Corregido a " + fmt(p.descuentoTotal) }[p.descTotalEstado]}</div>}
          {totalPend && abierto && (corrigiendoTotal !== null ? (
            <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
              <input type="number" min="0" aria-label="Monto del descuento" value={corrigiendoTotal} onChange={e => setCorrigiendoTotal(e.target.value)} style={{ width: 130 }} />
              <button className="btn sm" disabled={corrigiendoTotal === "" || +corrigiendoTotal < 0 || +corrigiendoTotal >= sumaLineas} onClick={() => decidirTotal("corregido", +corrigiendoTotal)}>Guardar monto</button>
              <button className="btn sm sec" onClick={() => setCorrigiendoTotal(null)}>Cancelar</button>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
              <button className="btn sm" onClick={() => decidirTotal("aprobado")}>Aprobar descuento</button>
              <button className="btn sm sec" onClick={() => decidirTotal("quitado")}>Quitar descuento</button>
              <button className="btn sm sec" onClick={() => setCorrigiendoTotal(String(p.descuentoTotal))}>Corregir monto</button>
            </div>
          ))}
          <button className="btn sm sec" style={{ marginTop: 6 }} onClick={() => setHistorial(historial === "total" ? null : "total")}>{historial === "total" ? "Ocultar historial" : "Ver historial"}</button>
          {historial === "total" && (
            <ul className="muted" style={{ margin: "6px 0 0 18px" }}>
              {p.logTotal.map((h, i) => <li key={i}>{ACCION_TXT[h.accion]} · {quien(h.usuarioId)} · {fmt(h.antes)} → {fmt(h.despues)} · {hora(h.fecha)}</li>)}
            </ul>
          )}
        </div>
      )}
      {lineas.map(l => {
        const propuesto = l.log.find(h => h.campo === "precio")?.despues ?? l.precio;
        const dif = l.precioLista ? Math.round((1 - propuesto / l.precioLista) * 100) : 0;
        const precioPend = l.precioEstado === "pendiente";
        const pctProp = l.log.find(h => h.campo === "descuento" && h.accion === "propuesto")?.despues ?? l.pct;
        const descPend = l.descEstado === "pendiente";
        return (
          <div key={l.id} style={sep}>
            {l.precioEstado && (
              <div>
                <div><b>{l.nombre}</b> · lista {fmt(l.precioLista)} → {quien(l.cambiadoPor)} puso <b>{fmt(propuesto)}</b> ({dif > 0 ? "−" + dif + "%" : dif < 0 ? "+" + -dif + "%" : "igual"}){l.cambiadoEn ? " · " + hora(l.cambiadoEn) : ""}</div>
                {!precioPend && <div className="muted">{ESTADO_PRECIO[l.precioEstado]}{l.precioEstado !== "aprobado" ? ": " + fmt(l.precio) : ""}</div>}
                {precioPend && abierto && (corrigiendo?.id === l.id ? (
                  <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                    <input type="number" min="0" aria-label="Precio corregido" value={corrigiendo.precio} onChange={e => setCorrigiendo({ id: l.id, precio: e.target.value })} style={{ width: 130 }} />
                    <button className="btn sm" disabled={corrigiendo.precio === "" || +corrigiendo.precio < 0} onClick={() => decidirPrecio(l, "corregido", +corrigiendo.precio)}>Guardar precio</button>
                    <button className="btn sm sec" onClick={() => setCorrigiendo(null)}>Cancelar</button>
                  </div>
                ) : (
                  <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                    <button className="btn sm" onClick={() => decidirPrecio(l, "aprobado")}>Aprobar precio</button>
                    <button className="btn sm sec" onClick={() => decidirPrecio(l, "repuesto")}>Volver a lista ({fmt(l.precioLista)})</button>
                    <button className="btn sm sec" onClick={() => setCorrigiendo({ id: l.id, precio: l.precio })}>Corregir precio</button>
                  </div>
                ))}
              </div>
            )}
            {l.descEstado && (
              <div style={l.precioEstado ? { marginTop: 8 } : undefined}>
                <div><b>{l.nombre}</b> · {quien(l.descAplicadoPor)} aplicó <b>descuento por cantidad {pctProp}%</b> ({fmt(Math.round(l.precio * l.cant * pctProp / 100))} menos en {l.cant} u.){l.descAplicadoEn ? " · " + hora(l.descAplicadoEn) : ""}</div>
                {!descPend && <div className="muted">{ESTADO_DESC[l.descEstado]}</div>}
                {descPend && abierto && (
                  <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                    <button className="btn sm" onClick={() => decidirDesc(l, "aprobado")}>Aprobar descuento</button>
                    <button className="btn sm sec" onClick={() => decidirDesc(l, "quitado")}>Quitar descuento</button>
                  </div>
                )}
              </div>
            )}
            {bajoCosto(l) && <div style={{ color: "var(--danger, #c0392b)", fontWeight: 800, marginTop: 6 }}>⚠ Por debajo del costo ({fmt(l.costo)})</div>}
            <button className="btn sm sec" style={{ marginTop: 6 }} onClick={() => setHistorial(historial === l.id ? null : l.id)}>{historial === l.id ? "Ocultar historial" : "Ver historial"}</button>
            {historial === l.id && (
              <ul className="muted" style={{ margin: "6px 0 0 18px" }}>
                {l.log.map((h, i) => <li key={i}>{h.campo === "descuento" ? "Descuento" : "Precio"}: {ACCION_TXT[h.accion]} · {quien(h.usuarioId)} · {valorLog(h)} · {hora(h.fecha)}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Devolución completa o parcial de un pedido que ya salió en reparto (Administración y Gerencia).
// Restaura el stock, baja la deuda del cliente (si ya estaba entregado) y deja el pedido con lo que realmente se vendió.
function Devolucion({ p, onClose }) {
  const { user, toast } = useApp();
  const lineas = p.lineas.filter(l => l.cant > 0);
  const [cants, setCants] = useState({});   // id de línea → cantidad que volvió
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const poner = (l, n) => setCants({ ...cants, [l.id]: Math.max(0, Math.min(l.cant, n || 0)) });
  const items = lineas.filter(l => cants[l.id] > 0).map(l => ({ lineaId: l.id, cant: cants[l.id] }));
  // Mismo cálculo que hace la base: lo devuelto sale de las líneas y el descuento sobre el total baja en proporción.
  const sumaOld = p.lineas.reduce((s, x) => s + x.total, 0);
  const valor = items.reduce((s, it) => { const l = lineas.find(x => x.id === it.lineaId); return s + (it.cant === l.cant ? l.total : Math.round(l.total * it.cant / l.cant)); }, 0);
  const sumaNew = sumaOld - valor;
  const dNew = sumaNew === 0 || sumaOld === 0 ? 0 : Math.round((p.descuentoTotal || 0) * sumaNew / sumaOld);
  const monto = items.length ? p.total - (sumaNew - dNew) : 0;
  const todo = lineas.length > 0 && lineas.every(l => cants[l.id] === l.cant);
  const confirmar = async () => {
    try {
      setEnviando(true);
      await api.devolverPedido(user, p.id, items, motivo);
      toast(todo ? "Devolución completa registrada. El pedido quedó anulado." : "Devolución registrada");
      onClose();
    } catch (e) { toast(e.message); } finally { setEnviando(false); }
  };
  return (
    <div className="card" style={{ marginTop: 12, border: "2px solid var(--brand)" }}>
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <b style={{ fontSize: 16 }}>Registrar devolución</b>
        <button className="btn sm sec" onClick={() => setCants(todo ? {} : Object.fromEntries(lineas.map(l => [l.id, l.cant])))}>{todo ? "Limpiar" : "Devolvió todo el pedido"}</button>
      </div>
      <p className="muted" style={{ margin: "6px 0" }}>Poné cuánto volvió de cada producto. Vuelve al stock{p.estado === "entregado" ? " y baja la deuda del cliente" : ""}.</p>
      {lineas.map(l => (
        <div key={l.id} className="row between" style={{ padding: "8px 0", borderTop: "1px solid rgba(0,0,0,.12)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}><b>{l.nombre}</b><div className="muted">Se entregaron {l.cant}</div></div>
          <div className="stepper">
            <button aria-label="Menos" onClick={() => poner(l, (cants[l.id] || 0) - 1)}>−</button>
            <input aria-label={"Cantidad devuelta de " + l.nombre} inputMode="numeric" value={cants[l.id] || 0} onChange={e => poner(l, parseInt(e.target.value))} />
            <button aria-label="Más" onClick={() => poner(l, (cants[l.id] || 0) + 1)}>＋</button>
          </div>
        </div>
      ))}
      <div className="field" style={{ marginTop: 8 }}><label htmlFor="dev-motivo">Motivo (opcional)</label>
        <input id="dev-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: el cliente no estaba" /></div>
      {items.length > 0 && <p style={{ fontWeight: 700, margin: "6px 0" }}>Se devuelven {fmt(monto)}{p.estado === "entregado" ? ": la deuda del cliente baja ese monto." : ": el total del pedido baja ese monto."}{todo ? " Como vuelve todo, el pedido queda anulado." : ""}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sec" onClick={onClose}>Cancelar</button>
        <button className="btn" style={{ flex: 1 }} disabled={!items.length || enviando} onClick={confirmar}>{enviando ? "Guardando…" : "Confirmar devolución"}</button>
      </div>
    </div>
  );
}

export function PedidoDetalle() {
  const { db, user, go, params, toast } = useApp();
  const [confirmar, setConfirmar] = useState(null);
  const [nuevaFecha, setNuevaFecha] = useState(null); // camión: fecha elegida mientras se cambia
  const [devolviendo, setDevolviendo] = useState(false); // panel de devolución abierto
  const p = db.pedidos.find(x => x.id === params.id);
  if (!p) return <div className="empty">Pedido no encontrado.</div>;
  const c = db.clientes.find(x => x.id === p.clienteId);
  const v = db.usuarios.find(x => x.id === p.vendedorId);
  const idx = PASOS.findIndex(s => s[0] === p.estado);
  const accion = async (estado, txt) => { try { await api.cambiarEstado(user, p.id, estado, txt); toast(txt); setConfirmar(null); } catch (e) { toast(e.message); } };
  const admin = puede.administrar(user);
  const volverA = params.desde === "deposito" ? "deposito" : "pedidos"; // la lista de la que se vino, para no perder el lugar
  const cambiarCamion = async () => {
    const dow = diaSemana(nuevaFecha);
    if (dow < 2 || dow > 6) return toast("Los camiones salen de martes a sábado");
    try { await api.cambiarFechaEntrega(user, p.id, nuevaFecha); toast("Camión cambiado"); setNuevaFecha(null); } catch (e) { toast(e.message); }
  };

  return (
    <>
      <button className="btn sm sec" onClick={() => go(volverA, { volver: true })}><Icon n="atras" s={16} /> {volverA === "deposito" ? "Preparación" : "Pedidos"}</button>
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
        <CambiosDePrecio p={p} />
        <div className="tw" style={{ overflowX: "auto" }}>
          <table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Desc.</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>{p.lineas.filter(l => l.cant > 0).map((l, i) => <tr key={i}><td>{l.nombre}{l.precioEstado === "pendiente" || l.descEstado === "pendiente" ? <span className="chip warn"> a confirmar</span> : l.manual && <span className="muted"> (manual)</span>}</td><td>{l.cant}</td><td>{fmt(l.precio)}</td><td>{l.pct ? l.pct + "%" : "—"}</td><td style={{ textAlign: "right" }}>{fmt(l.total)}</td></tr>)}</tbody>
          </table>
        </div>
        {p.descuentoTotal > 0 && <div className="row between muted" style={{ marginTop: 10 }}><span>Descuento sobre el total{p.descTotalEstado === "pendiente" ? " (a confirmar)" : ""}</span><span style={{ color: "var(--entr)", fontWeight: 700 }}>− {fmt(p.descuentoTotal)}</span></div>}
        <div className="row between" style={{ fontSize: 19, fontWeight: 850, marginTop: 10 }}><span>Total</span><span>{fmt(p.total)}</span></div>
        {puede.autorizar(user) && p.devoluciones?.length > 0 && (
          <div className="card" style={{ marginTop: 12, background: "var(--surface2)" }}>
            <b>Devoluciones</b>
            {p.devoluciones.map(d => (
              <div key={d.id} className="muted" style={{ marginTop: 6 }}>
                {fechaHora(d.fecha)} · {db.usuarios.find(u => u.id === d.usuarioId)?.nombre || "Administración"} · <b>{d.completa ? "Completa" : "Parcial"}</b>: {d.lineas.map(x => `${x.cant} x ${x.nombre}`).join(", ")} · {fmt(d.monto)}{d.motivo ? ` · "${d.motivo}"` : ""}
              </div>
            ))}
          </div>
        )}
        {p.obs && <p className="muted" style={{ marginTop: 8 }}><Icon n="nota" s={15} style={{ verticalAlign: "-2px" }} /> {p.obs}</p>}

        <div className="row" style={{ flexWrap: "wrap", marginTop: 16 }}>
          {p.estado === "porAutorizar" && puede.autorizar(user) && <button className="btn" disabled={cambioPendiente(p)} title={cambioPendiente(p) ? "Resolvé los cambios de precio o descuento primero" : ""} onClick={() => accion("pendiente", "Autorizado y enviado a depósito")}><Icon n="check" s={17} /> Autorizar</button>}
          {/* Administración imprime el remito en cualquier momento (también antes de autorizar); los demás roles, una vez preparado. */}
          {(admin ? !["anulado", "rechazado"].includes(p.estado) : ["preparado", "enReparto", "entregado"].includes(p.estado)) && <button className="btn sec" onClick={() => window.print()}><Icon n="imprimir" s={17} /> Imprimir remito</button>}
          {admin && ["enReparto", "entregado"].includes(p.estado) && !devolviendo && <button className="btn sec" onClick={() => setDevolviendo(true)}><Icon n="atras" s={17} /> Registrar devolución</button>}
          {admin && p.estado === "preparado" && <button className="btn brand" onClick={() => accion("enReparto", "Salió en reparto")}><Icon n="camion" s={17} /> Salió en reparto</button>}
          {admin && p.estado === "enReparto" && <>
            <button className="btn" onClick={() => accion("entregado", "Entregado")}>Entregado</button>
            <button className="btn dngr" onClick={() => setConfirmar("rechazado")}>Rechazado</button>
          </>}
          {admin && ["porAutorizar", "pendiente", "preparando", "preparado"].includes(p.estado) && <button className="btn sec" onClick={() => setConfirmar("anulado")}>Anular</button>}
        </div>
        {devolviendo && <Devolucion p={p} onClose={() => setDevolviendo(false)} />}
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
        <tbody>{p.lineas.filter(l => l.cant > 0).map((l, i) => <tr key={i}><td>{l.cant}</td><td>{l.nombre}</td><td>{fmt(l.precio)}</td><td>{l.pct ? l.pct + "%" : ""}</td><td>{fmt(l.total)}</td></tr>)}
          {p.descuentoTotal > 0 && <tr><td colSpan="4" style={{ textAlign: "right" }}>Descuento sobre el total</td><td>− {fmt(p.descuentoTotal)}</td></tr>}
          <tr><td colSpan="4" style={{ textAlign: "right" }}><b>TOTAL</b></td><td><b>{fmt(p.total)}</b></td></tr></tbody>
      </table>
      {p.obs && <p style={{ marginTop: "4mm" }}>Obs.: {p.obs}</p>}
      <div style={{ marginTop: "20mm", display: "flex", justifyContent: "space-between" }}><span>Firma y aclaración</span><span>Recibí conforme</span></div>
    </div>
  );
}
