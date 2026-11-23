import { Icon, Avatar } from "./icons.jsx";
import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { enviarPedido } from "../lib/offline";
import { DIAS_VISITA, calcLinea, cambioDeRuta, diaSemana, fechaCorta, fechaEntrega, feriadoDe, fmt, hoyISO, visitaReciente, nombreCamion, nombreDia, montoDescTotal, nuevoEstadoPedido, proximoTramo, puede, sinContar, tope, tramoAplicable } from "../lib/reglas";
import { ChipCuenta, ProdImg } from "./ui.jsx";
import { misClientes } from "./Inicio.jsx";

// Es oferta si se marcó a mano o si tiene descuento por cantidad.
const esOferta = p => !!p.oferta || (p.tramos?.length > 0);
const OFERTAS = "__ofertas";   // valor del filtro de categoría que muestra solo los productos marcados como oferta
const txtTramos =p => (p.tramos || []).map(t => `${t.min}+ ${t.pct}%`).join(" · ");

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
  // Las ofertas (marcadas a mano en Artículos o con descuento por cantidad) salen primero; el filtro "Ofertas" muestra solo esas.
  const list = db.productos
    .filter(p => p.activo && (!cat || (cat === OFERTAS ? esOferta(p) : p.categoria === cat)) && p.nombre.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (esOferta(b) ? 1 : 0) - (esOferta(a) ? 1 : 0));
  // aplicar: tildó el descuento por cantidad (si no, la cantidad se cobra a precio normal).
  const setQty = (id, n, aplicar = false) => {
    const p = db.productos.find(x => x.id === id);
    const items = { ...cart.items };
    const desc = { ...(cart.desc || {}) };
    n = Math.max(0, Math.min(n, tope(p)));
    if (n) items[id] = n; else delete items[id];
    if (n && aplicar) desc[id] = true; else delete desc[id];
    setCart({ ...cart, items, desc });
  };

  return (
    <>
      <h1 style={{ marginBottom: 12 }}>Catálogo</h1>
      <SelectorCliente />
      <div className="filters">
        <input type="search" placeholder="Buscar por nombre…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)}><option value="">Todas las categorías</option><option value={OFERTAS}>Ofertas</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
      </div>
      <div className="grid g3">
        {list.map(p => (
          <div key={p.id} className="pcard" style={esOferta(p) ? { borderColor: "var(--accent)" } : null} onClick={() => setAbierto(p.id)}>
            <div style={{ position: "relative" }}>
              <ProdImg p={p} full />
              {esOferta(p) && <span className="chip promo" style={{ position: "absolute", top: 8, left: 8 }}><Icon n="oferta" s={13} /> OFERTA</span>}
              {cart.items[p.id] && <span className="chip st-entregado" style={{ position: "absolute", top: 8, right: 8 }}>✓ {cart.items[p.id]}</span>}
            </div>
            <div className="body">
              <div className="muted" style={{ fontSize: 11.5 }}>{p.categoria}</div>
              <div className="nm">{p.nombre}</div>
              {p.tramos.length > 0 && <span className="chip st-autorizado" style={{ alignSelf: "flex-start", fontSize: 11 }}>{txtTramos(p)}</span>}
              <div className="row between" style={{ marginTop: "auto", paddingTop: 6 }}>
                <span className="pr">{fmt(p.precio)}</span>
                {sinContar(p) ? <span className="chip st-autorizado">Sin contar</span> : <span className={"chip " + (p.stock <= p.stockMin ? "warn" : "st-entregado")}>{p.stock <= 0 ? "Sin stock" : p.stock + " u."}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {list.length === 0 && <div className="empty">No hay productos con ese nombre.</div>}
      {abierto && <ProductoModal p={db.productos.find(x => x.id === abierto)} cant={cart.items[abierto] || 0} conDesc={!!cart.desc?.[abierto]} setQty={(n, aplicar) => setQty(abierto, n, aplicar)} onClose={() => setAbierto(null)} />}
    </>
  );
}

function ProductoModal({ p, cant, conDesc, setQty, onClose }) {
  const [n, setN] = useState(cant || 1);
  const [aplicar, setAplicar] = useState(conDesc);   // el descuento por cantidad se aplica solo si se tilda
  const l = calcLinea(p, n, null, null, aplicar);
  const tr = tramoAplicable(p, n);                    // tramo que corresponde a esta cantidad
  const prox = proximoTramo(p, n);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <ProdImg p={p} size={84} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted">{p.categoria}</div><h2 style={{ marginBottom: 4 }}>{p.nombre}</h2>
            <div style={{ fontWeight: 850, fontSize: 20 }}>{fmt(p.precio)}</div>
            <div className="muted">{sinContar(p) ? "Stock sin contar todavía" : "Stock disponible: " + p.stock}</div>
          </div>
        </div>
        {p.tramos.length > 0 && <div style={{ marginTop: 12 }}><div className="eyebrow">Descuento por cantidad</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>{p.tramos.map(t => <span key={t.min} className={"chip " + (aplicar && l.pct === t.pct ? "promo" : "st-autorizado")}>{t.min}+ → {t.pct}% off</span>)}</div>
          <label htmlFor="pm-desc" className="row" style={{ marginTop: 10, gap: 8, cursor: tr ? "pointer" : "not-allowed", opacity: tr ? 1 : 0.55 }}>
            <input id="pm-desc" type="checkbox" checked={!!tr && aplicar} disabled={!tr} onChange={e => setAplicar(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
            <span style={{ fontWeight: 700 }}>{tr ? `Aplicar descuento por cantidad (${tr.pct}% off)` : "Aplicar descuento por cantidad"}</span>
          </label></div>}
        <div className="row between" style={{ marginTop: 16 }}>
          <div className="stepper">
            <button aria-label="Menos" onClick={() => setN(Math.max(0, n - 1))}>−</button>
            <input aria-label="Cantidad" inputMode="numeric" value={n} onChange={e => setN(Math.max(0, parseInt(e.target.value) || 0))} />
            <button aria-label="Más" onClick={() => setN(Math.min(tope(p), n + 1))}>＋</button>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 850, fontSize: 20 }}>{fmt(l.total)}</div>
            {l.ahorro > 0 && <div className="muted" style={{ color: "var(--entr)" }}>Ahorra {fmt(l.ahorro)} ({l.pct}%)</div>}
          </div>
        </div>
        {tr && !aplicar && <p className="muted" style={{ marginTop: 8 }}>Llegó al tramo de {tr.pct}%. Tildá "Aplicar descuento" para dárselo; si no, se cobra a precio normal.</p>}
        {prox && <p className="muted" style={{ marginTop: 8 }}>Llevando {prox.min - n} más puede aplicar {prox.pct}% de descuento.</p>}
        {n > tope(p) && <p className="chip warn" style={{ marginTop: 8 }}>Supera el stock disponible</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn sec" onClick={onClose}>Cerrar</button>
          <button className="btn" style={{ flex: 1 }} disabled={n > tope(p)} onClick={() => { setQty(n, !!tr && aplicar); onClose(); }}>{n ? (cant ? "Actualizar" : "Agregar al pedido") : "Quitar del pedido"}</button>
        </div>
      </div>
    </div>
  );
}

// A qué camión va el pedido y por qué. Avisa (sin bloquear) si el cliente no tiene día o hoy no es su día.
function AvisoCamion({ c }) {
  const { db } = useApp();
  const hoy = hoyISO();
  const cam = fechaEntrega(c.dia, hoy, { excepciones: db.excepciones, vendedorId: c.vendedorId });
  const destino = `${nombreCamion(cam)} ${fechaCorta(cam)}`;
  const caja = { display: "block", borderRadius: 9, padding: 10, marginTop: 10 };
  const feriado = feriadoDe(db.feriados, cam);
  const visita = visitaReciente(c.dia, hoy);
  const cambio = DIAS_VISITA.includes(c.dia) ? cambioDeRuta(db.excepciones, visita, c.vendedorId ?? null) : null;
  return (
    <>
      {!DIAS_VISITA.includes(c.dia)
        ? <p className="chip alerta" style={caja}>Este cliente no tiene día de visita asignado, así que el pedido va al {destino} según el día de hoy. Asignale un día en su ficha de cliente.</p>
        : DIAS_VISITA.indexOf(c.dia) + 1 !== diaSemana(hoy)
          ? <p className="chip alerta" style={caja}>Este cliente es de los {c.dia.toLowerCase()} y hoy es {nombreDia(hoy)}. El pedido igual va a su camión: {destino}.</p>
          : <p className="chip st-preparado" style={caja}>Sale en el {destino}.</p>}
      {cambio && <p className="chip alerta" style={caja}>Esta semana la visita del {nombreDia(cambio.desde)} {fechaCorta(cambio.desde)} se pasó al {nombreDia(cambio.hasta)} {fechaCorta(cambio.hasta)}{cambio.motivo ? " (" + cambio.motivo + ")" : ""}. Por eso el camión es el {destino}.</p>}
      {feriado && <p className="chip warn" style={caja}>El {fechaCorta(cam)} es feriado ({feriado.nombre}). Tené cuidado: confirmá con Administración que ese camión salga.</p>}
    </>
  );
}

export function Confirmar() {
  const { db, user, cart, setCart, go, toast } = useApp();
  const c = db.clientes.find(x => x.id === cart.clienteId);
  const [editLinea, setEditLinea] = useState(null);
  const items = Object.entries(cart.items).map(([id, cant]) => ({ productoId: +id, cant, aplicarDesc: !!cart.desc?.[id], ...(cart.manual[id] || {}) }));
  const lineas = items.map(it => calcLinea(db.productos.find(p => p.id === it.productoId), it.cant, it.precioManual, it.descManual, it.aplicarDesc));
  const suma = lineas.reduce((s, l) => s + l.total, 0);
  const descTotal = montoDescTotal(cart.descTotal, suma);   // descuento sobre el total, en $ (se escribe en % o en $)
  const total = suma - descTotal;
  const ahorro = lineas.reduce((s, l) => s + l.ahorro, 0);
  const setCant = (id, n) => { const it = { ...cart.items }; if (n > 0) it[id] = n; else delete it[id]; setCart({ ...cart, items: it }); };
  // Tilda o destilda el descuento por cantidad de una línea (sin tildar, la cantidad se cobra a precio normal).
  const setDesc = (id, on) => { const d = { ...(cart.desc || {}) }; if (on) d[id] = true; else delete d[id]; setCart({ ...cart, desc: d }); };

  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (!c) return toast("Elegí un cliente primero");
    if (!items.length) return toast("El pedido está vacío");
    try {
      setEnviando(true);
      const desdeHoja = cart.origen === "hoja"; // la venta se empezó en la hoja de ruta: al terminar se vuelve ahí
      const r = await enviarPedido(user, { clienteId: c.id, items, obs: cart.obs, descTotal });
      setCart({ clienteId: null, items: {}, manual: {}, obs: "" });
      if (r.enCola) { toast("Sin señal: el pedido quedó guardado y se envía solo cuando vuelva la conexión."); desdeHoja ? go("hoja", { volver: true }) : go("pedidos"); return; }
      const p = r.pedido;
      toast(p.estado === "porAutorizar" ? `Pedido #${p.id} enviado. Queda por autorizar en Administración.` : `Pedido #${p.id} enviado al depósito`);
      if (desdeHoja) go("hoja", { volver: true }); else go("pedido", { id: p.id });
    } catch (e) { toast(e.message); } finally { setEnviando(false); }
  };

  return (
    <>
      <button className="btn sm sec" onClick={() => go("catalogo")}><Icon n="atras" s={16} /> Seguir agregando</button>
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
                <div className="muted">{fmt(l.precio)} c/u{l.pct ? ` · ${l.pct}% off` : ""}{l.manual ? (user.rol === "vendedor" ? " · precio a confirmar por Administración" : " · precio manual") : ""}{user.rol === "vendedor" && l.pct > 0 && !l.manual ? " · descuento a confirmar por Administración" : ""}</div>
                {tramoAplicable(p, l.cant) && (
                  <label className="row" style={{ gap: 8, marginTop: 4, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!cart.desc?.[l.productoId]} onChange={e => setDesc(l.productoId, e.target.checked)} style={{ width: 20, height: 20, flex: "none" }} />
                    <span style={{ fontWeight: 700 }}>Aplicar descuento por cantidad ({tramoAplicable(p, l.cant).pct}% off)</span>
                  </label>
                )}
              </div>
              <div className="stepper">
                <button aria-label="Menos" onClick={() => setCant(l.productoId, l.cant - 1)}>−</button>
                <input aria-label="Cantidad" value={l.cant} onChange={e => setCant(l.productoId, Math.min(tope(p), parseInt(e.target.value) || 0))} />
                <button aria-label="Más" onClick={() => setCant(l.productoId, Math.min(tope(p), l.cant + 1))}>＋</button>
              </div>
              <div style={{ width: 100, textAlign: "right", fontWeight: 800 }}>{fmt(l.total)}</div>
              {puede.editarPrecio(user) && <button className="btn sec sm" title="Cambiar precio o descuento" onClick={() => setEditLinea(l)}>✎</button>}
            </div>
          );
        })}
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="obs">Observaciones</label>
          <textarea id="obs" rows="2" value={cart.obs} onChange={e => setCart({ ...cart, obs: e.target.value })} placeholder="Ej: entregar antes de las 10" /></div>
        {lineas.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="dt-valor">Descuento sobre el total (opcional)</label>
            <div className="row" style={{ gap: 8 }}>
              <select aria-label="Tipo de descuento" value={cart.descTotal?.modo || "%"} onChange={e => setCart({ ...cart, descTotal: { modo: e.target.value, valor: "" } })} style={{ width: 80 }}>
                <option value="%">%</option><option value="$">$</option>
              </select>
              <input id="dt-valor" type="number" min="0" inputMode="decimal" placeholder={(cart.descTotal?.modo || "%") === "%" ? "Ej: 5" : "Ej: 10000"} value={cart.descTotal?.valor ?? ""} onChange={e => setCart({ ...cart, descTotal: { modo: cart.descTotal?.modo || "%", valor: e.target.value } })} />
              {descTotal > 0 && <b style={{ whiteSpace: "nowrap", color: "var(--entr)" }}>− {fmt(descTotal)}</b>}
            </div>
            {user.rol === "vendedor" && descTotal > 0 && <p className="muted" style={{ marginTop: 6 }}>Administración tiene que aprobar este descuento antes de que el pedido pase a depósito.</p>}
          </div>
        )}
        {ahorro > 0 && <div className="row between muted"><span>Descuentos por cantidad</span><span style={{ color: "var(--entr)", fontWeight: 700 }}>− {fmt(ahorro)}</span></div>}
        <div className="row between" style={{ fontSize: 20, fontWeight: 850, marginTop: 6 }}><span>Total</span><span>{fmt(total)}</span></div>
        {c && <AvisoCamion c={c} />}
        {c && nuevoEstadoPedido(user) === "porAutorizar" && <p className="chip st-porAutorizar" style={{ display: "block", borderRadius: 9, padding: 10, marginTop: 10 }}>{c.saldo < 0 ? "El cliente tiene deuda. " : ""}El pedido queda por autorizar: Administración lo aprueba y recién ahí pasa a depósito.</p>}
        <button className="btn blk" style={{ marginTop: 14 }} onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Enviar pedido"}</button>
      </div>
      {editLinea && <EditarLinea l={editLinea} onClose={() => setEditLinea(null)} onOk={m => { setCart({ ...cart, manual: { ...cart.manual, [editLinea.productoId]: m } }); setEditLinea(null); }} />}
    </>
  );
}

function EditarLinea({ l, onClose, onOk }) {
  const { user } = useApp();
  const conDesc = puede.editarDescuento(user); // el vendedor solo cambia el precio, y Administración lo tiene que aprobar
  const [precio, setPrecio] = useState(l.precio);
  const [desc, setDesc] = useState(l.pct);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Cambiar precio · {l.nombre}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          {conDesc ? "Queda registrado quién lo cambió." : "Vale solo para este pedido. Administración tiene que aprobar el cambio antes de que el pedido pase a depósito."}
        </p>
        <div className="grid g2">
          <div className="field"><label htmlFor="el-p">Precio unitario</label><input id="el-p" type="number" min="0" value={precio} onChange={e => setPrecio(e.target.value)} /></div>
          {conDesc && <div className="field"><label htmlFor="el-d">Descuento %</label><input id="el-d" type="number" value={desc} onChange={e => setDesc(e.target.value)} /></div>}
        </div>
        <div className="row"><button className="btn sec" onClick={() => onOk({})}>Volver al automático</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => onOk(conDesc ? { precioManual: +precio, descManual: +desc } : { precioManual: +precio })}>Aplicar</button></div>
      </div>
    </div>
  );
}
