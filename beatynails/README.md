# BeatyNails · página web

Página del salón de uñas BeatyNails con reservas en línea y tienda de productos, más un panel para
el salón. Son tres archivos sin dependencias: ábrelos en el navegador o súbelos tal cual a cualquier
hosting estático (Hostinger, Netlify, Vercel).

- `index.html`: la página para clientas.
- `admin.html`: el panel del salón (enlace "Panel del salón" al pie de la página).
- `datos.js`: datos y funciones que comparten las dos páginas.

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
- **Citas:** filtros por día, manicurista y estado; cambiar hora, día, servicio o manicurista
  (sin encimar citas), marcar atendida / no asistió / cancelada, agregar o eliminar citas.
- **Ventas:** pedidos de la tienda con su estado (nuevo, listo, entregado, cancelado).
- **Productos:** agregar, editar, ocultar o eliminar productos, subir foto e inventario. La tienda
  marca "Agotado" y descuenta piezas en cada pedido.
- **Horario y servicios:** horario por día, cada cuánto hay cita, manicuristas, servicios y precios,
  y costo de envío. Los cambios se ven al momento en la página.

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
