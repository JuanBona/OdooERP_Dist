// Backend de MODO DEMO: guarda todo en el navegador (localStorage).
// Implementa las mismas acciones que el backend de Supabase (ver supabase/schema.sql),
// así la interfaz no cambia cuando se conecta la base real.
import seed from "../seed.json";
import { calcPedido, hoyISO, nuevoEstadoPedido } from "../lib/reglas";

const KEY = "rds-demo-v3";
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
    stock: 50, stockMin: 10, stockContado: true, tramos: [], foto: p.foto || null, activo: true,
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
  return { usuarios, productos, clientes, pedidos: [], cobros: [], caja: [], arqueos: [], auditoria: [], seq: 1 };
}

function load() {
  let d = null;
  try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch {}
  d = d || inicial();
  d.caja ||= []; d.arqueos ||= [];
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
      if (p.stockContado !== false && it.cant > p.stock) throw new Error(`No hay stock suficiente de ${p.nombre} (quedan ${p.stock}).`);
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

  // ---- Caja del depósito (una sola, la manejan Administración y Gerencia) ----
  // Movimiento: { tipo: "ingreso" | "egreso" | "ajuste", concepto, monto (+/-), persona, detalle,
  //   vuelve (solo egresos), vuelveFecha, devoluciones: [{ fecha, monto, como, usuario }] }
  saldoCaja() {
    return db.caja.reduce((s, m) => s + m.monto +
      (m.devoluciones || []).filter(d => d.como === "Efectivo").reduce((a, d) => a + d.monto, 0), 0);
  },

  movCaja(user, { tipo, concepto, monto, persona = "", detalle = "", vuelve = false, vuelveFecha = "", vendedorId = null, cobroId = null }) {
    monto = Math.round(+monto);
    if (!(Math.abs(monto) > 0)) throw new Error("Poné el monto.");
    const m = { id: db.caja.length + 1, fecha: hoyISO(), hora: new Date().toISOString(), tipo, concepto,
      monto: tipo === "egreso" ? -Math.abs(monto) : tipo === "ingreso" ? Math.abs(monto) : monto,
      persona, detalle, vuelve: tipo === "egreso" && vuelve, vuelveFecha: vuelve ? vuelveFecha : "",
      devoluciones: [], vendedorId, cobroId, usuario: user.nombre };
    db.caja.unshift(m);
    audit(user, `Caja: ${tipo} ${concepto} $${Math.abs(m.monto)}${persona ? " · " + persona : ""}`, "Caja");
    save();
    return m;
  },

  // Lo que falta que vuelva de una salida.
  pendienteDe(m) { return m.vuelve ? -m.monto - m.devoluciones.reduce((s, d) => s + d.monto, 0) : 0; },

  registrarDevolucion(user, movId, monto, como) {
    const m = db.caja.find(x => x.id === movId);
    monto = Math.round(+monto);
    if (!(monto > 0)) throw new Error("Poné el monto que volvió.");
    if (monto > api.pendienteDe(m)) throw new Error("Es más de lo que falta devolver.");
    m.devoluciones.push({ fecha: hoyISO(), hora: new Date().toISOString(), monto, como, usuario: user.nombre });
    audit(user, `Devolución $${monto} (${como}) de ${m.persona}`, "Caja");
    save();
  },

  // Contar la caja: si no cuadra queda un ajuste con el motivo.
  arqueo(user, contado, motivo) {
    const dif = Math.round(+contado) - api.saldoCaja();
    db.arqueos.unshift({ fecha: new Date().toISOString(), contado: Math.round(+contado), esperado: api.saldoCaja(), dif, motivo, usuario: user.nombre });
    if (dif !== 0) api.movCaja(user, { tipo: "ajuste", concepto: "Diferencia al contar", monto: dif, detalle: motivo });
    else save();
    return dif;
  },

  // Efectivo que un vendedor cobró en la calle y todavía no entregó.
  aRendir(vendedorId) {
    const cobrado = db.cobros.filter(c => c.cobradorId === vendedorId && c.medio === "Efectivo").reduce((s, c) => s + c.monto, 0);
    const entregado = db.caja.filter(m => m.vendedorId === vendedorId && m.concepto === "Rendición de vendedor").reduce((s, m) => s + m.monto, 0);
    return cobrado - entregado;
  },

  registrarCobro(user, clienteId, monto, medio) {
    const c = db.clientes.find(x => x.id === clienteId);
    const vend = db.usuarios.find(u => u.id === c.vendedorId);
    c.saldo += monto;
    c.ultimoPago = hoyISO(); // cualquier pago reinicia el contador de 15 días
    const comision = Math.round(monto * (vend?.comisionPct || 0) / 100); // RF-GV-03: sobre lo cobrado
    const cobro = { id: db.cobros.length + 1, fecha: hoyISO(), hora: new Date().toISOString(), clienteId, vendedorId: c.vendedorId,
      cobradorId: user.id, monto, medio, comision, usuario: user.nombre };
    db.cobros.unshift(cobro);
    audit(user, `Cobro ${medio} $${monto}`, c.nombre);
    // Si cobra Administración en el depósito en efectivo, entra directo a la caja.
    if (medio === "Efectivo" && ["admin", "gerencia"].includes(user.rol)) {
      api.movCaja(user, { tipo: "ingreso", concepto: "Cobro en el depósito", monto, persona: c.nombre, cobroId: cobro.id });
    } else save();
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
    if (user.rol === "vendedor") { // mismas reglas que la base
      const viejo = cli.id ? db.clientes.find(c => c.id === cli.id) : null;
      if (viejo && viejo.vendedorId && viejo.vendedorId !== user.id) throw new Error("Ese cliente es de otro vendedor.");
      const { saldo, ultimoPago, codigo, ...resto } = cli;
      cli = { ...resto, vendedorId: viejo?.vendedorId || user.id };
    }
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
