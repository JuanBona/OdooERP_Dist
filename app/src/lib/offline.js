// Funcionamiento sin señal (RF-PV-06 / RNF-06).
// Si no hay conexión, el pedido se guarda en una "bandeja de salida" en el teléfono
// y se envía solo cuando vuelve la señal. El vendedor no tiene que hacer nada.
import { useSyncExternalStore } from "react";
import { api } from "../api/demo";

const KEY = "rds-outbox-v1";
const listeners = new Set();
let outbox = leer();
let online = typeof navigator === "undefined" ? true : navigator.onLine;

function leer() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function guardar() {
  try { localStorage.setItem(KEY, JSON.stringify(outbox)); } catch {}
  snapshot = { outbox, online };
  listeners.forEach(f => f());
}
let snapshot = { outbox, online };

export function useConexion() {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => snapshot);
}

// Devuelve { pedido } si se envió, o { enCola: true } si quedó esperando señal.
export function enviarPedido(user, data) {
  if (!navigator.onLine) {
    outbox.push({ uid: Date.now() + "-" + Math.random().toString(36).slice(2, 7), user, data, creado: new Date().toISOString(), error: null });
    guardar();
    return { enCola: true };
  }
  return { pedido: api.crearPedido(user, data) };
}

export function sincronizar(onResultado) {
  if (!navigator.onLine || !outbox.length) return;
  const pendientes = outbox; outbox = [];
  for (const it of pendientes) {
    try {
      const p = api.crearPedido(it.user, it.data);
      onResultado?.(`Se envió el pedido #${p.id} que estaba esperando señal`);
    } catch (e) {
      // Ej.: se quedó sin stock mientras no había señal. Queda en la bandeja con el motivo.
      outbox.push({ ...it, error: e.message });
      onResultado?.("Un pedido sin señal no se pudo enviar: " + e.message);
    }
  }
  guardar();
}

export function descartar(uid) { outbox = outbox.filter(x => x.uid !== uid); guardar(); }

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { online = true; guardar(); });
  window.addEventListener("offline", () => { online = false; guardar(); });
}
