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
| `/cuenta` | Clientes | Mis mascotas, reservas (cancelar), pedidos y datos |
| `/cuenta/mascota/:id` | Clientes | Ficha, cartilla de vacunación con próximas dosis e historial médico |
| `/admin` | Recepción | Día: llegadas, salidas, hospedados, guardería y estética con check-in/check-out |
| `/admin/reservas`, `/admin/pedidos` | Recepción | Listas con filtros y cambio de estado; «Nueva reserva» para clientes que llegan sin reserva o sin cuenta |
| `/admin/clientes` | Recepción | Clientes y mascotas; agregar registros médicos firmados por CanSuites |
| `/admin/catalogo` | Recepción | Servicios, precios, productos y existencia |
| `/admin/ajustes` | Administrador | Cupo del hotel y guardería, baños a la vez, horario, check-in/out |

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
