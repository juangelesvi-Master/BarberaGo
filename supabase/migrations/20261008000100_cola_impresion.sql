-- Puente de impresión como en RestoraGo: los tickets para impresoras de red se dejan en una cola en la nube
-- y el puente (puente-impresora/, en una computadora de la barbería) los toma y los imprime. Así puede imprimir
-- cualquier dispositivo (celular, iPad, otra computadora) aunque la impresora esté en la red local.

-- Un puente por barbería; se identifica con un código secreto (solo se guarda su hash).
create table privado.puentes_impresion (
  negocio_id uuid primary key references public.negocios (id) on delete cascade,
  token_hash text not null unique,
  creado_en timestamptz not null default now(),
  visto_en timestamptz,
  equipo text
);

create table public.cola_impresion (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  ip text not null check (char_length(ip) between 3 and 64),
  puerto integer not null default 9100 check (puerto between 1 and 65535),
  datos text not null check (char_length(datos) <= 1500000), -- ESC/POS en base64
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'impreso', 'error')),
  error text,
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  tomado_en timestamptz
);
create index cola_impresion_pendientes_idx on public.cola_impresion (negocio_id, creado_en) where estado = 'pendiente';

alter table public.cola_impresion enable row level security;
create policy cola_ver on public.cola_impresion for select to authenticated using (privado.es_miembro(negocio_id));
create policy cola_crear on public.cola_impresion for insert to authenticated
  with check (privado.es_miembro(negocio_id) and estado = 'pendiente' and error is null and tomado_en is null);

/** Estado del puente de la barbería: configurado y encendido (se reportó en los últimos 20 s). */
create function public.puente_estado(p_negocio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p privado.puentes_impresion;
begin
  if not privado.es_miembro(p_negocio) then raise exception 'No perteneces a esta barbería'; end if;
  select * into p from privado.puentes_impresion where negocio_id = p_negocio;
  if p is null then return jsonb_build_object('configurado', false, 'activo', false); end if;
  return jsonb_build_object('configurado', true, 'activo', coalesce(p.visto_en > now() - interval '20 seconds', false),
                            'equipo', p.equipo, 'visto_en', p.visto_en);
end $$;

/** Crea (o reemplaza) el código del puente. Solo administradores. Devuelve el código una sola vez. */
create function public.puente_crear(p_negocio uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare codigo text;
begin
  if not privado.es_admin_de(p_negocio) then raise exception 'Solo un administrador puede instalar el puente'; end if;
  codigo := 'bgo_' || translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into privado.puentes_impresion (negocio_id, token_hash)
  values (p_negocio, encode(extensions.digest(codigo, 'sha256'), 'hex'))
  on conflict (negocio_id) do update set token_hash = excluded.token_hash, creado_en = now(), visto_en = null, equipo = null;
  update public.cola_impresion set estado = 'error', error = 'Se cambió el puente'
   where negocio_id = p_negocio and estado = 'pendiente';
  return codigo;
end $$;

create function privado.negocio_del_puente(p_codigo text) returns uuid
language sql stable security definer set search_path = '' as $$
  select negocio_id from privado.puentes_impresion
   where token_hash = encode(extensions.digest(coalesce(p_codigo, ''), 'sha256'), 'hex');
$$;

/** Lo llama el puente cada pocos segundos: registra que está encendido y toma los tickets pendientes. */
create function public.puente_trabajos(p_codigo text, p_equipo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nid uuid; r jsonb;
begin
  nid := privado.negocio_del_puente(p_codigo);
  if nid is null then raise exception 'Código del puente no válido. Crea uno nuevo en BarberaGo > Impresora.'; end if;
  update privado.puentes_impresion set visto_en = now(), equipo = nullif(left(trim(coalesce(p_equipo, '')), 60), '')
   where negocio_id = nid;
  -- Los que esperaron más de 10 minutos ya no se imprimen (el cliente ya se fue).
  update public.cola_impresion set estado = 'error', error = 'El puente estuvo apagado y el ticket venció'
   where negocio_id = nid and estado = 'pendiente' and creado_en < now() - interval '10 minutes';
  with tomados as (
    update public.cola_impresion c set estado = 'enviado', tomado_en = now()
     where c.id in (select id from public.cola_impresion
                     where negocio_id = nid and estado = 'pendiente'
                     order by creado_en limit 10 for update skip locked)
    returning c.id, c.ip, c.puerto, c.datos, c.creado_en)
  select jsonb_agg(jsonb_build_object('id', id, 'ip', ip, 'puerto', puerto, 'datos', datos) order by creado_en) into r from tomados;
  return coalesce(r, '[]'::jsonb);
end $$;

/** El puente informa si pudo imprimir. */
create function public.puente_resultado(p_codigo text, p_id uuid, p_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  nid := privado.negocio_del_puente(p_codigo);
  if nid is null then raise exception 'Código del puente no válido'; end if;
  update public.cola_impresion
     set estado = case when p_ok then 'impreso' else 'error' end,
         error = case when p_ok then null else left(coalesce(p_error, 'No se pudo imprimir'), 300) end,
         datos = '' -- ya no hace falta guardar el ticket
   where id = p_id and negocio_id = nid and estado = 'enviado';
end $$;

revoke execute on function public.puente_estado(uuid), public.puente_crear(uuid),
  public.puente_trabajos(text, text), public.puente_resultado(text, uuid, boolean, text),
  privado.negocio_del_puente(text) from public;
grant execute on function public.puente_estado(uuid), public.puente_crear(uuid) to authenticated;
grant execute on function public.puente_trabajos(text, text), public.puente_resultado(text, uuid, boolean, text) to anon, authenticated;
