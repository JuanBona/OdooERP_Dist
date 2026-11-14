import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { enviarPedido } from "../lib/offline";
import { calcLinea, fmt, nuevoEstadoPedido, proximoTramo, puede } from "../lib/reglas";
import { ChipCuenta, ProdImg } from "./ui.jsx";
import { misClientes } from "./Inicio.jsx";

const txtTramos = p => (p.tramos || []).map(t => `${t.min}+ ${t.pct}%`).join(" · ");

function SelectorCliente() {
  const { db, user, cart, setCart } = useApp();
  const c = db.clientes.find(x => x.id === cart.clienteId);
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row between" style={{ flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="eyebrow" htmlFor="sel-cli">Pedido para</label>
          <select id="sel-cli" value={cart.clienteId ?? ""} onChange={e => setCart({ ...cart, clienteId: e.target.value ? +e.target.value : null })}>
            <option value="">Elegí un cliente…</option>
            {misClientes(db, user).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </div>
        {c && <ChipCuenta c={c} />}
      </div>
    </div>
  );
}

export function Catalogo() {
  const { db, cart, setCart } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [abierto, setAbierto] = useState(null);
  const cats = [...new Set(db.productos.map(p => p.categoria))];
  const list = db.productos
    .filter(p => p.activo && (!cat || p.categoria === cat) && p.nombre.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.tramos.length ? 1 : 0) - (a.tramos.length ? 1 : 0));
  const setQty = (id, n) => {
    const p = db.productos.find(x => x.id === id);
    const items = { ...cart.items };
    n = Math.max(0, Math.min(n, p.stock));
    if (n) items[id] = n; else delete items[id];
    setCart({ ...cart, items });
  };

  return (
    <>
      <h1 style={{ marginBottom: 12 }}>Catálogo</h1>
      <SelectorCliente />
      <div className="filters">
        <input type="search" placeholder="Buscar por nombre…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)}><option value="">Todas las categorías</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
      </div>
      <div className="grid g3">
        {list.map(p => (
          <div key={p.id} className="pcard" style={p.tramos.length ? { borderColor: "var(--accent)" } : null} onClick={() => setAbierto(p.id)}>
            <div style={{ position: "relative" }}>
              <ProdImg p={p} full />
              {p.tramos.length > 0 && <span className="chip promo" style={{ position: "absolute", top: 8, left: 8 }}>🏷 OFERTA</span>}
              {cart.items[p.id] && <span className="chip st-entregado" style={{ position: "absolute", top: 8, right: 8 }}>✓ {cart.items[p.id]}</span>}
            </div>
            <div className="body">
              <div className="muted" style={{ fontSize: 11.5 }}>{p.categoria}</div>
              <div className="nm">{p.nombre}</div>
              {p.tramos.length > 0 && <span className="chip promo" style={{ alignSelf: "flex-start", fontSize: 11 }}>{txtTramos(p)}</span>}
              <div className="row between" style={{ marginTop: "auto", paddingTop: 6 }}>
                <span className="pr">{fmt(p.precio)}</span>
                <span className={"chip " + (p.stock <= 0 ? "warn" : p.stock <= p.stockMin ? "warn" : "st-entregado")}>{p.stock <= 0 ? "Sin stock" : p.stock + " u."}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {list.length === 0 && <div className="empty">No hay productos con ese nombre.</div>}
      {abierto && <ProductoModal p={db.productos.find(x => x.id === abierto)} cant={cart.items[abierto] || 0} setQty={n => setQty(abierto, n)} onClose={() => setAbierto(null)} />}
    </>
  );
}

function ProductoModal({ p, cant, setQty, onClose }) {
  const [n, setN] = useState(cant || 1);
  const l = calcLinea(p, n);
  const prox = proximoTramo(p, n);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <ProdImg p={p} size={84} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted">{p.categoria}</div><h2 style={{ marginBottom: 4 }}>{p.nombre}</h2>
            <div style={{ fontWeight: 850, fontSize: 20 }}>{fmt(p.precio)}</div>
            <div className="muted">Stock disponible: {p.stock}</div>
          </div>
        </div>
        {p.tramos.length > 0 && <div style={{ marginTop: 12 }}><div className="eyebrow">Descuento por cantidad</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>{p.tramos.map(t => <span key={t.min} className={"chip " + (l.pct === t.pct ? "promo" : "st-autorizado")}>{t.min}+ → {t.pct}% off</span>)}</div></div>}
        <div className="row between" style={{ marginTop: 16 }}>
          <div className="stepper">
            <button aria-label="Menos" onClick={() => setN(Math.max(0, n - 1))}>−</button>
            <input aria-label="Cantidad" inputMode="numeric" value={n} onChange={e => setN(Math.max(0, parseInt(e.target.value) || 0))} />
            <button aria-label="Más" onClick={() => setN(Math.min(p.stock, n + 1))}>＋</button>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 850, fontSize: 20 }}>{fmt(l.total)}</div>
            {l.ahorro > 0 && <div className="muted" style={{ color: "var(--entr)" }}>Ahorra {fmt(l.ahorro)} ({l.pct}%)</div>}
          </div>
        </div>
        {prox && <p className="muted" style={{ marginTop: 8 }}>Llevando {prox.min - n} más tiene {prox.pct}% de descuento.</p>}
        {n > p.stock && <p className="chip warn" style={{ marginTop: 8 }}>Supera el stock disponible</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn sec" onClick={onClose}>Cerrar</button>
          <button className="btn" style={{ flex: 1 }} disabled={n > p.stock} onClick={() => { setQty(n); onClose(); }}>{n ? (cant ? "Actualizar" : "Agregar al pedido") : "Quitar del pedido"}</button>
        </div>
      </div>
    </div>
  );
}

export function Confirmar() {
  const { db, user, cart, setCart, go, toast } = useApp();
  const c = db.clientes.find(x => x.id === cart.clienteId);
  const [editLinea, setEditLinea] = useState(null);
  const items = Object.entries(cart.items).map(([id, cant]) => ({ productoId: +id, cant, ...(cart.manual[id] || {}) }));
  const lineas = items.map(it => calcLinea(db.productos.find(p => p.id === it.productoId), it.cant, it.precioManual, it.descManual));
  const total = lineas.reduce((s, l) => s + l.total, 0);
  const ahorro = lineas.reduce((s, l) => s + l.ahorro, 0);
  const setCant = (id, n) => { const it = { ...cart.items }; if (n > 0) it[id] = n; else delete it[id]; setCart({ ...cart, items: it }); };

  const enviar = () => {
    if (!c) return toast("Elegí un cliente primero");
    if (!items.length) return toast("El pedido está vacío");
    try {
      const r = enviarPedido(user, { clienteId: c.id, items, obs: cart.obs });
      setCart({ clienteId: null, items: {}, manual: {}, obs: "" });
      if (r.enCola) { toast("Sin señal: el pedido quedó guardado y se envía solo cuando vuelva la conexión."); go("pedidos"); return; }
      const p = r.pedido;
      toast(p.estado === "porAutorizar" ? `Pedido #${p.id} enviado. Queda por autorizar (cliente con deuda).` : `Pedido #${p.id} enviado al depósito`);
      go("pedido", { id: p.id });
    } catch (e) { toast(e.message); }
  };

  return (
    <>
      <button className="btn sm sec" onClick={() => go("catalogo")}>← Seguir agregando</button>
      <h1 style={{ margin: "12px 0" }}>Revisar pedido</h1>
      <SelectorCliente />
      <div className="card">
        {lineas.length === 0 && <div className="empty">No agregaste productos.</div>}
        {lineas.map(l => {
          const p = db.productos.find(x => x.id === l.productoId);
          return (
            <div key={l.productoId} className="list-item" style={{ cursor: "default", flexWrap: "wrap" }}>
              <ProdImg p={p} size={44} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <b>{l.nombre}</b>
                <div className="muted">{fmt(l.precio)} c/u{l.pct ? ` · ${l.pct}% off` : ""}{l.manual ? " · precio manual" : ""}</div>
              </div>
              <div className="stepper">
                <button aria-label="Menos" onClick={() => setCant(l.productoId, l.cant - 1)}>−</button>
                <input aria-label="Cantidad" value={l.cant} onChange={e => setCant(l.productoId, Math.min(p.stock, parseInt(e.target.value) || 0))} />
                <button aria-label="Más" onClick={() => setCant(l.productoId, Math.min(p.stock, l.cant + 1))}>＋</button>
              </div>
              <div style={{ width: 100, textAlign: "right", fontWeight: 800 }}>{fmt(l.total)}</div>
              {puede.editarPrecio(user) && <button className="btn sec sm" title="Cambiar precio o descuento" onClick={() => setEditLinea(l)}>✎</button>}
            </div>
          );
        })}
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="obs">Observaciones</label>
          <textarea id="obs" rows="2" value={cart.obs} onChange={e => setCart({ ...cart, obs: e.target.value })} placeholder="Ej: entregar antes de las 10" /></div>
        {ahorro > 0 && <div className="row between muted"><span>Descuentos por cantidad</span><span style={{ color: "var(--entr)", fontWeight: 700 }}>− {fmt(ahorro)}</span></div>}
        <div className="row between" style={{ fontSize: 20, fontWeight: 850, marginTop: 6 }}><span>Total</span><span>{fmt(total)}</span></div>
        {c && nuevoEstadoPedido(c) === "porAutorizar" && <p className="chip st-porAutorizar" style={{ display: "block", borderRadius: 9, padding: 10, marginTop: 10 }}>El cliente tiene deuda: el pedido va a quedar por autorizar.</p>}
        <button className="btn blk" style={{ marginTop: 14 }} onClick={enviar}>Enviar pedido</button>
      </div>
      {editLinea && <EditarLinea l={editLinea} onClose={() => setEditLinea(null)} onOk={m => { setCart({ ...cart, manual: { ...cart.manual, [editLinea.productoId]: m } }); setEditLinea(null); }} />}
    </>
  );
}

function EditarLinea({ l, onClose, onOk }) {
  const [precio, setPrecio] = useState(l.precio);
  const [desc, setDesc] = useState(l.pct);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Cambiar precio · {l.nombre}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>Solo Administración y Gerencia. Queda registrado quién lo cambió.</p>
        <div className="grid g2">
          <div className="field"><label htmlFor="el-p">Precio unitario</label><input id="el-p" type="number" value={precio} onChange={e => setPrecio(e.target.value)} /></div>
          <div className="field"><label htmlFor="el-d">Descuento %</label><input id="el-d" type="number" value={desc} onChange={e => setDesc(e.target.value)} /></div>
        </div>
        <div className="row"><button className="btn sec" onClick={() => onOk({})}>Volver al automático</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => onOk({ precioManual: +precio, descManual: +desc })}>Aplicar</button></div>
      </div>
    </div>
  );
}
