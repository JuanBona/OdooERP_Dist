// Backend de MODO DEMO: guarda todo en el navegador (localStorage).
// Implementa las mismas acciones que el backend de Supabase (ver supabase/schema.sql),
// así la interfaz no cambia cuando se conecta la base real.
import seed from "../seed.json";
import { calcPedido, hoyISO, nuevoEstadoPedido } from "../lib/reglas";

const KEY = "rds-demo-v1";
const listeners = new Set();
let db = load();

function inicial() {
  const usuarios = [
    { id: 1, nombre: "Vendedor 1", usuario: "vendedor1", rol: "vendedor", comisionPct: 0 },
    { id: 2, nombre: "Vendedor 2", usuario: "vendedor2", rol: "vendedor", comisionPct: 0 },
    { id: 3, nombre: "Depósito", usuario: "deposito", rol: "deposito" },
    { id: 4, nombre: "Administración", usuario: "admin", rol: "admin" },
    { id: 5, nombre: "Gerencia", usuario: "gerencia", rol: "gerencia" },
  ];
  const productos = seed.productos.map((p, i) => ({
    id: i + 1, nombre: p.nombre, categoria: p.categoria, precio: p.precio,
    stock: 50, stockMin: 10, tramos: [], foto: null, activo: true,
  }));
  // Ejemplo de tramos en dos productos para que se vea la función
  productos[0].tramos = [{ min: 5, pct: 4 }, { min: 10, pct: 8 }];
  const clientes = seed.clientes.map((c, i) => ({
    id: i + 1, codigo: c.codigo, nombre: c.nombre, dir: c.dir, cuit: c.cuit, tel: String(c.tel || ""),
    localidad: "", dia: "", vendedorId: null, saldo: 0, ultimoPago: null, obs: "",
  }));
  // Datos de ejemplo de deuda (para mostrar la alerta). Se borran con "Reiniciar demo".
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
  Object.assign(clientes[1], { saldo: -45200, ultimoPago: d(20), vendedorId: 1 });
  Object.assign(clientes[2], { saldo: -12800, ultimoPago: d(5), vendedorId: 1 });
  Object.assign(clientes[0], { vendedorId: 1 });
  Object.assign(clientes[3], { vendedorId: 2 });
  return { usuarios, productos, clientes, pedidos: [], cobros: [], gastos: [], cajas: [], auditoria: [], seq: 1 };
}

function load() {
  let d = null;
  try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch {}
  d = d || inicial();
  d.gastos ||= []; d.cajas ||= [];
  return d;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  listeners.forEach(fn => fn());
}
function audit(user, accion, ref) {
  db.auditoria.unshift({ fecha: new Date().toISOString(), usuario: user.nombre, accion, ref });
}

export const api = {
  modo: "demo",
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  get() { return db; },
  reset() { db = inicial(); save(); },

  login(usuario, clave) {
    const u = db.usuarios.find(x => x.usuario === usuario.trim().toLowerCase());
    if (!u || clave !== "1234") throw new Error("Usuario o clave incorrectos. En la demo la clave es 1234.");
    return u;
  },

  crearPedido(user, { clienteId, items, obs }) {
    const c = db.clientes.find(x => x.id === clienteId);
    for (const it of items) {
      const p = db.productos.find(x => x.id === it.productoId);
      if (it.cant > p.stock) throw new Error(`No hay stock suficiente de ${p.nombre} (quedan ${p.stock}).`);
    }
    const lineas = calcPedido(items, db.productos);
    lineas.forEach(l => { db.productos.find(p => p.id === l.productoId).stock -= l.cant; });
    const ped = {
      id: db.seq++, clienteId, vendedorId: user.rol === "vendedor" ? user.id : c.vendedorId,
      fecha: hoyISO(), creado: new Date().toISOString(), estado: nuevoEstadoPedido(c),
      lineas, total: lineas.reduce((s, l) => s + l.total, 0), obs: obs || "", hechos: [],
      historial: [{ fecha: new Date().toISOString(), usuario: user.nombre, txt: "Pedido cargado" }],
    };
    db.pedidos.unshift(ped);
    audit(user, "Creó pedido", "#" + ped.id);
    save();
    return ped;
  },

  cambiarEstado(user, pedidoId, estado, txt) {
    const p = db.pedidos.find(x => x.id === pedidoId);
    if (estado === "anulado" || estado === "rechazado") {
      p.lineas.forEach(l => { db.productos.find(x => x.id === l.productoId).stock += l.cant; });
    }
    if (estado === "entregado") {
      db.clientes.find(c => c.id === p.clienteId).saldo -= p.total; // va a cuenta corriente
    }
    if (estado === "enReparto") p.salio = hoyISO();
    p.estado = estado;
    p.historial.push({ fecha: new Date().toISOString(), usuario: user.nombre, txt });
    audit(user, txt, "#" + p.id);
    save();
  },

  tildar(user, pedidoId, idx) {
    const p = db.pedidos.find(x => x.id === pedidoId);
    p.hechos = p.hechos.includes(idx) ? p.hechos.filter(i => i !== idx) : [...p.hechos, idx];
    if (p.estado === "pendiente") {
      p.estado = "preparando";
      p.historial.push({ fecha: new Date().toISOString(), usuario: user.nombre, txt: "Empezó a preparar" });
    }
    save();
  },

  // ---- Caja: una sesión por usuario. Abrir → cobros/gastos → cerrar contando → Administración recibe ----
  cajaAbierta(userId) { return db.cajas.find(c => c.usuarioId === userId && c.estado === "abierta") || null; },

  abrirCaja(user, fondo) {
    if (api.cajaAbierta(user.id)) throw new Error("Ya tenés una caja abierta.");
    const caja = { id: db.cajas.length + 1, usuarioId: user.id, abierta: new Date().toISOString(), fondo: Math.round(+fondo || 0),
      estado: "abierta", cerrada: null, contado: null, recibidaPor: null, recibida: null, obs: "" };
    db.cajas.unshift(caja);
    audit(user, `Abrió caja con fondo $${caja.fondo}`, "Caja " + caja.id);
    save();
    return caja;
  },

  registrarCobro(user, clienteId, monto, medio) {
    const caja = api.cajaAbierta(user.id);
    if (!caja) throw new Error("Abrí tu caja antes de cobrar (pestaña Caja).");
    const c = db.clientes.find(x => x.id === clienteId);
    const vend = db.usuarios.find(u => u.id === c.vendedorId);
    c.saldo += monto;
    c.ultimoPago = hoyISO(); // cualquier pago reinicia el contador de 15 días
    const comision = Math.round(monto * (vend?.comisionPct || 0) / 100); // RF-GV-03: sobre lo cobrado
    db.cobros.unshift({ id: db.cobros.length + 1, fecha: hoyISO(), hora: new Date().toISOString(), clienteId, vendedorId: c.vendedorId,
      monto, medio, comision, cajaId: caja.id, usuario: user.nombre });
    audit(user, `Cobro ${medio} $${monto}`, c.nombre);
    save();
  },

  registrarGasto(user, { categoria, monto, medio, detalle }) {
    const caja = api.cajaAbierta(user.id);
    if (!caja) throw new Error("Abrí tu caja antes de cargar un gasto.");
    db.gastos.unshift({ id: db.gastos.length + 1, fecha: hoyISO(), hora: new Date().toISOString(), categoria,
      monto: Math.round(+monto), medio, detalle, cajaId: caja.id, usuarioId: user.id });
    audit(user, `Gasto ${categoria} $${monto}`, "Caja " + caja.id);
    save();
  },

  cerrarCaja(user, contado, obs) {
    const caja = api.cajaAbierta(user.id);
    if (!caja) throw new Error("No tenés una caja abierta.");
    Object.assign(caja, { estado: "cerrada", cerrada: new Date().toISOString(), contado: Math.round(+contado || 0), obs: obs || "" });
    audit(user, `Cerró caja (contó $${caja.contado})`, "Caja " + caja.id);
    save();
  },

  recibirRendicion(user, cajaId) {
    const caja = db.cajas.find(c => c.id === cajaId);
    Object.assign(caja, { estado: "rendida", recibidaPor: user.nombre, recibida: new Date().toISOString() });
    audit(user, "Recibió rendición", "Caja " + caja.id);
    save();
  },

  // Entregas automáticas: lo que salió en reparto un día anterior pasa solo a Entregado.
  cerrarRepartos() {
    const hoy = hoyISO(); let n = 0;
    db.pedidos.filter(p => p.estado === "enReparto" && p.salio && p.salio < hoy).forEach(p => {
      db.clientes.find(c => c.id === p.clienteId).saldo -= p.total;
      p.estado = "entregado";
      p.historial.push({ fecha: new Date().toISOString(), usuario: "Sistema", txt: "Entregado automáticamente al cierre del día" });
      n++;
    });
    if (n) save();
    return n;
  },

  guardarProducto(user, prod) {
    if (prod.id) {
      const i = db.productos.findIndex(p => p.id === prod.id);
      db.productos[i] = { ...db.productos[i], ...prod };
      audit(user, "Modificó artículo", prod.nombre);
    } else {
      prod.id = Math.max(0, ...db.productos.map(p => p.id)) + 1;
      db.productos.push({ stock: 0, stockMin: 0, tramos: [], foto: null, activo: true, ...prod });
      audit(user, "Creó artículo", prod.nombre);
    }
    save();
  },

  guardarCliente(user, cli) {
    if (cli.id) {
      const i = db.clientes.findIndex(c => c.id === cli.id);
      db.clientes[i] = { ...db.clientes[i], ...cli };
      audit(user, "Modificó cliente", cli.nombre);
    } else {
      cli.id = Math.max(0, ...db.clientes.map(c => c.id)) + 1;
      cli.codigo = Math.max(0, ...db.clientes.map(c => c.codigo)) + 1;
      db.clientes.push({ saldo: 0, ultimoPago: null, vendedorId: null, localidad: "", dia: "", obs: "", ...cli });
      audit(user, "Creó cliente", cli.nombre);
    }
    save();
  },

  guardarUsuario(user, u) {
    const i = db.usuarios.findIndex(x => x.id === u.id);
    db.usuarios[i] = { ...db.usuarios[i], ...u };
    audit(user, "Modificó usuario", u.nombre);
    save();
  },
};
