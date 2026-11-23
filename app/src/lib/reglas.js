// Reglas de negocio (las mismas que se replican en la base de Supabase).

export const fmt = n => "$ " + Math.round(n || 0).toLocaleString("es-AR");
// Fecha de hoy según el reloj del dispositivo (no UTC: pasadas las 21 hs ya sería "mañana").
const dos = n => String(n).padStart(2, "0");
export const isoLocal = d => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
export const hoyISO = () => isoLocal(new Date());

// Fechas como texto "AAAA-MM-DD", sin zonas horarias de por medio.
const aFecha = iso => new Date(iso + "T12:00:00Z");
export const sumarDias = (iso, n) => { const d = aFecha(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diaSemana = iso => (aFecha(iso).getUTCDay() + 6) % 7 + 1; // 1 lunes … 7 domingo
export const lunesDe = iso => sumarDias(iso, 1 - diaSemana(iso));
export const fechaCorta = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const NOMBRE_DIA = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export const nombreDia = iso => NOMBRE_DIA[diaSemana(iso)];

// Día de visita del cliente (la ruta del vendedor). Los vendedores no trabajan sábado ni domingo.
export const DIAS_VISITA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

// Visita más reciente (hoy incluido) de un cliente con ese día. Sin día (o "Sábado"): cuenta el día en que se
// carga; sábado y domingo cuentan como viernes.
export function visitaReciente(dia, hoy = hoyISO()) {
  const hoyDow = diaSemana(hoy);
  const idx = DIAS_VISITA.indexOf(dia);
  const dow = idx >= 0 ? idx + 1 : Math.min(hoyDow, 5);
  return sumarDias(hoy, -((hoyDow - dow + 7) % 7));
}

// Cambio de ruta por feriado que mueve las visitas de `fecha` a otro día (del vendedor, o de todos).
// excepciones: [{ id, vendedorId (null = todos), desde, hasta, motivo }]. Gana el del vendedor, y el más nuevo.
export function cambioDeRuta(excepciones = [], fecha, vendedorId = null) {
  return excepciones
    .filter(e => e.desde === fecha && (e.vendedorId == null || e.vendedorId === vendedorId))
    .sort((a, b) => ((a.vendedorId == null) - (b.vendedorId == null)) || (b.id - a.id))[0] || null;
}

// El pedido sale en el camión que corresponde al día de visita del cliente (misma regla que la base):
// Lun→Mié, Mar→Jue, Mié→Vie, Jue→Sáb, Vie→Mar siguiente. Si se olvidaron de cargarlo ese día, igual
// va a su camión mientras éste no haya salido. Si la visita se movió por un feriado, cuenta el día nuevo.
// ext: { excepciones, vendedorId } del cliente.
export function fechaEntrega(dia, hoy = hoyISO(), ext = {}) {
  let visita = visitaReciente(dia, hoy);
  const cambio = cambioDeRuta(ext.excepciones, visita, ext.vendedorId ?? null);
  if (cambio) visita = cambio.hasta;
  const cam = sumarDias(visita, diaSemana(visita) === 5 ? 4 : 2);
  return cam <= hoy ? sumarDias(cam, 7) : cam;
}

// Clientes que le toca visitar a un vendedor en `fecha`: los de ese día de la semana (salvo que esa visita se
// haya movido) más los que vienen de otro día movido a éste.
export function clientesDelDia(clientes, fecha, excepciones = []) {
  const dow = diaSemana(fecha);
  return clientes.filter(c => {
    const suyo = DIAS_VISITA.indexOf(c.dia) + 1; // 0 si no tiene día
    if (!suyo) return false;
    if (suyo === dow && !cambioDeRuta(excepciones, fecha, c.vendedorId ?? null)) return true;
    return excepciones.some(e => e.hasta === fecha && diaSemana(e.desde) === suyo && (e.vendedorId == null || e.vendedorId === c.vendedorId));
  });
}

// Feriado de ese día (o undefined). feriados: [{ fecha, nombre }]
export const feriadoDe = (feriados = [], iso) => feriados.find(f => f.fecha === iso);

// Día hábil (lunes a viernes) más cercano hacia adelante: sábado y domingo pasan al lunes.
export const proximoHabil = iso => (diaSemana(iso) === 6 ? sumarDias(iso, 2) : diaSemana(iso) === 7 ? sumarDias(iso, 1) : iso);
export const habilVecino = (iso, dir) => { let f = sumarDias(iso, dir); while (diaSemana(f) > 5) f = sumarDias(f, dir); return f; };
export const nombreCamion = iso => `Camión ${nombreDia(iso)}`;
// Camiones de la semana que empieza el lunes `lunes`: martes a sábado.
export const camionesDeSemana = lunes => [1, 2, 3, 4, 5].map(n => sumarDias(lunes, n));
export const cerrado = p => ["entregado", "anulado", "rechazado"].includes(p.estado);

export const ROLES = {
  vendedor: "Vendedor", deposito: "Depósito", admin: "Administración", gerencia: "Gerencia",
};

export const ESTADOS = {
  porAutorizar: "Por autorizar",   // solo si el cliente tiene deuda
  pendiente: "En depósito",
  preparando: "Preparando",
  preparado: "Listo para salir",
  enReparto: "En reparto",
  entregado: "Entregado",
  rechazado: "Rechazado",
  anulado: "Anulado",
};
export const ESTADO_CLASE = {
  porAutorizar: "st-porAutorizar", pendiente: "st-pendiente", preparando: "st-preparando",
  preparado: "st-preparado", enReparto: "st-porConfirmar", entregado: "st-entregado",
  rechazado: "st-rechazado", anulado: "st-autorizado",
};

// Todo pedido de un vendedor espera la autorización de Administración antes de ir a depósito.
// Los que cargan Administración o Gerencia entran ya autorizados.
export const nuevoEstadoPedido = user => (user.rol === "vendedor" ? "porAutorizar" : "pendiente");

// RF-PV-07: alerta (no bloquea) a los 15 días sin pagar teniendo deuda.
export function diasSinPagar(c) {
  if (!(c.saldo < 0)) return 0;
  if (!c.ultimoPago) return 999;
  return Math.floor((Date.now() - new Date(c.ultimoPago).getTime()) / 86400000);
}
export const tieneAlerta = c => diasSinPagar(c) >= 15;

// RF-PV-09: tramos de descuento por producto. Se aplica el mayor tramo alcanzado.
export function tramoAplicable(prod, cant) {
  return (prod.tramos || []).filter(t => cant >= t.min).sort((a, b) => b.pct - a.pct)[0] || null;
}
export function proximoTramo(prod, cant) {
  return (prod.tramos || []).filter(t => cant < t.min).sort((a, b) => a.min - b.min)[0] || null;
}

// Una línea de pedido. precioManual / descManual: sobreescritura (solo Admin/Gerencia).
// El descuento por cantidad ya no se aplica solo: hay que tildarlo (aplicarDesc) al tomar el pedido.
export function calcLinea(prod, cant, precioManual = null, descManual = null, aplicarDesc = false) {
  const precio = precioManual ?? prod.precio;
  const t = tramoAplicable(prod, cant);
  const pct = descManual ?? (aplicarDesc && t ? t.pct : 0);
  const bruto = precio * cant;
  return {
    productoId: prod.id, nombre: prod.nombre, cant, precio, pct,
    manual: precioManual != null || descManual != null,
    total: Math.round(bruto * (1 - pct / 100)), ahorro: Math.round(bruto * pct / 100),
  };
}

export function calcPedido(items, productos) {
  return items.map(it => calcLinea(productos.find(p => p.id === it.productoId), it.cant, it.precioManual, it.descManual, it.aplicarDesc));
}

// Arranque sin stock contado: mientras el producto está "Sin contar" se vende sin límite.
export const sinContar = p => p.stockContado === false;
export const tope = p => (sinContar(p) ? Infinity : p.stock);

// Cambios del vendedor (precio o descuento por cantidad): líneas con cambio (cualquier estado) y si alguna espera decisión.
export const lineasConCambio = p => p.lineas.filter(l => l.precioEstado || l.descEstado);
export const cambioPendiente = p => p.descTotalEstado === "pendiente" || p.lineas.some(l => l.precioEstado === "pendiente" || l.descEstado === "pendiente");
// Qué cambio espera decisión, para la etiqueta del pedido.
export const textoCambio = p => {
  const precio = p.lineas.some(l => l.precioEstado === "pendiente");
  const desc = p.lineas.some(l => l.descEstado === "pendiente") || p.descTotalEstado === "pendiente";
  return precio && desc ? "Precio y descuento" : desc ? "Descuento aplicado" : "Precio cambiado";
};
// Descuento sobre el total: monto en $ a partir de lo que se escribió (% o $), nunca igual ni mayor a la suma.
export const montoDescTotal = (d, suma) => {
  const v = Math.max(0, +d?.valor || 0);
  const monto = d?.modo === "%" ? Math.round(suma * Math.min(v, 100) / 100) : Math.round(v);
  return monto >= suma ? 0 : monto;
};
// Vende por debajo del costo (el costo solo lo trae la base a Administración y Gerencia; al vendedor le llega null).
export const bajoCosto = l => l.costo != null && l.cant > 0 && l.total / l.cant < l.costo;

export const puede = {
  autorizar: u => ["admin", "gerencia"].includes(u.rol),
  editarPrecio: u => ["vendedor", "admin", "gerencia"].includes(u.rol),     // vendedor: solo el precio, con aprobación
  editarDescuento: u => ["admin", "gerencia"].includes(u.rol),
  verFinanzas: u => u.rol === "gerencia",
  administrar: u => ["admin", "gerencia"].includes(u.rol),
  // Vendedor: da de alta clientes (quedan a su nombre) y edita los suyos y los sin asignar.
  crearCliente: u => ["vendedor", "admin", "gerencia"].includes(u.rol),
  editarCliente: (u, c) => ["admin", "gerencia"].includes(u.rol) || (u.rol === "vendedor" && (!c.vendedorId || c.vendedorId === u.id)),
  // Mover un pedido a otro camión: vendedor (los suyos), Administración y Gerencia.
  cambiarCamion: (u, p) => !cerrado(p) && (["admin", "gerencia"].includes(u.rol) || (u.rol === "vendedor" && p.vendedorId === u.id)),
};

// ---- Cajas ----
export const CAJAS = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["cheques", "Cheques"]];
export const nombreCaja = id => CAJAS.find(c => c[0] === id)?.[1] || id;
// Lo que vuelve de una salida entra a la caja del medio con que volvió (Efectivo o Transferencia).
export const CAJA_DE_DEVOLUCION = { Efectivo: "efectivo", Transferencia: "transferencia" };
export const faltanDatosCheque = ch => !ch || !String(ch.numero || "").trim() || !String(ch.banco || "").trim() || !ch.cobro;

// ---- Precio y ganancia ----
// Precio de venta para ganar `pct` % sobre el costo (costo 100 y 30% → 130), redondeado al peso.
export const precioConGanancia = (costo, pct) => Math.round(+costo * (1 + +pct / 100));
// % que se gana hoy sobre el costo, con un decimal (null si no hay costo).
export const gananciaPct = (costo, precio, decimales = 1) => (costo > 0 ? Math.round((precio - costo) / costo * 100 * 10 ** decimales) / 10 ** decimales : null);

// Salidas de caja que no son un gasto del negocio y por lo tanto no restan en el profit:
//  · Retiro del dueño.
//  · Pago a proveedor: esa mercadería ya se descuenta con el costo de lo vendido; contarla otra vez la restaría dos veces.
//  · Pago de comisiones: las comisiones ya se restan aparte (calculadas sobre lo cobrado); contarlas otra vez las restaría dos veces.
export const NO_ES_GASTO = ["Retiro del dueño", "Pago a proveedor", "Pago de comisiones"];

// Ganancia de lo cobrado en un mes ("AAAA-MM"), valuada con el PRECIO y el COSTO DE LA VENTA ORIGINAL.
// Un cobro llega después de la venta y los precios pueden haber cambiado: si el cliente pagó una Coca que
// compró a 100, se cuenta con ese 100 aunque hoy valga 120. Para eso cada cobro paga primero las ventas más
// viejas del cliente y gana lo que se ganó en esas ventas (cada pedido guarda el costo con que se vendió).
//  · Una deuda anterior al sistema (saldo inicial) se paga primero y no tiene costo conocido.
//  · Lo cobrado de ventas sin costo cargado, o de más (adelantos), no suma ganancia: sale en cobradoSinCosto.
// Misma cuenta que la función ganancia_cobrada de la base (que es la que usa la app real, porque necesita
// todo el historial); esta versión es la del modo demo. Devuelve { cobrado, ganancia, cobradoSinCosto }.
export function gananciaCobrada(db, mes) {
  const enMes = f => !!f && f.startsWith(mes);
  const porFechaYId = (a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id;
  let cobrado = 0, ganancia = 0, conocido = 0;
  db.clientes.forEach(c => {
    const ventas = db.pedidos.filter(p => p.clienteId === c.id && !["anulado", "rechazado"].includes(p.estado) && p.total > 0).sort(porFechaYId);
    const cobros = db.cobros.filter(k => k.clienteId === c.id).sort(porFechaYId);
    const entregado = ventas.filter(p => p.estado === "entregado").reduce((s, p) => s + p.total, 0);
    const s0 = c.saldo + entregado - cobros.reduce((s, k) => s + k.monto, 0); // saldo con el que arrancó el cliente
    // Cola de deudas, de la más vieja a la más nueva: gan y conoc son lo que se gana y lo que tiene costo, por peso.
    const deudas = [];
    if (s0 < 0) deudas.push({ resta: -s0, gan: 0, conoc: 0 });
    ventas.forEach(p => {
      let conoc = 0, gan = 0;
      const f = p.total / (p.total + (p.descuentoTotal || 0)); // el descuento sobre el total se reparte entre las líneas
      p.lineas.forEach(l => { if (l.costo != null) { conoc += l.total * f; gan += l.total * f - l.costo * l.cant; } });
      deudas.push({ resta: p.total, gan: gan / p.total, conoc: conoc / p.total });
    });
    // Cola de pagos (un saldo a favor inicial paga primero y no es de ningún mes).
    const pagos = [];
    if (s0 > 0) pagos.push({ monto: s0, delMes: false });
    cobros.forEach(k => pagos.push({ monto: k.monto, delMes: enMes(k.fecha) }));
    let i = 0;
    pagos.forEach(pago => {
      if (pago.delMes) cobrado += pago.monto;
      let falta = pago.monto;
      while (falta > 1e-9 && i < deudas.length) {
        const x = Math.min(falta, deudas[i].resta);
        if (pago.delMes) { ganancia += x * deudas[i].gan; conocido += x * deudas[i].conoc; }
        deudas[i].resta -= x; falta -= x;
        if (deudas[i].resta <= 1e-9) i++;
      }
    });
  });
  return { cobrado, ganancia: Math.round(ganancia), cobradoSinCosto: Math.round(cobrado - conocido) };
}

// Profit de un mes: la ganancia de lo cobrado (g, de gananciaCobrada) menos los gastos del mes (salidas de las
// 3 cajas que no vuelven) y las comisiones. Los pases entre cajas, lo que vuelve (préstamos), los retiros del
// dueño y los pagos a proveedores no son gastos (la mercadería ya está en el costo de lo vendido).
export function calcProfit(db, mes, g) {
  const enMes = f => !!f && f.startsWith(mes);
  const comisiones = db.cobros.filter(c => enMes(c.fecha)).reduce((s, c) => s + (c.comision || 0), 0);
  const gastos = db.caja.filter(m => enMes(m.fecha) && m.tipo === "egreso" && !m.vuelve && !NO_ES_GASTO.includes(m.concepto)).reduce((s, m) => s - m.monto, 0);
  return { cobrado: g.cobrado, ganancia: g.ganancia, cobradoSinCosto: g.cobradoSinCosto, gastos, comisiones,
    profit: g.ganancia - gastos - comisiones, conCostos: g.cobrado - g.cobradoSinCosto > 0,
    productosSinCosto: db.productos.filter(p => p.activo && p.costo == null).length };
}
