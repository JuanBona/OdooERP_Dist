import { Icon, Avatar } from "./icons.jsx";
import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { fmt, gananciaPct, precioConGanancia } from "../lib/reglas";
import { ProdImg } from "./ui.jsx";

export default function Articulos() {
  const { db } = useApp();
  const [q, setQ] = useState("");
  const [ed, setEd] = useState(null);
  const [calc, setCalc] = useState(null); // artículo para el que se abre la calculadora de precio
  const list = db.productos.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row between" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <div><h1>Artículos</h1><p className="muted">Precios, costos, stock, descuentos por cantidad y fotos. El botón de la calculadora arma el precio de venta según el costo y lo que querés ganar.</p></div>
        <button className="btn" onClick={() => setEd({ nombre: "", categoria: "Bebidas", precio: 0, costo: null, stock: 0, stockMin: 0, tramos: [], foto: null, activo: true })}><Icon n="mas" s={18} /> Nuevo artículo</button>
      </div>
      <div className="filters"><input type="search" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="card">
        {list.map(p => (
          <div key={p.id} className="list-item" onClick={() => setEd(p)}>
            <ProdImg p={p} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}><b>{p.nombre}</b>
              <div className="muted">{p.categoria}{p.tramos.length ? " · 🏷 " + p.tramos.map(t => `${t.min}+ ${t.pct}%`).join(", ") : ""}{!p.activo ? " · inactivo" : ""}</div>
              <div className="muted">{p.costo == null ? <span className="chip st-autorizado">Sin costo</span> : `Costo ${fmt(p.costo)} · ganás ${gananciaPct(p.costo, p.precio)}%`}</div></div>
            <div style={{ textAlign: "right" }}><b>{fmt(p.precio)}</b><div>{p.stockContado === false ? <span className="chip st-autorizado">Sin contar</span> : <span className={"chip " + (p.stock <= p.stockMin ? "warn" : "st-entregado")}>{p.stock} u.</span>}</div></div>
            <button className="btn sec sm" title="Calculadora de precio" aria-label={"Calcular precio de " + p.nombre} onClick={e => { e.stopPropagation(); setCalc(p); }}><Icon n="calc" s={18} /></button>
          </div>
        ))}
      </div>
      {ed && <EditarArticulo p={ed} onClose={() => setEd(null)} />}
      {calc && <CalculadoraPrecio p={calc} onClose={() => setCalc(null)} />}
    </>
  );
}

function EditarArticulo({ p, onClose }) {
  const { db, user, toast } = useApp();
  const [f, setF] = useState({ ...p, tramos: [...p.tramos, { min: "", pct: "" }, { min: "", pct: "" }, { min: "", pct: "" }].slice(0, 3) });
  const set = (k, v) => setF({ ...f, [k]: v });
  const setTramo = (i, k, v) => { const t = f.tramos.map((x, j) => j === i ? { ...x, [k]: v } : x); set("tramos", t); };
  const cats = [...new Set(db.productos.map(x => x.categoria))];
  const foto = e => {
    const file = e.target.files[0]; if (!file) return;
    // Se achica la foto para que el catálogo cargue rápido (RNF-03)
    const img = new Image(); const r = new FileReader();
    r.onload = () => { img.onload = () => {
      const s = 320 / Math.max(img.width, img.height), cv = document.createElement("canvas");
      cv.width = img.width * s; cv.height = img.height * s; cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      set("foto", cv.toDataURL("image/jpeg", 0.8));
    }; img.src = r.result; };
    r.readAsDataURL(file);
  };
  const guardar = async () => {
    if (!f.nombre.trim()) return toast("Poné el nombre del artículo");
    const tramos = f.tramos.filter(t => +t.min > 0 && +t.pct > 0).map(t => ({ min: +t.min, pct: +t.pct })).sort((a, b) => a.min - b.min);
    const costo = f.costo === "" || f.costo == null ? null : +f.costo;
    try { await api.guardarProducto(user, { ...f, precio: +f.precio, costo, stock: +f.stock, stockMin: +f.stockMin, tramos }); toast("Artículo guardado"); onClose(); }
    catch (e) { toast(e.message); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{p.id ? "Editar artículo" : "Nuevo artículo"}</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <ProdImg p={f} size={72} />
          <label className="btn sec sm" style={{ cursor: "pointer" }}><Icon n="camara" s={16} /> {f.foto ? "Cambiar foto" : "Subir foto"}<input type="file" accept="image/*" hidden onChange={foto} /></label>
          {f.foto && <button className="btn sec sm" onClick={() => set("foto", null)}>Quitar</button>}
        </div>
        <div className="field"><label htmlFor="ea-n">Nombre</label><input id="ea-n" value={f.nombre} onChange={e => set("nombre", e.target.value)} /></div>
        <div className="grid g2">
          <div className="field"><label htmlFor="ea-c">Categoría</label><input id="ea-c" list="cats" value={f.categoria} onChange={e => set("categoria", e.target.value)} /><datalist id="cats">{cats.map(c => <option key={c} value={c} />)}</datalist></div>
          <div className="field"><label htmlFor="ea-p">Precio</label><input id="ea-p" type="number" value={f.precio} onChange={e => set("precio", e.target.value)} /></div>
          <div className="field"><label htmlFor="ea-co">Costo</label><input id="ea-co" type="number" value={f.costo ?? ""} onChange={e => set("costo", e.target.value)} /></div>
          <div className="field"><label>Ganancia sobre el costo</label><div style={{ padding: "10px 0", fontWeight: 700 }}>{+f.costo > 0 && +f.precio > 0 ? gananciaPct(+f.costo, +f.precio) + " %" : "—"}</div></div>
          <div className="field"><label htmlFor="ea-s">Stock</label><input id="ea-s" type="number" value={f.stock} onChange={e => setF({ ...f, stock: e.target.value, stockContado: true })} /></div>
          <div className="field"><label htmlFor="ea-m">Stock mínimo (alerta)</label><input id="ea-m" type="number" value={f.stockMin} onChange={e => set("stockMin", e.target.value)} /></div>
        </div>
        <div className="field"><label>Descuento por cantidad (hasta 3 tramos)</label>
          {f.tramos.map((t, i) => (
            <div key={i} className="tramos" style={{ marginBottom: 6, alignItems: "center" }}>
              <input aria-label={`Desde cantidad tramo ${i + 1}`} type="number" placeholder="Desde (u.)" value={t.min} onChange={e => setTramo(i, "min", e.target.value)} />
              <input aria-label={`Porcentaje tramo ${i + 1}`} type="number" placeholder="% off" value={t.pct} onChange={e => setTramo(i, "pct", e.target.value)} />
              <span className="muted">{+t.min > 0 && +t.pct > 0 ? `${t.min}+ → ${t.pct}%` : "—"}</span>
            </div>
          ))}
        </div>
        <label className="row" style={{ marginBottom: 8, gap: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={f.stockContado !== false} onChange={e => set("stockContado", e.target.checked)} /> Stock contado (si no, se vende sin límite y figura “Sin contar”)</label>
        <label className="row" style={{ marginBottom: 14, gap: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={f.activo} onChange={e => set("activo", e.target.checked)} /> Se muestra en el catálogo</label>
        <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button><button className="btn" style={{ flex: 1 }} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}

// Calculadora de precio: con el costo y el % que se quiere ganar (sobre el costo) arma el precio de venta,
// pregunta si se quiere actualizar y, si se acepta, guarda el costo y el precio nuevo.
function CalculadoraPrecio({ p, onClose }) {
  const { user, toast } = useApp();
  const [costo, setCosto] = useState(p.costo ?? "");
  const [pct, setPct] = useState(p.costo ? String(gananciaPct(p.costo, p.precio)) : "");
  const [confirmar, setConfirmar] = useState(false);
  const nuevo = +costo > 0 && pct !== "" && +pct >= 0 ? precioConGanancia(costo, pct) : null;
  const guardar = async actualizarPrecio => {
    try {
      await api.guardarProducto(user, { ...p, costo: +costo, precio: actualizarPrecio ? nuevo : p.precio });
      toast(actualizarPrecio ? `Precio actualizado: ${fmt(nuevo)}` : "Costo guardado");
      onClose();
    } catch (e) { toast(e.message); }
  };
  const seguir = () => (nuevo === p.precio ? guardar(false) : setConfirmar(true)); // si el precio no cambia, no hace falta preguntar
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {!confirmar ? <>
          <h2>Calcular precio</h2>
          <p className="muted" style={{ marginBottom: 12 }}>{p.nombre} · precio de venta hoy {fmt(p.precio)}</p>
          <div className="grid g2">
            <div className="field"><label htmlFor="cp-c">Precio de costo</label><input id="cp-c" type="number" inputMode="decimal" value={costo} onChange={e => setCosto(e.target.value)} autoFocus /></div>
            <div className="field"><label htmlFor="cp-p">% que querés ganar</label><input id="cp-p" type="number" inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} /></div>
          </div>
          <div className="card kpi" style={{ margin: "6px 0 12px", borderColor: "var(--brand)" }}>
            <div className="num">{nuevo == null ? "—" : fmt(nuevo)}</div>
            <div className="lbl">{nuevo == null ? "Poné el costo y el porcentaje" : `Precio de venta (costo ${fmt(costo)} + ${pct}%)`}</div>
          </div>
          <div className="row"><button className="btn sec" onClick={onClose}>Cancelar</button>
            <button className="btn" style={{ flex: 1 }} disabled={nuevo == null} onClick={seguir}>Usar este precio</button></div>
        </> : <>
          <h2>¿Querés actualizar el precio?</h2>
          <p style={{ margin: "8px 0 16px" }}>El precio de <b>{p.nombre}</b> pasaría de <b>{fmt(p.precio)}</b> a <b>{fmt(nuevo)}</b>. El costo ({fmt(costo)}) se guarda igual.</p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn sec" onClick={() => setConfirmar(false)}>Volver</button>
            <button className="btn sec" onClick={() => guardar(false)}>No, solo guardar el costo</button>
            <button className="btn" style={{ flex: 1 }} onClick={() => guardar(true)}>Sí, actualizar a {fmt(nuevo)}</button>
          </div>
        </>}
      </div>
    </div>
  );
}
