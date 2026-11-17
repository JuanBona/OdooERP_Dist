import React, { useState } from "react";
import { Icon } from "./icons.jsx";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { DIAS_VISITA, diaSemana, fechaCorta, feriadoDe, hoyISO, nombreDia, sumarDias } from "../lib/reglas";

const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const largo = iso => `${cap(nombreDia(iso))} ${fechaCorta(iso)}`;
const habil = iso => !!iso && diaSemana(iso) <= 5;

// Feriados y cambios de ruta (Administración y Gerencia).
// Cuando un día de visita cae en feriado, las visitas de ese día se pasan a otro solo por esa semana:
// los pedidos se agrupan en el camión que corresponde al día nuevo, y después todo vuelve a la normalidad.
export default function Feriados() {
  const { db, user, go, toast } = useApp();
  const hoy = hoyISO();
  const vendedores = db.usuarios.filter(u => u.rol === "vendedor");
  const [f, setF] = useState({ vendedorId: "", desde: "", hasta: "", motivo: "" });
  const [fer, setFer] = useState({ fecha: "", nombre: "" });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const vendedor = vendedores.find(v => String(v.id) === f.vendedorId);
  const feriadoOriginal = feriadoDe(db.feriados, f.desde);
  const diaOriginal = habil(f.desde) ? DIAS_VISITA[diaSemana(f.desde) - 1] : null;
  const afectados = diaOriginal ? db.clientes.filter(c => c.dia === diaOriginal && (!vendedor || c.vendedorId === vendedor.id)).length : 0;

  const aplicar = async () => {
    if (!f.desde || !f.hasta) return toast("Elegí los dos días");
    if (!habil(f.desde) || !habil(f.hasta)) return toast("Los cambios de ruta son de lunes a viernes");
    if (f.desde === f.hasta) return toast("El día nuevo tiene que ser distinto del original");
    try {
      await api.crearCambioRuta(user, { vendedorId: vendedor?.id ?? null, desde: f.desde, hasta: f.hasta, motivo: f.motivo || feriadoOriginal?.nombre || "" });
      toast("Cambio de ruta guardado");
      setF({ vendedorId: "", desde: "", hasta: "", motivo: "" });
    } catch (e) { toast(e.message); }
  };
  const cancelar = async id => { try { await api.cancelarCambioRuta(user, id); toast("Cambio de ruta cancelado: vuelve a la ruta normal"); } catch (e) { toast(e.message); } };

  const agregarFeriado = async () => {
    if (!fer.fecha || !fer.nombre.trim()) return toast("Poné la fecha y el nombre del feriado");
    try { await api.guardarFeriado(user, { fecha: fer.fecha, nombre: fer.nombre.trim() }); setFer({ fecha: "", nombre: "" }); toast("Feriado guardado"); } catch (e) { toast(e.message); }
  };
  const borrarFeriado = async fecha => { try { await api.borrarFeriado(user, fecha); } catch (e) { toast(e.message); } };

  const cambios = db.excepciones.filter(e => e.hasta >= sumarDias(hoy, -7)).sort((a, b) => a.desde.localeCompare(b.desde));
  const proximos = db.feriados.filter(x => x.fecha >= hoy);

  return (
    <>
      <button className="btn sm sec" onClick={() => go("pedidos")}><Icon n="atras" s={16} /> Pedidos</button>
      <h1 style={{ margin: "12px 0 4px" }}>Feriados y cambios de ruta</h1>
      <p className="muted" style={{ marginBottom: 14 }}>Si un día de visita es feriado, pasá esas visitas a otro día. Vale solo para esa semana: después las visitas vuelven solas a su día.</p>

      <div className="card">
        <h2>Cambiar la ruta de un día</h2>
        <div className="grid g2" style={{ marginTop: 8 }}>
          <div className="field"><label htmlFor="cr-ven">Vendedor</label>
            <select id="cr-ven" value={f.vendedorId} onChange={e => set("vendedorId", e.target.value)}>
              <option value="">Todos los vendedores</option>{vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select></div>
          <div className="field"><label htmlFor="cr-mot">Motivo (opcional)</label><input id="cr-mot" value={f.motivo} placeholder={feriadoOriginal?.nombre || "Ej.: feriado"} onChange={e => set("motivo", e.target.value)} /></div>
          <div className="field"><label htmlFor="cr-des">Visita que no se hace</label><input id="cr-des" type="date" value={f.desde} onChange={e => set("desde", e.target.value)} /></div>
          <div className="field"><label htmlFor="cr-has">Pasa al día</label><input id="cr-has" type="date" value={f.hasta} onChange={e => set("hasta", e.target.value)} /></div>
        </div>
        {f.desde && !habil(f.desde) && <p className="chip warn" style={{ display: "block", borderRadius: 9, padding: 10, marginTop: 8 }}>Ese día es fin de semana: las visitas son de lunes a viernes.</p>}
        {feriadoOriginal && <p className="chip st-preparado" style={{ display: "block", borderRadius: 9, padding: 10, marginTop: 8 }}>Ese día es feriado: {feriadoOriginal.nombre}.</p>}
        {f.desde && f.hasta && habil(f.desde) && habil(f.hasta) && f.desde !== f.hasta && (
          <p className="muted" style={{ marginTop: 8 }}>
            Los clientes de los {diaOriginal.toLowerCase()}{vendedor ? ` de ${vendedor.nombre}` : ""} ({afectados}) se visitan el {largo(f.hasta).toLowerCase()}, y sus pedidos salen en el camión de ese día.
          </p>
        )}
        <button className="btn blk" style={{ marginTop: 12 }} onClick={aplicar}>Aplicar cambio</button>
      </div>

      <div className="sec-h"><h2>Cambios de ruta</h2></div>
      <div className="card">
        {cambios.length === 0 && <div className="empty">No hay cambios de ruta cargados.</div>}
        {cambios.map(e => (
          <div key={e.id} className="list-item" style={{ cursor: "default" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{largo(e.desde)} → {largo(e.hasta)}</b>
              <div className="muted">{e.vendedorId == null ? "Todos los vendedores" : db.usuarios.find(u => u.id === e.vendedorId)?.nombre || "—"}{e.motivo ? " · " + e.motivo : ""}</div>
            </div>
            <span className={"chip " + (e.hasta < hoy ? "st-autorizado" : "st-preparado")}>{e.hasta < hoy ? "Ya pasó" : "Vigente"}</span>
            <button className="btn sec sm" onClick={() => cancelar(e.id)}>Cancelar</button>
          </div>
        ))}
      </div>

      <div className="sec-h"><h2>Feriados</h2></div>
      <div className="card">
        {proximos.length === 0 && <div className="empty">No hay feriados próximos cargados.</div>}
        {proximos.map(x => (
          <div key={x.fecha} className="list-item" style={{ cursor: "default" }}>
            <div style={{ flex: 1, minWidth: 0 }}><b>{largo(x.fecha)}</b><div className="muted">{x.nombre}</div></div>
            <button className="btn sec sm" aria-label={"Borrar feriado " + x.nombre} onClick={() => borrarFeriado(x.fecha)}>Borrar</button>
          </div>
        ))}
        <div className="grid g2" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="fe-fec">Fecha</label><input id="fe-fec" type="date" value={fer.fecha} onChange={e => setFer({ ...fer, fecha: e.target.value })} /></div>
          <div className="field"><label htmlFor="fe-nom">Nombre</label><input id="fe-nom" value={fer.nombre} placeholder="Ej.: Día del Trabajador" onChange={e => setFer({ ...fer, nombre: e.target.value })} /></div>
        </div>
        <button className="btn sec blk" onClick={agregarFeriado}><Icon n="mas" s={16} /> Agregar feriado</button>
        <p className="muted" style={{ marginTop: 8 }}>Los feriados de 2027 se cargan acá cuando el Gobierno los decrete. Sirven para avisar al cargar un pedido o mover un camión.</p>
      </div>
    </>
  );
}
