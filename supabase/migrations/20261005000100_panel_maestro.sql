-- Panel maestro (como en RestoraGo): el dueño de BarberaGo ve todas las cuentas y barberías,
-- ajusta planes y genera códigos de activación. Todo pasa por funciones que validan al maestro.

create table privado.maestros (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table privado.maestros enable row level security; -- sin políticas: solo vía funciones

insert into privado.maestros (email) values ('juangelesvi@gmail.com') on conflict do nothing;

-- Es maestro si su correo está en la lista y ya lo confirmó.
create function privado.es_maestro() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join privado.maestros m on m.email = lower(u.email)
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  );
$$;

create function privado.exigir_maestro() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.es_maestro() then raise exception 'Solo el administrador maestro puede hacer esto'; end if;
end $$;

create function public.maestro_es() returns boolean
language sql stable security definer set search_path = '' as $$ select privado.es_maestro(); $$;

-- Números generales de la plataforma.
create function public.maestro_resumen() returns jsonb
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
    'codigos_libres', (select count(*) from public.codigos_activacion where usos < usos_max and (expira is null or expira > now()))
  );
end $$;

-- Cada cuenta con su plan y sus barberías.
create function public.maestro_cuentas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir_maestro();
  return coalesce((
    select jsonb_agg(c order by c->>'creada' desc) from (
      select jsonb_build_object(
        'id', p.id, 'nombre', p.nombre, 'email', p.email, 'telefono', p.telefono, 'creada', p.created_at,
        'ultimo_acceso', u.last_sign_in_at,
        'maestro', exists (select 1 from privado.maestros m where m.email = lower(p.email)),
        'suscripcion', (select to_jsonb(s) - 'usuario_id' from public.suscripciones s where s.usuario_id = p.id),
        'barberias', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', n.id, 'nombre', n.nombre, 'slug', n.slug, 'creada', n.created_at,
            'pago_en_linea', n.pago_en_linea,
            'citas_30d', (select count(*) from public.citas ci where ci.negocio_id = n.id and ci.inicio >= now() - interval '30 days'),
            'ventas_30d', (select coalesce(sum(v.total), 0) from public.ventas v where v.negocio_id = n.id and v.estado = 'pagada' and v.fecha >= now() - interval '30 days'),
            'equipo', (select count(*) from public.miembros mi where mi.negocio_id = n.id and mi.activo)
          ) order by n.created_at)
          from public.negocios n where n.creado_por = p.id), '[]'::jsonb)
      ) as c
      from public.perfiles p left join auth.users u on u.id = p.id
    ) t
  ), '[]'::jsonb);
end $$;

-- Cambia el plan de una cuenta a mano (vence en el pasado = suspendida).
create function public.maestro_plan(p_usuario uuid, p_plan text, p_negocios_max integer, p_vence timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.suscripciones;
begin
  perform privado.exigir_maestro();
  if coalesce(trim(p_plan), '') = '' then raise exception 'Escribe el nombre del plan'; end if;
  insert into public.suscripciones as x (usuario_id, plan, negocios_max, vence, origen)
  values (p_usuario, trim(p_plan), p_negocios_max, p_vence, 'manual')
  on conflict (usuario_id) do update set plan = excluded.plan, negocios_max = excluded.negocios_max,
    vence = excluded.vence, origen = 'manual', updated_at = now()
  returning * into s;
  return to_jsonb(s);
end $$;

create function public.maestro_codigos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir_maestro();
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from public.codigos_activacion c), '[]'::jsonb);
end $$;

-- Genera códigos como BG-7K3M-Q9TX (sin letras que se confunden).
create function public.maestro_crear_codigos(p_plan text, p_negocios_max integer, p_dias integer, p_cantidad integer,
  p_usos_max integer default 1, p_nota text default null, p_expira timestamptz default null) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  nuevo text; lista text[] := '{}'; i int;
begin
  perform privado.exigir_maestro();
  if p_cantidad not between 1 and 100 then raise exception 'Puedes generar de 1 a 100 códigos a la vez'; end if;
  if coalesce(trim(p_plan), '') = '' then raise exception 'Escribe el nombre del plan'; end if;
  while coalesce(array_length(lista, 1), 0) < p_cantidad loop
    nuevo := 'BG-';
    for i in 1..8 loop
      nuevo := nuevo || substr(letras, 1 + floor(random() * length(letras))::int, 1);
      if i = 4 then nuevo := nuevo || '-'; end if;
    end loop;
    insert into public.codigos_activacion (codigo, plan, negocios_max, dias, usos_max, nota, expira)
    values (nuevo, trim(p_plan), p_negocios_max, p_dias, coalesce(p_usos_max, 1), nullif(trim(p_nota), ''), p_expira)
    on conflict (codigo) do nothing;
    if found then lista := lista || nuevo; end if;
  end loop;
  return lista;
end $$;

-- Desactiva un código sin borrarlo (queda en el historial).
create function public.maestro_desactivar_codigo(p_codigo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir_maestro();
  update public.codigos_activacion set expira = now() where codigo = p_codigo;
end $$;

revoke all on function privado.es_maestro(), privado.exigir_maestro(), public.maestro_es(), public.maestro_resumen(),
  public.maestro_cuentas(), public.maestro_plan(uuid, text, integer, timestamptz), public.maestro_codigos(),
  public.maestro_crear_codigos(text, integer, integer, integer, integer, text, timestamptz),
  public.maestro_desactivar_codigo(text) from public, anon;
grant execute on function privado.es_maestro(), privado.exigir_maestro(), public.maestro_es(), public.maestro_resumen(),
  public.maestro_cuentas(), public.maestro_plan(uuid, text, integer, timestamptz), public.maestro_codigos(),
  public.maestro_crear_codigos(text, integer, integer, integer, integer, text, timestamptz),
  public.maestro_desactivar_codigo(text) to authenticated;
