import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./api";
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
import HojaRuta from "./views/HojaRuta.jsx";
import Feriados from "./views/Feriados.jsx";
import { sincronizar, useConexion } from "./lib/offline";
import { Icon, Avatar } from "./views/icons.jsx";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const TABS = {
  vendedor: [["inicio", "Inicio"], ["hoja", "Hoja de ruta"], ["clientes", "Clientes"], ["catalogo", "Catálogo"], ["pedidos", "Mis pedidos"]],
  deposito: [["deposito", "Preparación"]],
  admin: [["inicio", "Inicio"], ["pedidos", "Pedidos"], ["clientes", "Clientes"], ["catalogo", "Catálogo"], ["caja", "Caja"], ["articulos", "Artículos"]],
  gerencia: [["inicio", "Inicio"], ["resumen", "Resumen del mes"], ["pedidos", "Pedidos"], ["deposito", "Depósito"], ["clientes", "Clientes"], ["catalogo", "Catálogo"], ["caja", "Caja"], ["articulos", "Artículos"], ["usuarios", "Usuarios"]],
};

const VIEWS = {
  inicio: Inicio, clientes: Clientes, cliente: ClienteDetalle, catalogo: Catalogo, confirmar: Confirmar,
  pedidos: Pedidos, pedido: PedidoDetalle, deposito: Deposito, depoPedido: DepoPedido,
  articulos: Articulos, usuarios: Usuarios, caja: Caja, resumen: Resumen, hoja: HojaRuta, feriados: Feriados,
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
  // Si ya había entrado en este dispositivo (modo Supabase), entra directo.
  useEffect(() => { api.sesionGuardada?.().then(u => u && login(u)).catch(() => {}); }, []);
  const login = u => {
    setUser(u);
    setCart({ clienteId: null, items: {}, manual: {}, obs: "" });
    go(u.rol === "deposito" ? "deposito" : "inicio");
  };

  if (!user) return <Ctx.Provider value={{ db, toast }}><Login onLogin={login} />{msg && <div className="toast">{msg}</div>}</Ctx.Provider>;

  const View = VIEWS[nav.view] || Inicio;
  const tabs = TABS[user.rol];
  const activo = { cliente: nav.params.desde === "hoja" ? "hoja" : "clientes", confirmar: "catalogo", pedido: "pedidos", depoPedido: "deposito", feriados: "pedidos" }[nav.view] || nav.view;
  const cartCount = Object.values(cart.items).reduce((a, b) => a + b, 0);

  return (
    <Ctx.Provider value={{ db, user, go, toast, cart, setCart, params: nav.params }}>
      <div className="topbar">
        <div className="logo-pill"><img className="banner-img" src={logo} alt="Sodería Rincón del Sur" /></div>
        {api.modo === "demo" && <span className="demo-flag">DEMO</span>}
        <div className="sp" />
        <div className="who">
          <Avatar txt={user.nombre} />
          <div><div className="who-n">{user.nombre}</div><div className="sub">{ROLES[user.rol]}</div></div>
        </div>
        <button className="iconbtn" title={dark ? "Modo claro" : "Modo oscuro"} aria-label="Cambiar modo" onClick={() => setDark(!dark)}><Icon n={dark ? "sol" : "luna"} s={18} /></button>
        <button className="iconbtn" title="Salir" aria-label="Salir" onClick={() => { api.salir?.(); setUser(null); }}><Icon n="salir" s={18} /></button>
      </div>
      {tabs.length > 1 && (
        <nav className={"tabs" + (tabs.length > 5 ? " muchas" : "")}>
          {tabs.map(([k, l]) => (
            <button key={k} className={activo === k ? "on" : ""} onClick={() => go(k)}>
              <Icon n={k} s={19} /><span>{l}</span>
            </button>
          ))}
        </nav>
      )}
      {(!online || outbox.length > 0) && (
        <div className="offline-bar" role="status">
          <Icon n="sinSenal" s={16} /> {!online ? "Sin señal. Podés seguir cargando pedidos: se envían solos cuando vuelva la conexión." : "Enviando pedidos guardados…"}
          {outbox.length > 0 && <b> · {outbox.length} {outbox.length === 1 ? "pedido esperando" : "pedidos esperando"}</b>}
        </div>
      )}
      <main><View /></main>
      {cartCount > 0 && nav.view === "catalogo" && (
        <div className="cartbar">
          <div className="cart-ico"><Icon n="pedidos" s={20} /><span>{cartCount}</span></div>
          <div style={{ flex: 1 }}><div className="sub">{cartCount} {cartCount === 1 ? "unidad" : "unidades"} en el pedido</div><div className="tot">Listo para revisar</div></div>
          <button className="btn brand" onClick={() => go("confirmar")}>Revisar y enviar</button>
        </div>
      )}
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}
