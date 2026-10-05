-- Personal sin correo: el administrador da de alta a su gente por nombre y agenda, y la app
-- genera un código de acceso. La cuenta de Auth la crea la Edge Function `personal` con un correo
-- interno derivado del código (nunca recibe correos), así que no se envía ningún email.

alter table public.perfiles add column if not exists personal boolean not null default false;
alter table public.miembros add column if not exists acceso_codigo boolean not null default false;

-- Las cuentas con código son solo de empleado: no pueden crear barberías.
create or replace function privado.negocio_sin_personal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.perfiles where id = new.creado_por and personal) then
    raise exception 'Las cuentas con código de acceso no pueden crear barberías';
  end if;
  return new;
end $$;
revoke execute on function privado.negocio_sin_personal() from public, anon, authenticated;
create trigger negocio_sin_personal before insert on public.negocios
  for each row execute function privado.negocio_sin_personal();

-- ¿p_actor puede administrar el equipo de p_negocio? (la Edge Function pasa el usuario de la sesión)
create or replace function privado.actor_puede_equipo(p_actor uuid, p_negocio uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros
                  where negocio_id = p_negocio and usuario_id = p_actor and activo
                    and (rol = 'admin' or 'equipo' = any (permisos)));
$$;
revoke execute on function privado.actor_puede_equipo(uuid, uuid) from public, anon, authenticated;

-- Validación previa a crear la cuenta (o a cambiar el código / borrar a alguien con código).
create or replace function public.personal_validar(p_actor uuid, p_negocio uuid, p_usuario uuid default null)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.actor_puede_equipo(p_actor, p_negocio) then
    raise exception 'No tienes permiso para administrar el equipo';
  end if;
  if not privado.negocio_vigente(p_negocio) then
    raise exception 'El plan de la barbería venció. Renueva para seguir dando acceso';
  end if;
  if p_usuario is not null then
    if p_usuario = p_actor then raise exception 'No puedes cambiar tu propio acceso aquí'; end if;
    if not exists (select 1 from public.miembros m join public.perfiles p on p.id = m.usuario_id
                    where m.negocio_id = p_negocio and m.usuario_id = p_usuario and p.personal) then
      raise exception 'Esa persona no entra con código en esta barbería';
    end if;
  end if;
end $$;

-- Registra a la persona recién creada en Auth como miembro. Con p_crear_agenda le crea su columna en la agenda.
create or replace function public.personal_registrar(
  p_actor uuid, p_negocio uuid, p_usuario uuid, p_nombre text, p_rol text,
  p_barbero uuid default null, p_crear_agenda boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare v_nombre text := trim(coalesce(p_nombre, '')); v_barb uuid := p_barbero; perm text[]; n_barb int;
begin
  perform public.personal_validar(p_actor, p_negocio);
  if char_length(v_nombre) not between 1 and 60 then raise exception 'El nombre debe tener entre 1 y 60 caracteres'; end if;
  if p_rol not in ('admin', 'recepcion', 'barbero') then raise exception 'Rol no válido'; end if;
  if exists (select 1 from public.miembros where usuario_id = p_usuario) then raise exception 'Esa cuenta ya está registrada'; end if;

  if p_crear_agenda then
    select count(*) into n_barb from public.barberos where negocio_id = p_negocio;
    insert into public.barberos (negocio_id, nombre, color, orden)
    values (p_negocio, v_nombre,
            (array['#c8102e', '#1d4ed8', '#047857', '#b45309', '#7c3aed', '#0e7490', '#be185d', '#4b5563'])[n_barb % 8 + 1], n_barb)
    returning id into v_barb;
  elsif v_barb is not null and not exists (select 1 from public.barberos where id = v_barb and negocio_id = p_negocio) then
    raise exception 'Agenda no válida';
  end if;

  perm := case p_rol
    when 'admin' then array['agenda', 'clientes', 'cobrar', 'caja', 'catalogo', 'inventario', 'reportes', 'equipo', 'ajustes']
    when 'recepcion' then array['agenda', 'clientes', 'cobrar', 'caja']
    else array['agenda', 'clientes', 'cobrar'] end;

  update public.perfiles set personal = true, nombre = v_nombre, email = null where id = p_usuario;
  insert into public.miembros (negocio_id, usuario_id, rol, permisos, nombre, email, barbero_id, acceso_codigo)
  values (p_negocio, p_usuario, p_rol, perm, v_nombre, null, v_barb, true);
end $$;

revoke execute on function public.personal_validar(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.personal_registrar(uuid, uuid, uuid, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.personal_validar(uuid, uuid, uuid) to service_role;
grant execute on function public.personal_registrar(uuid, uuid, uuid, text, text, uuid, boolean) to service_role;
