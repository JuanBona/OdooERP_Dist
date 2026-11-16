// Reglas de negocio (las mismas que se replican en la base de Supabase).

export const fmt = n => "$ " + Math.round(n || 0).toLocaleString("es-AR");
export const hoyISO = () => new Date().toISOString().slice(0, 10);
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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

// RF-PV-04 / decisión 4: los pedidos de clientes con deuda pasan por autorización.
export const nuevoEstadoPedido = cliente => (cliente.saldo < 0 ? "porAutorizar" : "pendiente");

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
};
