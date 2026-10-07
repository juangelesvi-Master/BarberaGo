# CanSuites

Hotel · Guardería · Estética canina en El Pueblito, Querétaro.

Página web con reservas en línea para hotel, guardería y baño/estética, tienda en línea, cuentas de
clientes con sus mascotas y su expediente médico, y un panel para recepción. Mismo stack que BarberaGo
(Vite + React + TypeScript + Supabase, instalable como PWA y empaquetable con Capacitor), adaptado a un
solo negocio.

Usa el proyecto de Supabase **CanSuites** (`btlxpxqqnkkwqnmurszl`); la URL y la llave publicable ya están
como valores por defecto en `src/lib/api-supabase.ts` (la llave es pública por diseño; la seguridad la dan
las políticas RLS).

## Correr en local

```bash
cd cansuites
npm install
npm run dev        # http://localhost:5173, con la base real de Supabase
npm run dev:demo   # sin base: datos de ejemplo guardados en el navegador
```

En modo demostración hay dos cuentas: cliente `cliente@demo.com` / `demo123` y recepción
`admin@cansuites.com` / `cansuites`.

## Publicar

- `npm run build` y sube `dist/` a cualquier hosting estático (Hostinger, Netlify, Vercel).
  `public/.htaccess` redirige las rutas a `index.html` en Apache/Hostinger.
- En Supabase > Authentication > URL Configuration pon el dominio (por ejemplo `https://www.cansuites.com`)
  como Site URL para que funcionen los correos de confirmación y de cambio de contraseña.
- Android / iOS: `npx cap add android` (o `ios`) una vez y luego `npm run cap:android`.

## Pantallas

| Ruta | Para quién | Qué hace |
| --- | --- | --- |
| `/` | Todos | Portada con servicios, precios de estética por talla, tienda, mapa y contacto |
| `/reservar` | Clientes | Hotel (noches con cupo por día), guardería (días) y estética (día y hora según la talla) |
| `/tienda` | Clientes | Carrito; el pedido se aparta en línea y se paga al recoger |
| `/entrar` | Clientes | Crear cuenta, entrar, recuperar contraseña |
| `/cuenta` | Clientes | Mis mascotas, reservas (pagar, cambiar fecha, cancelar), pedidos y datos |
| `/cuenta/pago/:id` | Clientes | Regreso de Mercado Pago: confirma el pago o permite reintentar |
| `/cuenta/mascota/:id` | Clientes | Ficha, cartilla de vacunación con próximas dosis e historial médico |
| `/admin` | Recepción | Día: llegadas, salidas, hospedados, guardería y estética con check-in/check-out |
| `/admin/reservas`, `/admin/pedidos` | Recepción | Listas con filtros y cambio de estado; «Nueva reserva» para clientes que llegan sin reserva o sin cuenta |
| `/admin/clientes` | Recepción | Clientes y mascotas; agregar registros médicos firmados por CanSuites |
| `/admin/catalogo` | Recepción | Servicios, precios, productos y existencia |
| `/admin/ajustes` | Administrador | Cupo del hotel y guardería, baños a la vez, horario, check-in/out |

## Pagos en línea (Mercado Pago)

El administrador conecta la cuenta de CanSuites en **Ajustes > Pagos en línea** pegando su Access Token
(producción `APP_USR-…` o de una cuenta de prueba). La llave se guarda en `privado.pago_cuenta` y solo la
lee la Edge Function `pagos` (`supabase/functions/pagos`, desplegada con `verify_jwt = false`).
Opciones: no cobrar, que el cliente elija (pagar ahora o al llegar) u obligar el pago; todo o un anticipo.

Flujo: `reservar(..., p_pagar)` aparta el lugar 20 minutos → `pagos` (`cobrar`) crea la liga de Checkout
Pro → Mercado Pago avisa al webhook (`/functions/v1/pagos?accion=webhook`) → `pago_registrar` confirma.
La página de regreso también pregunta (`verificar`) por si el aviso se atrasa. Un apartado vencido deja de
ocupar lugar; un pago que llega tarde o doble se devuelve solo.

Cambiar fecha (`reagendar`): cliente o recepción mueven la reserva sin perder lo pagado; el total se
recalcula con el mismo precio. Si el cliente cancela una reserva pagada, primero se le ofrece cambiar la
fecha; si cancela, queda «por reembolsar» y recepción la devuelve por Mercado Pago o la marca como devuelta.

## Base de datos

Migración en `supabase/migrations/` (ya aplicada en CanSuites). Puntos clave:

- `perfiles.rol`: `cliente` (por defecto al registrarse), `personal` o `admin`. Para dar acceso al panel,
  cambia el rol en la tabla `perfiles` desde Supabase.
- `reservar(...)`: valida la mascota, el horario y el cupo por día con un candado para que dos clientes no
  tomen el último lugar; calcula noches/días y el total con el precio vigente.
- `ocupacion`, `ocupacion_estetica`: lugares ocupados por día u hora (abiertas a visitantes, sin datos personales).
- `alta_cliente_mostrador(...)`: recepción da de alta a un cliente sin cuenta (sin contraseña; si dio su correo, la activa
  después con «Olvidé mi contraseña»).
- `pedir(...)`: aparta productos y descuenta existencia; `estado_pedido` la regresa al cancelar.
- `registros_medicos`: el servidor firma cada entrada como `cansuites` (personal) o `dueno`; el dueño no
  puede editar ni borrar lo que registró CanSuites.

Los precios de estética vienen del volante. Los de hotel y guardería son de ejemplo y se cambian en
`/admin/catalogo`.
