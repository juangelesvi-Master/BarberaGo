# BeatyNails · página web

Página del salón de uñas BeatyNails con reservas en línea y tienda de productos. Es un solo archivo
(`index.html`) sin dependencias: ábrelo en el navegador o súbelo tal cual a cualquier hosting estático
(Hostinger, Netlify, Vercel).

## Qué incluye

- **Servicios y precios** (MXN) con duración de cada cita.
- **Reservas:** eliges servicio, manicurista (o "Cualquiera"), día y hora. Los horarios ocupados salen
  tachados, los domingos está cerrado y la cita se puede cancelar desde "Mis próximas citas".
- **Tienda:** productos con foto, filtro por categoría, carrito con cantidades, recoger en el salón
  o envío a domicilio (gratis desde $800) y confirmación del pedido.
- **Contacto y horario.**

## Cómo editarla

Todo el contenido está al inicio del `<script>` en `index.html`:

- `SERVICES`: servicios, precio y minutos.
- `STAFF`: nombres de las manicuristas.
- `OPEN`: horario por día de la semana (0 = domingo).
- `PRODUCTS`: productos de la tienda. Las fotos actuales son ilustraciones de ejemplo; para usar fotos
  reales, pon el archivo en `img/` y cambia `p.img` por su ruta (por ejemplo `img/esmalte-rojo.jpg`).

## Limitación actual

Las reservas y pedidos se guardan solo en el navegador de quien los hace (`localStorage`), así que el
salón todavía no los recibe. El siguiente paso es guardarlos en una base de datos (por ejemplo el
Supabase que ya usa BarberaGo) y cobrar en línea.
