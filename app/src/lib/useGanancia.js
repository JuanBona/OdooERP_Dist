import { useEffect, useState } from "react";
import { api } from "../api";

// Ganancia de lo cobrado en un mes ("AAAA-MM"), valuada con el precio y el costo de la venta original.
// En la app real la calcula la base (necesita todo el historial); en la demo, la propia app. null mientras carga.
export function useGanancia(db, mes, activo = true) {
  const [g, setG] = useState(null);
  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true;
    Promise.resolve(api.gananciaCobrada(mes)).then(r => vivo && setG(r)).catch(() => vivo && setG(null));
    return () => { vivo = false; };
  }, [activo, mes, db, db.cobros.length, db.pedidos.length]);
  return g;
}
