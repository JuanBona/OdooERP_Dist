// Backend de MODO DEMO: guarda todo en el navegador (localStorage).
// Implementa las mismas acciones que el backend de Supabase (ver supabase/schema.sql),
// así la interfaz no cambia cuando se conecta la base real.
import seed from "../seed.json";
import { CAJA_DE_DEVOLUCION, calcPedido, cambioPendiente, cerrado, diaSemana, faltanDatosCheque, fechaEntrega, gananciaCobrada, hoyISO, nuevoEstadoPedido } from "../lib/reglas";

const KEY = "rds-demo-v4";
const listeners = new Set();
let db = load();

function inicial() {
  const usuarios = [
    { id: 1, nombre: "Piniya", usuario: "piniya", rol: "vendedor", comisionPct: 0 },
    { id: 2, nombre: "Javier", usuario: "javier", rol: "vendedor", comisionPct: 0 },
    { id: 6, nombre: "Nico", usuario: "nico", rol: "vendedor", comisionPct: 0 },
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
  return { usuarios, productos, clientes, pedidos: [], cobros: [], caja: [], arqueos: [], auditoria: [], seq: 1, feriados: feriadosIniciales(), excepciones: [], seqRuta: 1 };
}

// Los mismos feriados que carga la migración de la base.
function feriadosIniciales() {
  return [
    { fecha: "2026-11-23", nombre: "Día de la Soberanía Nacional (trasladado)" },
    { fecha: "2026-12-07", nombre: "Puente turístico (día no laborable)" },
    { fecha: "2026-12-08", nombre: "Inmaculada Concepción de María" },
    { fecha: "2026-12-25", nombre: "Navidad" },
  ];
}

function load() {
  let d = null;
  try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch {}
  d = d || inicial();
  d.caja ||= []; d.arqueos ||= [];
  d.caja.forEach(m => { m.caja ||= "efectivo"; }); d.arqueos.forEach(a => { a.caja ||= "efectivo"; });
  d.feriados ||= feriadosIniciales(); d.excepciones ||= []; d.seqRuta ||= 1;
  // Pedidos guardados antes de que existieran los camiones: se les calcula con la misma regla.
  d.pedidos.forEach(p => { p.fechaEntrega ||= fechaEntrega(d.clientes.find(c => c.id === p.clienteId)?.dia, p.fecha); });
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

  crearPedido(user, { clienteId, items, obs, fecha }) {
    const c = db.clientes.find(x => x.id === clienteId);
    for (const it of items) {
      const p = db.productos.find(x => x.id === it.productoId);
      if (p.stockContado !== false && it.cant > p.stock) throw new Error(`No hay stock suficiente de ${p.nombre} (quedan ${p.stock}).`);
    }
    if (user.rol === "vendedor" && items.some(it => it.descManual != null)) throw new Error("Solo Administración puede cambiar descuentos.");
    if (items.some(it => it.precioManual != null && it.precioManual < 0)) throw new Error("El precio no puede ser negativo.");
    const lineas = calcPedido(items, db.productos);
    lineas.forEach(l => {
      const prod = db.productos.find(p => p.id === l.productoId);
      prod.stock -= l.cant; l.costo = prod.costo ?? null; // el costo queda guardado al vender
      l.id = db.seq++; l.precioLista = prod.precio; l.precioEstado = null; l.descEstado = null; l.log = [];
      // El vendedor cambia el precio o tilda el descuento por cantidad: queda pendiente de aprobación.
      // (Poner el precio de lista no es un cambio.)
      if (user.rol === "vendedor") {
        if (l.precio !== prod.precio) {
          l.precioEstado = "pendiente"; l.cambiadoPor = user.id; l.cambiadoEn = new Date().toISOString();
          l.log.push({ campo: "precio", accion: "propuesto", usuarioId: user.id, antes: prod.precio, despues: l.precio, fecha: l.cambiadoEn });
        } else l.manual = false;
        if (l.pct > 0) {
          l.descEstado = "pendiente"; l.descAplicadoPor = user.id; l.descAplicadoEn = new Date().toISOString();
          l.log.push({ campo: "descuento", accion: "propuesto", usuarioId: user.id, antes: 0, despues: l.pct, fecha: l.descAplicadoEn });
        }
      }
    });
    const ped = {
      id: db.seq++, clienteId, vendedorId: user.rol === "vendedor" ? user.id : c.vendedorId,
      fecha: fecha || hoyISO(), fechaEntrega: fechaEntrega(c.dia, fecha || hoyISO(), { excepciones: db.excepciones, vendedorId: c.vendedorId }), creado: new Date().toISOString(), estado: nuevoEstadoPedido(user),
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
    if (p.estado === "porAutorizar" && estado === "pendiente" && cambioPendiente(p)) {
      throw new Error("Resolvé los cambios de precio o descuento antes de autorizar el pedido");
    }
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

  // Administración / Gerencia resuelven un cambio de precio del vendedor.
  resolverPrecio(user, lineaId, accion, precio = null) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia pueden resolver precios.");
    const p = db.pedidos.find(x => x.lineas.some(l => l.id === lineaId));
    const l = p?.lineas.find(x => x.id === lineaId);
    if (!l) throw new Error("Línea no encontrada.");
    if (p.estado !== "porAutorizar") throw new Error("El pedido ya fue autorizado o cerrado.");
    if (l.precioEstado !== "pendiente") throw new Error("Este precio ya fue resuelto.");
    let nuevo, txt;
    if (accion === "aprobado") { nuevo = l.precio; txt = "Aprobó el precio de " + l.nombre; }
    else if (accion === "repuesto") { nuevo = l.precioLista; txt = "Volvió a precio de lista: " + l.nombre; }
    else if (accion === "corregido") {
      if (precio == null || precio < 0) throw new Error("Precio inválido.");
      nuevo = precio; txt = "Corrigió el precio de " + l.nombre;
    } else throw new Error("Acción inválida.");
    (l.log ||= []).push({ campo: "precio", accion, usuarioId: user.id, antes: l.precio, despues: nuevo, fecha: new Date().toISOString() });
    l.precio = nuevo; l.precioEstado = accion; l.manual = accion !== "repuesto";
    l.total = Math.round(nuevo * l.cant * (1 - l.pct / 100));
    p.total = p.lineas.reduce((s, x) => s + x.total, 0);
    p.historial.push({ fecha: new Date().toISOString(), usuario: user.nombre, txt });
    audit(user, txt, "#" + p.id);
    save();
  },

  // Administración / Gerencia resuelven el descuento por cantidad tildado por el vendedor: "aprobado" o "quitado".
  resolverDescuento(user, lineaId, accion) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia pueden resolver descuentos.");
    const p = db.pedidos.find(x => x.lineas.some(l => l.id === lineaId));
    const l = p?.lineas.find(x => x.id === lineaId);
    if (!l) throw new Error("Línea no encontrada.");
    if (p.estado !== "porAutorizar") throw new Error("El pedido ya fue autorizado o cerrado.");
    if (l.descEstado !== "pendiente") throw new Error("Este descuento ya fue resuelto.");
    if (accion !== "aprobado" && accion !== "quitado") throw new Error("Acción inválida.");
    const nuevo = accion === "aprobado" ? l.pct : 0;
    const txt = (accion === "aprobado" ? "Aprobó el descuento de " : "Quitó el descuento de ") + l.nombre;
    (l.log ||= []).push({ campo: "descuento", accion, usuarioId: user.id, antes: l.pct, despues: nuevo, fecha: new Date().toISOString() });
    l.pct = nuevo; l.descEstado = accion;
    l.total = Math.round(l.precio * l.cant * (1 - l.pct / 100));
    p.total = p.lineas.reduce((s, x) => s + x.total, 0);
    p.historial.push({ fecha: new Date().toISOString(), usuario: user.nombre, txt });
    audit(user, txt, "#" + p.id);
    save();
  },

  cambiarFechaEntrega(user, pedidoId, fecha) {
    const p = db.pedidos.find(x => x.id === pedidoId);
    if (user.rol === "vendedor" && p.vendedorId !== user.id) throw new Error("El pedido no es tuyo.");
    if (!["vendedor", "admin", "gerencia"].includes(user.rol)) throw new Error("No tenés permiso para cambiar el camión.");
    if (cerrado(p)) throw new Error("El pedido ya está cerrado.");
    const dow = (new Date(fecha + "T12:00:00Z").getUTCDay() + 6) % 7 + 1;
    if (dow < 2 || dow > 6) throw new Error("Los camiones salen de martes a sábado.");
    p.fechaEntrega = fecha;
    p.historial.push({ fecha: new Date().toISOString(), usuario: user.nombre, txt: "Cambió el camión al " + fecha.slice(8) + "/" + fecha.slice(5, 7) });
    audit(user, "Cambió el camión", "#" + p.id);
    save();
  },

  // ---- Feriados y cambios de ruta (Administración y Gerencia) ----
  guardarFeriado(user, { fecha, nombre }) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia.");
    db.feriados = [...db.feriados.filter(f => f.fecha !== fecha), { fecha, nombre }].sort((a, b) => a.fecha.localeCompare(b.fecha));
    audit(user, "Cargó feriado " + fecha, nombre); save();
  },
  borrarFeriado(user, fecha) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia.");
    db.feriados = db.feriados.filter(f => f.fecha !== fecha); save();
  },
  crearCambioRuta(user, { vendedorId, desde, hasta, motivo }) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia.");
    const habil = f => diaSemana(f) <= 5;
    if (!habil(desde) || !habil(hasta)) throw new Error("Los cambios de ruta son de lunes a viernes.");
    if (desde === hasta) throw new Error("El día nuevo tiene que ser distinto del original.");
    db.excepciones.push({ id: db.seqRuta++, vendedorId: vendedorId || null, desde, hasta, motivo: motivo || "" });
    audit(user, `Cambio de ruta ${desde} → ${hasta}`, motivo || ""); save();
  },
  cancelarCambioRuta(user, id) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia.");
    db.excepciones = db.excepciones.filter(e => e.id !== id); save();
  },

  // Ganancia de lo cobrado en el mes, con el precio y el costo de cada venta original.
  gananciaCobrada(mes) { return gananciaCobrada(db, mes); },

  // Autoriza varios pedidos juntos (ej.: todos los de un camión). Devuelve cuántos autorizó.
  autorizarPedidos(user, ids) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia pueden autorizar.");
    let n = 0;
    db.pedidos.filter(p => ids.includes(p.id) && p.estado === "porAutorizar" && !cambioPendiente(p)).forEach(p => {
      p.estado = "pendiente";
      p.historial.push({ fecha: new Date().toISOString(), usuario: user.nombre, txt: "Autorizado y enviado a depósito" });
      n++;
    });
    if (n) { audit(user, `Autorizó ${n} pedidos`, "Pedidos"); save(); }
    return n;
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

  // ---- Cajas del depósito (efectivo, transferencia y cheques; las manejan Administración y Gerencia) ----
  // Movimiento: { tipo: "ingreso" | "egreso" | "ajuste", concepto, monto (+/-), persona, detalle, caja,
  //   chequeNumero/chequeBanco/chequeCobro (solo en la caja de cheques),
  //   vuelve (solo egresos), vuelveFecha, devoluciones: [{ fecha, monto, como, usuario }] }
  saldoCaja(caja = "efectivo") {
    return db.caja.reduce((s, m) => s + (m.caja === caja ? m.monto : 0) +
      (m.devoluciones || []).filter(d => CAJA_DE_DEVOLUCION[d.como] === caja).reduce((a, d) => a + d.monto, 0), 0);
  },

  movCaja(user, { tipo, concepto, monto, persona = "", detalle = "", vuelve = false, vuelveFecha = "", vendedorId = null, cobroId = null, caja = "efectivo", cheque = null }) {
    monto = Math.round(+monto);
    if (!(Math.abs(monto) > 0)) throw new Error("Poné el monto.");
    if (caja === "cheques" && concepto !== "Diferencia al contar" && faltanDatosCheque(cheque)) throw new Error("Poné el número, el banco y la fecha de cobro del cheque.");
    const m = { id: db.caja.length + 1, fecha: hoyISO(), hora: new Date().toISOString(), tipo, concepto, caja,
      monto: tipo === "egreso" ? -Math.abs(monto) : tipo === "ingreso" ? Math.abs(monto) : monto,
      persona, detalle, vuelve: tipo === "egreso" && vuelve, vuelveFecha: vuelve ? vuelveFecha : "",
      ...(caja === "cheques" && cheque ? { chequeNumero: cheque.numero.trim(), chequeBanco: cheque.banco.trim(), chequeCobro: cheque.cobro } : {}),
      devoluciones: [], vendedorId, cobroId, usuario: user.nombre };
    db.caja.unshift(m);
    audit(user, `Caja ${caja}: ${tipo} ${concepto} $${Math.abs(m.monto)}${persona ? " · " + persona : ""}`, "Caja");
    save();
    return m;
  },

  // Pasa plata de una caja a otra (no cuenta como gasto ni como ingreso). Con cheques, informar el cheque.
  pasarEntreCajas(user, { origen, destino, monto, detalle = "", cheque = null }) {
    if (!["admin", "gerencia"].includes(user.rol)) throw new Error("Solo Administración o Gerencia.");
    monto = Math.round(+monto);
    if (!(monto > 0)) throw new Error("Poné el monto.");
    if (origen === destino) throw new Error("Elegí dos cajas distintas.");
    if ((origen === "cheques" || destino === "cheques") && faltanDatosCheque(cheque)) throw new Error("Poné el número, el banco y la fecha de cobro del cheque.");
    api.movCaja(user, { tipo: "ajuste", concepto: "Pase entre cajas", monto: -monto, persona: "A " + destino, detalle, caja: origen, cheque: origen === "cheques" ? cheque : null });
    api.movCaja(user, { tipo: "ajuste", concepto: "Pase entre cajas", monto, persona: "De " + origen, detalle, caja: destino, cheque: destino === "cheques" ? cheque : null });
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
  arqueo(user, contado, motivo, caja = "efectivo") {
    const dif = Math.round(+contado) - api.saldoCaja(caja);
    db.arqueos.unshift({ fecha: new Date().toISOString(), contado: Math.round(+contado), esperado: api.saldoCaja(caja), dif, motivo, caja, usuario: user.nombre });
    if (dif !== 0) api.movCaja(user, { tipo: "ajuste", concepto: "Diferencia al contar", monto: dif, detalle: motivo, caja });
    else save();
    return dif;
  },

  // Efectivo que un vendedor cobró en la calle y todavía no entregó.
  aRendir(vendedorId) {
    const cobrado = db.cobros.filter(c => c.cobradorId === vendedorId && c.medio === "Efectivo").reduce((s, c) => s + c.monto, 0);
    const entregado = db.caja.filter(m => m.vendedorId === vendedorId && m.concepto === "Rendición de vendedor").reduce((s, m) => s + m.monto, 0);
    return cobrado - entregado;
  },

  registrarCobro(user, clienteId, monto, medio, uid, cheque) { // cheque: { numero, banco, cobro }
    if (medio === "Cheque" && faltanDatosCheque(cheque)) throw new Error("Poné el número, el banco y la fecha de cobro del cheque.");
    const c = db.clientes.find(x => x.id === clienteId);
    const vend = db.usuarios.find(u => u.id === c.vendedorId);
    c.saldo += monto;
    c.ultimoPago = hoyISO(); // cualquier pago reinicia el contador de 15 días
    const comision = Math.round(monto * (vend?.comisionPct || 0) / 100); // RF-GV-03: sobre lo cobrado
    const cobro = { id: db.cobros.length + 1, fecha: hoyISO(), hora: new Date().toISOString(), clienteId, vendedorId: c.vendedorId,
      cobradorId: user.id, monto, medio, comision, usuario: user.nombre };
    db.cobros.unshift(cobro);
    audit(user, `Cobro ${medio} $${monto}`, c.nombre);
    // Cada medio entra a su caja: el efectivo si cobra Administración (si cobra un vendedor lo entrega después),
    // y la transferencia y el cheque entran solos.
    if (medio === "Efectivo" && ["admin", "gerencia"].includes(user.rol)) {
      api.movCaja(user, { tipo: "ingreso", concepto: "Cobro en el depósito", monto, persona: c.nombre, cobroId: cobro.id });
    } else if (medio === "Transferencia") {
      api.movCaja(user, { tipo: "ingreso", concepto: "Cobro por transferencia", monto, persona: c.nombre, cobroId: cobro.id, caja: "transferencia" });
    } else if (medio === "Cheque") {
      api.movCaja(user, { tipo: "ingreso", concepto: "Cobro con cheque", monto, persona: c.nombre, cobroId: cobro.id, caja: "cheques", cheque });
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
