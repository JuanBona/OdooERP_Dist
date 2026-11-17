// Funcionamiento sin señal (RF-PV-06 / RNF-06).
// Si no hay conexión, el pedido se guarda en una "bandeja de salida" en el teléfono
// y se envía solo cuando vuelve la señal. El vendedor no tiene que hacer nada.
import { useSyncExternalStore } from "react";
import { api } from "../api";
import { hoyISO } from "./reglas";

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
const nuevoUid = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
const encolar = (tipo, user, data) => {
  outbox.push({ uid: data.uid, tipo, user, data, creado: new Date().toISOString(), error: null });
  guardar();
  return { enCola: true };
};
// El identificador viaja con el envío: si se reintenta, el servidor no lo duplica.
const ENVIAR = {
  pedido: (user, d) => api.crearPedido(user, d),
  cobro: (user, d) => api.registrarCobro(user, d.clienteId, d.monto, d.medio, d.uid),
};

async function enviar(tipo, user, data) {
  data = { ...data, uid: data.uid || nuevoUid() };
  if (tipo === "pedido") data.fecha ||= hoyISO(); // el camión depende del día en que se cargó, no de cuándo llegue
  if (!navigator.onLine) return encolar(tipo, user, data);
  try {
    return { resultado: await ENVIAR[tipo](user, data) };
  } catch (e) {
    if (esCorte(e)) return encolar(tipo, user, data); // la señal se cortó justo al enviar
    throw e;                                           // error real (sin stock, sin permiso…)
  }
}

// Devuelven { resultado } si se envió, o { enCola: true } si quedó esperando señal.
export async function enviarPedido(user, data) {
  const r = await enviar("pedido", user, data);
  return r.enCola ? r : { pedido: r.resultado };
}
export const enviarCobro = (user, data) => enviar("cobro", user, data);

let sincronizando = false;
export async function sincronizar(onResultado) {
  if (sincronizando || !navigator.onLine || !outbox.some(x => !x.error)) return;
  sincronizando = true;
  try {
    for (const it of outbox.filter(x => !x.error)) {
      try {
        const r = await ENVIAR[it.tipo || "pedido"](it.user, it.data);
        outbox = outbox.filter(x => x.uid !== it.uid);
        onResultado?.(it.tipo === "cobro" ? "Se envió un cobro que estaba esperando señal" : `Se envió el pedido #${r?.id ?? ""} que estaba esperando señal`);
      } catch (e) {
        if (esCorte(e)) break; // se volvió a cortar: queda para la próxima
        // Ej.: se quedó sin stock mientras no había señal. Queda en la bandeja con el motivo.
        outbox = outbox.map(x => x.uid === it.uid ? { ...x, error: e.message } : x);
        onResultado?.("Algo cargado sin señal no se pudo enviar: " + e.message);
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
