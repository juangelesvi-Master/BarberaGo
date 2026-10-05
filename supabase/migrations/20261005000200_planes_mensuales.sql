-- Planes mensuales cobrados con Mercado Pago (suscripción recurrente a la cuenta de BarberaGo):
--   Básico   $200/mes por sucursal: citas en línea y todas las funciones de la app.
--   Completo $400/mes por sucursal: lo anterior más la tienda en línea (productos en reservas y pedidos).
-- La prueba gratis y los códigos dan el plan Completo salvo que el código diga otra cosa.

alter table public.suscripciones
  add column nivel text not null default 'completo' check (nivel in ('basico', 'completo')),
  add column mp_suscripcion text,  -- suscripción de Mercado Pago activa
  add column mp_pendiente text,    -- suscripción recién creada que aún no se autoriza
  add column mp_estado text;
alter table public.codigos_activacion
  add column nivel text not null default 'completo' check (nivel in ('basico', 'completo'));

-- Cuenta de Mercado Pago de BarberaGo (a donde llegan las mensualidades) y precios.
create table privado.plataforma (
  id integer primary key default 1 check (id = 1),
  mp_token text,
  mp_cuenta text,
  mp_prueba boolean not null default false,
  precio_basico numeric(10,2) not null default 200 check (precio_basico > 0),
  precio_completo numeric(10,2) not null default 400 check (precio_completo > 0),
  updated_at timestamptz not null default now()
);
alter table privado.plataforma enable row level security; -- sin políticas: solo vía funciones
insert into privado.plataforma (id) values (1) on conflict do nothing;

-- La tienda en línea solo funciona con plan Completo vigente.
create function privado.tiene_tienda(n uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.negocios ne join public.suscripciones s on s.usuario_id = ne.creado_por
                  where ne.id = n and s.vence > now() and s.nivel = 'completo');
$$;

create function privado.exigir_tienda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.tiene_tienda(new.negocio_id) then raise exception 'Esta barbería no tiene tienda en línea'; end if;
  return new;
end $$;
create trigger exigir_tienda before insert on public.cita_productos for each row execute function privado.exigir_tienda();
create trigger exigir_tienda before insert on public.pedidos for each row execute function privado.exigir_tienda();

create or replace function public.reserva_negocio(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'negocio', jsonb_build_object('id', n.id, 'nombre', n.nombre, 'slug', n.slug, 'telefono', n.telefono, 'direccion', n.direccion,
                                  'logo_url', n.logo_url, 'zona_horaria', n.zona_horaria, 'moneda', n.moneda, 'horario', n.horario,
                                  -- Solo se ofrece pagar si la barbería ya conectó su cuenta.
                                  'pago_en_linea', case when privado.tiene_pagos(n.id)
                                                        then n.pago_en_linea else 'desactivado' end,
                                  'anticipo_pct', n.anticipo_pct, 'sitio', n.sitio),
    'servicios', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion,
                                  'categoria', s.categoria, 'duracion_min', s.duracion_min, 'precio', s.precio) order by s.orden, s.nombre)
                             from public.servicios s where s.negocio_id = n.id and s.activo and s.en_linea), '[]'),
    'barberos', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.nombre, 'foto_url', b.foto_url, 'color', b.color,
                                  'bio', b.bio) order by b.orden, b.nombre)
                            from public.barberos b where b.negocio_id = n.id and b.activo and b.en_linea), '[]'),
    -- Los productos solo se venden en línea con pago en línea y plan Completo.
    'productos', case when privado.tiene_pagos(n.id) and n.pago_en_linea <> 'desactivado' and privado.tiene_tienda(n.id) then coalesce((
                   select jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'descripcion', x.descripcion, 'foto_url', x.foto_url,
                                                       'precio', x.precio, 'disponible', least(x.disp, 20)) order by x.nombre)
                     from (select p.*, privado.producto_disponible(p.id) as disp from public.productos p
                            where p.negocio_id = n.id and p.activo and p.en_linea and p.precio > 0) x
                    where x.disp > 0), '[]') else '[]' end)
    from public.negocios n
   where n.slug = lower(trim(p_slug)) and n.reserva_online and privado.negocio_vigente(n.id);
$$;

-- El código también define el nivel; un código Básico no baja a quien ya tiene Completo vigente.
create or replace function public.canjear_codigo(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.codigos_activacion; s public.suscripciones;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para canjear un código'; end if;
  select * into c from public.codigos_activacion where codigo = upper(trim(p_codigo)) for update;
  if c is null or c.usos >= c.usos_max or (c.expira is not null and c.expira < now()) then
    raise exception 'El código no es válido o ya fue usado';
  end if;
  insert into public.suscripciones as x (usuario_id, plan, negocios_max, vence, origen, nivel)
  values (auth.uid(), c.plan, c.negocios_max, now() + make_interval(days => c.dias), 'codigo', c.nivel)
  on conflict (usuario_id) do update set
    plan = case when excluded.negocios_max >= x.negocios_max or x.vence < now() then excluded.plan else x.plan end,
    negocios_max = case when x.vence < now() then excluded.negocios_max else greatest(x.negocios_max, excluded.negocios_max) end,
    nivel = case when x.vence < now() or excluded.nivel = 'completo' then excluded.nivel else x.nivel end,
    vence = greatest(x.vence, now()) + make_interval(days => c.dias),
    origen = 'codigo', updated_at = now()
  returning * into s;
  update public.codigos_activacion set usos = usos + 1 where codigo = c.codigo;
  return to_jsonb(s);
end $$;

-- Precios públicos para la pantalla "Mi plan".
create function public.planes_precios() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('basico', precio_basico, 'completo', precio_completo, 'cobro', mp_token is not null)
    from privado.plataforma where id = 1;
$$;

-- ── Funciones del servidor (solo service_role, las usa la función "pagos") ──

create function public.plataforma_token() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('token', mp_token, 'basico', precio_basico, 'completo', precio_completo)
    from privado.plataforma where id = 1;
$$;

create function public.plataforma_guardar(p_token text, p_cuenta text, p_prueba boolean) returns void
language sql security definer set search_path = '' as $$
  update privado.plataforma set mp_token = p_token, mp_cuenta = p_cuenta, mp_prueba = p_prueba, updated_at = now() where id = 1;
$$;

create function public.es_maestro_usuario(p_usuario uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join privado.maestros m on m.email = lower(u.email)
                  where u.id = p_usuario and u.email_confirmed_at is not null);
$$;

create function public.suscripcion_datos(p_usuario uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select to_jsonb(s) from public.suscripciones s where s.usuario_id = p_usuario), '{}'::jsonb);
$$;

create function public.suscripcion_pendiente(p_usuario uuid, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.suscripciones set mp_pendiente = p_id, updated_at = now() where usuario_id = p_usuario;
  if not found then
    -- Sin prueba previa: queda vencida hasta que Mercado Pago autorice el cobro.
    insert into public.suscripciones (usuario_id, plan, negocios_max, vence, origen, mp_pendiente)
    values (p_usuario, 'Sin plan', 1, now(), 'pago', p_id);
  end if;
end $$;

-- Aplica lo que diga Mercado Pago de una suscripción. Si quedó autorizada, extiende el plan
-- hasta el siguiente cobro (con 3 días de gracia) y la vuelve la suscripción activa.
create function public.suscripcion_aplicar(p_usuario uuid, p_id text, p_estado text, p_nivel text,
  p_sucursales integer, p_proximo timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.suscripciones; anterior text;
begin
  select * into s from public.suscripciones where usuario_id = p_usuario for update;
  if s is null then return null; end if;
  anterior := s.mp_suscripcion;
  if p_estado = 'authorized' then
    update public.suscripciones set
      plan = case when p_nivel = 'completo' then 'Completo' else 'Básico' end,
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
  -- Devuelve también la suscripción que quedó reemplazada para cancelarla en Mercado Pago.
  return to_jsonb(s) || jsonb_build_object('reemplazada', case when p_estado = 'authorized' and anterior is distinct from p_id then anterior end);
end $$;

-- ── Panel maestro: nivel en planes y códigos, precios y cuenta de cobro ──

create function public.maestro_plan_nivel(p_usuario uuid, p_plan text, p_nivel text, p_negocios_max integer, p_vence timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.suscripciones;
begin
  perform privado.exigir_maestro();
  if coalesce(trim(p_plan), '') = '' then raise exception 'Escribe el nombre del plan'; end if;
  insert into public.suscripciones as x (usuario_id, plan, negocios_max, vence, origen, nivel)
  values (p_usuario, trim(p_plan), p_negocios_max, p_vence, 'manual', p_nivel)
  on conflict (usuario_id) do update set plan = excluded.plan, negocios_max = excluded.negocios_max, nivel = excluded.nivel,
    vence = excluded.vence, origen = 'manual', updated_at = now()
  returning * into s;
  return to_jsonb(s);
end $$;

create function public.maestro_generar_codigos(p_plan text, p_nivel text, p_negocios_max integer, p_dias integer, p_cantidad integer,
  p_usos_max integer, p_nota text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare lista text[];
begin
  lista := public.maestro_crear_codigos(p_plan, p_negocios_max, p_dias, p_cantidad, p_usos_max, p_nota, null);
  update public.codigos_activacion set nivel = p_nivel where codigo = any (lista);
  return lista;
end $$;

create function public.maestro_plataforma() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir_maestro();
  return (select jsonb_build_object('conectada', mp_token is not null, 'cuenta', mp_cuenta, 'prueba', mp_prueba,
                                    'basico', precio_basico, 'completo', precio_completo)
            from privado.plataforma where id = 1);
end $$;

create function public.maestro_precios(p_basico numeric, p_completo numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir_maestro();
  update privado.plataforma set precio_basico = p_basico, precio_completo = p_completo, updated_at = now() where id = 1;
end $$;

revoke all on function privado.tiene_tienda(uuid), privado.exigir_tienda(), public.planes_precios(),
  public.plataforma_token(), public.plataforma_guardar(text, text, boolean), public.es_maestro_usuario(uuid),
  public.suscripcion_datos(uuid), public.suscripcion_pendiente(uuid, text),
  public.suscripcion_aplicar(uuid, text, text, text, integer, timestamptz),
  public.maestro_plan_nivel(uuid, text, text, integer, timestamptz),
  public.maestro_generar_codigos(text, text, integer, integer, integer, integer, text),
  public.maestro_plataforma(), public.maestro_precios(numeric, numeric) from public, anon, authenticated;
grant execute on function privado.tiene_tienda(uuid) to anon, authenticated;
grant execute on function public.planes_precios() to anon, authenticated;
grant execute on function public.maestro_plan_nivel(uuid, text, text, integer, timestamptz),
  public.maestro_generar_codigos(text, text, integer, integer, integer, integer, text),
  public.maestro_plataforma(), public.maestro_precios(numeric, numeric) to authenticated;
grant execute on function public.plataforma_token(), public.plataforma_guardar(text, text, boolean), public.es_maestro_usuario(uuid),
  public.suscripcion_datos(uuid), public.suscripcion_pendiente(uuid, text),
  public.suscripcion_aplicar(uuid, text, text, text, integer, timestamptz) to service_role;
-- Las versiones sin nivel quedan solo para compatibilidad interna.
revoke execute on function public.maestro_plan(uuid, text, integer, timestamptz),
  public.maestro_crear_codigos(text, integer, integer, integer, integer, text, timestamptz) from authenticated;
