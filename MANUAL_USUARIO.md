# Manual de Usuario — Sistema de Gestión Reparto (Odoo 19)

**Rincón del Sur — Peyrano**
Versión del documento: 2026-08-24

---

## Índice

1. [Acceso al sistema](#1-acceso-al-sistema)
2. [Gestión de clientes](#2-gestión-de-clientes)
3. [Catálogo de productos](#3-catálogo-de-productos)
4. [Descuentos por cantidad (listas de precios)](#4-descuentos-por-cantidad-listas-de-precios)
5. [Inventario y carga de camiones](#5-inventario-y-carga-de-camiones)
6. [Punto de Venta — conceptos generales](#6-punto-de-venta--conceptos-generales)
7. [Venta desde mostrador / oficina (Punto de Venta Reparto)](#7-venta-desde-mostrador--oficina-punto-de-venta-reparto)
8. [Venta desde el camión (POS Camión 1)](#8-venta-desde-el-camión-pos-camión-1)
9. [Alertas de crédito y pantalla de Deudores](#9-alertas-de-crédito-y-pantalla-de-deudores)
10. [Control de stock por camión](#10-control-de-stock-por-camión)
11. [Roles y permisos de usuario](#11-roles-y-permisos-de-usuario)
12. [Facturación](#12-facturación)
13. [Cierre de caja (sesión de POS)](#13-cierre-de-caja-sesión-de-pos)
14. [Funcionamiento sin conexión (offline)](#14-funcionamiento-sin-conexión-offline)
15. [Preguntas frecuentes y limitaciones conocidas](#15-preguntas-frecuentes-y-limitaciones-conocidas)

---

## 1. Acceso al sistema

El sistema corre en un servidor local (Odoo 19 Community). Para acceder:

1. Abrir el navegador (Chrome, Edge o similar).
2. Ir a la dirección que te indique el administrador (por ejemplo `http://localhost:8069` en el entorno de prueba, o la URL del servidor en producción).
3. Ingresar usuario y contraseña.

Cada usuario ve únicamente las aplicaciones y datos que le correspondan según su rol (ver sección [11. Roles y permisos](#11-roles-y-permisos-de-usuario)).

La pantalla principal muestra un menú de aplicaciones (grilla de 9 puntos arriba a la izquierda). Las apps relevantes para la operación diaria son:

- **Contactos** — clientes y proveedores.
- **Inventario** — stock, ubicaciones, traslados.
- **Punto de venta** — ventas, sesiones, configuración de tiendas/camiones.
- **Facturación** — facturas, pagos, listas de precios.

---

## 2. Gestión de clientes

### 2.1 Crear un cliente nuevo

1. Ir a **Contactos** → botón **Nuevo**.
2. Elegir tipo: **Empresa** (comercio/negocio) o **Persona** (individuo).
3. Completar:
   - **Nombre** del comercio o persona.
   - **Dirección** (calle, ciudad — importante para que el vendedor lo ubique en la ruta de reparto).
   - **Teléfono / Correo electrónico** (opcional pero recomendado).
   - **Tipo de responsabilidad de ARCA** (pestaña de datos fiscales): elegir entre *Consumidor Final*, *Responsable Inscripto*, *Monotributo*, etc. **Este campo es obligatorio** para poder facturarle luego — si no se completa, el sistema bloqueará la facturación con el aviso "Falta la configuración del contacto".
4. Click en el ícono de nube (guardar) en la barra superior.

### 2.2 Asignar un cliente a un vendedor

Cada cliente tiene un campo **Vendedor** (*Salesperson*, visible en la pestaña "Ventas y compras"). Este campo determina:

- Qué vendedor puede ver y editar ese cliente (ver [Roles y permisos](#11-roles-y-permisos-de-usuario)).
- A quién se le atribuye la venta en los reportes.

Para asignarlo: abrir la ficha del cliente → pestaña **Ventas y compras** → campo **Vendedor** → elegir el usuario correspondiente.

> **Importante:** un usuario con rol *Vendedor* **no puede crear ni borrar clientes** — solo puede ver y editar los que tiene asignados. Si hace falta dar de alta un cliente nuevo para un vendedor, debe hacerlo un usuario de Administración (Operativa o Privada).

---

## 3. Catálogo de productos

### 3.1 Ver o buscar un producto

**Inventario** → **Productos** → **Productos**. Se puede buscar por nombre, filtrar por categoría, o cambiar entre vista de tarjetas y vista de lista.

### 3.2 Crear un producto nuevo

1. **Inventario** → **Productos** → **Nuevo**.
2. Completar:
   - **Nombre del producto**.
   - **Tipo de producto**: dejar en *Bienes*.
   - **Rastrear inventario**: **activar este casillero siempre** que el producto tenga stock físico que controlar (ver nota abajo). Si queda desactivado, el sistema nunca sabrá cuánto stock hay y **no van a funcionar ni los traslados a camión ni el bloqueo de sobreventa**.
   - **Precio de venta**.
   - **Categoría** (Gaseosas, Cervezas, Aguas, Licores, etc.).
   - Tildar **Ventas**, **Punto de venta** y **Compras** según corresponda (para que aparezca en el buscador del POS, "Punto de venta" tiene que estar tildado).
3. Guardar.

> ⚠️ **Nota importante sobre el catálogo actual:** al día de este manual, la mayoría de los ~182 productos importados desde la planilla de precios **no tienen "Rastrear inventario" activado**. Eso significa que hoy el control de stock por camión solo funciona en los productos donde se activó manualmente ese casillero. Antes de depender del bloqueo de sobreventa (sección 10) para todo el catálogo, hay que revisar y activar el rastreo de inventario producto por producto (o en lote).

### 3.3 Cargar stock inicial de un producto

1. Abrir la ficha del producto.
2. Click en el número que aparece junto a **"Cantidad a la mano"** (o ir a **Inventario** → **Productos** → abrir el producto → botón **"A la mano"** en la barra superior).
3. **Nuevo** → elegir la ubicación (normalmente **WH/Stock**, el depósito central) → cargar la cantidad → **Guardar**.

---

## 4. Descuentos por cantidad (listas de precios)

El sistema permite configurar precios distintos según la cantidad comprada (ej: "a partir de 6 unidades, 10% de descuento" — para vender por caja más barato que por unidad suelta).

### 4.1 Habilitar listas de precios (ya no hace falta tocar nada)

Esto **ya viene activado solo**, en Reparto, en Camión 1 y en cualquier punto de venta que se cree de acá en adelante (Camión 2, 3, etc.). Se corrigió a nivel Odoo (módulo `pos_reparto_pricelist`) para que no haya que repetir el mismo ajuste manual en cada tienda nueva — antes había que ir a Ajustes y tildar "Listas de precios flexibles" tienda por tienda; ahora todo punto de venta nace con eso ya tildado y apuntando a la lista **Default**.

Si alguna vez lo ves destildado en una tienda puntual (alguien lo tocó a mano), se puede volver a activar en **Punto de venta** → **Configuración** → **Ajustes** → elegir la tienda arriba → sección **Precios** → tildar **"Listas de precios flexibles"**.

> **La lista de precios en sí (Default) es una sola y es compartida.** No hay una lista distinta por camión ni por Reparto: las reglas de descuento que cargues en la sección 4.2 aplican igual para venta de mostrador/oficina y para venta en cualquier camión, porque todos apuntan a la misma lista "Default". Cualquier regla nueva que agregues ahí se ve reflejada en todos los puntos de venta automáticamente, sin configuración adicional.

### 4.2 Crear una regla de descuento por cantidad

1. **Punto de venta** → **Configuración** → **Ajustes** → sección Precios → link **"Listas de precios"**.
2. Abrir la lista **Default**.
3. En la pestaña **Precios de venta** → **Agregar una línea**.
4. Completar:
   - **Aplicar a**: Producto (o Categoría, si querés que aplique a todos los productos de una categoría).
   - **Producto**: elegir el producto.
   - **Cantidad mínima**: por ejemplo `6` (una caja).
   - **Tipo de precio**: **Descuento**.
   - **Descuento**: el porcentaje, por ejemplo `10` (%).
5. **Guardar y cerrar**.

A partir de ese momento, cuando el vendedor cargue 6 unidades o más de ese producto en el POS, el precio unitario baja automáticamente ese porcentaje — sin que el vendedor tenga que hacer nada manual.

---

## 5. Inventario y carga de camiones

### 5.1 Concepto de ubicaciones

El sistema maneja el stock por **ubicación física**, no como un número único por producto. Las ubicaciones actuales son:

- **WH/Stock** — el depósito central.
- **WH/Stock/Camión 1** — el stock que físicamente está arriba del camión 1 (y así, un **Camión 2**, **Camión 3**, etc. si se suman más adelante).

El stock "disponible para vender" en cada punto de venta se calcula **según la ubicación de ese punto de venta**, no contra el total de la empresa. Por eso es fundamental transferir mercadería del depósito al camión antes de salir a repartir — si no se hace el traslado, el sistema entiende que el camión no tiene nada cargado.

### 5.2 Cómo cargar mercadería a un camión (traslado interno)

1. **Inventario** → **Información general** → tarjeta **"Traslados internos"** → botón **Abrir**.
2. **Nuevo**.
3. Completar:
   - **Tipo de operación**: *My Company: Traslados internos*.
   - **Ubicación de origen**: WH/Stock (queda así por defecto).
   - **Ubicación de destino**: buscar y elegir el camión, por ejemplo *WH/Stock/Camión 1*.
4. En la pestaña **Operaciones** → **Agregar un producto** → buscar el producto → cargar la **cantidad** a transferir.
5. Repetir para cada producto que se suba al camión ese día.
6. Botón **Validar** (arriba a la izquierda) para confirmar el traslado. El estado pasa de "Borrador" a "Hecho" y el stock se mueve de verdad: baja en WH/Stock y sube en Camión 1.

> **Rutina diaria recomendada:** antes de que el vendedor salga a repartir, un usuario de Depósito hace este traslado con lo que se carga esa mañana. Al final del día, si sobra mercadería en el camión, se puede hacer el traslado inverso (Camión 1 → WH/Stock) para que el stock quede prolijo.

### 5.3 Consultar cuánto stock hay en cada ubicación

Abrir la ficha del producto → botón **"A la mano"** (arriba) → se lista la cantidad por cada ubicación (WH/Stock, Camión 1, etc.), con acceso al **Historial** de movimientos de cada una.

### 5.4 Cómo dar de alta un camión nuevo (paso a paso completo)

Dar de alta un camión (Camión 2, Camión 3, etc.) implica crear **tres cosas encadenadas**: una ubicación de stock, un tipo de operación, y un punto de venta. Es tarea de un usuario Administrador — no es un uso diario. Estos son los pasos exactos, usando **Camión 1** como referencia real de cómo quedó armado (podés copiar los mismos valores cambiando "1" por "2"):

**Paso 1 — Crear la ubicación de stock del camión**

1. **Inventario** → **Configuración** → **Ubicaciones** → **Nuevo**.
2. Completar:
   - **Nombre de la ubicación**: `Camión 2`.
   - **Ubicación superior**: `WH/Stock` (así queda anidada como `WH/Stock/Camión 2`, al mismo nivel que Camión 1).
   - **Tipo de ubicación**: *Ubicación interna* (queda así por defecto).
3. Guardar.

**Paso 2 — Crear el tipo de operación (picking type) del camión**

1. **Inventario** → **Configuración** → **Tipos de operación** → **Nuevo**.
2. Completar (referencia real de Camión 1 entre paréntesis):
   - **Nombre**: `POS Camión 2 Orders` (Camión 1 usa *"POS Camión 1 Orders"*).
   - **Tipo de operación**: *Salida* / *outgoing* (Camión 1: `outgoing`).
   - **Almacén**: `My Company` (el mismo almacén que usan los demás).
   - **Código de secuencia**: algo corto y único, ej. `POSCAM2` (Camión 1 usa `POSCAM1`).
   - **Ubicación de origen predeterminada**: `WH/Stock/Camión 2` (la ubicación del Paso 1).
   - **Ubicación de destino predeterminada**: `Customers` (igual que Camión 1 — es la ubicación estándar de clientes, no cambia).
3. Guardar.

**Paso 3 — Crear el punto de venta y vincularlo a ese camión**

1. **Punto de venta** → **Configuración** → **Punto de venta** → **Nuevo** (o el botón **"+ Nueva tienda"** que aparece arriba en la pantalla de Ajustes).
2. Completar:
   - **Nombre**: `POS Camión 2`.
   - **Tipo de operación**: elegir el que creaste en el Paso 2 (`POS Camión 2 Orders`). **Este es el vínculo real entre el punto de venta y el camión** — a través de este campo, el sistema sabe que las ventas de este POS tienen que descontar stock de `WH/Stock/Camión 2`, y el módulo de bloqueo de sobreventa (sección 10) usa esta misma ubicación para calcular el disponible.
   - **Métodos de pago**: agregar los que corresponda (Card, Cash, Customer Account según necesites — revisar contra Camión 1 como referencia).
   - **Diario de POS** / **Diario de facturas**: dejar los que sugiere el sistema por defecto, salvo que Facturación te pida uno específico.
3. Guardar.
4. La lista de precios con descuentos por cantidad (sección 4) **ya viene activada sola** en este POS nuevo — no hay que tocar nada ahí, gracias a la corrección que se hizo a nivel Odoo.

**Paso 4 — Cargar mercadería inicial en el camión nuevo**

Hacer el traslado interno de WH/Stock → WH/Stock/Camión 2 como se explica en la sección 5.2, para que el camión salga con stock cargado desde el primer día.

**Paso 5 — Asignar un vendedor a ese punto de venta (si hace falta restringirlo)**

Por defecto, **cualquier usuario con el grupo "Punto de venta: Usuario" puede abrir sesión en cualquier POS**, incluido el nuevo Camión 2 — no hay una restricción automática de "este camión es solo para Fulano". En la práctica, alcanza con que cada vendedor use la tablet/usuario que tiene asignado, sin necesidad de bloquear nada a nivel sistema.

Si en algún momento hace falta un bloqueo **duro** (que un vendedor físicamente no pueda ni ver un camión que no es el suyo), hay dos caminos:

- **Camino simple (recomendado primero):** darle a ese vendedor únicamente el usuario y las credenciales de la tablet de su camión, sin acceso a las otras. Es control operativo, no técnico, pero es el que ya usa el negocio hoy.
- **Camino técnico:** instalar el módulo estándar de Odoo **`pos_hr`** ("Empleados en PdV"). Una vez instalado, en cada punto de venta aparece un casillero **"Iniciar sesión como empleado"** (Ajustes del POS → sección "Interfaz de PdV") — al activarlo, se puede elegir exactamente qué empleados pueden loguearse en ese punto de venta puntual. Este módulo no está instalado hoy en el sistema; es un paso adicional a pedir si el negocio necesita ese nivel de control.

Aparte de la apertura de sesión, el control real de "qué ve cada vendedor" ya está resuelto por el rol **Vendedor** (sección 11): sin importar en qué camión inicie sesión, solo va a poder ver y vender a los clientes que tiene asignados como "Vendedor" en su ficha de contacto.

---

## 6. Punto de Venta — conceptos generales

Hoy existen dos configuraciones de Punto de Venta, pensadas para dos situaciones de venta distintas:

| | **Punto de Venta Reparto** | **POS Camión 1** |
|---|---|---|
| Uso | Venta con entrega diferida (se cobra hoy, se entrega otro día) o venta de mostrador/oficina | Venta ambulante desde el camión, cobro y entrega inmediata |
| Ubicación de stock que controla | WH/Stock (depósito central) | WH/Stock/Camión 1 |
| Permite "Enviar más tarde" (Ship Later) | Sí | No |

Para abrir cualquiera de los dos: **Punto de venta** → tablero de tiendas → botón **"Seguir vendiendo"** (si ya hay una sesión abierta) o **"Nueva sesión"** (si está cerrado).

---

## 7. Venta desde mostrador / oficina (Punto de Venta Reparto)

1. **Punto de venta** → tarjeta **Punto de Venta Reparto** → **Seguir vendiendo** / **Nueva sesión**.
2. (Opcional) Click en **"Consumidor Final Anónimo"** abajo a la izquierda para asociar la venta a un cliente puntual — buscar por nombre.
3. Click en los productos para agregarlos al carrito. Para cambiar la cantidad de una línea: click en la línea del carrito para seleccionarla → click en **"Cant."** en el teclado numérico → tipear la cantidad.
4. Si la venta es con **entrega diferida**: click en los tres puntos (⋮) junto al cliente → **"Ship Later"** → elegir fecha de entrega. Esto deja pendiente un remito de entrega en Inventario para el día indicado, y no descuenta stock hasta que se valide esa entrega.
5. Click en **Pago**.
6. Elegir el medio de pago (Efectivo, Tarjeta, Cuenta Corriente del cliente, etc.) y confirmar el monto.
7. Click en **Validar**. Se genera el ticket y, si corresponde, la factura.

---

## 8. Venta desde el camión (POS Camión 1)

Este es el flujo que usa el vendedor en la tablet, comercio por comercio.

1. **Punto de venta** → tarjeta **POS Camión 1** → **Seguir vendiendo**.
2. Click en el nombre del cliente (o "Consumidor Final Anónimo") abajo a la izquierda → buscar y seleccionar el comercio.
   - **Si el cliente tiene deuda vencida**, aparece automáticamente un aviso: *"¡Cliente con deuda vencida! Debe $X desde hace N días."* Este aviso es solo informativo — **no impide** continuar la venta. Ver sección 9 para el detalle del semáforo de colores.
3. Agregar los productos que pide el comercio, tocando cada uno en la grilla. Si el comercio compra una cantidad grande de un producto con descuento por caja configurado (sección 4), el precio se ajusta solo.
4. Click en **Pago** → elegir medio de pago → **Validar**.
   - Si se pidió **más cantidad de la que hay físicamente en el camión**, el sistema **bloquea la venta** con un mensaje del tipo: *"Stock insuficiente: [producto]: pediste X, hay Y disponibles en WH/Stock/Camión 1"*. Hay que corregir la cantidad (o avisar que no hay más de ese producto) antes de poder cobrar. Ver sección 10.
5. El ticket se imprime/genera. Si el vendedor pierde señal en el medio de la venta, ver sección 14.

---

## 9. Alertas de crédito y pantalla de Deudores

### 9.1 Aviso automático al vender

Al seleccionar en el POS (Reparto o Camión) un cliente que tiene facturas vencidas sin cobrar, aparece automáticamente un cartel con:

- El monto total adeudado.
- Los días transcurridos desde la fecha de referencia (el pedido más viejo sin cobrar, o el último pago si hubo alguno).

El color de fondo funciona como semáforo:
- 🟠 **Naranja**: 10 días o más sin pagar.
- 🔴 **Rojo**: 15 días o más sin pagar (ese es el límite de crédito máximo del negocio).

Este aviso **no bloquea la venta** — es información para que el vendedor decida (cobrar en efectivo, avisar al comercio, etc.).

### 9.2 Pantalla de Deudores

**Punto de venta** → menú **Clientes** → **Deudores** (o el nombre equivalente en el menú, dependiendo de permisos). Muestra la lista completa de clientes con deuda mayor a $0, ordenada por días sin pago (los más urgentes primero), con el mismo semáforo de colores.

- Un **Vendedor** solo ve en esta pantalla a **sus propios clientes**.
- **Depósito**, **Administración Operativa** y **Administración Privada/Gerencia** ven a **todos** los deudores.

---

## 10. Control de stock por camión

El sistema bloquea automáticamente cualquier venta en un camión que pida más unidades de un producto que las que hay cargadas físicamente en ese camión (según los traslados hechos, sección 5).

- Se valida **al momento de cobrar** (botón Validar en la pantalla de pago), no mientras se arma el carrito. Es una limitación conocida y aceptada: el vendedor puede armar el pedido tranquilo y recién al cobrar se entera si falta stock.
- El mensaje de error indica exactamente qué producto, cuánto se pidió y cuánto hay disponible.
- **Depende de que el producto tenga "Rastrear inventario" activado** (sección 3.2). Si no lo tiene, el sistema no tiene forma de saber cuánto hay y **no bloquea nada**, sin importar la cantidad pedida.
- Aplica únicamente en puntos de venta cuya ubicación de origen sea un camión (no aplica, por ejemplo, en Punto de Venta Reparto si su origen es el depósito central, salvo que también se quede sin stock ahí).

---

## 11. Roles y permisos de usuario

El sistema tiene 4 roles de seguridad, agrupados bajo la categoría **"Reparto"** (se asignan al usuario desde **Ajustes → Usuarios y compañías → Usuarios**, pestaña de permisos):

| Rol | Puede ver clientes | Puede ver pedidos POS | Notas |
|---|---|---|---|
| **Vendedor** | Solo los propios (según el campo "Vendedor" del cliente) | Solo los propios | No puede crear ni borrar clientes. No puede borrar pedidos. |
| **Depósito** | Todos | Todos | Sin restricciones propias todavía (se ajustará si el detalle operativo lo requiere) |
| **Administración Operativa** | Todos | Todos | ídem |
| **Administración Privada / Gerencia** | Todos | Todos | ídem |

Los 4 roles son **mutuamente excluyentes** entre sí (un usuario tiene uno solo), pero se combinan con los grupos estándar de Odoo (por ejemplo, además hay que darle al vendedor el grupo "Point of Sale User" para que pueda abrir el POS).

**Alta de un usuario nuevo (vendedor, depósito, etc.):**

1. **Ajustes** → **Usuarios y compañías** → **Usuarios** → **Nuevo**.
2. Cargar nombre, email de acceso, contraseña inicial.
3. En la pestaña de permisos, asignarle el rol de **Reparto** que corresponda (Vendedor / Depósito / Administración Operativa / Administración Privada) y el o los grupos estándar de la app que va a usar (por ejemplo, *Point of Sale: User*).
4. Si es vendedor, no te olvides de ir a los clientes que le correspondan y asignarle el campo **Vendedor** (sección 2.2) — si no, no va a ver ningún cliente.

---

## 12. Facturación

- Hoy el sistema emite **factura local de Odoo sin timbrar** (Factura A, B o C interna) — no está conectado a los webservices de ARCA/AFIP todavía.
- El vendedor elige facturar o no cada venta, caso por caso, desde la propia pantalla de cobro del POS (opción "Recibo/Factura").
- Para poder facturar a un cliente, es obligatorio que tenga cargado el **Tipo de responsabilidad de ARCA** (sección 2.1) — si falta, el sistema avisa "Falta la configuración del contacto" y no deja continuar hasta completarlo.
- La conexión real con ARCA (para que las facturas sean válidas fiscalmente) es un desarrollo pendiente: requiere CUIT real, certificado digital y punto de venta habilitado en ARCA.

---

## 13. Cierre de caja (sesión de POS)

Al terminar el turno o el día:

1. Dentro del POS, click en el ícono de menú (☰, arriba a la derecha) → **Cerrar sesión de PdV** (o "Cerrar sesión" según la versión).
2. El sistema muestra un resumen: total vendido, desglose por medio de pago, efectivo esperado vs. efectivo contado.
3. Contar el efectivo físico y cargarlo si hay diferencia.
4. Confirmar el cierre.

Una vez cerrada la sesión, para volver a vender hay que abrir una **sesión nueva** desde el tablero de Punto de venta.

---

## 14. Funcionamiento sin conexión (offline)

El POS de Odoo está diseñado para seguir funcionando aunque se corte la conexión a internet/servidor en el medio de una venta (típico en reparto, dentro de un camión sin buena señal):

- Se puede seguir cargando productos y **cobrar** una venta sin conexión — el sistema guarda todo localmente en el navegador/tablet y muestra un aviso de "Conexión perdida" pero no impide cerrar la venta.
- **Importante:** al recuperar señal, la venta **no se sincroniza sola automáticamente** con el servidor. Hasta que no se **recargue o se vuelva a entrar a la sesión de POS**, esa venta existe solo en el dispositivo (no se ve stock actualizado ni la ve nadie más), aunque el ticket ya se haya cobrado e impreso.
- **Recomendación de uso:** si el vendedor perdió señal en un comercio, al llegar al siguiente (con señal) conviene **refrescar la pantalla** antes de arrancar el próximo pedido, para asegurar que lo anterior sincronizó.
- No hay riesgo de perder la venta ni la plata cobrada — el dato queda guardado en el dispositivo hasta que sincronice.

---

## 15. Preguntas frecuentes y limitaciones conocidas

**¿Por qué un producto no se descuenta del stock cuando lo vendo?**
Porque no tiene activado "Rastrear inventario" (sección 3.2). Revisar la ficha del producto.

**¿Por qué el sistema no me bloqueó una venta que superaba el stock del camión?**
Revisar que: (1) el producto tenga "Rastrear inventario" activado, y (2) se haya hecho el traslado de stock al camión correspondiente (sección 5.2). Sin esos dos pasos, no hay nada contra qué comparar.

**El aviso de deuda vencida, ¿me impide cobrar?**
No. Es solo informativo. La venta se puede completar igual.

**¿Puedo ver los clientes de otro vendedor?**
No, si tu usuario tiene el rol Vendedor. Solo ves los que tenés asignados como "Vendedor" en la ficha del cliente. Los roles de Depósito y Administración sí ven todos los clientes.

**¿El criterio de "2 visitas consecutivas sin cobro" del relevamiento está implementado?**
No todavía — hoy el sistema solo evalúa días sin pago. Ese criterio requiere trackear visitas independientemente de si generaron deuda, que es una funcionalidad pendiente de desarrollo.

**¿Cómo agrego un camión nuevo (Camión 2, 3, etc.)?**
Es un patrón repetible: crear la ubicación de stock, el tipo de operación de picking y la configuración de Punto de Venta correspondiente. Pedirle esto al equipo de desarrollo — no es una tarea de uso diario.

---

*Documento vivo — actualizar cada vez que se sume o cambie una funcionalidad relevante.*
