# Guía de Usuario — Sistema de Reparto

**Rincón del Sur — Peyrano**
Versión: 2026-09-26

---

## Índice

1. [Cómo entrar al sistema](#1-cómo-entrar-al-sistema)
2. [La pantalla de Inicio y cómo moverse](#2-la-pantalla-de-inicio-y-cómo-moverse)
3. [Quién puede hacer qué (roles)](#3-quién-puede-hacer-qué-roles)
4. [Un día de trabajo, de punta a punta](#4-un-día-de-trabajo-de-punta-a-punta)
5. [Clientes](#5-clientes)
6. [Productos, precios y descuentos por cantidad](#6-productos-precios-y-descuentos-por-cantidad)
7. [Stock: es un solo pozo general](#7-stock-es-un-solo-pozo-general)
8. [Armar el viaje del día](#8-armar-el-viaje-del-día)
9. [Cuando un cliente llama y hace un pedido](#9-cuando-un-cliente-llama-y-hace-un-pedido)
10. [Vender desde el camión (chofer)](#10-vender-desde-el-camión-chofer)
11. [Si se corta la señal](#11-si-se-corta-la-señal)
12. [Cuentas corrientes y cobros](#12-cuentas-corrientes-y-cobros)
13. [Comisiones de los vendedores](#13-comisiones-de-los-vendedores)
14. [Remito interno](#14-remito-interno)
15. [Cajas de la empresa, Rendición y Gastos](#15-cajas-de-la-empresa-rendición-y-gastos)
16. [Cierre de caja (sesión de POS)](#16-cierre-de-caja-sesión-de-pos)
17. [Preguntas frecuentes](#17-preguntas-frecuentes)
18. [Para el administrador: usuarios y camiones](#18-para-el-administrador-usuarios-y-camiones)

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
| **Administración Operativa** | Arma los viajes, carga clientes nuevos, imprime remitos, define descuentos por cantidad, **confirma rendiciones** y anota gastos | Todos los puntos de venta y todos los clientes. |
| **Gerencia** | Todo lo de Administración (menos confirmar rendiciones — solo las ve), más **cobros de cuentas corrientes** y **comisiones** | Todo el negocio. Es la única que ve el panel de Comisiones. |

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

1. **Administración** arma el **viaje** de cada chofer: qué clientes visita ese día (sección 8). Si un cliente llamó y pidió algo, se lo suma como parada (sección 9).
2. **El chofer** abre **Viaje** en Inicio, toca la parada, y el punto de venta se abre con el cliente ya elegido (sección 10). Carga el pedido contra el stock general (sección 7) y cobra.
3. Cada vez que cobra, **la parada se tilda sola** en el viaje.
4. **Gerencia** ve el progreso, las deudas y las comisiones (secciones 12 y 13).
5. **Al final del día:** el chofer cierra su sesión de POS (sección 16), y **Administración rinde** a cada vendedor lo que cobró (sección 15).

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

**Cómo hacerlo:** abrí cada cliente desde **Inicio → Clientes** y elegí el **Vendedor**, como se explicó arriba. Hacelo **antes** de que el chofer salga a repartir, porque un cliente sin vendedor no aparece en su punto de venta ni en su viaje.

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

## 7. Stock: es un solo pozo general

El stock **ya no es por camión**: los 3 camiones venden contra el **mismo stock general de la empresa** (**WH/Existencias**). Ningún camión "tiene cargado" nada propio — el vendedor toma el pedido contra ese pozo común, y después Depósito arma la entrega física (sección 8 en adelante).

> Si te acordás de una época en que cada camión tenía su propia ubicación de stock (Camion 1/2/3): eso se sacó. Fue un error de diseño inicial — se confundía el rol de vendedor (toma el pedido) con el de despachante (entrega la mercadería). Ahora todo sale de un solo lugar.

### 7.1 Poner el stock en el depósito
1. **Inventario → Productos →** abrí el producto.
2. Botón **A la mano** → **Nuevo**.
3. Ubicación **WH/Existencias**, cargá la cantidad y guardá.

### 7.2 Ver cuánto hay
Producto → botón **A la mano**: muestra la cantidad disponible, con el historial de movimientos. Ya no hay "carga" ni "descarga" de camión: el stock se ajusta directo en **WH/Existencias**.

### 7.3 El número de stock en el punto de venta
En la grilla y en el carrito, cada producto muestra el stock general disponible. Es una **foto** del momento en que se abrió la sesión: si otro camión vendió el mismo producto mientras tanto, no se actualiza solo. Para eso está el bloqueo real al cobrar, que sí es exacto y compara contra el stock general, no contra ningún camión.

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
   - **Efectivo:** cobra en el momento, va a la **Caja Efectivo** de la empresa.
   - **Débito:** cobra en el momento, va a la **Caja Transferencia** de la empresa.
   - **Cuenta corriente:** el cliente queda debiendo (sección 12).
6. Se genera el ticket y, si querés, el **remito** (sección 14).

**Si sale "Stock insuficiente":** pediste más de lo que hay en el stock general (sección 7). El cartel dice cuánto hay disponible; corregí la cantidad, o avisá a Depósito que falta ese producto.

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
2. Elegí el **Cliente**, el **Monto** y el **Diario** (**Caja Efectivo** o **Caja Transferencia**).
3. Confirmá. El pago se aplica solo a la deuda y el cliente se actualiza en Deudores (si pagó todo, desaparece de la lista).

Este cobro es también el que **genera la comisión** del vendedor (sección 13) y el que suma al **saldo de Cajas** una vez que Administración lo rinda (sección 15).

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

## 15. Cajas de la empresa, Rendición y Gastos

Esto es nuevo: la plata que cobran los vendedores en la calle **no se ve reflejada en la caja de la empresa al toque** — queda "pendiente de rendir" a nombre de cada uno, hasta que Administración confirma la rendición del día.

### 15.1 El saldo de Cajas
**Inicio → Punto de venta → Cajas** (Gerencia y Administración). Muestra 2 números: cuánto hay disponible en **Caja Efectivo** y cuánto en **Caja Transferencia**. Es el saldo real y actual de la empresa — solo sube cuando se confirma una rendición, y baja con los gastos (sección 15.3).

### 15.2 Rendir a un vendedor
Lo hace **Administración** (Gerencia solo puede consultar, no confirmar):
1. **Inicio → Punto de venta → Rendiciones → Nuevo**.
2. Elegí el **Vendedor**. El sistema calcula solo cuánto **debería** traer en Efectivo y en Transferencia (todo lo que cobró y todavía no rindió).
3. Contá la plata real que te entrega y cargala en **Recibido Efectivo** / **Recibido Transferencia**. Si no coincide con lo esperado, la **diferencia** se calcula y queda guardada igual (sirve para detectar faltantes en el momento).
4. Botón **Rendir**. Ya no se puede editar ni volver a rendir esa rendición.

Un vendedor puede rendirse más de una vez si hace falta (por ejemplo, a mitad de tarde y de nuevo a la noche) — cada rendición junta todo lo que esté pendiente hasta ese momento.

### 15.3 Gastos
**Inicio → Punto de venta → Gastos** (Gerencia y Administración). Sirve para anotar un egreso de una de las 2 cajas — por ejemplo, si un vendedor sacó plata de la caja en efectivo para algo puntual.

1. **Nuevo.**
2. Elegí la **caja** (Efectivo o Transferencia), el **monto**, el **vendedor responsable** y el **motivo**.
3. Guardá.

Es solo un registro informativo por vendedor (no le descuenta nada automático de su comisión), pero **sí resta** del saldo de Cajas que ve Gerencia (sección 15.1).

---

## 16. Cierre de caja (sesión de POS)

Al terminar el turno o el día, el chofer:
1. Dentro del punto de venta, menú **☰** (arriba a la derecha) → **Cerrar sesión de PdV**.
2. Revisa el resumen: total vendido, por medio de pago, efectivo esperado y contado.
3. Cuenta el efectivo, carga la diferencia si la hay y **confirma el cierre**.

Antes de cerrar, **asegurate de que todas las ventas estén enviadas** (sección 11). Para volver a vender hay que abrir una **sesión nueva**.

> Esto es distinto de la **Rendición** (sección 15): el cierre de sesión es un control interno de Odoo por dispositivo/turno; la Rendición es el proceso de negocio por el que Administración confirma cuánta plata entregó cada vendedor y recién ahí se refleja en las Cajas de la empresa.

---

## 17. Preguntas frecuentes

**No veo ningún cliente en el punto de venta.**
El cliente no tiene tu usuario como **Vendedor** (sección 5.3). Pedile a Administración que se lo asigne.

**El botón de Viaje da error.**
Probablemente un cliente de la lista no está asignado a ese chofer. Revisá el viaje y asigná el cliente.

**El sistema no me deja vender por "Stock insuficiente".**
No hay esa cantidad en el stock general (sección 7). Depósito tiene que cargarla o hay que bajar la cantidad del pedido.

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

## 18. Para el administrador: usuarios y camiones

### 18.1 Cambiar el nombre de un usuario
**Ajustes → Usuarios y compañías → Usuarios →** abrí el usuario → cambiá **Nombre** y, si querés, el **login**. No se pierde ninguna configuración.

### 18.2 Cambiar o resetear una contraseña
Abrí el usuario → **Acción → Cambiar contraseña**. Entregala por un canal privado y pedí que la cambie al primer ingreso.

### 18.3 Crear un usuario nuevo
1. **Ajustes → Usuarios y compañías → Usuarios → Nuevo**.
2. Nombre, login y contraseña inicial.
3. En permisos, elegí **un** rol de **Reparto** (Vendedor, Depósito, Administración Operativa o Gerencia).
4. Si es **vendedor**, en la pestaña **Camión (Reparto)** elegí su punto de venta: **solo verá ese camión**.
5. Asignale sus **clientes** (sección 5.3); si no, no verá ninguno.

### 18.4 Camiones
Hoy hay **3 camiones**, cada uno con su propio punto de venta. Pero **el stock ya es general** (sección 7) y **las cajas ya son de la empresa**, no por camión (sección 15): los 3 camiones venden contra el mismo stock y sus cobros van a las mismas 2 cajas (Efectivo/Transferencia). Lo único propio de cada camión es su punto de venta (para poder abrir su propia sesión) y su método de pago en efectivo puntual (necesario porque Odoo exige un método de efectivo por punto de venta), que ya apunta al mismo diario compartido. Para sumar un camión nuevo, pedilo al equipo técnico.

### 18.5 Problemas con los datos
Ante cualquier problema con los datos (algo que desapareció, un número que no cierra), **no borres ni corrijas nada a mano**: avisá al equipo técnico para revisarlo antes.

---

*Documento vivo: se actualiza cuando cambia o se suma una funcionalidad.*
