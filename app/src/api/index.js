// Elige el backend: con VITE_SUPABASE_URL configurada usa Supabase; si no, el modo demo (datos en el navegador).
import { api as demo } from "./demo";
import { api as supa } from "./supabase";

export const api = import.meta.env.VITE_SUPABASE_URL ? supa : demo;
