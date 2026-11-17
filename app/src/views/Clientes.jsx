import { Icon, Avatar } from "./icons.jsx";
import React, { useMemo, useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { enviarCobro } from "../lib/offline";
import { DIAS_VISITA, faltanDatosCheque, fmt, puede, tieneAlerta, sinContar, tope } from "../lib/reglas";
import { ChipCuenta, ChequeCampos, chequeVacio } from "./ui.jsx";
import { misClientes, PedidoRow } from "./Inicio.jsx";

export function Clientes() {
  const { db, user, go } = useApp();
  const [q, setQ] = useState("");
  const [dia, setDia] = useState("");
  const [loc, setLoc] = useState("");
  const [soloAlerta, setSoloAlerta] = useState(false);
  const [editando, setEditando] = useState(null);
  const base = misClientes(db, user);
  const localidades = useMemo(() => [...new Set(db.clientes.map(c => c.localidad).filter(Boolean))].sort(), [db.clientes]);
  const list = base.filter(c =>
    (!q || (c.nombre + " " + c.dir + " " + c.codigo).toLowerCase().includes(q.toLowerCase())) &&
    (!dia || c.dia === dia) && (!loc || c.localidad === loc) && (!soloAlerta || tieneAlerta(c)));

  return (
    <>
      <div className="row between" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}><h1>Clientes</h1><p className="muted">Elegí un cliente para tomarle el pedido, o tocá + para agregar uno.</p></div>
        {puede.crearCliente(user) && <button className="btn-circulo" title="Agregar cliente" aria-label="Agregar cliente" onClick={() => setEditando({ nombre: "", dir: "", tel: "", localidad: "", dia: "", vendedorId: user.rol === "vendedor" ? user.id : null, obs: "" })}><Icon n="mas" s={24} /></button>}
      </div>
      <div className="filters">
        <input type="search" placeholder="Buscar por nombre, dirección o código…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={dia} onChange={e => setDia(e.target.value)}><option value="">Ruta: todos los días</option>{DIAS_VISITA.map(d => <option key={d}>{d}</option>)}</select>
        <select value={loc} onChange={e => setLoc(e.target.value)}><option value="">Todas las localidades</option>{localidades.map(l => <option key={l}>{l}</option>)}</select>
        <button className={"btn sm " + (soloAlerta ? "" : "sec")} onClick={() => setSoloAlerta(!soloAlerta)}><Icon n="alerta" s={15} /> Con alerta de pago</button>
      </div>
      <div className="card">
        {list.length === 0 && <div className="empty">No hay clientes con ese filtro.</div>}
        {list.slice(0, 80).map(c => (
          <div key={c.id} className="list-item" onClick={() => go("cliente", { id: c.id })}>
            <Avatar txt={c?.nombre} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{c.nombre}</b>
              <div className="muted">#{c.codigo} · {c.dir}{c.localidad ? " · " + c.localidad : ""}{c.dia ? " · " + c.dia : ""}</div>
            </div>
            <ChipCuenta c={c} />
          </div>
        ))}
        {list.length > 80 && <div className="empty">Mostrando 80 de {list.length}. Escribí en el buscador para encontrar el resto.</div>}
      </div>
      {editando && <EditarCliente c={editando} onClose={() => setEditando(null)} />}
    </>
  );
}

export function EditarCliente({ c, onClose }) {
  const { db, user, toast } = useApp();
  const [f, setF] = useState(c);
  const set = (k, v) => setF({ ...f, [k]: v });
  const vendedores = db.usuarios.filter(u => u.rol === "vendedor");
  const guardar = async () => {
    if (!f.nombre.trim()) return toast("Poné el nombre del cliente");
    try { await api.guardarCliente(user, f); toast(c.id ? "Cliente guardado" : "Cliente agregado"); onClose(); } catch (e) { toast(e.message); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{c.id ? "Editar cliente" : "Nuevo cliente"}</h2>
        <div className="field"><label htmlFor="ec-nom">Nombre / razón social</label><input id="ec-nom" value={f.nombre} onChange={e => set("nombre", e.target.value)} /></div>
        <div className="field"><label htmlFor="ec-dir">Dirección</label><input id="ec-dir" value={f.dir} onChange={e => set("dir", e.target.value)} /></div>
        <div className="grid g2">
          <div className="field"><label htmlFor="ec-loc">Localidad</label><input id="ec-loc" list="locs" value={f.localidad} onChange={e => set("localidad", e.target.value)} />
            <datalist id="locs">{[...new Set(db.clientes.map(x => x.localidad).filter(Boolean))].map(l => <option key={l} value={l} />)}</datalist></div>
          <div className="field"><label htmlFor="ec-dia">Día de visita</label><select id="ec-dia" value={f.dia} onChange={e => set("dia", e.target.value)}><option value="">—</option>{DIAS_VISITA.map(d => <option key={d}>{d}</option>)}</select></div>
          {user.rol !== "vendedor" && <div className="field"><label htmlFor="ec-ven">Vendedor</label><select id="ec-ven" value={f.vendedorId ?? ""} onChange={e => set("vendedorId", vendedores.find(v => String(v.id) === e.target.value)?.id ?? null)}><option value="">Sin asignar</option>{vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select></div>}
          <div className="field"><label htmlFor="ec-tel">Teléfono</label><input id="ec-tel" value={f.tel} onChange={e => set("tel", e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="ec-obs">Observaciones para el reparto</label><textarea id="ec-obs" rows="2" value={f.obs} onChange={e => set("obs", e.target.value)} /></div>
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" style={{ flex: 1 }} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}

export function ClienteDetalle() {
  const { db, user, go, params, setCart, toast } = useApp();
  const c = db.clientes.find(x => x.id === params.id);
  const [cobro, setCobro] = useState(false);
  const [editando, setEditando] = useState(false);
  if (!c) return <div className="empty">Cliente no encontrado.</div>;
  const peds = db.pedidos.filter(p => p.clienteId === c.id);
  const vend = db.usuarios.find(u => u.id === c.vendedorId);

  // RF-PV-08: lo que compra siempre, con la última cantidad
  const habitual = {};
  [...peds].reverse().forEach(p => p.estado !== "anulado" && p.lineas.forEach(l => { habitual[l.productoId] = l.cant; }));
  const habList = Object.entries(habitual).map(([id, cant]) => ({ p: db.productos.find(x => x.id === +id), cant })).filter(x => x.p);

  const tomarPedido = (items = {}) => { setCart({ clienteId: c.id, items, manual: {}, obs: "", origen: params.desde === "hoja" ? "hoja" : undefined }); go(Object.keys(items).length ? "confirmar" : "catalogo"); };

  return (
    <>
      <button className="btn sm sec" onClick={() => (params.desde === "hoja" ? go("hoja", { volver: true }) : go("clientes"))}><Icon n="atras" s={16} /> {params.desde === "hoja" ? "Hoja de ruta" : "Clientes"}</button>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row between" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Cliente #{c.codigo}</div>
            <h1>{c.nombre}</h1>
            <p className="muted">{c.dir}{c.localidad ? " · " + c.localidad : ""}{c.tel ? " · Tel " + c.tel : ""}</p>
            <p className="muted">Ruta: {c.dia || "sin día"} · Vendedor: {vend?.nombre || "sin asignar"}</p>
            {!DIAS_VISITA.includes(c.dia) && <p className="chip alerta" style={{ marginTop: 6 }}>Falta asignarle un día de visita: sus pedidos salen en el camión según el día en que se cargan.</p>}
            {c.obs && <p className="muted" style={{ marginTop: 6 }}><Icon n="nota" s={15} style={{ verticalAlign: "-2px" }} /> {c.obs}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <ChipCuenta c={c} />
            <div className="muted" style={{ marginTop: 6 }}>Último pago: {c.ultimoPago || "—"}</div>
          </div>
        </div>
        {c.saldo < 0 && <p className="muted" style={{ marginTop: 10 }}>Este cliente tiene deuda: su pedido va a quedar <b>por autorizar</b> hasta que Administración lo apruebe.</p>}
        <div className="row" style={{ marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => tomarPedido()}><Icon n="mas" s={18} /> Tomar pedido</button>
          <button className="btn sec" onClick={() => setCobro(true)}><Icon n="plata" s={18} /> Registrar cobro</button>
          {puede.editarCliente(user, c) && <button className="btn sec" onClick={() => setEditando(true)}><Icon n="lapiz" s={16} /> Editar</button>}
        </div>
      </div>

      {habList.length > 0 && <>
        <div className="sec-h"><h2>Lo que compra siempre</h2>
          <button className="btn sm" onClick={() => tomarPedido(Object.fromEntries(habList.map(h => [h.p.id, Math.min(h.cant, tope(h.p))]).filter(x => x[1] > 0)))}>Repetir último pedido</button></div>
        <div className="grid g2">
          {habList.map(({ p, cant }) => (
            <div key={p.id} className="hab-card"><div className="info"><div className="nm">{p.nombre}</div><div className="muted">{fmt(p.precio)} · {sinContar(p) ? "sin contar" : "stock " + p.stock}</div></div><span className="tag-last">Última: {cant}</span></div>
          ))}
        </div>
      </>}

      <div className="sec-h"><h2>Pedidos</h2></div>
      <div className="card">{peds.length ? peds.map(p => <PedidoRow key={p.id} p={p} />) : <div className="empty">Sin pedidos todavía.</div>}</div>

      {cobro && <Cobro c={c} onClose={() => setCobro(false)} onOk={m => { toast("Cobro registrado: " + fmt(m)); setCobro(false); }} />}
      {editando && <EditarCliente c={c} onClose={() => setEditando(false)} />}
    </>
  );
}

function Cobro({ c, onClose, onOk }) {
  const { user } = useApp();
  const [monto, setMonto] = useState(c.saldo < 0 ? -c.saldo : "");
  const [medio, setMedio] = useState("Efectivo");
  const [ch, setCh] = useState(chequeVacio());
  const { toast } = useApp();
  const ok = async () => {
    const m = Math.round(+monto); if (!(m > 0)) return;
    if (medio === "Cheque" && faltanDatosCheque(ch)) return toast("Poné el número, el banco y la fecha de cobro del cheque");
    try { const r = await enviarCobro(user, { clienteId: c.id, monto: m, medio, cheque: medio === "Cheque" ? ch : null }); if (r.enCola) { toast("Sin señal: el cobro quedó guardado y se envía solo cuando vuelva la conexión."); onClose(); } else onOk(m); } catch (e) { toast(e.message); }
  };
  const nota = medio === "Transferencia" ? "Entra sola a la caja de transferencia."
    : medio === "Cheque" ? "Entra solo a la caja de cheques, con su número, banco y fecha de cobro."
    : user.rol === "vendedor" ? "Lo vas a tener que entregar en el depósito." : "Entra directo a la caja de efectivo del depósito.";
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Registrar cobro</h2>
        <p className="muted" style={{ marginBottom: 12 }}>{c.nombre} · {c.saldo < 0 ? "debe " + fmt(-c.saldo) : "sin deuda"}. Cualquier pago, aunque sea parcial, reinicia la alerta de 15 días.</p>
        <div className="field"><label htmlFor="co-m">Monto</label><input id="co-m" type="number" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} /></div>
        <div className="field"><label htmlFor="co-med">Medio</label><select id="co-med" value={medio} onChange={e => setMedio(e.target.value)}>{["Efectivo", "Transferencia", "Cheque"].map(x => <option key={x}>{x}</option>)}</select></div>
        {medio === "Cheque" && <ChequeCampos ch={ch} setCh={setCh} />}
        {nota && <p className="muted" style={{ marginBottom: 10 }}>{nota}</p>}
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" style={{ flex: 1 }} onClick={ok}>Registrar {monto ? fmt(monto) : ""}</button></div>
      </div>
    </div>
  );
}
