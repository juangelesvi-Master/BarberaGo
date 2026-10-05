-- Mejoras traídas de RestoraGo:
--   · Plan anual (12 meses al precio de 10) y pago único con Mercado Pago (OXXO, tarjeta o saldo).
--   · Solicitudes "Quiero probar BarberaGo" desde la página /promo.
--   · Panel maestro: cambiar contraseña y eliminar cuentas (lo hace la Edge Function `maestro`).
--   · Limpieza automática de cuentas sin barbería ni pago (24 h).
--   · Insumos por servicio que se descuentan del inventario al cobrar.

-- ───────────── Plan anual y pago único ─────────────

-- Pagos únicos ya aplicados (así un aviso repetido de Mercado Pago no suma dos veces).
create table privado.pagos_plataforma (
  pago_id text primary key,
  usuario_id uuid not null,
  nivel text not null,
  sucursales integer not null,
  meses integer not null,
  monto numeric(10,2) not null,
  created_at timestamptz not null default now()
);
alter table privado.pagos_plataforma enable row level security; -- sin políticas: solo vía funciones

-- Igual que la versión mensual, pero sabe si la suscripción es anual (cobro cada 12 meses).
create function public.suscripcion_aplicar(p_usuario uuid, p_id text, p_estado text, p_nivel text,
  p_sucursales integer, p_proximo timestamptz, p_anual boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.suscripciones; anterior text;
begin
  select * into s from public.suscripciones where usuario_id = p_usuario for update;
  if s is null then return null; end if;
  anterior := s.mp_suscripcion;
  if p_estado = 'authorized' then
    update public.suscripciones set
      plan = case when p_nivel = 'completo' then 'Completo' else 'Básico' end || case when p_anual then ' anual' else '' end,
      nivel = p_nivel, negocios_max = greatest(1, least(p_sucursales, 100)),
      vence = greatest(vence, coalesce(p_proximo, now()) + interval '3 days'),
      origen = 'pago', mp_suscripcion = p_id, mp_estado = p_estado,
      mp_pendiente = case when mp_pendiente = p_id then null else mp_pendiente end, updated_at = now()
    where usuario_id = p_usuario returning * into s;
  elsif p_id = s.mp_suscripcion then
    update public.suscripciones set mp_estado = p_estado, updated_at = now() where usuario_id = p_usuario returning * into s;
  elsif p_id = s.mp_pendiente and p_estado in ('cancelled', 'paused') then
    update public.suscripciones set mp_pendiente = null, updated_at = now() where usuario_id = p_usuario returning * into s;
  end if;
  return to_jsonb(s) || jsonb_build_object('reemplazada', case when p_estado = 'authorized' and anterior is distinct from p_id then anterior end);
end $$;

-- Pago único aprobado: suma 1 o 12 meses al plan (desde hoy o desde que vence, lo que sea después).
create function public.pago_unico_aplicar(p_usuario uuid, p_pago text, p_nivel text, p_sucursales integer,
  p_meses integer, p_monto numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.suscripciones; v_plan text;
begin
  if p_nivel not in ('basico', 'completo') or p_meses not in (1, 12) then raise exception 'Pago no válido'; end if;
  if not exists (select 1 from public.perfiles where id = p_usuario) then return null; end if;
  insert into privado.pagos_plataforma (pago_id, usuario_id, nivel, sucursales, meses, monto)
  values (p_pago, p_usuario, p_nivel, p_sucursales, p_meses, p_monto) on conflict (pago_id) do nothing;
  if not found then
    return (select to_jsonb(x) from public.suscripciones x where usuario_id = p_usuario);
  end if;
  v_plan := case when p_nivel = 'completo' then 'Completo' else 'Básico' end || case when p_meses = 12 then ' anual' else '' end;
  insert into public.suscripciones as x (usuario_id, plan, negocios_max, vence, origen, nivel)
  values (p_usuario, v_plan, greatest(1, least(p_sucursales, 100)), now() + make_interval(months => p_meses), 'pago', p_nivel)
  on conflict (usuario_id) do update set
    plan = excluded.plan, nivel = excluded.nivel,
    negocios_max = case when x.vence < now() then excluded.negocios_max else greatest(x.negocios_max, excluded.negocios_max) end,
    vence = greatest(x.vence, now()) + make_interval(months => p_meses),
    origen = 'pago', updated_at = now()
  returning * into s;
  return to_jsonb(s);
end $$;

revoke all on function public.suscripcion_aplicar(uuid, text, text, text, integer, timestamptz, boolean),
  public.pago_unico_aplicar(uuid, text, text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.suscripcion_aplicar(uuid, text, text, text, integer, timestamptz, boolean),
  public.pago_unico_aplicar(uuid, text, text, integer, integer, numeric) to service_role;

-- ───────────── Solicitudes "Quiero probar BarberaGo" ─────────────

create table public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 80),
  barberia text check (char_length(barberia) <= 80),
  telefono text not null check (telefono ~ '^[0-9+ ]{8,20}$'),
  email text check (char_length(email) <= 120),
  ciudad text check (char_length(ciudad) <= 60),
  mensaje text check (char_length(mensaje) <= 500),
  atendida boolean not null default false,
  created_at timestamptz not null default now()
);
create index solicitudes_fecha_idx on public.solicitudes (created_at desc);
alter table public.solicitudes enable row level security; -- sin políticas: se escribe con solicitar_prueba y se lee en el panel maestro

create function public.solicitar_prueba(p_nombre text, p_barberia text, p_telefono text, p_email text,
  p_ciudad text, p_mensaje text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tel text := regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g');
begin
  if char_length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Escribe tu nombre'; end if;
  if char_length(v_tel) not between 8 and 20 then raise exception 'Escribe un teléfono válido'; end if;
  if nullif(trim(p_email), '') is not null and trim(p_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Revisa el correo'; end if;
  -- Freno contra envíos repetidos.
  if (select count(*) from public.solicitudes where telefono = v_tel and created_at > now() - interval '1 day') >= 3
     or (select count(*) from public.solicitudes where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Ya recibimos tu solicitud. Te contactaremos pronto';
  end if;
  insert into public.solicitudes (nombre, barberia, telefono, email, ciudad, mensaje)
  values (left(trim(p_nombre), 80), left(nullif(trim(p_barberia), ''), 80), v_tel, left(nullif(lower(trim(p_email)), ''), 120),
          left(nullif(trim(p_ciudad), ''), 60), left(nullif(trim(p_mensaje), ''), 500));
end $$;

create function public.maestro_solicitudes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir_maestro();
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.solicitudes s), '[]'::jsonb);
end $$;

create function public.maestro_solicitud_atender(p_id uuid, p_atendida boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir_maestro();
  update public.solicitudes set atendida = p_atendida where id = p_id;
end $$;

revoke all on function public.solicitar_prueba(text, text, text, text, text, text), public.maestro_solicitudes(),
  public.maestro_solicitud_atender(uuid, boolean) from public;
grant execute on function public.solicitar_prueba(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.maestro_solicitudes(), public.maestro_solicitud_atender(uuid, boolean) to authenticated;
revoke execute on function public.maestro_solicitudes(), public.maestro_solicitud_atender(uuid, boolean) from anon;

create or replace function public.maestro_resumen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir_maestro();
  return jsonb_build_object(
    'cuentas', (select count(*) from public.perfiles),
    'barberias', (select count(*) from public.negocios),
    'activas', (select count(*) from public.suscripciones where vence >= now() and origen <> 'prueba'),
    'prueba', (select count(*) from public.suscripciones where vence >= now() and origen = 'prueba'),
    'vencidas', (select count(*) from public.suscripciones where vence < now()),
    'por_vencer', (select count(*) from public.suscripciones where vence between now() and now() + interval '7 days'),
    'citas_30d', (select count(*) from public.citas where inicio >= now() - interval '30 days'),
    'ventas_30d', (select coalesce(sum(total), 0) from public.ventas where estado = 'pagada' and fecha >= now() - interval '30 days'),
    'codigos_libres', (select count(*) from public.codigos_activacion where usos < usos_max and (expira is null or expira > now())),
    'solicitudes', (select count(*) from public.solicitudes where not atendida)
  );
end $$;

-- ───────────── Panel maestro: contraseña y eliminar cuentas ─────────────

-- Valida al maestro y junta lo necesario para actuar sobre la cuenta (la Edge Function hace el resto).
create function public.maestro_cuenta_preparar(p_actor uuid, p_usuario uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_neg uuid[];
begin
  if not public.es_maestro_usuario(p_actor) then raise exception 'Solo el administrador maestro puede hacer esto'; end if;
  if p_usuario = p_actor then raise exception 'No puedes hacer esto con tu propia cuenta'; end if;
  if not exists (select 1 from auth.users where id = p_usuario) then raise exception 'La cuenta ya no existe'; end if;
  if exists (select 1 from auth.users u join privado.maestros m on m.email = lower(u.email) where u.id = p_usuario) then
    raise exception 'No se puede cambiar otra cuenta maestra';
  end if;
  select coalesce(array_agg(id), '{}') into v_neg from public.negocios where creado_por = p_usuario;
  return jsonb_build_object(
    'personal', coalesce((select personal from public.perfiles where id = p_usuario), false),
    'negocios', to_jsonb(v_neg),
    'mp_suscripcion', (select mp_suscripcion from public.suscripciones where usuario_id = p_usuario and mp_estado = 'authorized'),
    -- Las cuentas con código de su personal se van con sus barberías.
    'personal_equipo', coalesce((select jsonb_agg(distinct m.usuario_id) from public.miembros m join public.perfiles p on p.id = m.usuario_id
                                  where m.negocio_id = any (v_neg) and p.personal and m.usuario_id <> p_usuario), '[]'::jsonb)
  );
end $$;

-- ───────────── Limpieza de cuentas sin uso ─────────────

-- Cuentas con más de 24 h que nunca crearon barbería, no son parte de un equipo y nunca pagaron ni canjearon código.
create function public.limpieza_candidatos() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}') from (
    select u.id from auth.users u
     where u.created_at < now() - interval '24 hours'
       and not exists (select 1 from public.negocios n where n.creado_por = u.id)
       and not exists (select 1 from public.miembros m where m.usuario_id = u.id)
       and not exists (select 1 from public.suscripciones s where s.usuario_id = u.id
                        and (s.origen in ('pago', 'codigo', 'manual') or s.mp_suscripcion is not null or s.mp_pendiente is not null))
       and not exists (select 1 from privado.pagos_plataforma pp where pp.usuario_id = u.id)
       and not exists (select 1 from privado.maestros ma where ma.email = lower(u.email))
     order by u.created_at limit 200
  ) x;
$$;

revoke all on function public.maestro_cuenta_preparar(uuid, uuid), public.limpieza_candidatos() from public, anon, authenticated;
grant execute on function public.maestro_cuenta_preparar(uuid, uuid), public.limpieza_candidatos() to service_role;

-- ───────────── Insumos por servicio ─────────────

create table public.servicio_insumos (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  servicio_id uuid not null,
  producto_id uuid not null,
  cantidad integer not null default 1 check (cantidad between 1 and 999),
  primary key (servicio_id, producto_id),
  foreign key (negocio_id, servicio_id) references public.servicios (negocio_id, id) on delete cascade,
  foreign key (negocio_id, producto_id) references public.productos (negocio_id, id) on delete cascade
);
create index servicio_insumos_producto_idx on public.servicio_insumos (negocio_id, producto_id);
alter table public.servicio_insumos enable row level security;
create policy servicio_insumos_leer on public.servicio_insumos for select using ((select privado.es_miembro(negocio_id)));
create policy servicio_insumos_insertar on public.servicio_insumos for insert with check ((select privado.puede(negocio_id, 'catalogo')));
create policy servicio_insumos_editar on public.servicio_insumos for update
  using ((select privado.puede(negocio_id, 'catalogo'))) with check ((select privado.puede(negocio_id, 'catalogo')));
create policy servicio_insumos_borrar on public.servicio_insumos for delete using ((select privado.puede(negocio_id, 'catalogo')));

-- Lo que se descontó queda guardado en la partida, para devolverlo igual si se anula la venta.
alter table public.venta_items add column if not exists insumos jsonb;

create function privado.descontar_insumos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select jsonb_agg(jsonb_build_object('producto_id', si.producto_id, 'cantidad', si.cantidad * new.cantidad))
    into new.insumos
    from public.servicio_insumos si where si.servicio_id = new.servicio_id and si.negocio_id = new.negocio_id;
  if new.insumos is not null then
    update public.productos p set stock = p.stock - si.cantidad * new.cantidad
      from public.servicio_insumos si
     where si.servicio_id = new.servicio_id and si.negocio_id = new.negocio_id and p.id = si.producto_id;
  end if;
  return new;
end $$;
create trigger descontar_insumos before insert on public.venta_items
  for each row when (new.tipo = 'servicio' and new.servicio_id is not null) execute function privado.descontar_insumos();

create function privado.devolver_insumos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.productos p set stock = p.stock + x.total
    from (select (e->>'producto_id')::uuid as producto_id, sum((e->>'cantidad')::int) as total
            from public.venta_items i, jsonb_array_elements(i.insumos) e
           where i.venta_id = new.id and i.insumos is not null group by 1) x
   where p.id = x.producto_id and p.negocio_id = new.negocio_id;
  return new;
end $$;
create trigger devolver_insumos after update of estado on public.ventas
  for each row when (old.estado = 'pagada' and new.estado = 'anulada') execute function privado.devolver_insumos();

revoke execute on function privado.descontar_insumos(), privado.devolver_insumos() from public, anon, authenticated;
