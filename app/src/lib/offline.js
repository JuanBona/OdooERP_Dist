// Funcionamiento sin señal (RF-PV-06 / RNF-06).
// Si no hay conexión, el pedido se guarda en una "bandeja de salida" en el teléfono
// y se envía solo cuando vuelve la señal. El vendedor no tiene que hacer nada.
import { useSyncExternalStore } from "react";
import { api } from "../api";

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
const esCorte = e => !navigator.onLine || /conexión|Failed to fetch|NetworkError|Load failed/i.test(e?.message || "");
const encolar = (user, data) => {
  outbox.push({ uid: Date.now() + "-" + Math.random().toString(36).slice(2, 7), user, data, creado: new Date().toISOString(), error: null });
  guardar();
  return { enCola: true };
};

export async function enviarPedido(user, data) {
  if (!navigator.onLine) return encolar(user, data);
  try {
    return { pedido: await api.crearPedido(user, data) };
  } catch (e) {
    if (esCorte(e)) return encolar(user, data); // la señal se cortó justo al enviar
    throw e;                                     // error real (sin stock, sin permiso…)
  }
}

let sincronizando = false;
export async function sincronizar(onResultado) {
  if (sincronizando || !navigator.onLine || !outbox.some(x => !x.error)) return;
  sincronizando = true;
  try {
    for (const it of outbox.filter(x => !x.error)) {
      try {
        const p = await api.crearPedido(it.user, it.data);
        outbox = outbox.filter(x => x.uid !== it.uid);
        onResultado?.(`Se envió el pedido #${p.id} que estaba esperando señal`);
      } catch (e) {
        if (esCorte(e)) break; // se volvió a cortar: queda para la próxima
        // Ej.: se quedó sin stock mientras no había señal. Queda en la bandeja con el motivo.
        outbox = outbox.map(x => x.uid === it.uid ? { ...x, error: e.message } : x);
        onResultado?.("Un pedido sin señal no se pudo enviar: " + e.message);
      }
      guardar();
    }
  } finally { sincronizando = false; guardar(); }
}

export function descartar(uid) { outbox = outbox.filter(x => x.uid !== uid); guardar(); }

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { online = true; guardar(); });
  window.addEventListener("offline", () => { online = false; guardar(); });
}
