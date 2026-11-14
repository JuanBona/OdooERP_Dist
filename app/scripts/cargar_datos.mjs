// Carga inicial en Supabase: usuarios con sus roles, productos (lista de precios) y clientes (Excel).
// Uso:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... CLAVE_INICIAL=... node scripts/cargar_datos.mjs
// Es seguro correrlo dos veces: no duplica usuarios, productos ni clientes.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLAVE_INICIAL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLAVE_INICIAL) {
  console.error("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o CLAVE_INICIAL."); process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const seed = JSON.parse(readFileSync(new URL("../src/seed.json", import.meta.url)));
const DOMINIO = "rincondelsur.app";
const ok = (r, que) => { if (r.error) { console.error("Error en", que, r.error.message); process.exit(1); } return r.data; };

const USUARIOS = [
  ["vendedor1", "Vendedor 1", "vendedor"], ["vendedor2", "Vendedor 2", "vendedor"],
  ["deposito", "Depósito", "deposito"], ["admin", "Administración", "admin"], ["gerencia", "Gerencia", "gerencia"],
];

// 1. Usuarios (login: usuario + clave; por dentro el mail es usuario@rincondelsur.app)
const existentes = ok(await sb.auth.admin.listUsers({ perPage: 1000 }), "listar usuarios").users;
for (const [usuario, nombre, rol] of USUARIOS) {
  const email = `${usuario}@${DOMINIO}`;
  let u = existentes.find(x => x.email === email);
  if (!u) u = ok(await sb.auth.admin.createUser({ email, password: CLAVE_INICIAL, email_confirm: true }), "crear " + usuario).user;
  ok(await sb.from("perfiles").upsert({ id: u.id, nombre, rol, usuario }), "perfil " + usuario);
  console.log("usuario", usuario, "→", rol);
}

// 2. Productos
const { count: nProd } = await sb.from("productos").select("*", { count: "exact", head: true });
if (!nProd) {
  const filas = seed.productos.map((p, i) => ({ nombre: p.nombre, categoria: p.categoria, precio: p.precio, stock: 0, stock_min: 0, foto_url: p.foto || null }));
  ok(await sb.from("productos").insert(filas), "productos");
  console.log(filas.length, "productos (stock en 0: cargarlo desde Artículos o con el stock real de Odoo)");
} else console.log("productos ya cargados:", nProd);

// 3. Clientes
const { count: nCli } = await sb.from("clientes").select("*", { count: "exact", head: true });
if (!nCli) {
  const filas = seed.clientes.map(c => ({ codigo: c.codigo, nombre: c.nombre, dir: c.dir || "", cuit: c.cuit || "", tel: String(c.tel || "") }));
  for (let i = 0; i < filas.length; i += 500) ok(await sb.from("clientes").insert(filas.slice(i, i + 500)), "clientes");
  console.log(filas.length, "clientes");
} else console.log("clientes ya cargados:", nCli);

// 4. Bucket público para las fotos de productos
const buckets = ok(await sb.storage.listBuckets(), "buckets");
if (!buckets.find(b => b.name === "productos")) ok(await sb.storage.createBucket("productos", { public: true }), "bucket");
console.log("listo");
