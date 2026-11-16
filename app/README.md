# Rincón del Sur — app de pedidos y reparto

Reemplazo simple de Odoo. Diseño: maqueta del cliente (`distribuidora_4 (1).html`).
Requerimientos: [`../docs/REQUERIMIENTOS_APP_SIMPLE.md`](../docs/REQUERIMIENTOS_APP_SIMPLE.md).

## Correr

```bash
cd app
npm install
npm run dev
```

Sin variables de entorno corre en **modo demo**: los datos se guardan en el navegador
(clave de todos los usuarios: `1234`). Botón "Reiniciar datos de la demo" en el login.

## Estado — Etapa 1

- Login con 4 roles: Vendedor, Depósito, Administración, Gerencia.
- Catálogo con los 182 productos de la lista de precios, tramos de descuento por cantidad.
- 776 clientes del Excel, con día de visita, localidad y vendedor editables.
- Alerta de 15 días sin pagar (no bloquea); el cobro la reinicia.
- Pedido → si el cliente debe, queda "Por autorizar" → depósito con checklist → listo → en reparto → entregado / rechazado.
- Stock se descuenta al confirmar el pedido y vuelve si se anula o rechaza.
- Precio manual en el renglón (solo Administración/Gerencia).
- Remito interno imprimible. Historial de cada pedido.
- Artículos con foto (se achica sola), stock mínimo y tramos. Usuarios con % de comisión.
- Caja del depósito (Administración/Gerencia): entradas, salidas a quién, plata que tiene que volver, rendición de vendedores y conteo.
- Funciona sin señal (PWA + bandeja de salida). Resumen del mes para Gerencia.

## Base de datos

`supabase/migrations/` tiene tablas, permisos por rol (RLS), auditoría inmutable y las funciones
`crear_pedido`, `cambiar_estado`, `registrar_cobro` y `cerrar_reparto` (entregas automáticas).
Con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` usa Supabase (`src/api/supabase.js`); sin ellas, modo demo (`src/api/demo.js`).
Cómo instalarlo en el servidor: [`DEPLOY.md`](DEPLOY.md).
