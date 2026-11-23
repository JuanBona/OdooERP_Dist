// Editar un pedido que todavía está "por autorizar" (ej.: promo pasada días antes de la visita, el cliente
// va sumando mercadería). Una vez autorizado (en depósito o más adelante) ya no se puede tocar.
export const puedeEditarPedido = (user, p) =>
  !!p && p.estado === "porAutorizar" && (user.rol === "vendedor" ? p.vendedorId === user.id : ["admin", "gerencia"].includes(user.rol));

// Carga el pedido en el carrito para editarlo con el mismo catálogo y la misma pantalla de revisión.
export function carritoDePedido(p, extra = {}) {
  const items = {}, desc = {}, manual = {};
  p.lineas.forEach(l => {
    items[l.productoId] = (items[l.productoId] || 0) + l.cant;
    if (l.pct > 0 && !l.manual) desc[l.productoId] = true;          // tenía tildado el descuento por cantidad
    if (l.manual || (l.precioLista != null && l.precio !== l.precioLista)) {
      manual[l.productoId] = { precioManual: l.precio, ...(l.manual && l.pct > 0 ? { descManual: l.pct } : {}) };
    }
  });
  return {
    clienteId: p.clienteId, items, desc, manual, obs: p.obs || "",
    descTotal: p.descuentoTotal > 0 ? { modo: "$", valor: String(p.descuentoTotal) } : undefined,
    editId: p.id, ...extra,
  };
}
