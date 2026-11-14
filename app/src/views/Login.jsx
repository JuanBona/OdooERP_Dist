import React, { useState } from "react";
import { api } from "../api/demo";
import { ROLES } from "../lib/reglas";
import logo from "../assets/logo.jpg";

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [err, setErr] = useState("");
  const entrar = (u, c) => {
    try { onLogin(api.login(u, c)); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={e => { e.preventDefault(); entrar(usuario, clave); }}>
        <img src={logo} alt="Sodería Rincón del Sur" className="banner-img" style={{ margin: "0 auto 18px" }} />
        <div className="field"><label htmlFor="lg-user">Usuario</label>
          <input id="lg-user" autoComplete="username" value={usuario} onChange={e => setUsuario(e.target.value)} /></div>
        <div className="field"><label htmlFor="lg-pass">Clave</label>
          <input id="lg-pass" type="password" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} /></div>
        {err && <p className="chip warn" style={{ display: "block", marginBottom: 10, borderRadius: 8, padding: 8 }}>{err}</p>}
        <button className="btn blk" type="submit">Entrar</button>
        {api.modo === "demo" && <>
          <p className="muted" style={{ marginTop: 18, textAlign: "center" }}>Demo: entrá con un toque</p>
          <div className="demo-users">
            {api.get().usuarios.map(u => (
              <button type="button" key={u.id} onClick={() => entrar(u.usuario, "1234")}>
                {u.nombre}{u.nombre !== ROLES[u.rol] && <span className="rl">{ROLES[u.rol]}</span>}
              </button>
            ))}
          </div>
          <button type="button" className="btn sec sm blk" style={{ marginTop: 14 }} onClick={() => { api.reset(); setErr(""); }}>Reiniciar datos de la demo</button>
        </>}
      </form>
    </div>
  );
}
