import { Icon, Avatar } from "./icons.jsx";
import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { fmt } from "../lib/reglas";
import { ProdImg } from "./ui.jsx";

export default function Articulos() {
  const { db } = useApp();
  const [q, setQ] = useState("");
  const [ed, setEd] = useState(null);
  const list = db.productos.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row between" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <div><h1>Artículos</h1><p className="muted">Precios, stock, descuentos por cantidad y fotos.</p></div>
        <button className="btn" onClick={() => setEd({ nombre: "", categoria: "Bebidas", precio: 0, stock: 0, stockMin: 0, tramos: [], foto: null, activo: true })}><Icon n="mas" s={18} /> Nuevo artículo</button>
      </div>
      <div className="filters"><input type="search" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="card">
        {list.map(p => (
          <div key={p.id} className="list-item" onClick={() => setEd(p)}>
            <ProdImg p={p} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}><b>{p.nombre}</b>
              <div className="muted">{p.categoria}{p.tramos.length ? " · 🏷 " + p.tramos.map(t => `${t.min}+ ${t.pct}%`).join(", ") : ""}{!p.activo ? " · inactivo" : ""}</div></div>
            <div style={{ textAlign: "right" }}><b>{fmt(p.precio)}</b><div>{p.stockContado === false ? <span className="chip st-autorizado">Sin contar</span> : <span className={"chip " + (p.stock <= p.stockMin ? "warn" : "st-entregado")}>{p.stock} u.</span>}</div></div>
          </div>
        ))}
      </div>
      {ed && <EditarArticulo p={ed} onClose={() => setEd(null)} />}
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
    try { await api.guardarProducto(user, { ...f, precio: +f.precio, stock: +f.stock, stockMin: +f.stockMin, tramos }); toast("Artículo guardado"); onClose(); }
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
