// Reglas de negocio (las mismas que se replican en la base de Supabase).

export const fmt = n => "$ " + Math.round(n || 0).toLocaleString("es-AR");
// Fecha de hoy según el reloj del dispositivo (no UTC: pasadas las 21 hs ya sería "mañana").
const dos = n => String(n).padStart(2, "0");
export const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };

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
export function calcLinea(prod, cant, precioManual = null, descManual = null) {
  const precio = precioManual ?? prod.precio;
  const t = tramoAplicable(prod, cant);
  const pct = descManual ?? (t ? t.pct : 0);
  const bruto = precio * cant;
  return {
    productoId: prod.id, nombre: prod.nombre, cant, precio, pct,
    manual: precioManual != null || descManual != null,
    total: Math.round(bruto * (1 - pct / 100)), ahorro: Math.round(bruto * pct / 100),
  };
}

export function calcPedido(items, productos) {
  return items.map(it => calcLinea(productos.find(p => p.id === it.productoId), it.cant, it.precioManual, it.descManual));
}

// Arranque sin stock contado: mientras el producto está "Sin contar" se vende sin límite.
export const sinContar = p => p.stockContado === false;
export const tope = p => (sinContar(p) ? Infinity : p.stock);

export const puede = {
  autorizar: u => ["admin", "gerencia"].includes(u.rol),
  editarPrecio: u => ["admin", "gerencia"].includes(u.rol),
  verFinanzas: u => u.rol === "gerencia",
  administrar: u => ["admin", "gerencia"].includes(u.rol),
  // Vendedor: da de alta clientes (quedan a su nombre) y edita los suyos y los sin asignar.
  crearCliente: u => ["vendedor", "admin", "gerencia"].includes(u.rol),
  editarCliente: (u, c) => ["admin", "gerencia"].includes(u.rol) || (u.rol === "vendedor" && (!c.vendedorId || c.vendedorId === u.id)),
  // Mover un pedido a otro camión: vendedor (los suyos), Administración y Gerencia.
  cambiarCamion: (u, p) => !cerrado(p) && (["admin", "gerencia"].includes(u.rol) || (u.rol === "vendedor" && p.vendedorId === u.id)),
};
