# BeatyNails · página web

Página del salón de uñas BeatyNails con reservas en línea y tienda de productos, más un panel para
el salón. Son tres archivos sin dependencias: ábrelos en el navegador o súbelos tal cual a cualquier
hosting estático (Hostinger, Netlify, Vercel).

- `index.html`: la página para clientas.
- `admin.html`: el panel del salón (enlace "Panel del salón" al pie de la página).
- `entrar.html` y `auth.js`: pantalla de entrada al panel con usuario y contraseña.
- `datos.js`: datos y funciones que comparten las dos páginas.
- `ticket.js`: tickets para impresora térmica (lo usa el panel).
- `pagos.js`: cobro en línea con Mercado Pago y Stripe (lo usan las dos páginas).
- `../supabase/functions/beatynails-pagos/`: función de servidor que guarda las llaves secretas y
  habla con Mercado Pago y Stripe.
- `impresora/puente-impresora.js`: puente para imprimir en impresoras de red (IP).

## Qué incluye

- **Servicios y precios** (MXN) con duración de cada cita.
- **Reservas:** eliges servicio, manicurista (o "Cualquiera"), día y hora. Los horarios ocupados salen
  tachados, los domingos está cerrado y la cita se puede cancelar desde "Mis próximas citas".
- **Tienda:** productos con foto, filtro por categoría, carrito con cantidades, recoger en el salón
  o envío a domicilio (gratis desde $800) y confirmación del pedido.
- **Pago en línea:** al reservar, la clienta elige pagar completo, dejar un anticipo (50% o el
  porcentaje que pongas) o pagar en el salón; en la tienda, pagar en línea o al recoger o recibir.
  Se cobra con Mercado Pago o Stripe, según lo que actives en el panel.
- **Contacto y horario.**

## Panel del salón (`admin.html`)

Para abrir el panel hay que entrar con usuario y contraseña (`entrar.html`). La primera vez que se abre
en un navegador se crea el acceso y se muestra un **código de recuperación** para poner una contraseña
nueva si se olvida. La contraseña se guarda cifrada (PBKDF2), nunca tal cual; tras 5 intentos fallidos
hay que esperar 30 segundos. En **Cuenta** se cambia la contraseña y se cierra la sesión.

- **Resumen:** ingresos de servicios y tienda, citas atendidas, ventas, citas por venir, gráfica de
  ingresos de los últimos 14 días, agenda de hoy, pedidos por atender, más vendidos e inventario bajo.
- **Venta de mostrador:** cobra servicios, productos u otros conceptos en el salón, con descuento
  ($ o %), pago en efectivo (con cambio), tarjeta o transferencia. Descuenta inventario, marca la cita
  como cobrada si vienes de "Cobrar" en la agenda, imprime el ticket y muestra la caja del día con
  su corte de caja por forma de pago. Cancelar una venta en **Ventas** regresa el inventario.
- **Citas:** agenda del día con una columna por manicurista (horas, ocupación y total de cada una;
  tocar un espacio libre agenda ahí y tocar una cita muestra sus opciones) y lista separada por
  manicurista (hoy, próximas o historial). Cambiar hora, día, servicio o manicurista (sin encimar
  citas), marcar atendida / no asistió / cancelada, cobrar, agregar o eliminar citas.
- **Ventas:** ventas de mostrador y pedidos de la tienda en línea, con su estado.
- **Productos:** agregar, editar, ocultar o eliminar productos, subir foto e inventario. La tienda
  marca "Agotado" y descuenta piezas en cada pedido.
- **Horario y servicios:** horario por día, cada cuánto hay cita, manicuristas, servicios y precios,
  y costo de envío. Los cambios se ven al momento en la página.

- **Pagos en línea:** qué formas de pago ven tus clientas (completo, anticipo y su porcentaje, en
  sucursal; y en la tienda en línea o al recoger), con qué proveedor se cobra, modo de prueba y la
  conexión con la función de pagos. Citas y Ventas muestran si se pagó en línea, el anticipo y si el
  monto pagado no coincide. Al cobrar en mostrador una cita con anticipo, el anticipo se descuenta solo.

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

## Cobrar en línea (Mercado Pago y Stripe)

El panel arranca en **modo de prueba**: el pago se simula en la página y no se cobra nada. Para cobrar
de verdad:

1. Saca tus llaves: el **Access Token** de Mercado Pago (Tus integraciones → Credenciales) y la
   **llave secreta** de Stripe (Desarrolladores → Llaves de API). Para probar usa las de prueba
   (`TEST-…` y `sk_test_…`); solo necesitas las del proveedor que vayas a usar.
2. Guárdalas como secretos en Supabase (nunca en la página):

   ```bash
   supabase secrets set BN_MP_ACCESS_TOKEN=APP_USR-... BN_STRIPE_SECRET_KEY=sk_live_... \
     BN_ORIGENES=https://tu-dominio.com BN_MONEDA=MXN
   ```

   `BN_ORIGENES` son los dominios donde está publicada la página, separados por coma. El cliente solo
   puede regresar a esos dominios después de pagar.
3. Publica la función: `supabase functions deploy beatynails-pagos --no-verify-jwt`
4. En el panel, **Pagos en línea**: pega la dirección
   `https://TU-PROYECTO.supabase.co/functions/v1/beatynails-pagos` y la llave pública (anon o
   publishable), toca **Probar conexión** y quita el modo de prueba.

Cómo funciona: la página pide a la función una liga de pago y lleva a la clienta a Mercado Pago o
Stripe. Al volver, la función le pregunta al proveedor si el pago se aprobó y para qué referencia era;
la página no marca nada como pagado solo porque la dirección lo diga. Si el pago no se completa, la
clienta puede intentar de nuevo, pagar en el salón o cancelar, y el horario o las piezas se liberan
al cancelar.

Mientras los datos vivan en el navegador, los precios que se cobran los manda la página; el panel avisa
si lo pagado no coincide con lo esperado. Con la base de datos, la función tomará los precios de ahí.

## Código para el salón

Cuando una clienta paga en línea (la cita completa, el anticipo o un pedido), la pantalla de "pago
recibido" le muestra un código de 4 números. También lo ve en "Mis próximas citas" y en el carrito.
Lo da en el salón:

- **Cita:** en el panel, **Resumen → Código del cliente**, se escribe el código y se toca
  **Confirmar asistencia**. La cita queda marcada como "Llegó" con la hora.
- **Pedido:** con el mismo código se toca **Entregar pedido** y el pedido pasa a entregado.

Un código ya usado lo dice ("Asistencia confirmada" o "Pedido entregado") y no se puede usar dos veces.
No se repite con otro código que siga sin usarse. Las citas que se pagan en el salón no llevan código.

## Entrar al panel y app para Android

El panel se abre en `entrar.html` con el usuario **beauty** y la contraseña **beauty123**. En el
código solo está la huella de la contraseña (PBKDF2), no la contraseña. Desde **Cuenta** se puede
cambiar, pero el cambio vale solo en ese navegador o teléfono. Ojo: como la página es estática, esto
evita que cualquiera entre por accidente, pero no es una protección fuerte; la protección de verdad
llega cuando los datos pasen a Supabase con su propio acceso.

La app para Android (`descargas/beatynails-panel.apk`) abre `https://beautynails.restorago.com/admin.html`
dentro de la app, así que siempre tiene la versión publicada. Se descarga desde la pantalla de entrada,
desde **Cuenta** y desde el pie de la página. Su código está en `beatynails-app/` y se compila con
`beatynails-app/build.sh` (instrucciones dentro). Hay que firmar siempre con la misma llave para que
Android deje instalar las actualizaciones encima.

## Cómo editarla

Servicios, manicuristas, horario y productos se cambian desde el panel. Los valores iniciales están en
`DEFAULTS` dentro de `datos.js`. Las fotos de producto son ilustraciones hasta que subas una foto real
desde el panel.

## Limitación actual

Todo (reservas, pedidos, productos y horario) se guarda solo en el navegador donde se usa
(`localStorage`): el panel ve lo que se hizo en ese mismo navegador, pero no las reservas de las clientas
desde sus teléfonos (ni sus pagos en línea), y el acceso al panel también es de cada navegador: protege
el panel en el equipo del salón, pero en otro navegador se crea un acceso nuevo (con un panel vacío). El siguiente paso es
guardarlos en una base de datos (por ejemplo el Supabase que ya usa BarberaGo).
