// Cuentas del mes (facturación, gastos, comisiones, lo que quedó) y reglas del cierre de mes.
// Las usan el Resumen del mes y la pantalla de Cierre, así los números son siempre los mismos.

// Fechas en hora local (Argentina): toISOString() usa UTC y después de las 21 h ya daría el día siguiente.
const dosDig = n => String(n).padStart(2, "0");
export const mesDe = d => `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}`;
export const mesActual = () => mesDe(new Date());
export const mover = (m, d) => { const x = new Date(m + "-15T12:00"); x.setMonth(x.getMonth() + d); return mesDe(x); };
export const nombreMes = m => { const s = new Date(m + "-15T12:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" }); return s[0].toUpperCase() + s.slice(1); };

// El mes en curso para las cuentas: si el mes del calendario ya se cerró (último día después de las 18 h),
// ya cuenta el mes siguiente, que arranca de 0.
export const mesEnCurso = db => { const m = mesActual(); return (db.cierres || []).some(c => c.mes === m) ? mover(m, 1) : m; };

export const HORA_CIERRE = 18;
// El cierre se habilita el último día del mes desde las 18 h.
export const puedeCerrarHoy = (ahora = new Date()) => {
  const manana = new Date(ahora); manana.setDate(ahora.getDate() + 1);
  return manana.getMonth() !== ahora.getMonth() && ahora.getHours() >= HORA_CIERRE;
};
// Qué mes falta cerrar: el actual (último día, desde las 18 h) o el anterior si quedó sin cerrar.
export function mesPorCerrar(db, ahora = new Date()) {
  const cerrados = new Set((db.cierres || []).map(c => c.mes));
  const actual = mesDe(ahora), anterior = mover(actual, -1);
  if (puedeCerrarHoy(ahora) && !cerrados.has(actual)) return actual;
  const huboMovimiento = db.pedidos.some(p => p.fecha?.startsWith(anterior)) || db.cobros.some(c => c.fecha?.startsWith(anterior));
  if (!cerrados.has(anterior) && huboMovimiento) return anterior;
  return null;
}

// Salidas de caja que no son gasto: el retiro del dueño y el pago de comisiones
// (las comisiones ya se restan aparte, calculadas sobre lo cobrado: así no se restan dos veces).
export const NO_SON_GASTO = ["Retiro del dueño", "Pago de comisiones"];
export const detallePagoComision = mes => `Comisiones ${nombreMes(mes)}`;

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const top = (obj, n) => Object.values(obj).sort((a, b) => b.valor - a.valor).slice(0, n);

export function calcularMes(db, mes) {
  const enMes = f => f && f.startsWith(mes);
  const peds = db.pedidos.filter(p => enMes(p.fecha) && !["anulado", "rechazado"].includes(p.estado));
  const cobros = db.cobros.filter(c => enMes(c.fecha));
  const gastos = db.caja.filter(m => enMes(m.fecha) && m.tipo === "egreso" && !m.vuelve && !NO_SON_GASTO.includes(m.concepto))
    .map(m => ({ categoria: m.concepto, monto: -m.monto }));
  const facturacion = sum(peds, p => p.total);
  const cobrado = sum(cobros, c => c.monto);
  const gastado = sum(gastos, g => g.monto);
  const comisiones = sum(cobros, c => c.comision || 0);
  const profit = cobrado - gastado - comisiones;
  const pctGanancia = cobrado > 0 ? Math.round(profit / cobrado * 1000) / 10 : 0;

  const pagosComision = db.caja.filter(m => m.concepto === "Pago de comisiones" && m.detalle === detallePagoComision(mes));
  const vendedores = db.usuarios.filter(u => u.rol === "vendedor").map(u => {
    const comision = sum(cobros.filter(c => c.vendedorId === u.id), c => c.comision || 0);
    const pagado = sum(pagosComision.filter(m => m.vendedorId === u.id), m => -m.monto);
    return {
      id: u.id, nombre: u.nombre, pct: u.comisionPct || 0,
      pedidos: peds.filter(p => p.vendedorId === u.id).length,
      vendido: sum(peds.filter(p => p.vendedorId === u.id), p => p.total),
      cobrado: sum(cobros.filter(c => c.vendedorId === u.id), c => c.monto),
      comision, pagado, falta: Math.max(0, comision - pagado),
    };
  });

  const prod = {};
  peds.forEach(p => p.lineas.forEach(l => {
    const k = l.productoId ?? l.nombre;
    prod[k] ||= { nombre: l.nombre, cant: 0, valor: 0 };
    prod[k].cant += l.cant; prod[k].valor += l.cant; prod[k].total = (prod[k].total || 0) + (l.total || 0);
  }));
  const cli = {};
  peds.forEach(p => {
    cli[p.clienteId] ||= { id: p.clienteId, nombre: db.clientes.find(c => c.id === p.clienteId)?.nombre || "—", pedidos: 0, valor: 0 };
    cli[p.clienteId].pedidos++; cli[p.clienteId].valor += p.total;
  });
  const porTipo = {};
  gastos.forEach(g => { porTipo[g.categoria] = (porTipo[g.categoria] || 0) + g.monto; });

  return {
    mes, pedidos: peds.length, entregados: peds.filter(p => p.estado === "entregado").length,
    facturacion, cobrado, gastado, comisiones, profit, pctGanancia,
    vendedores, topProductos: top(prod, 10), topClientes: top(cli, 10),
    gastosPorTipo: Object.entries(porTipo).sort((a, b) => b[1] - a[1]),
  };
}
