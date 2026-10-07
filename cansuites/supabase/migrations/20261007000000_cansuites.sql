-- CanSuites: hotel, guardería y estética canina con cuentas de clientes, mascotas y expediente médico.
-- Un solo negocio. Basado en los patrones de BarberaGo: helpers en `privado` para RLS y funciones
-- `security definer` para lo que necesita validarse en el servidor (reservas con cupo, pedidos con existencia).

create schema if not exists privado;
grant usage on schema privado to anon, authenticated;

-- ───────────────────────── Cuentas ─────────────────────────

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '',
  telefono text,
  email text,
  rol text not null default 'cliente' check (rol in ('cliente', 'personal', 'admin')),
  created_at timestamptz not null default now()
);

create function privado.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, telefono, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''), split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data->>'telefono'), ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function privado.crear_perfil() from public, anon, authenticated;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function privado.crear_perfil();

create function privado.es_personal() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = (select auth.uid()) and rol in ('personal', 'admin'));
$$;

create function privado.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = (select auth.uid()) and rol = 'admin');
$$;
grant execute on function privado.es_personal(), privado.es_admin() to anon, authenticated;

alter table public.perfiles enable row level security;
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = (select auth.uid()) or privado.es_personal());
create policy perfiles_editar on public.perfiles for update to authenticated
  using (id = (select auth.uid()) or privado.es_admin())
  with check (id = (select auth.uid()) or privado.es_admin());
-- El cliente solo puede cambiar su nombre y teléfono; el rol se cambia desde el panel de Supabase.
revoke update on public.perfiles from authenticated;
grant update (nombre, telefono) on public.perfiles to authenticated;

-- ───────────────────────── Negocio ─────────────────────────

create table public.ajustes (
  id integer primary key default 1 check (id = 1),
  capacidad_hotel integer not null default 12 check (capacidad_hotel between 0 and 500),
  capacidad_guarderia integer not null default 20 check (capacidad_guarderia between 0 and 500),
  estetica_simultaneos integer not null default 2 check (estetica_simultaneos between 0 and 50),
  intervalo_min integer not null default 60 check (intervalo_min between 15 and 240),
  horario jsonb not null default '{"1":[["09:00","18:00"]],"2":[["09:00","18:00"]],"3":[["09:00","18:00"]],"4":[["09:00","18:00"]],"5":[["09:00","18:00"]],"6":[["09:00","15:00"]],"7":[]}',
  check_in text not null default '10:00',
  check_out text not null default '13:00'
);
insert into public.ajustes (id) values (1);

alter table public.ajustes enable row level security;
create policy ajustes_ver on public.ajustes for select to anon, authenticated using (true);
create policy ajustes_editar on public.ajustes for update to authenticated using (privado.es_admin()) with check (privado.es_admin());

create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('hotel', 'guarderia', 'estetica')),
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  precio numeric(10, 2) not null default 0 check (precio >= 0),
  talla text check (talla in ('CH', 'M', 'G', 'EG')),
  incluye text[] not null default '{}',
  activo boolean not null default true,
  orden integer not null default 0
);

alter table public.servicios enable row level security;
create policy servicios_ver on public.servicios for select to anon, authenticated using (activo or privado.es_personal());
create policy servicios_alta on public.servicios for insert to authenticated with check (privado.es_personal());
create policy servicios_editar on public.servicios for update to authenticated using (privado.es_personal()) with check (privado.es_personal());

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  categoria text,
  precio numeric(10, 2) not null default 0 check (precio >= 0),
  stock integer not null default 0 check (stock >= 0),
  foto_url text,
  activo boolean not null default true,
  orden integer not null default 0
);

alter table public.productos enable row level security;
create policy productos_ver on public.productos for select to anon, authenticated using (activo or privado.es_personal());
create policy productos_alta on public.productos for insert to authenticated with check (privado.es_personal());
create policy productos_editar on public.productos for update to authenticated using (privado.es_personal()) with check (privado.es_personal());

-- ───────────────────────── Mascotas y expediente ─────────────────────────

create table public.mascotas (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid not null references public.perfiles (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  raza text,
  sexo text not null default 'macho' check (sexo in ('macho', 'hembra')),
  nacimiento date,
  peso_kg numeric(5, 2) check (peso_kg is null or peso_kg between 0 and 150),
  talla text not null default 'M' check (talla in ('CH', 'M', 'G', 'EG')),
  color text,
  esterilizado boolean not null default false,
  alergias text,
  condiciones text,
  alimentacion text,
  veterinario text,
  foto_url text,
  notas text,
  created_at timestamptz not null default now()
);
create index mascotas_dueno_idx on public.mascotas (dueno_id);

create function privado.puede_ver_mascota(p_mascota uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.es_personal()
      or exists (select 1 from public.mascotas where id = p_mascota and dueno_id = (select auth.uid()));
$$;
grant execute on function privado.puede_ver_mascota(uuid) to authenticated;

alter table public.mascotas enable row level security;
create policy mascotas_ver on public.mascotas for select to authenticated
  using (dueno_id = (select auth.uid()) or privado.es_personal());
create policy mascotas_alta on public.mascotas for insert to authenticated
  with check (dueno_id = (select auth.uid()) or privado.es_personal());
create policy mascotas_editar on public.mascotas for update to authenticated
  using (dueno_id = (select auth.uid()) or privado.es_personal())
  with check (dueno_id = (select auth.uid()) or privado.es_personal());

create table public.registros_medicos (
  id uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  tipo text not null default 'observacion'
    check (tipo in ('vacuna', 'desparasitacion', 'consulta', 'tratamiento', 'cirugia', 'observacion')),
  fecha date not null default current_date,
  titulo text not null check (length(trim(titulo)) > 0),
  detalle text,
  proxima date,
  autor text not null default 'dueno' check (autor in ('cansuites', 'dueno')),
  autor_nombre text,
  creado_por uuid default auth.uid() references public.perfiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index registros_mascota_idx on public.registros_medicos (mascota_id, fecha desc);

-- Quién registró la entrada lo decide el servidor: el personal firma como CanSuites, el dueño como dueño.
create function privado.firmar_registro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.autor := case when privado.es_personal() then 'cansuites' else 'dueno' end;
    new.autor_nombre := (select nombre from public.perfiles where id = (select auth.uid()));
    new.creado_por := (select auth.uid());
  else
    new.autor := old.autor;
    new.autor_nombre := old.autor_nombre;
    new.creado_por := old.creado_por;
    new.mascota_id := old.mascota_id;
  end if;
  return new;
end $$;
revoke all on function privado.firmar_registro() from public, anon, authenticated;
create trigger firmar before insert or update on public.registros_medicos
  for each row execute function privado.firmar_registro();

alter table public.registros_medicos enable row level security;
create policy registros_ver on public.registros_medicos for select to authenticated
  using (privado.puede_ver_mascota(mascota_id));
create policy registros_alta on public.registros_medicos for insert to authenticated
  with check (privado.puede_ver_mascota(mascota_id));
create policy registros_editar on public.registros_medicos for update to authenticated
  using (privado.es_personal() or (autor = 'dueno' and privado.puede_ver_mascota(mascota_id)))
  with check (privado.puede_ver_mascota(mascota_id));
create policy registros_borrar on public.registros_medicos for delete to authenticated
  using (privado.es_personal() or (autor = 'dueno' and privado.puede_ver_mascota(mascota_id)));

-- ───────────────────────── Reservas ─────────────────────────

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity,
  cliente_id uuid not null references public.perfiles (id) on delete cascade,
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  servicio_id uuid not null references public.servicios (id),
  tipo text not null check (tipo in ('hotel', 'guarderia', 'estetica')),
  entrada date not null,
  salida date not null,
  hora text,
  unidades integer not null check (unidades between 1 and 60),
  precio_unit numeric(10, 2) not null,
  total numeric(10, 2) not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'en_curso', 'completada', 'cancelada')),
  notas text,
  created_at timestamptz not null default now(),
  check (salida >= entrada)
);
create index reservas_fechas_idx on public.reservas (tipo, entrada, salida) where estado <> 'cancelada';
create index reservas_cliente_idx on public.reservas (cliente_id);
create index reservas_mascota_idx on public.reservas (mascota_id);

alter table public.reservas enable row level security;
create policy reservas_ver on public.reservas for select to authenticated
  using (cliente_id = (select auth.uid()) or privado.es_personal());
create policy reservas_editar on public.reservas for update to authenticated
  using (privado.es_personal()) with check (privado.es_personal());
-- Las altas y cancelaciones de clientes pasan por reservar() y cancelar_reserva().

/** Hoy y la hora actual en Querétaro. */
create function privado.ahora_local() returns timestamp
language sql stable set search_path = '' as $$
  select now() at time zone 'America/Mexico_City';
$$;

/** Horas de inicio de la estética de un día según ajustes.horario e intervalo. */
create function privado.horas_estetica(p_fecha date) returns setof text
language sql stable security definer set search_path = '' as $$
  select to_char(t, 'HH24:MI')
  from public.ajustes a,
       jsonb_array_elements(coalesce(a.horario -> extract(isodow from p_fecha)::int::text, '[]'::jsonb)) tramo,
       generate_series(
         ('2000-01-01 ' || (tramo ->> 0))::timestamp,
         ('2000-01-01 ' || (tramo ->> 1))::timestamp - make_interval(mins => a.intervalo_min),
         make_interval(mins => a.intervalo_min)
       ) t
  where a.id = 1;
$$;

/** Lugares ocupados por día de hotel (noches) o guardería (días). Abierta a visitantes: no expone datos personales. */
create function public.ocupacion(p_tipo text, p_desde date, p_hasta date)
returns table (dia date, ocupados integer)
language sql stable security definer set search_path = '' as $$
  select d::date, count(r.id)::int
  from generate_series(p_desde, least(p_hasta, p_desde + 120), interval '1 day') d
  join public.reservas r
    on r.tipo = p_tipo and r.estado <> 'cancelada'
   and r.entrada <= d::date
   and (case when p_tipo = 'hotel' then r.salida > d::date else r.salida >= d::date end)
  where p_tipo in ('hotel', 'guarderia')
  group by d;
$$;

create function public.ocupacion_estetica(p_fecha date)
returns table (hora text, ocupadas integer)
language sql stable security definer set search_path = '' as $$
  select r.hora, count(*)::int from public.reservas r
  where r.tipo = 'estetica' and r.estado <> 'cancelada' and r.entrada = p_fecha
  group by r.hora;
$$;

create function public.reservar(p_mascota uuid, p_servicio uuid, p_entrada date, p_salida date, p_hora text, p_notas text)
returns public.reservas
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_m public.mascotas;
  v_s public.servicios;
  v_a public.ajustes;
  v_hoy date := privado.ahora_local()::date;
  v_unidades int;
  v_cap int;
  v_lleno date;
  v_r public.reservas;
begin
  if v_uid is null then raise exception 'Inicia sesión para reservar'; end if;
  select * into v_m from public.mascotas where id = p_mascota;
  if v_m.id is null or (v_m.dueno_id <> v_uid and not privado.es_personal()) then raise exception 'No encontramos esa mascota'; end if;
  select * into v_s from public.servicios where id = p_servicio and activo;
  if v_s.id is null then raise exception 'Ese servicio ya no está disponible'; end if;
  select * into v_a from public.ajustes where id = 1;
  if p_entrada < v_hoy then raise exception 'Elige una fecha a partir de hoy'; end if;

  -- Una reserva a la vez para que dos personas no tomen el último lugar.
  perform pg_advisory_xact_lock(hashtext('cansuites.reservas'));

  if v_s.tipo = 'hotel' then
    v_unidades := p_salida - p_entrada;
    if v_unidades < 1 then raise exception 'La salida debe ser después de la entrada'; end if;
    v_cap := v_a.capacidad_hotel;
  elsif v_s.tipo = 'guarderia' then
    v_unidades := p_salida - p_entrada + 1;
    if v_unidades < 1 then raise exception 'El último día no puede ser antes del primero'; end if;
    v_cap := v_a.capacidad_guarderia;
  else
    v_unidades := 1;
    p_salida := p_entrada;
    if p_hora is null or p_hora not in (select privado.horas_estetica(p_entrada)) then raise exception 'Elige un horario disponible'; end if;
    if p_entrada = v_hoy and p_hora <= to_char(privado.ahora_local(), 'HH24:MI') then raise exception 'Ese horario ya pasó'; end if;
    if (select count(*) from public.reservas where tipo = 'estetica' and estado <> 'cancelada' and entrada = p_entrada and hora = p_hora)
       >= v_a.estetica_simultaneos then
      raise exception 'Ese horario se acaba de ocupar. Elige otro.';
    end if;
  end if;
  if v_unidades > 60 then raise exception 'Para estancias de más de 60 días escríbenos por WhatsApp'; end if;

  if v_s.tipo <> 'estetica' then
    select o.dia into v_lleno from public.ocupacion(v_s.tipo, p_entrada,
      case when v_s.tipo = 'hotel' then p_salida - 1 else p_salida end) o
    where o.ocupados >= v_cap order by o.dia limit 1;
    if v_cap = 0 then v_lleno := p_entrada; end if;
    if v_lleno is not null then raise exception 'No hay lugar el %. Prueba otras fechas.', to_char(v_lleno, 'DD/MM/YYYY'); end if;
  end if;

  insert into public.reservas (cliente_id, mascota_id, servicio_id, tipo, entrada, salida, hora, unidades, precio_unit, total, estado, notas)
  values (v_m.dueno_id, v_m.id, v_s.id, v_s.tipo, p_entrada, p_salida, case when v_s.tipo = 'estetica' then p_hora end,
          v_unidades, v_s.precio, v_s.precio * v_unidades,
          case when privado.es_personal() then 'confirmada' else 'pendiente' end, nullif(trim(p_notas), ''))
  returning * into v_r;
  return v_r;
end $$;

create function public.cancelar_reserva(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_r public.reservas;
begin
  select * into v_r from public.reservas where id = p_id;
  if v_r.id is null or (v_r.cliente_id <> (select auth.uid()) and not privado.es_personal()) then
    raise exception 'No encontramos esa reserva';
  end if;
  if not privado.es_personal() and (v_r.estado not in ('pendiente', 'confirmada') or v_r.entrada < privado.ahora_local()::date) then
    raise exception 'Esta reserva ya no se puede cancelar en línea. Escríbenos por WhatsApp.';
  end if;
  update public.reservas set estado = 'cancelada' where id = p_id;
end $$;

-- ───────────────────────── Tienda ─────────────────────────

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity,
  cliente_id uuid not null references public.perfiles (id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'listo', 'entregado', 'cancelado')),
  total numeric(10, 2) not null default 0,
  notas text,
  created_at timestamptz not null default now()
);
create index pedidos_cliente_idx on public.pedidos (cliente_id);

create table public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  producto_id uuid references public.productos (id) on delete set null,
  nombre text not null,
  cantidad integer not null check (cantidad > 0),
  precio_unit numeric(10, 2) not null
);
create index pedido_items_pedido_idx on public.pedido_items (pedido_id);

alter table public.pedidos enable row level security;
create policy pedidos_ver on public.pedidos for select to authenticated
  using (cliente_id = (select auth.uid()) or privado.es_personal());
alter table public.pedido_items enable row level security;
create policy pedido_items_ver on public.pedido_items for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id and (p.cliente_id = (select auth.uid()) or privado.es_personal())));

/** Aparta productos (descuenta existencia) y crea el pedido para pagar al recoger. */
create function public.pedir(p_items jsonb, p_notas text) returns public.pedidos
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_p public.pedidos;
  v_item record;
  v_prod public.productos;
begin
  if v_uid is null then raise exception 'Inicia sesión para comprar'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Tu carrito está vacío'; end if;
  insert into public.pedidos (cliente_id, notas) values (v_uid, nullif(trim(p_notas), '')) returning * into v_p;
  for v_item in
    select (e ->> 'producto_id')::uuid as producto_id, sum((e ->> 'cantidad')::int)::int as cantidad
    from jsonb_array_elements(p_items) e group by 1
  loop
    if v_item.cantidad is null or v_item.cantidad < 1 then continue; end if;
    select * into v_prod from public.productos where id = v_item.producto_id and activo for update;
    if v_prod.id is null then raise exception 'Un producto ya no está disponible'; end if;
    if v_prod.stock < v_item.cantidad then raise exception 'Solo quedan % de %', v_prod.stock, v_prod.nombre; end if;
    update public.productos set stock = stock - v_item.cantidad where id = v_prod.id;
    insert into public.pedido_items (pedido_id, producto_id, nombre, cantidad, precio_unit)
    values (v_p.id, v_prod.id, v_prod.nombre, v_item.cantidad, v_prod.precio);
  end loop;
  update public.pedidos set total = coalesce((select sum(cantidad * precio_unit) from public.pedido_items where pedido_id = v_p.id), 0)
  where id = v_p.id returning * into v_p;
  if v_p.total = 0 then raise exception 'Tu carrito está vacío'; end if;
  return v_p;
end $$;

/** Cambia el estado de un pedido (personal). Al cancelar, regresa la existencia. */
create function public.estado_pedido(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.pedidos;
begin
  if not privado.es_personal() then raise exception 'Sin permiso'; end if;
  select * into v_p from public.pedidos where id = p_id for update;
  if v_p.id is null then return; end if;
  if p_estado = 'cancelado' and v_p.estado <> 'cancelado' then
    update public.productos pr set stock = pr.stock + i.cantidad
    from public.pedido_items i where i.pedido_id = p_id and i.producto_id = pr.id;
  end if;
  update public.pedidos set estado = p_estado where id = p_id;
end $$;

revoke execute on function public.reservar(uuid, uuid, date, date, text, text), public.cancelar_reserva(uuid),
  public.pedir(jsonb, text), public.estado_pedido(uuid, text) from public, anon;
grant execute on function public.reservar(uuid, uuid, date, date, text, text), public.cancelar_reserva(uuid),
  public.pedir(jsonb, text), public.estado_pedido(uuid, text) to authenticated;
grant execute on function public.ocupacion(text, date, date), public.ocupacion_estetica(date) to anon, authenticated;
revoke all on function privado.horas_estetica(date), privado.ahora_local() from public, anon, authenticated;

-- ───────────────────────── Fotos ─────────────────────────

insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;
create policy fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────────────────── Catálogo inicial ─────────────────────────
-- Estética: precios del volante. Hotel y guardería: precios de ejemplo, se cambian en el panel.

insert into public.servicios (tipo, nombre, descripcion, precio, talla, incluye, orden) values
  ('hotel', 'Suite estándar', 'Habitación individual con cama, agua fresca, 3 salidas a las áreas de juego y monitoreo 24/7.', 450, null, '{"Áreas de juego","Monitoreo 24/7","Supervisión veterinaria"}', 0),
  ('hotel', 'Suite premium', 'Suite amplia con cama ortopédica, alberca, juego guiado y reporte con fotos por WhatsApp.', 650, null, '{"Alberca","Reporte con fotos","Monitoreo 24/7","Supervisión veterinaria"}', 1),
  ('guarderia', 'Guardería por día', 'Déjalo en la mañana y recógelo en la tarde: juego en grandes áreas, socialización y descanso.', 250, null, '{"Grandes áreas de juego","Socialización supervisada","Siesta"}', 2),
  ('estetica', 'Baño y estética · Chico', 'Peso aproximado 1 – 10 kg.', 250, 'CH', '{}', 3),
  ('estetica', 'Baño y estética · Mediano', 'Peso aproximado 11 – 25 kg.', 300, 'M', '{}', 4),
  ('estetica', 'Baño y estética · Grande', 'Peso aproximado 26 – 40 kg.', 350, 'G', '{}', 5),
  ('estetica', 'Baño y estética · Extra grande', 'Peso aproximado + 40 kg.', 400, 'EG', '{}', 6);

insert into public.productos (nombre, descripcion, categoria, precio, stock, orden) values
  ('Croqueta premium adulto 4 kg', 'Proteína de cordero, sin colorantes.', 'Alimento', 689, 15, 0),
  ('Premios naturales de res', 'Bolsa de 200 g, deshidratados.', 'Alimento', 149, 30, 1),
  ('Shampoo de avena', 'Piel sensible, 500 ml. El mismo que usamos en la estética.', 'Higiene', 189, 20, 2),
  ('Cepillo de cerdas suaves', 'Para pelo corto y largo.', 'Higiene', 129, 12, 3),
  ('Pelota de hule resistente', 'Rebota y flota: perfecta para la alberca.', 'Juguetes', 99, 40, 4),
  ('Cuerda para jalar', 'Algodón trenzado, 40 cm.', 'Juguetes', 119, 25, 5),
  ('Paliacate CanSuites', 'Naranja con huellitas, tallas CH a EG.', 'Accesorios', 89, 50, 6),
  ('Cama ortopédica mediana', 'Espuma viscoelástica y funda lavable.', 'Descanso', 899, 6, 7);
