# Pedidos agrupados por camión, día de visita por cliente y hoja de ruta

Fecha: 2026-11-17. Estado: diseño acordado con el cliente. Implementado (rama `feat/pedidos-por-camion`, sin commit ni deploy): día de visita, camiones, autorización, feriados y hoja de ruta.

## 1. Qué se pide

- "Mis pedidos" deja de ser una lista plana. El vendedor ve 5 renglones, uno por camión: "Camión martes Nico", "Camión miércoles Nico", "Camión jueves Nico", "Camión viernes Nico", "Camión sábado Nico". Al tocar un renglón se abren sus ventas.
- Gerencia, administración y depósito ven un renglón por vendedor. Al tocarlo aparecen sus 5 camiones, y al tocar un camión sus pedidos. Si se suma un vendedor, aparece solo.
- Cada cliente tiene un día de visita fijo. El camión sale de ese día.
- Los feriados se resuelven con un cambio masivo que dura una sola semana.
- Nueva sección "Hoja de ruta" para el vendedor: clientes que le toca visitar hoy.

## 2. Regla de camión

El camión depende del **día de visita del cliente**, no del día en que se carga el pedido.

| Día de visita | Camión |
|---|---|
| Lunes | Miércoles |
| Martes | Jueves |
| Miércoles | Viernes |
| Jueves | Sábado |
| Viernes | Martes de la semana siguiente |

- Si el vendedor carga el pedido otro día (se olvidó), se respeta el día del cliente.
- El pedido guarda `fecha_entrega` calculada al crearlo. Así se puede mover a mano y una regla futura no mueve pedidos viejos.
- Sábado y domingo los vendedores no entran. Si gerencia o administración cargan un pedido esos días y el cliente no tiene día, va al camión del martes.
- Cliente sin día asignado: se usa el día en que se carga el pedido (misma tabla) y se avisa que falta asignarle día.
- "Camión" es solo el día de entrega. No tiene relación con Camión 1/2/3 de caja.

## 3. Avisos

- **Al cargar un pedido:** si hoy no es el día del cliente, aviso antes de confirmar. Ejemplo: "Este cliente es de los lunes. El pedido va al camión del miércoles 19/11." Sirve para detectar errores de carga sin bloquear.
- **Feriado:** si la fecha de entrega cae en feriado, aviso "El <fecha> es feriado, tené cuidado". No bloquea.
- **Detalle del pedido:** se muestra el camión y la fecha de entrega, con opción de cambiarla a mano (vendedor, gerencia y administración).
- **Cliente sin día:** aviso al cargar el pedido.

## 4. Pantalla de pedidos

- Navegador de semana con ← →, "Hoy", y la semana en curso por defecto. La semana es la de entrega, de martes a sábado. El pedido del viernes aparece en el camión martes de la semana siguiente.
- Cada renglón de camión muestra: cantidad de pedidos, total en $ y cuántos faltan entregar.
- Se mantienen la búsqueda por cliente o número y el filtro por estado.
- Lo cargado sin señal sigue apareciendo arriba, igual que hoy.
- Pedidos de semanas anteriores se consultan con el navegador de semana, así la lista no se acumula.

## 5. Feriados: cambio masivo

- Pantalla para gerencia y administración: elegir vendedor (o todos), día original y día nuevo. Ejemplo: "lunes 24/11 → martes 25/11".
- Efecto: esa semana los clientes del lunes se tratan como del martes (camión jueves). La semana siguiente vuelven solos a su día fijo.
- Se guarda como excepción por semana (vendedor, fecha original, fecha nueva). Se puede ver y cancelar mientras está vigente.
- Lista de feriados nacionales de Argentina en una tabla editable, para avisar. Gerencia puede agregar feriados puntuales.

## 6. Día de visita por cliente

- Campo nuevo en la ficha del cliente: día de visita (lunes a viernes).
- Carga inicial de los 776 clientes: importación de una planilla "cliente → día" si el dueño la tiene. Si no, carga a mano en la ficha.

## 7. Hoja de ruta (sección nueva)

- Lista de clientes del día del vendedor, según su día de visita y teniendo en cuenta las excepciones por feriado.
- Al tocar un cliente se abre el mismo flujo de pedido que hoy, con la deuda y el estado de cuenta visibles igual que en pedidos normales.
- Marca visual de los clientes ya visitados o con pedido cargado hoy.

## 8. Pendiente de definir con el cliente

- Si tiene planilla de clientes con su día.
- Qué es "faltan entregar" exactamente: estados distintos de entregado, anulado y rechazado.
- Si la hoja de ruta debe mostrar también un orden de recorrido o solo la lista.

## 9. Autorización antes de depósito (acordado, implementado)

- Todo pedido cargado por un **vendedor** queda "por autorizar". Administración o Gerencia lo autorizan y recién ahí pasa a depósito.
- Lo que cargan Administración o Gerencia entra ya autorizado.
- En cada camión, Administración y Gerencia ven "N por autorizar" y un botón **Autorizar todos** (también se autoriza o anula de a uno desde el detalle). Al autorizar se ve si el cliente debe.
- **Depósito** solo ve lo autorizado (también en la base) y su pantalla es vendedor → 5 camiones → pedidos, el más viejo primero (por orden de autorización). No muestra plata.
- La pestaña **Depósito** se saca de Administración. Gerencia la conserva.
- Los pedidos que ya estaban en depósito antes del cambio no se tocan.

## 10. Orden de trabajo propuesto

1. Día de visita en el cliente y campo `fecha_entrega` en el pedido, con migración de pedidos existentes.
2. Pantalla de pedidos agrupada por camión, con navegador de semana y los avisos.
3. Cambio masivo por feriados y tabla de feriados.
4. Hoja de ruta.
5. Actualizar el manual de usuario junto con cada paso.

## 11. Cómo quedó lo de feriados y hoja de ruta (implementado)

- **Feriados:** tabla editable (`feriados`). Vienen cargados los que quedan de 2026 (23/11 trasladado, 7/12 puente, 8/12, 25/12); los de 2027 se cargan desde la app cuando se decreten. Avisan en el pedido, en el cambio manual de camión y en la fila del camión ("⚠ Feriado: …"). No bloquean.
- **Cambio de ruta por feriado:** pantalla "Feriados y cambios de ruta" (botón en Pedidos, solo Administración y Gerencia). Se elige vendedor (o todos), la visita que no se hace y el día al que pasa. Los clientes de ese día se visitan el día nuevo y sus pedidos van al camión que corresponde a ese día. A la semana siguiente vuelve solo. Se puede cancelar. El cambio de un vendedor gana sobre el general.
- Un cambio de ruta no mueve pedidos ya cargados: afecta a los que se carguen después. Los ya cargados se mueven a mano con "Cambiar camión".
- **Hoja de ruta (vendedor):** pestaña nueva. Clientes del día (con el cambio por feriado aplicado), ordenados por localidad, con su deuda y la marca "Pedido cargado". Flechas para otros días (salta fines de semana). Tocar el cliente abre su ficha (deuda, cobro, pedido habitual); el botón "Pedido" va directo al catálogo con el cliente elegido. Avisa si hay clientes sin día asignado.
- Aún falta cargar el día de visita de los 776 clientes (planilla del dueño).

## 12. Tres cajas, costos, profit y calculadora de precio (implementado, sin desplegar)

- **Tres cajas:** Efectivo, Transferencia y Cheques. Cada una con sus cuadros (tendría que haber, entró hoy, salió hoy, afuera que tiene que volver), su propio "Contar caja" y su última vez contada. Entradas y salidas se cargan en la caja que se elija; la lista de movimientos es una sola, con la caja marcada y filtro por caja. Los movimientos que ya existían quedan en Efectivo.
- **Cobros por medio:** efectivo (si cobra administración entra a la caja; si cobra un vendedor lo entrega), **transferencia entra sola** a su caja y **cheque entra solo** a la caja de cheques, con **número, banco y fecha de cobro obligatorios** (también al cargar a mano un movimiento de cheques o al pasar un cheque entre cajas).
- **Pasar entre cajas:** depositar efectivo en el banco, cobrar un cheque, etc. Se registra como dos ajustes y **no cuenta como gasto ni como ingreso**.
- Lo que vuelve de una salida (préstamo) entra a la caja del medio con que vuelve (efectivo o transferencia).
- **Costo:** campo en Artículos (Administración y Gerencia). Se guarda en tablas aparte que solo leen Administración y Gerencia (los vendedores no lo ven ni por la API) y cada línea de pedido guarda el costo con que se vendió. Los productos que ya existían quedan "Sin costo": se cargan con el campo o con la calculadora.
- **Precio de venta en Artículos (rediseñado):** el artículo tiene tres rectángulos, **Costo**, **Ganancia %** y **Precio final**. Con costo y ganancia el precio final se calcula solo (costo × (1 + ganancia), redondeado al peso, ej.: costo 100 y 10% = 110); también se puede escribir el **precio final a mano**, y entonces la ganancia se recalcula como dato. Si el costo y la ganancia **sobrescriben un precio que el artículo ya tenía**, se muestra un warning en el momento y se pide confirmar al guardar ("¿Sobrescribir el precio final?"). Si se cambia solo el costo con la ganancia cargada, se mantiene la ganancia y se recalcula el precio (con el mismo aviso). Reemplaza al popup de la calculadora. La lista muestra el costo y cuánto se gana, o "Sin costo".
- **Profit (solo Gerencia, mes en curso):** cuadro en Inicio y en Resumen del mes.
  - Ganancia = lo **cobrado del mes valuado con el precio y el costo de la venta original**. Un cobro llega después de la venta y los precios pueden haber cambiado: si el cliente pagó una Coca que compró a 100, cuenta con ese 100 aunque hoy valga 120 (y con el costo de ese momento). Para eso **cada cobro paga primero las ventas más viejas del cliente** y gana lo que se ganó en ellas. Cambiar un precio o un costo después **no modifica** pedidos, deudas ni ganancias ya cargadas.
  - Una deuda anterior al sistema se paga primero y no tiene costo conocido; lo cobrado de ventas sin costo, o los adelantos, no suman ganancia y el resumen lo informa aparte.
  - El cálculo está en la base (`ganancia_cobrada`, solo Gerencia) porque necesita todo el historial; la demo usa la misma cuenta en la app.
  - Se resta: gastos (salidas de las 3 cajas que no vuelven) y comisiones.
  - **No** se restan: pagos a proveedores (esa mercadería ya está en el costo), retiros del dueño, **inversiones**, plata que vuelve (préstamos) ni pases entre cajas.
  - **Inversiones:** al retirar plata de cualquiera de las 3 cajas (efectivo, transferencia o cheques) hay un concepto "Inversiones". No cuenta como gasto ni afecta el profit, y en el Resumen del mes se muestra aparte (no entra en "Gastos"). La salida avisa al cargarla: "no cuenta como gasto, no afecta el profit".
  - Avisa cuántos productos activos siguen sin costo.

## 13. Precio manual del vendedor con aprobación (implementado)

- El vendedor puede cambiar el **precio unitario** de una línea al cargar el pedido (el descuento sigue automático y solo lo cambian Administración y Gerencia). Vale **solo para ese pedido**: el catálogo no se toca.
- Si el precio difiere del de lista, la línea queda **pendiente**: el pedido muestra "⚠ Precio cambiado" y no se puede autorizar. Poner el mismo precio de lista no cuenta como cambio.
- En el pedido, Administración y Gerencia ven un recuadro rojo: lista → precio que puso el vendedor (con %), quién y cuándo. Por línea: **Aprobar**, **Volver a lista** o **Corregir precio** (un tercer precio). También "Aprobar todos los cambios" y "Ver historial".
- **Autorizar** queda deshabilitado mientras haya pendientes y la base también lo valida (`cambiar_estado`: "Resolvé los cambios de precio antes de autorizar el pedido"). **Autorizar todos** del camión salta esos pedidos y avisa cuántos quedaron.
- Si el precio final queda **por debajo del costo**, la fila se marca en rojo (el costo solo lo trae la base a Administración y Gerencia).
- Lo que cargan Administración o Gerencia con precio manual no pasa por aprobación.
- El historial vive en `pedido_linea_precio_log` (solo lo leen Administración y Gerencia). El vendedor ve "precio a confirmar" mientras está pendiente.

## 14. Descuento por cantidad opcional (implementado)

- El descuento por cantidad (10+ → 4%, etc.) **ya no se aplica solo**. Se tilda en un casillero "Aplicar descuento por cantidad" (en el producto y en "Revisar pedido"). Sin tildar, la cantidad se cobra a precio normal. Vale para todos los roles. Un solo tilde por producto: aplica el tramo que corresponde a la cantidad.
- Si lo tilda un **vendedor**, queda pendiente igual que un cambio de precio: el pedido muestra "⚠ Descuento aplicado" y no se puede autorizar hasta que Administración o Gerencia lo **aprueben** o lo **quiten** (la línea vuelve a precio normal). Queda en el historial (quién, cuándo). Lo que tilda Administración o Gerencia se aplica directo.
- "Autorizar todos" también deja afuera los pedidos con descuento pendiente. Los pedidos sin conexión viejos, cargados antes del cambio, entran sin descuento.

## 15. Descuento sobre el total del pedido (implementado)

- En "Revisar pedido" hay un campo opcional **Descuento sobre el total**, en % o en $ (se convierte a monto). Lo pueden usar todos los roles que toman pedidos. No puede ser negativo ni igual o mayor al total.
- Si lo hace un **vendedor**, queda pendiente igual que los otros cambios: el recuadro de Administración muestra "Piniya aplicó $X (Y% de $Z)" con **Aprobar descuento**, **Quitar descuento** y **Corregir monto**, más historial. Hasta resolverlo no se puede autorizar y "Autorizar todos" salta el pedido. Lo que carga Administración o Gerencia se aplica directo.
- El total del pedido es la suma de las líneas menos este descuento (`pedidos.descuento_total`). Si después se corrige un precio o un descuento de línea, el descuento sobre el total se mantiene (hasta el tope de la suma).
- **Ganancia:** el descuento se reparte entre las líneas en proporción a lo que valen, así que baja la ganancia (10 × $100 con costo $60 y $100 de descuento: se cobran $900 y se ganan $300, no $400).
- Aparece en el detalle del pedido y en el remito como "Descuento sobre el total".
