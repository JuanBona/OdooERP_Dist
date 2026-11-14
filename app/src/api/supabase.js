// Backend real: Supabase (nube o self-hosted). Mantiene una copia local de los datos con la misma
// forma que el modo demo, así las pantallas no cambian. Las escrituras van por funciones de la base
// (supabase/migrations) que validan permisos, stock y reglas; después se recarga lo necesario.
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DOMINIO = "rincondelsur.app"; // el login usa "usuario" → usuario@rincondelsur.app

// Solo se crea si hay Supabase configurado (sin URL la app corre en modo demo).
export const sb = URL ? createClient(URL, KEY, { auth: { persistSession: true } }) : null;
const listeners = new Set();
let db = { usuarios: [], productos: [], clientes: [], pedidos: [], cobros: [], caja: [], arqueos: [], auditoria: [], miARendir: 0 };
let yo = null;

const emit = () => { db = { ...db }; listeners.forEach(f => f()); };
const err = e => { if (e) throw new Error(traducir(e.message)); };
function traducir(m) {
  if (/Invalid login/i.test(m)) return "Usuario o clave incorrectos.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión con el servidor.";
  return m;
}

// ---------- Carga y conversión (snake_case de la base → forma de la app) ----------
const num = v => (v == null ? v : Number(v));
const mapUsuario = p => ({ id: p.id, nombre: p.nombre, rol: p.rol, usuario: p.usuario, comisionPct: num(p.comision_pct) });
const mapProducto = p => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, precio: num(p.precio), stock: p.stock, stockMin: p.stock_min, tramos: p.tramos || [], foto: p.foto_url, activo: p.activo });
const mapCliente = c => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, dir: c.dir, cuit: c.cuit, tel: c.tel, localidad: c.localidad, dia: c.dia, vendedorId: c.vendedor_id, saldo: num(c.saldo), ultimoPago: c.ultimo_pago, obs: c.obs });
const mapLinea = l => ({ productoId: l.producto_id, nombre: l.nombre, cant: l.cant, precio: num(l.precio), pct: num(l.pct), manual: l.manual, total: num(l.total) });
const mapPedido = p => ({ id: p.id, clienteId: p.cliente_id, vendedorId: p.vendedor_id, fecha: p.fecha, creado: p.creado, estado: p.estado, total: num(p.total), obs: p.obs, hechos: p.hechos || [], historial: p.historial || [], salio: p.salio, lineas: (p.pedido_lineas || []).sort((a, b) => a.id - b.id).map(mapLinea) });
const mapCobro = c => ({ id: c.id, fecha: c.fecha, hora: c.fecha + "T12:00:00", clienteId: c.cliente_id, vendedorId: c.vendedor_id, cobradorId: c.cobrador_id, monto: num(c.monto), medio: c.medio, comision: num(c.comision) });
const nombreDe = id => db.usuarios.find(u => u.id === id)?.nombre || "—";
const mapMov = m => ({ id: m.id, fecha: m.fecha, hora: m.hora, tipo: m.tipo, concepto: m.concepto, monto: num(m.monto), persona: m.persona, detalle: m.detalle, vuelve: m.vuelve, vuelveFecha: m.vuelve_fecha || "", vendedorId: m.vendedor_id, cobroId: m.cobro_id, usuario: nombreDe(m.usuario),
  devoluciones: (m.caja_devoluciones || []).map(d => ({ fecha: d.hora.slice(0, 10), hora: d.hora, monto: num(d.monto), como: d.como, usuario: nombreDe(d.usuario) })) });

async function todo(q) { // trae todas las filas (Supabase devuelve de a 1000)
  const out = []; let desde = 0;
  for (;;) { const { data, error } = await q().range(desde, desde + 999); err(error); out.push(...data); if (data.length < 1000) return out; desde += 1000; }
}

const cargas = {
  usuarios: async () => { db.usuarios = (await todo(() => sb.from("perfiles").select("*").order("nombre"))).map(mapUsuario); },
  productos: async () => { db.productos = (await todo(() => sb.from("productos").select("*").order("id"))).map(mapProducto); },
  clientes: async () => { db.clientes = (await todo(() => sb.from("clientes").select("*").order("codigo"))).map(mapCliente); },
  pedidos: async () => { db.pedidos = (await todo(() => sb.from("pedidos").select("*, pedido_lineas(*)").order("id", { ascending: false }))).map(mapPedido); },
  cobros: async () => { db.cobros = (await todo(() => sb.from("cobros").select("*").order("id", { ascending: false }))).map(mapCobro); },
  caja: async () => {
    if (!["admin", "gerencia"].includes(yo?.rol)) { db.caja = []; db.arqueos = []; return; }
    db.caja = (await todo(() => sb.from("caja_movimientos").select("*, caja_devoluciones(*)").order("id", { ascending: false }))).map(mapMov);
    const { data, error } = await sb.from("caja_arqueos").select("*").order("id", { ascending: false }).limit(20); err(error);
    db.arqueos = data.map(a => ({ fecha: a.hora, contado: num(a.contado), esperado: num(a.esperado), dif: num(a.contado) - num(a.esperado), motivo: a.motivo, usuario: nombreDe(a.usuario) }));
  },
  miARendir: async () => {
    if (yo?.rol !== "vendedor") return;
    const { data, error } = await sb.rpc("mi_a_rendir"); err(error); db.miARendir = num(data) || 0;
  },
};
const recargar = async (...qué) => { await Promise.all(qué.map(k => cargas[k]())); emit(); };
const recargarTodo = () => recargar(...Object.keys(cargas));

// Tiempo real: si otro usuario cambia algo, se recarga esa parte.
const TABLA = { productos: "productos", clientes: "clientes", pedidos: "pedidos", pedido_lineas: "pedidos", cobros: "cobros", caja_movimientos: "caja", caja_devoluciones: "caja", perfiles: "usuarios" };
let canal = null; const pendientes = new Set(); let timer = null;
let reloj = null;
function escuchar() {
  canal?.unsubscribe();
  // El vendedor no ve la caja, así que no le llega el aviso cuando le reciben la plata: se refresca solo.
  clearInterval(reloj);
  if (yo?.rol === "vendedor") {
    const refrescar = () => recargar("miARendir", "pedidos").catch(() => {});
    reloj = setInterval(refrescar, 30000);
    window.addEventListener("focus", refrescar);
  }
  canal = sb.channel("cambios").on("postgres_changes", { event: "*", schema: "public" }, ev => {
    const k = TABLA[ev.table]; if (!k) return;
    pendientes.add(k); if (k === "cobros" || k === "caja") pendientes.add("miARendir");
    clearTimeout(timer); timer = setTimeout(() => { const ks = [...pendientes]; pendientes.clear(); recargar(...ks).catch(() => {}); }, 400);
  }).subscribe();
}

export const api = {
  modo: "supabase",
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  get() { return db; },
  reset() {},

  async login(usuario, clave) {
    const email = usuario.includes("@") ? usuario.trim() : `${usuario.trim().toLowerCase()}@${DOMINIO}`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: clave }); err(error);
    return api._entrar(data.user.id);
  },
  async sesionGuardada() { // si ya había entrado en este dispositivo
    const { data } = await sb.auth.getSession();
    return data.session ? api._entrar(data.session.user.id) : null;
  },
  async _entrar(uid) {
    const { data, error } = await sb.from("perfiles").select("*").eq("id", uid).single(); err(error);
    yo = mapUsuario(data);
    await recargarTodo(); escuchar();
    return yo;
  },
  async salir() { canal?.unsubscribe(); clearInterval(reloj); await sb.auth.signOut(); yo = null; },

  async crearPedido(user, { clienteId, items, obs }) {
    const p_items = items.map(i => ({ producto_id: i.productoId, cant: i.cant, precio_manual: i.precioManual ?? null, desc_manual: i.descManual ?? null }));
    const { data: id, error } = await sb.rpc("crear_pedido", { p_cliente: clienteId, p_items, p_obs: obs || "" }); err(error);
    await recargar("pedidos", "productos");
    return db.pedidos.find(p => p.id === id);
  },
  async cambiarEstado(user, pedidoId, estado, txt) {
    const { error } = await sb.rpc("cambiar_estado", { p_pedido: pedidoId, p_estado: estado, p_txt: txt }); err(error);
    await recargar("pedidos", "productos", "clientes");
  },
  async tildar(user, pedidoId, idx) {
    const { error } = await sb.rpc("tildar", { p_pedido: pedidoId, p_idx: idx }); err(error);
    await recargar("pedidos");
  },
  async registrarCobro(user, clienteId, monto, medio) {
    const { error } = await sb.rpc("registrar_cobro", { p_cliente: clienteId, p_monto: monto, p_medio: medio }); err(error);
    await recargar("clientes", "cobros", "caja", "miARendir");
  },
  async guardarProducto(user, p) {
    let foto_url = p.foto;
    if (p.foto && p.foto.startsWith("data:")) { // sube la foto achicada a Storage
      const blob = await (await fetch(p.foto)).blob();
      const path = `${p.id || "nuevo"}-${Date.now()}.jpg`;
      const { error } = await sb.storage.from("productos").upload(path, blob, { contentType: "image/jpeg", upsert: true }); err(error);
      foto_url = sb.storage.from("productos").getPublicUrl(path).data.publicUrl;
    }
    const fila = { nombre: p.nombre, categoria: p.categoria, precio: p.precio, stock: p.stock, stock_min: p.stockMin, tramos: p.tramos, foto_url, activo: p.activo };
    const { error } = p.id ? await sb.from("productos").update(fila).eq("id", p.id) : await sb.from("productos").insert(fila); err(error);
    await recargar("productos");
  },
  async guardarCliente(user, c) {
    const fila = { nombre: c.nombre, dir: c.dir, tel: c.tel, localidad: c.localidad, dia: c.dia, vendedor_id: c.vendedorId, obs: c.obs };
    if (!c.id) fila.codigo = Math.max(0, ...db.clientes.map(x => x.codigo || 0)) + 1;
    const { error } = c.id ? await sb.from("clientes").update(fila).eq("id", c.id) : await sb.from("clientes").insert(fila); err(error);
    await recargar("clientes");
  },
  async guardarUsuario(user, u) {
    const { error } = await sb.from("perfiles").update({ nombre: u.nombre, comision_pct: u.comisionPct || 0 }).eq("id", u.id); err(error);
    await recargar("usuarios");
  },

  // ---- Caja del depósito ----
  saldoCaja() { return db.caja.reduce((s, m) => s + m.monto + m.devoluciones.filter(d => d.como === "Efectivo").reduce((a, d) => a + d.monto, 0), 0); },
  pendienteDe(m) { return m.vuelve ? -m.monto - m.devoluciones.reduce((s, d) => s + d.monto, 0) : 0; },
  aRendir(vendedorId) {
    if (yo?.rol === "vendedor") return db.miARendir;
    const cobrado = db.cobros.filter(c => c.cobradorId === vendedorId && c.medio === "Efectivo").reduce((s, c) => s + c.monto, 0);
    const entregado = db.caja.filter(m => m.vendedorId === vendedorId && m.concepto === "Rendición de vendedor").reduce((s, m) => s + m.monto, 0);
    return cobrado - entregado;
  },
  async movCaja(user, { tipo, concepto, monto, persona = "", detalle = "", vuelve = false, vuelveFecha = "", vendedorId = null }) {
    monto = Math.round(+monto);
    if (!(Math.abs(monto) > 0)) throw new Error("Poné el monto.");
    const { error } = await sb.from("caja_movimientos").insert({
      tipo, concepto, persona, detalle, vendedor_id: vendedorId, usuario: user.id,
      monto: tipo === "egreso" ? -Math.abs(monto) : Math.abs(monto),
      vuelve: tipo === "egreso" && vuelve, vuelve_fecha: vuelve && vuelveFecha ? vuelveFecha : null,
    }); err(error);
    await recargar("caja");
  },
  async registrarDevolucion(user, movId, monto, como) {
    const m = db.caja.find(x => x.id === movId);
    monto = Math.round(+monto);
    if (!(monto > 0)) throw new Error("Poné el monto que volvió.");
    if (monto > api.pendienteDe(m)) throw new Error("Es más de lo que falta devolver.");
    const { error } = await sb.from("caja_devoluciones").insert({ movimiento_id: movId, monto, como, usuario: user.id }); err(error);
    await recargar("caja");
  },
  async arqueo(user, contado, motivo) {
    const { data, error } = await sb.rpc("contar_caja", { p_contado: Math.round(+contado), p_motivo: motivo || "" }); err(error);
    await recargar("caja");
    return num(data);
  },
  cerrarRepartos() { return 0; }, // en Supabase lo hace la tarea programada cerrar_reparto()
};
