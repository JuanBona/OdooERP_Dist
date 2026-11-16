import { Icon, Avatar } from "./icons.jsx";
import React, { useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { ROLES } from "../lib/reglas";

const QUE_HACE = {
  vendedor: "Toma pedidos y cobra a sus clientes. Ve solo lo suyo.",
  deposito: "Prepara los pedidos.",
  admin: "Autoriza pedidos, imprime remitos, carga clientes y artículos.",
  gerencia: "Todo lo de Administración, más usuarios, comisiones y finanzas.",
};

export default function Usuarios() {
  const { db, user, toast } = useApp();
  const [ed, setEd] = useState(null);
  return (
    <>
      <h1>Usuarios</h1>
      <p className="muted" style={{ marginBottom: 14 }}>La comisión de cada vendedor se calcula sobre lo cobrado.</p>
      <div className="card">
        {db.usuarios.map(u => (
          <div key={u.id} className="list-item" onClick={() => setEd({ ...u })}>
            <Avatar txt={u?.nombre} />
            <div style={{ flex: 1, minWidth: 0 }}><b>{u.nombre}</b> <span className="chip st-autorizado">{ROLES[u.rol]}</span><div className="muted">{QUE_HACE[u.rol]}</div></div>
            {u.rol === "vendedor" && <span className="chip st-preparado">{u.comisionPct || 0}% comisión</span>}
          </div>
        ))}
      </div>
      {ed && (
        <div className="modal-back" onClick={() => setEd(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Editar usuario</h2>
            <div className="field"><label htmlFor="eu-n">Nombre</label><input id="eu-n" value={ed.nombre} onChange={e => setEd({ ...ed, nombre: e.target.value })} /></div>
            {ed.rol === "vendedor" && <div className="field"><label htmlFor="eu-c">Comisión sobre lo cobrado (%)</label><input id="eu-c" type="number" value={ed.comisionPct || 0} onChange={e => setEd({ ...ed, comisionPct: +e.target.value })} /></div>}
            <div className="row"><button className="btn sec" onClick={() => setEd(null)}>Cancelar</button>
              <button className="btn" style={{ flex: 1 }} onClick={async () => { try { await api.guardarUsuario(user, ed); toast("Usuario guardado"); setEd(null); } catch (e) { toast(e.message); } }}>Guardar</button></div>
          </div>
        </div>
      )}
    </>
  );
}
