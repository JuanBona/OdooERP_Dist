# Guía de Usuario — Sistema de Reparto

**Rincón del Sur — Peyrano**
Versión: 2026-09-23

---

## Índice

1. [Cómo entrar al sistema](#1-cómo-entrar-al-sistema)
2. [La pantalla de Inicio y cómo moverse](#2-la-pantalla-de-inicio-y-cómo-moverse)
3. [Quién puede hacer qué (roles)](#3-quién-puede-hacer-qué-roles)
4. [Un día de trabajo, de punta a punta](#4-un-día-de-trabajo-de-punta-a-punta)
5. [Clientes](#5-clientes)
6. [Productos, precios y descuentos por cantidad](#6-productos-precios-y-descuentos-por-cantidad)
7. [Stock: cargar y descargar el camión](#7-stock-cargar-y-descargar-el-camión)
8. [Armar el viaje del día](#8-armar-el-viaje-del-día)
9. [Cuando un cliente llama y hace un pedido](#9-cuando-un-cliente-llama-y-hace-un-pedido)
10. [Vender desde el camión (chofer)](#10-vender-desde-el-camión-chofer)
11. [Si se corta la señal](#11-si-se-corta-la-señal)
12. [Cuentas corrientes y cobros](#12-cuentas-corrientes-y-cobros)
13. [Comisiones de los vendedores](#13-comisiones-de-los-vendedores)
14. [Remito interno](#14-remito-interno)
15. [Cierre de caja](#15-cierre-de-caja)
16. [Preguntas frecuentes](#16-preguntas-frecuentes)
17. [Para el administrador: usuarios y camiones](#17-para-el-administrador-usuarios-y-camiones)

---

## 1. Cómo entrar al sistema

1. Abrí el navegador e ingresá a la dirección del sistema (hoy: `https://rincondelsur.duckdns.org`). Tiene que verse un **candado** en la barra de direcciones.
2. Escribí tu **usuario** y tu **contraseña**. Te las entrega el administrador por separado; nunca se comparten por este documento.
3. **La primera vez, cambiá tu contraseña:** tu nombre (arriba a la derecha) → **Preferencias** → **Seguridad de la cuenta** → **Cambiar contraseña**.

**Qué navegador usar:**

| Dispositivo | Navegador recomendado |
|---|---|
| iPhone / iPad | **Safari** |
| Android | **Chrome** |
| Computadora | Chrome o Edge |

> En iPhone **no uses Brave ni Firefox**: muestran un cartel de error de JavaScript que no es del sistema y molesta. En Safari anda perfecto.

**Para usarlo como una aplicación** (pantalla completa, sin barra de direcciones):

- **iPhone (Safari):** botón Compartir → **Añadir a pantalla de inicio**.
- **Android (Chrome):** menú ⋮ → **Instalar aplicación** (o **Añadir a pantalla de inicio**).

---

## 2. La pantalla de Inicio y cómo moverse

Al entrar ves **Inicio**: cuadraditos grandes, uno por cada cosa que tu rol puede usar. Tocás uno y se abre.

| Rol | Cuadraditos que ve |
|---|---|
| Chofer / Vendedor | Viaje, Clientes, Punto de venta |
| Administración Operativa | Clientes, Punto de venta, Inventario |
| Depósito | Clientes, Inventario |
| Gerencia | Clientes, Punto de venta, Facturación, Inventario |

**Cómo volver a Inicio desde cualquier pantalla:** tocá el botón de la **casita** en la barra de arriba. En el POS también hay una casita al lado del nombre del cajero.

> A propósito, no hay un botón de "todas las aplicaciones" ni acceso a la tienda de aplicaciones de Odoo: cada persona ve solo lo suyo.

---

## 3. Quién puede hacer qué (roles)

Cada persona tiene **un** rol. Los cuatro roles del negocio son:

| Rol | Qué hace | Qué ve |
|---|---|---|
| **Vendedor / Chofer** | Reparte y vende desde **su** camión | Solo **su** punto de venta y **sus** clientes. No crea ni borra clientes ni pedidos. |
| **Depósito** | Carga y descarga los camiones, controla stock | Inventario y clientes. No usa el punto de venta. |
| **Administración Operativa** | Arma los viajes, carga clientes nuevos, imprime remitos, define descuentos por cantidad | Todos los puntos de venta y todos los clientes. |
| **Gerencia** | Todo lo de Administración, más **cobros de cuentas corrientes** y **comisiones** | Todo el negocio. Es la única que ve el panel de Comisiones. |

Además existe el usuario **admin**, que es solo para el equipo técnico (instalaciones y configuración), no para el trabajo diario.

**Los usuarios actuales:**

| Usuario | Rol | Camión |
|---|---|---|
| `camion1` | Vendedor / Chofer | POS Camion 1 |
| `camion2` | Vendedor / Chofer | POS Camion 2 |
| `camion3` | Vendedor / Chofer | POS Camion 3 |
| `administracion` | Administración Operativa | — |
| `deposito` | Depósito | — |
| `gerencia` | Gerencia | — |

> Los nombres de usuario se pueden cambiar por los de las personas reales (ver sección 17). Las contraseñas se entregan aparte y cada persona debe cambiarla al entrar.

---

## 4. Un día de trabajo, de punta a punta

1. **Mañana, en el depósito:** se carga mercadería a cada camión (sección 7).
2. **Administración** arma el **viaje** de cada chofer: qué clientes visita ese día (sección 8). Si un cliente llamó y pidió algo, se lo suma como parada (sección 9).
3. **El chofer** abre **Viaje** en Inicio, toca la parada, y el punto de venta se abre con el cliente ya elegido (sección 10). Carga el pedido y cobra.
4. Cada vez que cobra, **la parada se tilda sola** en el viaje.
5. **Gerencia** ve el progreso, las deudas y las comisiones (secciones 12 y 13).
6. **Al final del día:** el chofer cierra la caja (sección 15) y, si sobró mercadería, el depósito la descarga del camión (sección 7).

---

## 5. Clientes

### 5.1 Ver o buscar un cliente
**Inicio → Clientes.** Se busca por nombre, código o CUIT. Cada cliente tiene su **código** en el campo *Referencia*.

### 5.2 Crear un cliente nuevo
Solo lo hace **Administración** o **Gerencia** (un Vendedor no puede).
1. **Clientes → Nuevo**.
2. Completá **Nombre**, **Dirección** (importante para ubicarlo en la ruta), **Teléfono** y **Correo** si los tiene.
3. Si conocés el **CUIT**, cargalo.
4. **Asignale el vendedor** (sección 5.3) y guardá.

### 5.3 Asignar un cliente a un camión — importante
En la ficha del cliente, pestaña **Ventas y compras**, campo **Vendedor**: elegí el usuario del camión que lo atiende (`camion1`, `camion2` o `camion3`).

**Por qué importa:** cada chofer ve **solamente** los clientes que tiene asignados. Si un cliente no tiene vendedor, el chofer no lo encuentra en el punto de venta. Si además ese cliente queda como parada de un viaje, la pantalla **Viaje** del chofer da error en vez de mostrar la ruta.

Para asignar muchos clientes de una vez, pedile al equipo técnico que cargue una planilla con dos columnas: `codigo` del cliente y `camion` (1, 2 o 3).

### 5.4 Clientes con el CUIT en la nota
Al cargar el listado inicial, 29 clientes tenían un número que no es un CUIT válido (por ejemplo un DNI de 8 dígitos). Quedaron sin CUIT, y el número original está guardado en la **nota** de la ficha. Si hace falta, se corrige a mano. Este sistema no factura, así que no impide vender.

---

## 6. Productos, precios y descuentos por cantidad

### 6.1 Ver un producto
**Inventario → Productos.** Están los 182 productos de la lista de precios, agrupados en categorías (Almacén y General, Bebidas y Gaseosas, Vinos Comunes y Licores, Lista Vinos Finos, Destilados y Varios).

El **precio de venta** de cada producto es el del **pack o caja** de la lista (por ejemplo "GASEOSA COCA COLA 500CC X 12").

### 6.2 Crear un producto nuevo
1. **Inventario → Productos → Nuevo**.
2. Completá el **Nombre**, el **Precio de venta** y la **Categoría**.
3. Dejá tildado **Rastrear inventario** (viene tildado por defecto): si no, el sistema no sabe cuánto stock hay y no puede controlar la sobreventa.
4. Tildá **Punto de venta** para que aparezca en la grilla de los camiones.
5. Guardá.

### 6.3 Cambiar un precio
Abrí el producto, cambiá **Precio de venta** y guardá. Vale para todos los camiones desde ese momento.

### 6.4 Descuentos automáticos por cantidad
Los define **Administración** o **Gerencia**. Por ejemplo: "de 10 unidades en adelante 4%, de 20 en adelante 8%".

1. Abrí el producto → pestaña **Descuentos por volumen**.
2. Agregá una línea por tramo: **Cantidad mínima** y **% descuento**.
3. Guardá.

Para revisar todos los productos que tienen descuentos: **Punto de venta → Configuración → Descuentos por volumen**.

**En el camión:** el precio baja solo cuando el chofer llega a la cantidad. Bajo cada renglón del pedido se ven **todos los tramos** y queda resaltado el que aplica. Cuando falta poco para el siguiente tramo, aparece un aviso.

**Descuentos manuales:** el chofer **no puede** cambiar precios ni poner descuentos a mano (esos botones están ocultos y el sistema los rechaza igual). Solo Administración y Gerencia pueden.

---

## 7. Stock: cargar y descargar el camión

El stock se maneja **por ubicación**: el depósito central (**WH/Existencias**) y cada camión (**Camion 1**, **Camion 2**, **Camion 3**). El punto de venta de un camión **solo vende lo que ese camión tiene cargado**. Si un producto no está en el camión, no aparece; si se pide más de lo que hay, el sistema bloquea la venta al cobrar.

### 7.1 Poner el stock inicial en el depósito (una sola vez)
1. **Inventario → Productos →** abrí el producto.
2. Botón **A la mano** → **Nuevo**.
3. Ubicación **WH/Existencias**, cargá la cantidad y guardá.

### 7.2 Cargar mercadería a un camión (cada mañana)
Lo hace **Depósito**. Cada camión tiene su propia tarjeta: **Carga Camion 1**, **Carga Camion 2**, **Carga Camion 3**.
1. **Inventario → Información general →** tarjeta **Carga Camion N → Abrir**.
2. **Nuevo**.
3. Pestaña **Operaciones → Agregar un producto:** elegí el producto y la **cantidad**. Repetí por cada producto.
4. **Validar.** El stock baja del depósito y sube en el camión.

> No uses "Traslados internos" ni ningún otro tipo de operación: para los camiones existen solo las tarjetas de Carga y Descarga.

### 7.3 Descargar lo que sobró (al final del día)
Igual que la carga, pero con la tarjeta **Descarga Camion N**: devuelve la mercadería del camión al depósito.

### 7.4 Ver cuánto hay en cada lugar
Producto → botón **A la mano**: muestra la cantidad en el depósito y en cada camión, con el historial de movimientos.

### 7.5 El número de stock en el punto de venta
En la grilla y en el carrito, cada producto muestra el stock del camión. Es una **foto** del momento en que se abrió la sesión: si otro dispositivo vendió el mismo producto, no se actualiza solo. Para eso está el bloqueo real al cobrar, que sí es exacto.

---

## 8. Armar el viaje del día

Lo hace **Administración Operativa** o **Gerencia**. Un **viaje** es la hoja de ruta de un chofer para un día: la lista de clientes que tiene que visitar.

1. **Inicio → Punto de venta → Viajes → Nuevo**.
2. Elegí el **Chofer**, la **Fecha** y el **Punto de venta** (su camión).
3. En **Paradas**, agregá un cliente por línea. No hay orden fijo: es una lista de tareas, no una ruta optimizada por mapa.
4. Guardá.

**Reglas a tener en cuenta:**
- Cada chofer tiene **un solo viaje por día**. Si ya existe, se abre y se le suman paradas.
- Los clientes de un viaje tienen que estar **asignados a ese chofer** (sección 5.3); si no, la pantalla del chofer da error.
- Un mismo cliente en viajes de dos choferes el mismo día no se bloquea: revisalo a mano para no duplicar visitas.

**Cómo lo ve el chofer:** en Inicio, el cuadradito **Viaje** muestra sus paradas del día. Tocando una, se abre el punto de venta con ese cliente **ya seleccionado**.

**Cómo se sigue el avance:** en **Punto de venta → Viajes** se ve, por cada chofer, cuántas paradas se completaron sobre el total. **La parada se tilda sola** cuando el chofer cobra un pedido a ese cliente ese día: no hay que marcar nada a mano.

---

## 9. Cuando un cliente llama y hace un pedido

Cuando un comercio llama para pedir mercadería, Administración lo suma al viaje del chofer que lo va a atender, así la visita y el pedido quedan registrados en **Viajes**.

1. Confirmá qué **chofer y qué día** van a atender a ese cliente.
2. **Punto de venta → Viajes** y abrí el **viaje de ese chofer para esa fecha**. Si todavía no existe, creá uno nuevo (sección 8).
3. En **Paradas → Agregar una línea**, elegí el **cliente** y guardá.
4. El chofer ve la parada nueva en su cuadradito **Viaje** (puede que tenga que **recargar la pantalla** si ya la tenía abierta).
5. Al llegar al cliente, el chofer toca la parada, carga el pedido (que ya viene con el cliente elegido) y cobra. En ese momento la parada se **tilda sola** y queda **vinculada al pedido**.

> **Importante:** la parada se agrega a mano; el sistema **no** la crea solo por el llamado. Lo que sí hace solo es marcarla como visitada y asociarle el pedido cuando el chofer cobra.
>
> Antes de sumarlo, chequeá que el cliente tenga **vendedor asignado** (sección 5.3) y, si es un cliente con deuda, mirá la sección 12: al elegirlo, el sistema avisa cuánto debe.

---

## 10. Vender desde el camión (chofer)

1. **Inicio → Viaje** y tocá la parada del cliente. Se abre el punto de venta con el cliente ya elegido.
   *(Si el cliente no está en el viaje: **Inicio → Punto de venta →** tu camión → **Seguir vendiendo** o **Nueva sesión**, y elegí el cliente arriba a la izquierda.)*
2. **Si el cliente tiene deuda vencida**, aparece un aviso con el monto y los días. Es solo informativo: **no impide vender** (sección 12).
3. Tocá los **productos** en la grilla. Para cambiar la cantidad: tocá la línea → **Cant.** → escribí el número.
4. Los **descuentos por cantidad** se aplican solos.
5. Tocá **Pago**, elegí el medio y **Validar**:
   - **Efectivo Camion N:** cobra en el momento.
   - **Tarjeta.**
   - **Cuenta corriente:** el cliente queda debiendo (sección 12).
6. Se genera el ticket y, si querés, el **remito** (sección 14).

**Si sale "Stock insuficiente":** pediste más de lo que hay en el camión. El cartel dice cuánto hay disponible; corregí la cantidad, o avisá a Depósito que falta ese producto.

---

## 11. Si se corta la señal

El punto de venta sigue funcionando sin internet:
- Podés **seguir cargando y cobrando**. Aparece un aviso de "Conexión perdida" y se puede continuar.
- La venta queda guardada **en el dispositivo**.
- **Cuando vuelve la señal, se envía sola** en unos segundos (hasta ~15 segundos). No hace falta hacer nada.

**Recomendaciones:**
- Después de recuperar señal, esperá unos segundos antes de cerrar el navegador o la aplicación.
- **No borres los datos del navegador** ni cierres sesión mientras haya ventas sin enviar.
- Podés comprobarlo en **Punto de venta → Órdenes**: las ventas enviadas figuran ahí.

Mientras una venta no llegó al servidor, tampoco se descuenta el stock ni la ve nadie más. No se pierde la venta ni el dinero cobrado.

---

## 12. Cuentas corrientes y cobros

### 12.1 El aviso al vender
Al elegir en el punto de venta un cliente con deuda vencida, aparece un cartel con el **monto adeudado** y los **días sin pagar**, con colores:

- 🟠 **Naranja:** 10 días o más.
- 🔴 **Rojo:** 15 días o más (es el máximo de crédito del negocio).

Es solo información: la venta se puede hacer igual.

### 12.2 Lista de deudores
**Punto de venta → Deudores.** Muestra los clientes con deuda, con los más atrasados primero. Un **Vendedor** ve solo a **sus** clientes; los demás roles ven a todos.

### 12.3 Registrar el cobro de una deuda
Lo hace **Gerencia**:
1. **Inicio → Facturación → Clientes → Pagos → Nuevo**.
2. Elegí el **Cliente**, el **Monto** y el **Diario** (Efectivo o Banco).
3. Confirmá. El pago se aplica solo a la deuda y el cliente se actualiza en Deudores (si pagó todo, desaparece de la lista).

Este cobro es también el que **genera la comisión** del vendedor (sección 13).

---

## 13. Comisiones de los vendedores

### 13.1 Cargar el porcentaje de cada vendedor
Solo **Gerencia** puede hacerlo.
1. **Ajustes → Usuarios y compañías → Usuarios** y abrí el usuario del vendedor (`camion1`, `camion2`, `camion3`).
2. Pestaña **Comisión (Reparto)**.
3. Escribí el **% Comisión** y guardá.

**Un cambio de porcentaje vale para lo que se cobre de ahí en adelante**: las comisiones que ya se generaron **no se modifican**.

### 13.2 Cuándo se genera la comisión
La comisión se genera **cuando se le cobra al cliente**, no cuando se carga el pedido:

| Tipo de venta | Cuándo se genera |
|---|---|
| **Contado** (efectivo o tarjeta) | Al cobrar la venta en el camión. |
| **Cuenta corriente** | Cuando el cliente **paga** esa deuda (sección 12.3). Si paga en partes, cada pago genera su parte proporcional. |

Solo cuenta si el cliente tiene **vendedor asignado** (sección 5.3): la comisión va para ese vendedor.

### 13.3 Ver las comisiones
**Punto de venta → Comisiones** (solo Gerencia). Es una tabla por **vendedor y mes** con lo cobrado y la comisión resultante, más el detalle línea por línea. Es de **solo lectura**: nadie carga comisiones a mano; las genera el sistema con cada cobro real.

---

## 14. Remito interno

**Este sistema no factura.** El negocio sigue facturando con su programa en la PC, incluida la Factura A. Lo que genera el sistema es un **remito interno**, sin valor fiscal, como constancia de lo entregado.

1. **Punto de venta → Órdenes** y abrí la venta.
2. Botón **Imprimir remito**.

El remito muestra cliente, productos, cantidades y totales. La factura se hace aparte, con el remito como respaldo.

---

## 15. Cierre de caja

Al terminar el turno o el día, el chofer:
1. Dentro del punto de venta, menú **☰** (arriba a la derecha) → **Cerrar sesión de PdV**.
2. Revisa el resumen: total vendido, por medio de pago, efectivo esperado y contado.
3. Cuenta el efectivo, carga la diferencia si la hay y **confirma el cierre**.

Antes de cerrar, **asegurate de que todas las ventas estén enviadas** (sección 11). Para volver a vender hay que abrir una **sesión nueva**.

---

## 16. Preguntas frecuentes

**No veo ningún cliente en el punto de venta.**
El cliente no tiene tu usuario como **Vendedor** (sección 5.3). Pedile a Administración que se lo asigne.

**El botón de Viaje da error.**
Probablemente un cliente de la lista no está asignado a ese chofer. Revisá el viaje y asigná el cliente.

**El sistema no me deja vender por "Stock insuficiente".**
El camión no tiene cargada esa cantidad (sección 7). Depósito tiene que cargarla o hay que bajar la cantidad del pedido.

**Un producto no aparece en el punto de venta.**
No está cargado en el camión, o no tiene tildado **Punto de venta** (sección 6.2).

**El aviso de deuda, ¿me impide vender?**
No, es informativo.

**Cambié un descuento pero el camión no lo toma.**
En la tablet: menú **☰** → **Volver a cargar datos**. Si no, cerrá y abrí el punto de venta.

**La pantalla queda cargando y no abre (después de una actualización).**
Es una copia vieja guardada en el navegador. Probá en una pestaña privada; si anda, borrá los **datos del sitio** en la configuración del navegador.

**Salió un cartel de error de JavaScript en el celular.**
Es del navegador (Brave o Firefox en iPhone), no del sistema. Usá **Safari**.

**Me olvidé la contraseña.**
Pedile al administrador que te genere una nueva.

**Limitaciones actuales:**
- No hay facturación fiscal (se hace con el programa externo).
- El viaje es una lista de paradas, no una ruta optimizada por mapa.
- La comisión evalúa solo lo cobrado; el criterio de "2 visitas consecutivas sin cobro" no está implementado.
- Las paradas se agregan a mano (sección 9).

---

## 17. Para el administrador: usuarios y camiones

### 17.1 Cambiar el nombre de un usuario
**Ajustes → Usuarios y compañías → Usuarios →** abrí el usuario → cambiá **Nombre** y, si querés, el **login**. No se pierde ninguna configuración.

### 17.2 Cambiar o resetear una contraseña
Abrí el usuario → **Acción → Cambiar contraseña**. Entregala por un canal privado y pedí que la cambie al primer ingreso.

### 17.3 Crear un usuario nuevo
1. **Ajustes → Usuarios y compañías → Usuarios → Nuevo**.
2. Nombre, login y contraseña inicial.
3. En permisos, elegí **un** rol de **Reparto** (Vendedor, Depósito, Administración Operativa o Gerencia).
4. Si es **vendedor**, en la pestaña **Camión (Reparto)** elegí su punto de venta: **solo verá ese camión**.
5. Asignale sus **clientes** (sección 5.3); si no, no verá ninguno.

### 17.4 Camiones
Hoy hay **3 camiones**. Cada uno tiene: una ubicación de stock, un tipo de operación de venta, de carga y de descarga, su caja, su método de pago en efectivo y su punto de venta. Para sumar un camión nuevo, pedilo al equipo técnico.

### 17.5 Problemas con los datos
Ante cualquier problema con los datos (algo que desapareció, un número que no cierra), **no borres ni corrijas nada a mano**: avisá al equipo técnico para revisarlo antes.

---

*Documento vivo: se actualiza cuando cambia o se suma una funcionalidad.*
