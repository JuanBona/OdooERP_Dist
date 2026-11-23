// Backend real: Supabase (nube o self-hosted). Mantiene una copia local de los datos con la misma
// forma que el modo demo, así las pantallas no cambian. Las escrituras van por funciones de la base
// (supabase/migrations) que validan permisos, stock y reglas; después se recarga lo necesario.
import { createClient } from "@supabase/supabase-js";
import { CAJA_DE_DEVOLUCION, faltanDatosCheque, fechaEntrega } from "../lib/reglas";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const DOMINIO = "rincondelsur.app"; // el login usa "usuario" → usuario@rincondelsur.app

// Solo se crea si hay Supabase configurado (sin URL la app corre en modo demo).
export const sb = URL ? createClient(URL, KEY, { auth: { persistSession: true } }) : null;
const listeners = new Set();
let db = { usuarios: [], productos: [], clientes: [], pedidos: [], cobros: [], caja: [], arqueos: [], cierres: [], auditoria: [], miARendir: 0, feriados: [], excepciones: [] };
let yo = null;

// Copia local de los datos para abrir sin señal. La caja no se guarda en la tablet.
const COPIA = "rds-copia-v1";
let tCopia = null;
function guardarCopia() {
  clearTimeout(tCopia);
  tCopia = setTimeout(() => {
    try { localStorage.setItem(COPIA, JSON.stringify({ fecha: new Date().toISOString(), yo, db: { ...db, caja: [], arqueos: [] } })); } catch {}
  }, 500);
}
const leerCopia = () => { try { return JSON.parse(localStorage.getItem(COPIA)); } catch { return null; } };
const borrarCopia = () => { try { localStorage.removeItem(COPIA); } catch {} };
const emit = () => { db = { ...db }; listeners.forEach(f => f()); if (yo) guardarCopia(); };

// Al volver la señal se trae todo de nuevo (lo que cambió mientras tanto).
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { if (yo && sb) recargarTodo().then(escuchar).catch(() => {}); });
}
const err = e => { if (e) throw new Error(traducir(e.message)); };
function traducir(m) {
  if (/Invalid login/i.test(m)) return "Usuario o clave incorrectos.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión con el servidor.";
  return m;
}

// ---------- Carga y conversión (snake_case de la base → forma de la app) ----------
const num = v => (v == null ? v : Number(v));
const mapUsuario = p => ({ id: p.id, nombre: p.nombre, rol: p.rol, usuario: p.usuario, comisionPct: num(p.comision_pct) });
// El costo viene de tablas aparte que solo ven Administración y Gerencia (a los demás les llega vacío).
const unoDe = x => (Array.isArray(x) ? x[0] : x) ?? null;
const costoDe = x => num(unoDe(x)?.costo ?? null);
const mapProducto = p => ({ id: p.id, costo: costoDe(p.producto_costos), nombre: p.nombre, categoria: p.categoria, precio: num(p.precio), stock: p.stock, stockMin: p.stock_min, stockContado: p.stock_contado, tramos: p.tramos || [], foto: p.foto_url, activo: p.activo, oferta: !!p.oferta });
const mapCliente = c => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, dir: c.dir, cuit: c.cuit, tel: c.tel, localidad: c.localidad, dia: c.dia, vendedorId: c.vendedor_id, saldo: num(c.saldo), ultimoPago: c.ultimo_pago, obs: c.obs });
const mapLinea = l => ({
  id: l.id, costo: costoDe(l.linea_costos), productoId: l.producto_id, nombre: l.nombre, cant: l.cant, precio: num(l.precio), pct: num(l.pct), manual: l.manual, total: num(l.total),
  precioLista: l.precio_lista == null ? null : num(l.precio_lista), precioEstado: l.precio_estado, cambiadoPor: l.precio_cambiado_por, cambiadoEn: l.precio_cambiado_en,
  descEstado: l.desc_estado, descAplicadoPor: l.desc_aplicado_por, descAplicadoEn: l.desc_aplicado_en,
  // Historial de precios: solo lo devuelve la base a Administración y Gerencia (a los demás les llega vacío).
  log: (l.pedido_linea_precio_log || []).sort((a, b) => a.id - b.id).map(h => ({ campo: h.campo, accion: h.accion, usuarioId: h.usuario_id, antes: num(h.precio_antes), despues: num(h.precio_despues), fecha: h.creado_en })),
});
const mapPedido = p => ({ id: p.id, clienteId: p.cliente_id, vendedorId: p.vendedor_id, fecha: p.fecha, fechaEntrega: p.fecha_entrega, creado: p.creado, estado: p.estado, total: num(p.total), obs: p.obs, hechos: p.hechos || [], historial: p.historial || [], salio: p.salio,
  // Devoluciones del pedido: solo las devuelve la base a Administración y Gerencia.
  devoluciones: (p.pedido_devoluciones || []).sort((a, b) => a.id - b.id).map(d => ({ id: d.id, fecha: d.creado_en, usuarioId: d.usuario_id, monto: num(d.monto), completa: d.completa, motivo: d.motivo, lineas: (d.pedido_devolucion_lineas || []).map(x => ({ nombre: x.nombre, cant: x.cant, monto: num(x.monto) })) })),
  descuentoTotal: num(p.descuento_total) || 0, descTotalEstado: p.desc_total_estado, descTotalPor: p.desc_total_por, descTotalEn: p.desc_total_en,
  // Historial del descuento sobre el total: solo lo devuelve la base a Administración y Gerencia.
  logTotal: (p.log_total || []).filter(h => h.campo === "total").sort((a, b) => a.id - b.id).map(h => ({ accion: h.accion, usuarioId: h.usuario_id, antes: num(h.precio_antes), despues: num(h.precio_despues), fecha: h.creado_en })), lineas: (p.pedido_lineas || []).sort((a, b) => a.id - b.id).map(mapLinea) });
const mapCobro = c => ({ id: c.id, fecha: c.fecha, hora: c.fecha + "T12:00:00", clienteId: c.cliente_id, vendedorId: c.vendedor_id, cobradorId: c.cobrador_id, monto: num(c.monto), medio: c.medio, comision: num(c.comision) });
const mapFeriado = f => ({ fecha: f.fecha, nombre: f.nombre });
const mapCambioRuta = e => ({ id: e.id, vendedorId: e.vendedor_id, desde: e.fecha_original, hasta: e.fecha_nueva, motivo: e.motivo });
const nombreDe = id => db.usuarios.find(u => u.id === id)?.nombre || "—";
const mapMov = m => ({ id: m.id, fecha: m.fecha, hora: m.hora, tipo: m.tipo, concepto: m.concepto, monto: num(m.monto), persona: m.persona, detalle: m.detalle, vuelve: m.vuelve, vuelveFecha: m.vuelve_fecha || "", vendedorId: m.vendedor_id, cobroId: m.cobro_id, caja: m.caja || "efectivo", chequeNumero: m.cheque_numero, chequeBanco: m.cheque_banco, chequeCobro: m.cheque_cobro, usuario: nombreDe(m.usuario),
  devoluciones: (m.caja_devoluciones || []).map(d => ({ fecha: d.hora.slice(0, 10), hora: d.hora, monto: num(d.monto), como: d.como, usuario: nombreDe(d.usuario) })) });

const DIAS_HISTORIAL = 60;
const desde = () => { const d = new Date(); d.setDate(d.getDate() - DIAS_HISTORIAL); return d.toISOString().slice(0, 10); };

async function todo(q) { // trae todas las filas (Supabase devuelve de a 1000)
  const out = []; let desde = 0;
  for (;;) { const { data, error } = await q().range(desde, desde + 999); err(error); out.push(...data); if (data.length < 1000) return out; desde += 1000; }
}

const cargas = {
  // Administración y Gerencia leen todos los perfiles. Los demás roles solo pueden leer el suyo, pero Depósito necesita los
  // nombres de los vendedores para agrupar los pedidos: los toma de una vista que no incluye las comisiones.
  usuarios: async () => {
    const todos = ["admin", "gerencia"].includes(yo?.rol);
    db.usuarios = (await todo(() => sb.from(todos ? "perfiles" : "lista_vendedores").select("*").order("nombre"))).map(mapUsuario);
    if (!todos && yo && !db.usuarios.some(u => u.id === yo.id)) db.usuarios.push(yo);
  },
  productos: async () => { db.productos = (await todo(() => sb.from("productos").select("*, producto_costos(costo)").order("id"))).map(mapProducto); },
  clientes: async () => { db.clientes = (await todo(() => sb.from("clientes").select("*").order("codigo"))).map(mapCliente); },
  // Solo lo reciente (para que entrar sea rápido y no se descargue todo el historial):
  // pedidos de los últimos 60 días + los que siguen abiertos, y cobros de los últimos 60 días.
  pedidos: async () => {
    db.pedidos = (await todo(() => sb.from("pedidos").select("*, log_total:pedido_linea_precio_log(*), pedido_devoluciones(*, pedido_devolucion_lineas(*)), pedido_lineas(*, linea_costos(costo), pedido_linea_precio_log(*))")
      .or(`fecha.gte.${desde()},fecha_entrega.gte.${desde()},estado.in.(porAutorizar,pendiente,preparando,preparado,enReparto)`)
      .order("id", { ascending: false }))).map(mapPedido);
  },
  feriados: async () => { db.feriados = (await todo(() => sb.from("feriados").select("*").order("fecha"))).map(mapFeriado); },
  excepciones: async () => { db.excepciones = (await todo(() => sb.from("excepciones_visita").select("*").gte("fecha_nueva", desde()).order("id"))).map(mapCambioRuta); },
  cobros: async () => { db.cobros = (await todo(() => sb.from("cobros").select("*").gte("fecha", desde()).order("id", { ascending: false }))).map(mapCobro); },
  cierres: async () => {
    if (yo?.rol !== "gerencia") { db.cierres = []; return; }
    const { data, error } = await sb.from("cierres_mes").select("*").order("mes", { ascending: false }); err(error);
    db.cierres = data.map(c => ({ mes: c.mes, hora: c.hora, usuario: nombreDe(c.usuario), resumen: c.resumen }));
  },
  caja: async () => {
    if (!["admin", "gerencia"].includes(yo?.rol)) { db.caja = []; db.arqueos = []; return; }
    db.caja = (await todo(() => sb.from("caja_movimientos").select("*, caja_devoluciones(*)").order("id", { ascending: false }))).map(mapMov);
    const { data, error } = await sb.from("caja_arqueos").select("*").order("id", { ascending: false }).limit(20); err(error);
    db.arqueos = data.map(a => ({ fecha: a.hora, contado: num(a.contado), esperado: num(a.esperado), dif: num(a.contado) - num(a.esperado), motivo: a.motivo, caja: a.caja || "efectivo", usuario: nombreDe(a.usuario) }));
  },
  miARendir: async () => {
    if (yo?.rol !== "vendedor") return;
    const { data, error } = await sb.rpc("mi_a_rendir"); err(error); db.miARendir = num(data) || 0;
  },
};
const recargar = async (...qué) => { await Promise.all(qué.map(k => cargas[k]())); emit(); };
const recargarTodo = () => recargar(...Object.keys(cargas));

// Tiempo real: si otro usuario cambia algo, se recarga esa parte.
const TABLA = { productos: "productos", clientes: "clientes", pedidos: "pedidos", pedido_lineas: "pedidos", pedido_linea_precio_log: "pedidos", pedido_devoluciones: "pedidos", pedido_devolucion_lineas: "pedidos", cobros: "cobros", caja_movimientos: "caja", caja_devoluciones: "caja", perfiles: "usuarios", feriados: "feriados", excepciones_visita: "excepciones", cierres_mes: "cierres" };
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
  async sesionGuardada() { // si ya había entrado en este dispositivo (funciona sin señal)
    const { data } = await sb.auth.getSession();
    return data.session ? api._entrar(data.session.user.id) : null;
  },
  async _entrar(uid) {
    try {
      const { data, error } = await sb.from("perfiles").select("*").eq("id", uid).single(); err(error);
      yo = mapUsuario(data);
      await recargarTodo(); escuchar();
    } catch (e) {
      // Sin señal: abre con la última copia guardada en la tablet (solo si es del mismo usuario).
      const c = leerCopia();
      if (!c || c.yo?.id !== uid) throw e;
      yo = c.yo; db = { ...db, ...c.db };
      // La copia puede ser de antes de que existieran los camiones: se les calcula con la misma regla.
      db.pedidos = db.pedidos.map(p => p.fechaEntrega ? p : { ...p, fechaEntrega: fechaEntrega(db.clientes.find(x => x.id === p.clienteId)?.dia, p.fecha) });
      db.feriados ||= []; db.excepciones ||= [];
      emit();
    }
    return yo;
  },
  async salir() { canal?.unsubscribe(); clearInterval(reloj); await sb.auth.signOut(); yo = null; borrarCopia(); },

  async crearPedido(user, { clienteId, items, obs, uid, fecha, descTotal }) {
    const p_items = items.map(i => ({ producto_id: i.productoId, cant: i.cant, precio_manual: i.precioManual ?? null, desc_manual: i.descManual ?? null, aplicar_desc: !!i.aplicarDesc }));
    const { data: id, error } = await sb.rpc("crear_pedido", { p_cliente: clienteId, p_items, p_obs: obs || "", p_uid: uid || null, p_fecha: fecha || null, p_desc_total: descTotal || 0 }); err(error);
    await recargar("pedidos", "productos");
    return db.pedidos.find(p => p.id === id);
  },
  // Editar un pedido por autorizar (confirmar = lo confirma el día de la visita: queda con fecha de hoy).
  async editarPedido(user, pedidoId, { items, obs, descTotal, confirmar = false }) {
    const p_items = items.map(i => ({ producto_id: i.productoId, cant: i.cant, precio_manual: i.precioManual ?? null, desc_manual: i.descManual ?? null, aplicar_desc: !!i.aplicarDesc }));
    const { error } = await sb.rpc("editar_pedido", { p_pedido: pedidoId, p_items, p_obs: obs || "", p_desc_total: descTotal || 0, p_confirmar: confirmar }); err(error);
    await recargar("pedidos", "productos");
    return db.pedidos.find(p => p.id === pedidoId);
  },
  async cambiarEstado(user, pedidoId, estado, txt) {
    const { error } = await sb.rpc("cambiar_estado", { p_pedido: pedidoId, p_estado: estado, p_txt: txt }); err(error);
    await recargar("pedidos", "productos", "clientes");
  },
  // ---- Feriados y cambios de ruta (Administración y Gerencia) ----
  async guardarFeriado(user, { fecha, nombre }) {
    const { error } = await sb.from("feriados").upsert({ fecha, nombre }); err(error);
    await recargar("feriados");
  },
  async borrarFeriado(user, fecha) {
    const { error } = await sb.from("feriados").delete().eq("fecha", fecha); err(error);
    await recargar("feriados");
  },
  async crearCambioRuta(user, { vendedorId, desde, hasta, motivo }) {
    const { error } = await sb.from("excepciones_visita").insert({ vendedor_id: vendedorId || null, fecha_original: desde, fecha_nueva: hasta, motivo: motivo || "" }); err(error);
    await recargar("excepciones");
  },
  async cancelarCambioRuta(user, id) {
    const { error } = await sb.from("excepciones_visita").delete().eq("id", id); err(error);
    await recargar("excepciones");
  },
  // Ganancia de lo cobrado en el mes ("AAAA-MM"), con el precio y el costo de cada venta original (solo Gerencia).
  async gananciaCobrada(mes) {
    const [a, m] = mes.split("-").map(Number);
    const hasta = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    const { data, error } = await sb.rpc("ganancia_cobrada", { p_desde: mes + "-01", p_hasta: hasta }); err(error);
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return { cobrado: num(r.cobrado) || 0, ganancia: Math.round(num(r.ganancia) || 0), cobradoSinCosto: Math.round(num(r.cobrado_sin_costo) || 0) };
  },
  async autorizarPedidos(user, ids) {
    const { data, error } = await sb.rpc("autorizar_pedidos", { p_ids: ids }); err(error);
    await recargar("pedidos");
    return data;
  },
  // Administración / Gerencia resuelven un cambio de precio del vendedor: "aprobado", "repuesto" (vuelve a lista) o "corregido" (precio nuevo).
  async resolverPrecio(user, lineaId, accion, precio = null) {
    const { error } = await sb.rpc("resolver_precio_linea", { p_linea: lineaId, p_accion: accion, p_precio: precio }); err(error);
    await recargar("pedidos");
  },
  // Administración / Gerencia resuelven el descuento por cantidad tildado por el vendedor: "aprobado" o "quitado".
  async resolverDescuento(user, lineaId, accion) {
    const { error } = await sb.rpc("resolver_descuento_linea", { p_linea: lineaId, p_accion: accion }); err(error);
    await recargar("pedidos");
  },
  // Descuento sobre el total del pedido: "aprobado", "quitado" o "corregido" (monto nuevo en $).
  async resolverDescuentoTotal(user, pedidoId, accion, monto = null) {
    const { error } = await sb.rpc("resolver_descuento_total", { p_pedido: pedidoId, p_accion: accion, p_monto: monto }); err(error);
    await recargar("pedidos");
  },
  // Devolución completa o parcial de un pedido que ya salió en reparto (Administración y Gerencia).
  // items: [{ lineaId, cant }]. Restaura stock, deuda del cliente y lo vendido.
  async devolverPedido(user, pedidoId, items, motivo = "") {
    const p_items = items.map(i => ({ linea_id: i.lineaId, cant: i.cant }));
    const { error } = await sb.rpc("devolver_pedido", { p_pedido: pedidoId, p_items, p_motivo: motivo || null }); err(error);
    await recargar("pedidos", "productos", "clientes");
  },
  async cambiarFechaEntrega(user, pedidoId, fecha) {
    const { error } = await sb.rpc("cambiar_fecha_entrega", { p_pedido: pedidoId, p_fecha: fecha }); err(error);
    await recargar("pedidos");
  },
  async tildar(user, pedidoId, idx) {
    const { error } = await sb.rpc("tildar", { p_pedido: pedidoId, p_idx: idx }); err(error);
    await recargar("pedidos");
  },
  async registrarCobro(user, clienteId, monto, medio, uid, cheque) { // cheque: { numero, banco, cobro }
    const { error } = await sb.rpc("registrar_cobro", { p_cliente: clienteId, p_monto: monto, p_medio: medio, p_uid: uid || null, p_cheque: medio === "Cheque" ? cheque : null }); err(error);
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
    const fila = { nombre: p.nombre, categoria: p.categoria, precio: p.precio, stock: p.stock, stock_min: p.stockMin, stock_contado: !!p.stockContado, tramos: p.tramos, foto_url, activo: p.activo, oferta: !!p.oferta };
    let id = p.id;
    if (id) { const { error } = await sb.from("productos").update(fila).eq("id", id); err(error); }
    else { const { data, error } = await sb.from("productos").insert(fila).select("id").single(); err(error); id = data.id; }
    if (p.costo !== undefined) { // el costo va aparte (solo lo ven Administración y Gerencia)
      const { error } = p.costo === null || p.costo === "" ? await sb.from("producto_costos").delete().eq("producto_id", id) : await sb.from("producto_costos").upsert({ producto_id: id, costo: +p.costo }); err(error);
    }
    await recargar("productos");
  },
  async guardarCliente(user, c) {
    const fila = { nombre: c.nombre, dir: c.dir, tel: c.tel, localidad: c.localidad, dia: c.dia, obs: c.obs };
    // El vendedor no elige vendedor: la base lo deja a su nombre. El código lo pone la base.
    if (user.rol !== "vendedor") fila.vendedor_id = c.vendedorId;
    else if (!c.id) fila.vendedor_id = user.id;
    const { error } = c.id ? await sb.from("clientes").update(fila).eq("id", c.id) : await sb.from("clientes").insert(fila); err(error);
    await recargar("clientes");
  },
  async guardarUsuario(user, u) {
    const { error } = await sb.from("perfiles").update({ nombre: u.nombre, comision_pct: u.comisionPct || 0 }).eq("id", u.id); err(error);
    await recargar("usuarios");
  },

  // ---- Caja del depósito ----
  saldoCaja(caja = "efectivo") { return db.caja.reduce((s, m) => s + (m.caja === caja ? m.monto : 0) + m.devoluciones.filter(d => CAJA_DE_DEVOLUCION[d.como] === caja).reduce((a, d) => a + d.monto, 0), 0); },
  pendienteDe(m) { return m.vuelve ? -m.monto - m.devoluciones.reduce((s, d) => s + d.monto, 0) : 0; },
  aRendir(vendedorId) {
    if (yo?.rol === "vendedor") return db.miARendir;
    const cobrado = db.cobros.filter(c => c.cobradorId === vendedorId && c.medio === "Efectivo").reduce((s, c) => s + c.monto, 0);
    const entregado = db.caja.filter(m => m.vendedorId === vendedorId && m.concepto === "Rendición de vendedor").reduce((s, m) => s + m.monto, 0);
    return cobrado - entregado;
  },
  async movCaja(user, { tipo, concepto, monto, persona = "", detalle = "", vuelve = false, vuelveFecha = "", vendedorId = null, caja = "efectivo", cheque = null }) {
    monto = Math.round(+monto);
    if (!(Math.abs(monto) > 0)) throw new Error("Poné el monto.");
    if (caja === "cheques" && faltanDatosCheque(cheque)) throw new Error("Poné el número, el banco y la fecha de cobro del cheque.");
    const { error } = await sb.from("caja_movimientos").insert({
      tipo, concepto, persona, detalle, vendedor_id: vendedorId, usuario: user.id, caja,
      ...(caja === "cheques" ? { cheque_numero: cheque.numero.trim(), cheque_banco: cheque.banco.trim(), cheque_cobro: cheque.cobro } : {}),
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
  // Pasa plata de una caja a otra (no cuenta como gasto ni como ingreso). Con cheques, informar el cheque.
  async pasarEntreCajas(user, { origen, destino, monto, detalle = "", cheque = null }) {
    monto = Math.round(+monto);
    if (!(monto > 0)) throw new Error("Poné el monto.");
    if (origen === destino) throw new Error("Elegí dos cajas distintas.");
    if ((origen === "cheques" || destino === "cheques") && faltanDatosCheque(cheque)) throw new Error("Poné el número, el banco y la fecha de cobro del cheque.");
    const { error } = await sb.rpc("pasar_entre_cajas", { p_origen: origen, p_destino: destino, p_monto: monto, p_detalle: detalle, p_cheque: cheque }); err(error);
    await recargar("caja");
  },
  async arqueo(user, contado, motivo, caja = "efectivo") {
    const { data, error } = await sb.rpc("contar_caja", { p_contado: Math.round(+contado), p_motivo: motivo || "", p_caja: caja }); err(error);
    await recargar("caja");
    return num(data);
  },
  async cerrarMes(user, mes, resumen) {
    const { error } = await sb.from("cierres_mes").insert({ mes, resumen, usuario: user.id });
    if (error?.code === "23505") throw new Error("Ese mes ya está cerrado.");
    err(error);
    await recargar("cierres");
  },
  cerrarRepartos() { return 0; }, // en Supabase lo hace la tarea programada cerrar_reparto()
};
