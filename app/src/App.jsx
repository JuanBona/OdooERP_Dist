import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api/demo";
import { ROLES } from "./lib/reglas";
import logo from "./assets/logo.jpg";
import Login from "./views/Login.jsx";
import Inicio from "./views/Inicio.jsx";
import { Clientes, ClienteDetalle } from "./views/Clientes.jsx";
import { Catalogo, Confirmar } from "./views/Catalogo.jsx";
import { Pedidos, PedidoDetalle } from "./views/Pedidos.jsx";
import { Deposito, DepoPedido } from "./views/Deposito.jsx";
import Articulos from "./views/Articulos.jsx";
import Usuarios from "./views/Usuarios.jsx";
import Caja from "./views/Caja.jsx";
import Resumen from "./views/Resumen.jsx";
import { sincronizar, useConexion } from "./lib/offline";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const TABS = {
  vendedor: [["inicio", "Inicio"], ["clientes", "Clientes"], ["catalogo", "Catálogo"], ["pedidos", "Mis pedidos"]],
  deposito: [["deposito", "Preparación"]],
  admin: [["inicio", "Inicio"], ["pedidos", "Pedidos"], ["deposito", "Depósito"], ["clientes", "Clientes"], ["catalogo", "Catálogo"], ["caja", "Caja"], ["articulos", "Artículos"]],
  gerencia: [["inicio", "Inicio"], ["resumen", "Resumen del mes"], ["pedidos", "Pedidos"], ["deposito", "Depósito"], ["clientes", "Clientes"], ["catalogo", "Catálogo"], ["caja", "Caja"], ["articulos", "Artículos"], ["usuarios", "Usuarios"]],
};

const VIEWS = {
  inicio: Inicio, clientes: Clientes, cliente: ClienteDetalle, catalogo: Catalogo, confirmar: Confirmar,
  pedidos: Pedidos, pedido: PedidoDetalle, deposito: Deposito, depoPedido: DepoPedido,
  articulos: Articulos, usuarios: Usuarios, caja: Caja, resumen: Resumen,
};

export default function App() {
  const db = useSyncExternalStore(api.subscribe, api.get);
  const [user, setUser] = useState(null);
  const [nav, setNav] = useState({ view: "inicio", params: {} });
  const [cart, setCart] = useState({ clienteId: null, items: {}, manual: {}, obs: "" });
  const [msg, setMsg] = useState(null);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("rds-dark") === "1"; } catch { return false; } });

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    try { localStorage.setItem("rds-dark", dark ? "1" : "0"); } catch {}
  }, [dark]);

  const { online, outbox } = useConexion();
  const go = (view, params = {}) => { setNav({ view, params }); window.scrollTo(0, 0); };
  const toast = m => { setMsg(m); setTimeout(() => setMsg(null), 3200); };

  // Al volver la señal se envían solos los pedidos que quedaron esperando.
  useEffect(() => { if (online) sincronizar(toast); }, [online]);
  // Entregas automáticas: lo que salió ayer en reparto pasa a Entregado.
  useEffect(() => { api.cerrarRepartos(); }, []);
  const login = u => {
    setUser(u);
    setCart({ clienteId: null, items: {}, manual: {}, obs: "" });
    go(u.rol === "deposito" ? "deposito" : "inicio");
  };

  if (!user) return <Ctx.Provider value={{ db, toast }}><Login onLogin={login} />{msg && <div className="toast">{msg}</div>}</Ctx.Provider>;

  const View = VIEWS[nav.view] || Inicio;
  const tabs = TABS[user.rol];
  const activo = { cliente: "clientes", confirmar: "catalogo", pedido: "pedidos", depoPedido: "deposito" }[nav.view] || nav.view;
  const cartCount = Object.values(cart.items).reduce((a, b) => a + b, 0);

  return (
    <Ctx.Provider value={{ db, user, go, toast, cart, setCart, params: nav.params }}>
      <div className="topbar">
        <img className="banner-img" src={logo} alt="Sodería Rincón del Sur" />
        {api.modo === "demo" && <span className="demo-flag">DEMO</span>}
        <div className="sp" />
        <div className="who" style={{ textAlign: "right", lineHeight: 1.2 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{user.nombre}</div>
          <div className="sub">{ROLES[user.rol]}</div>
        </div>
        <button className="iconbtn" title="Modo oscuro" onClick={() => setDark(!dark)}>{dark ? "☀" : "☾"}</button>
        <button className="iconbtn" title="Salir" style={{ width: "auto", padding: "0 10px", fontSize: 13, fontWeight: 700 }} onClick={() => setUser(null)}>Salir</button>
      </div>
      {tabs.length > 1 && (
        <nav className="tabs">
          {tabs.map(([k, l]) => <button key={k} className={activo === k ? "on" : ""} onClick={() => go(k)}>{l}</button>)}
        </nav>
      )}
      {(!online || outbox.length > 0) && (
        <div className="offline-bar" role="status">
          {!online ? "Sin señal. Podés seguir cargando pedidos: se envían solos cuando vuelva la conexión." : "Enviando pedidos guardados…"}
          {outbox.length > 0 && <b> · {outbox.length} {outbox.length === 1 ? "pedido esperando" : "pedidos esperando"}</b>}
        </div>
      )}
      <main><View /></main>
      {cartCount > 0 && nav.view === "catalogo" && (
        <div className="cartbar">
          <div style={{ flex: 1 }}><div className="sub">{cartCount} unidades</div><div className="tot">Ver pedido</div></div>
          <button className="btn brand" onClick={() => go("confirmar")}>Revisar y enviar →</button>
        </div>
      )}
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}
