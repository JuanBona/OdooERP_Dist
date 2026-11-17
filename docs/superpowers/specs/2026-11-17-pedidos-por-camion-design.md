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
