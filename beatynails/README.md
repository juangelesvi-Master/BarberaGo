# BeatyNails · página web

Página del salón de uñas BeatyNails con reservas en línea y tienda de productos, más un panel para
el salón. Son tres archivos sin dependencias: ábrelos en el navegador o súbelos tal cual a cualquier
hosting estático (Hostinger, Netlify, Vercel).

- `index.html`: la página para clientas.
- `admin.html`: el panel del salón (enlace "Panel del salón" al pie de la página).
- `datos.js`: datos y funciones que comparten las dos páginas.
- `ticket.js`: tickets para impresora térmica (lo usa el panel).
- `impresora/puente-impresora.js`: puente para imprimir en impresoras de red (IP).

## Qué incluye

- **Servicios y precios** (MXN) con duración de cada cita.
- **Reservas:** eliges servicio, manicurista (o "Cualquiera"), día y hora. Los horarios ocupados salen
  tachados, los domingos está cerrado y la cita se puede cancelar desde "Mis próximas citas".
- **Tienda:** productos con foto, filtro por categoría, carrito con cantidades, recoger en el salón
  o envío a domicilio (gratis desde $800) y confirmación del pedido.
- **Contacto y horario.**

## Panel del salón (`admin.html`)

- **Resumen:** ingresos de servicios y tienda, citas atendidas, ventas, citas por venir, gráfica de
  ingresos de los últimos 14 días, agenda de hoy, pedidos por atender, más vendidos e inventario bajo.
- **Venta de mostrador:** cobra servicios, productos u otros conceptos en el salón, con descuento
  ($ o %), pago en efectivo (con cambio), tarjeta o transferencia. Descuenta inventario, marca la cita
  como cobrada si vienes de "Cobrar" en la agenda, imprime el ticket y muestra la caja del día con
  su corte de caja por forma de pago. Cancelar una venta en **Ventas** regresa el inventario.
- **Citas:** filtros por día, manicurista y estado; cambiar hora, día, servicio o manicurista
  (sin encimar citas), marcar atendida / no asistió / cancelada, agregar o eliminar citas.
- **Ventas:** ventas de mostrador y pedidos de la tienda en línea, con su estado.
- **Productos:** agregar, editar, ocultar o eliminar productos, subir foto e inventario. La tienda
  marca "Agotado" y descuenta piezas en cada pedido.
- **Horario y servicios:** horario por día, cada cuánto hay cita, manicuristas, servicios y precios,
  y costo de envío. Los cambios se ven al momento en la página.

- **Impresora:** tickets de citas y pedidos (botón "Ticket") en impresoras térmicas de 58 u 80 mm,
  con vista previa, prueba de impresión, nombre, dirección y mensaje al pie.

## Imprimir tickets

En el panel, sección **Impresora**, elige cómo está conectada:

- **Bluetooth:** abre el panel en Chrome o Edge (Android, Windows o Mac), toca "Buscar impresora
  Bluetooth" y elige la impresora. Funciona con impresoras térmicas Bluetooth LE que usan ESC/POS
  (la mayoría de las portátiles de 58 mm). En iPhone no funciona porque Safari no tiene Bluetooth web.
- **Red (IP):** el navegador no puede hablar directo con el puerto 9100 de la impresora, así que hace
  falta el puente. En una computadora del salón conectada a la misma red, instala Node.js y corre:

  ```bash
  node impresora/puente-impresora.js
  ```

  Deja la ventana abierta. En el panel escribe la IP de la impresora (por ejemplo `192.168.1.50`) y
  el puerto (normalmente `9100`). El panel debe abrirse en esa misma computadora.
- **Impresora del equipo:** usa el diálogo de impresión del navegador con cualquier impresora ya
  instalada en Windows, Mac o Android.

Usa "Imprimir prueba" para revisar que salgan bien los acentos y la ñ (página de códigos 850).

El panel arranca con citas y pedidos de ejemplo para que se vea lleno; se borran con el botón
"Borrar datos de ejemplo".

## Cómo editarla

Servicios, manicuristas, horario y productos se cambian desde el panel. Los valores iniciales están en
`DEFAULTS` dentro de `datos.js`. Las fotos de producto son ilustraciones hasta que subas una foto real
desde el panel.

## Limitación actual

Todo (reservas, pedidos, productos y horario) se guarda solo en el navegador donde se usa
(`localStorage`): el panel ve lo que se hizo en ese mismo navegador, pero no las reservas de las clientas
desde sus teléfonos, y el panel no tiene contraseña. El siguiente paso es guardarlos en una base de datos (por ejemplo el
Supabase que ya usa BarberaGo) y cobrar en línea.
