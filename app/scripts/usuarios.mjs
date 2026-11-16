// Actualiza los usuarios de la app (nombres, roles, claves). Se puede correr varias veces.
// Uso (en el servidor, desde app/):
//   SUPABASE_URL=http://127.0.0.1:8000 SUPABASE_SERVICE_ROLE_KEY=... CLAVE=... node scripts/usuarios.mjs
// O más fácil: app/servidor/usuarios.sh (lee las claves de supabase/.env y te pide la clave).
// La clave NO se guarda en el repo: se pasa al correrlo.
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLAVE } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLAVE) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o CLAVE."); process.exit(1);
}
if (CLAVE.length < 6) { console.error("La clave tiene que tener al menos 6 caracteres."); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DOMINIO = "rincondelsur.app";

// usuario (para entrar) · nombre (se ve en la app) · rol · usuario viejo a renombrar (conserva sus datos)
const USUARIOS = [
  { usuario: "piniya",   nombre: "Piniya",         rol: "vendedor", antes: "vendedor1" },
  { usuario: "javier",   nombre: "Javier",         rol: "vendedor", antes: "vendedor2" },
  { usuario: "nico",     nombre: "Nico",           rol: "vendedor" },
  { usuario: "gerencia", nombre: "Gerencia",       rol: "gerencia" },
  { usuario: "admin",    nombre: "Administración", rol: "admin" },
  { usuario: "deposito", nombre: "Depósito",       rol: "deposito" },
];

const ok = (r, que) => { if (r.error) { console.error("Error en", que + ":", r.error.message); process.exit(1); } return r.data; };
const todos = ok(await sb.auth.admin.listUsers({ perPage: 1000 }), "listar usuarios").users;
const porMail = m => todos.find(u => u.email === m);

for (const x of USUARIOS) {
  const email = `${x.usuario}@${DOMINIO}`;
  let u = porMail(email);
  let accion = "actualizado";
  if (!u && x.antes && porMail(`${x.antes}@${DOMINIO}`)) {
    u = porMail(`${x.antes}@${DOMINIO}`); accion = `renombrado (antes ${x.antes})`;
  }
  if (u) {
    ok(await sb.auth.admin.updateUserById(u.id, { email, password: CLAVE, email_confirm: true }), x.usuario);
  } else {
    u = ok(await sb.auth.admin.createUser({ email, password: CLAVE, email_confirm: true }), x.usuario).user;
    accion = "creado";
  }
  ok(await sb.from("perfiles").upsert({ id: u.id, nombre: x.nombre, rol: x.rol, usuario: x.usuario }), "perfil " + x.usuario);
  console.log(`${x.usuario.padEnd(9)} ${x.rol.padEnd(9)} ${accion}`);
}
console.log("Listo. Para entrar: usuario (ej. piniya) y la clave nueva.");
