-- Reservas desde recepción: clientes que llegan sin cuenta o sin reserva.

/**
 * Da de alta a un cliente desde el panel (solo personal). Si trae correo y ya tiene cuenta, regresa esa cuenta.
 * La cuenta nueva no tiene contraseña: si se dio un correo real, el cliente puede activarla después con
 * "Olvidé mi contraseña". Sin correo se guarda uno interno que nunca se muestra.
 */
create function public.alta_cliente_mostrador(p_nombre text, p_telefono text, p_email text)
returns public.perfiles
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(nullif(trim(p_email), ''));
  v_id uuid;
  v_p public.perfiles;
begin
  if not privado.es_personal() then raise exception 'Sin permiso'; end if;
  if nullif(trim(p_nombre), '') is null then raise exception 'Escribe el nombre del cliente'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ese correo no es válido'; end if;

  if v_email is not null then
    select id into v_id from auth.users where lower(email) = v_email;
    if v_id is not null then
      select * into v_p from public.perfiles where id = v_id;
      return v_p;
    end if;
  end if;

  v_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    coalesce(v_email, 'sin-correo-' || v_id || '@mostrador.cansuites.com'), '', now(),
    '{"provider":"email","providers":["email"],"mostrador":true}',
    jsonb_build_object('nombre', trim(p_nombre), 'telefono', nullif(trim(p_telefono), '')), now(), now(),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', coalesce(v_email, ''), 'email_verified', v_email is not null),
    'email', now(), now());

  -- El perfil lo crea el trigger de auth.users; aquí solo se ajustan los datos.
  update public.perfiles set nombre = trim(p_nombre), telefono = nullif(trim(p_telefono), ''), email = v_email
  where id = v_id returning * into v_p;
  return v_p;
end $$;
revoke execute on function public.alta_cliente_mostrador(text, text, text) from public, anon;
grant execute on function public.alta_cliente_mostrador(text, text, text) to authenticated;

-- reservar(): el personal puede registrar la cita de estética del horario en curso (cliente que llega sin cita).
create or replace function public.reservar(p_mascota uuid, p_servicio uuid, p_entrada date, p_salida date, p_hora text, p_notas text)
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
    if p_entrada = v_hoy and p_hora <= to_char(privado.ahora_local(), 'HH24:MI') and not privado.es_personal() then
      raise exception 'Ese horario ya pasó';
    end if;
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
