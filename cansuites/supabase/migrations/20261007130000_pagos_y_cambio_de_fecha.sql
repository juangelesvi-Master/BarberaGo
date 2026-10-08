-- Pagos en línea con Mercado Pago (como en BarberaGo, para un solo negocio) y cambio de fecha de reservas.
--
-- Flujo de pago: reservar(..., p_pagar) aparta el lugar 20 minutos (pago_estado = 'esperando') → la Edge
-- Function `pagos` crea la liga de Checkout Pro → Mercado Pago avisa al webhook → pago_registrar confirma.
-- Un apartado vencido deja de ocupar lugar y se cancela solo la próxima vez que alguien reserva.
-- Si se cancela una reserva pagada, queda "por reembolsar" y recepción decide desde el panel.

-- ───────────────────────── Cuenta de Mercado Pago ─────────────────────────

create table privado.pago_cuenta (
  id integer primary key default 1 check (id = 1),
  access_token text not null,
  actualizado timestamptz not null default now()
);
revoke all on privado.pago_cuenta from public, anon, authenticated;

alter table public.ajustes
  add column pago_modo text not null default 'no' check (pago_modo in ('no', 'opcional', 'obligatorio')),
  add column pago_anticipo integer not null default 100 check (pago_anticipo in (20, 30, 50, 100)),
  add column pago_cuenta text,
  add column pago_prueba boolean not null default false;

-- El administrador elige el modo y el anticipo; la cuenta conectada solo la cambia el servidor.
revoke update on public.ajustes from authenticated;
grant update (capacidad_hotel, capacidad_guarderia, estetica_simultaneos, intervalo_min, horario, check_in, check_out, pago_modo, pago_anticipo)
  on public.ajustes to authenticated;

-- ───────────────────────── Pagos de reservas ─────────────────────────

alter table public.reservas
  add column pago_estado text not null default 'sin_pago'
    check (pago_estado in ('sin_pago', 'esperando', 'pagado', 'por_reembolsar', 'reembolsado')),
  add column pago_monto numeric(10, 2) not null default 0,
  add column pagado numeric(10, 2) not null default 0,
  add column pago_expira timestamptz,
  add column pago_id text;

-- Al cancelar una reserva pagada (cliente o recepción) el dinero queda por reembolsar;
-- un apartado sin pagar simplemente se suelta.
create function privado.al_cancelar_reserva() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'cancelada' and old.estado <> 'cancelada' then
    if old.pago_estado = 'pagado' and old.pagado > 0 then new.pago_estado := 'por_reembolsar';
    elsif old.pago_estado = 'esperando' then new.pago_estado := 'sin_pago';
    end if;
  end if;
  return new;
end $$;
revoke all on function privado.al_cancelar_reserva() from public, anon, authenticated;
create trigger al_cancelar before update of estado on public.reservas
  for each row execute function privado.al_cancelar_reserva();

/** Cancela los apartados cuyo pago no llegó a tiempo (con unos minutos de gracia). */
create function privado.soltar_apartados() returns void
language sql security definer set search_path = '' as $$
  update public.reservas set estado = 'cancelada'
   where pago_estado = 'esperando' and estado <> 'cancelada' and pago_expira < now() - interval '5 minutes';
$$;
revoke all on function privado.soltar_apartados() from public, anon, authenticated;

/** ¿La reserva ocupa lugar? Las canceladas y los apartados vencidos no. */
create function privado.ocupa(p_estado text, p_pago text, p_expira timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_estado <> 'cancelada' and not (p_pago = 'esperando' and p_expira < now());
$$;

create or replace function public.ocupacion(p_tipo text, p_desde date, p_hasta date)
returns table (dia date, ocupados integer)
language sql stable security definer set search_path = '' as $$
  select d::date, count(r.id)::int
  from generate_series(p_desde, least(p_hasta, p_desde + 120), interval '1 day') d
  join public.reservas r
    on r.tipo = p_tipo and privado.ocupa(r.estado, r.pago_estado, r.pago_expira)
   and r.entrada <= d::date
   and (case when p_tipo = 'hotel' then r.salida > d::date else r.salida >= d::date end)
  where p_tipo in ('hotel', 'guarderia')
  group by d;
$$;

create or replace function public.ocupacion_estetica(p_fecha date)
returns table (hora text, ocupadas integer)
language sql stable security definer set search_path = '' as $$
  select r.hora, count(*)::int from public.reservas r
  where r.tipo = 'estetica' and privado.ocupa(r.estado, r.pago_estado, r.pago_expira) and r.entrada = p_fecha
  group by r.hora;
$$;

/**
 * Valida fechas, horario y cupo de una reserva (nueva o cambiada de fecha) y regresa las unidades
 * (noches, días o 1 cita). `p_sin` es la reserva que se está moviendo, para no contarla contra sí misma.
 */
create function privado.validar_lugar(p_tipo text, p_entrada date, p_salida date, p_hora text, p_sin uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.ajustes;
  v_hoy date := privado.ahora_local()::date;
  v_unidades int;
  v_cap int;
  v_lleno date;
begin
  select * into v_a from public.ajustes where id = 1;
  if p_entrada < v_hoy then raise exception 'Elige una fecha a partir de hoy'; end if;

  if p_tipo = 'hotel' then
    v_unidades := p_salida - p_entrada;
    if v_unidades < 1 then raise exception 'La salida debe ser después de la entrada'; end if;
    v_cap := v_a.capacidad_hotel;
  elsif p_tipo = 'guarderia' then
    v_unidades := p_salida - p_entrada + 1;
    if v_unidades < 1 then raise exception 'El último día no puede ser antes del primero'; end if;
    v_cap := v_a.capacidad_guarderia;
  else
    v_unidades := 1;
    if p_hora is null or p_hora not in (select privado.horas_estetica(p_entrada)) then raise exception 'Elige un horario disponible'; end if;
    -- El personal puede tomar el horario en curso (cliente que llega sin cita).
    if p_entrada = v_hoy and p_hora <= to_char(privado.ahora_local(), 'HH24:MI') and not privado.es_personal() then
      raise exception 'Ese horario ya pasó';
    end if;
    if (select count(*) from public.reservas r
         where r.tipo = 'estetica' and r.entrada = p_entrada and r.hora = p_hora and r.id is distinct from p_sin
           and privado.ocupa(r.estado, r.pago_estado, r.pago_expira)) >= v_a.estetica_simultaneos then
      raise exception 'Ese horario se acaba de ocupar. Elige otro.';
    end if;
  end if;
  if v_unidades > 60 then raise exception 'Para estancias de más de 60 días escríbenos por WhatsApp'; end if;

  if p_tipo <> 'estetica' then
    select d::date into v_lleno
      from generate_series(p_entrada, case when p_tipo = 'hotel' then p_salida - 1 else p_salida end, interval '1 day') d
     where v_cap = 0 or (select count(*) from public.reservas r
             where r.tipo = p_tipo and r.id is distinct from p_sin and privado.ocupa(r.estado, r.pago_estado, r.pago_expira)
               and r.entrada <= d::date and (case when p_tipo = 'hotel' then r.salida > d::date else r.salida >= d::date end)) >= v_cap
     order by d limit 1;
    if v_lleno is not null then raise exception 'No hay lugar el %. Prueba otras fechas.', to_char(v_lleno, 'DD/MM/YYYY'); end if;
  end if;
  return v_unidades;
end $$;
revoke all on function privado.validar_lugar(text, date, date, text, uuid) from public, anon, authenticated;

-- reservar() gana p_pagar: con pago en línea el lugar queda apartado mientras el cliente paga.
-- La versión de 6 parámetros se queda (sin pago) para no romper a quien la llame; la app manda los 7.
create function public.reservar(p_mascota uuid, p_servicio uuid, p_entrada date, p_salida date, p_hora text, p_notas text,
                                p_pagar boolean default false)
returns public.reservas
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_personal boolean := privado.es_personal();
  v_m public.mascotas;
  v_s public.servicios;
  v_a public.ajustes;
  v_unidades int;
  v_pagar boolean := false;
  v_r public.reservas;
begin
  if v_uid is null then raise exception 'Inicia sesión para reservar'; end if;
  select * into v_m from public.mascotas where id = p_mascota;
  if v_m.id is null or (v_m.dueno_id <> v_uid and not v_personal) then raise exception 'No encontramos esa mascota'; end if;
  select * into v_s from public.servicios where id = p_servicio and activo;
  if v_s.id is null then raise exception 'Ese servicio ya no está disponible'; end if;
  select * into v_a from public.ajustes where id = 1;
  if v_s.tipo = 'estetica' then p_salida := p_entrada; end if;

  -- Una reserva a la vez para que dos personas no tomen el último lugar.
  perform pg_advisory_xact_lock(hashtext('cansuites.reservas'));
  perform privado.soltar_apartados();
  v_unidades := privado.validar_lugar(v_s.tipo, p_entrada, p_salida, p_hora, null);

  -- Recepción no cobra en línea. El cliente paga en línea si es obligatorio o si lo eligió (y hay cuenta conectada).
  if not v_personal and exists (select 1 from privado.pago_cuenta)
     and (v_a.pago_modo = 'obligatorio' or (v_a.pago_modo = 'opcional' and coalesce(p_pagar, false))) then
    v_pagar := v_s.precio * v_unidades > 0;
  end if;

  insert into public.reservas (cliente_id, mascota_id, servicio_id, tipo, entrada, salida, hora, unidades, precio_unit, total, estado, notas,
                               pago_estado, pago_monto, pago_expira)
  values (v_m.dueno_id, v_m.id, v_s.id, v_s.tipo, p_entrada, p_salida, case when v_s.tipo = 'estetica' then p_hora end,
          v_unidades, v_s.precio, v_s.precio * v_unidades,
          case when v_personal then 'confirmada' else 'pendiente' end, nullif(trim(p_notas), ''),
          case when v_pagar then 'esperando' else 'sin_pago' end,
          case when v_pagar then round(v_s.precio * v_unidades * v_a.pago_anticipo / 100, 2) else 0 end,
          case when v_pagar then now() + interval '20 minutes' end)
  returning * into v_r;
  return v_r;
end $$;

/**
 * Cambia la fecha (y hora) de una reserva sin perder lo pagado. El precio por noche/día se respeta;
 * el total se recalcula con las nuevas unidades.
 */
create function public.reagendar(p_id uuid, p_entrada date, p_salida date, p_hora text)
returns public.reservas
language plpgsql security definer set search_path = '' as $$
declare
  v_personal boolean := privado.es_personal();
  v_r public.reservas;
  v_unidades int;
begin
  select * into v_r from public.reservas where id = p_id for update;
  if v_r.id is null or (v_r.cliente_id <> (select auth.uid()) and not v_personal) then raise exception 'No encontramos esa reserva'; end if;
  if v_r.estado not in ('pendiente', 'confirmada') then raise exception 'Esta reserva ya no se puede cambiar de fecha'; end if;
  if v_r.pago_estado = 'esperando' then raise exception 'Termina el pago antes de cambiar la fecha'; end if;
  if not v_personal and v_r.entrada < privado.ahora_local()::date then
    raise exception 'Esta reserva ya no se puede cambiar en línea. Escríbenos por WhatsApp.';
  end if;
  if v_r.tipo = 'estetica' then p_salida := p_entrada; else p_hora := null; end if;

  perform pg_advisory_xact_lock(hashtext('cansuites.reservas'));
  perform privado.soltar_apartados();
  v_unidades := privado.validar_lugar(v_r.tipo, p_entrada, p_salida, p_hora, v_r.id);

  update public.reservas
     set entrada = p_entrada, salida = p_salida, hora = p_hora, unidades = v_unidades, total = precio_unit * v_unidades
   where id = v_r.id
  returning * into v_r;
  return v_r;
end $$;

create or replace function public.reservar(p_mascota uuid, p_servicio uuid, p_entrada date, p_salida date, p_hora text, p_notas text)
returns public.reservas
language sql security definer set search_path = '' as $$
  select public.reservar(p_mascota => p_mascota, p_servicio => p_servicio, p_entrada => p_entrada, p_salida => p_salida,
                         p_hora => p_hora, p_notas => p_notas, p_pagar => false);
$$;

revoke execute on function public.reservar(uuid, uuid, date, date, text, text, boolean), public.reagendar(uuid, date, date, text) from public, anon;
grant execute on function public.reservar(uuid, uuid, date, date, text, text, boolean), public.reagendar(uuid, date, date, text) to authenticated;

-- El cliente ya no puede cancelar un apartado mientras paga (lo suelta el vencimiento), y el resto igual que antes.
create or replace function public.cancelar_reserva(p_id uuid) returns void
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

-- ───────────────────────── Funciones del servidor (solo la Edge Function `pagos`) ─────────────────────────

create function public.pago_guardar_cuenta(p_token text, p_cuenta text, p_prueba boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into privado.pago_cuenta (id, access_token) values (1, p_token)
  on conflict (id) do update set access_token = excluded.access_token, actualizado = now();
  update public.ajustes
     set pago_cuenta = p_cuenta, pago_prueba = p_prueba, pago_modo = case when pago_modo = 'no' then 'opcional' else pago_modo end
   where id = 1;
end $$;

create function public.pago_token() returns text
language sql stable security definer set search_path = '' as $$
  select nullif(access_token, '') from privado.pago_cuenta where id = 1;
$$;

create function public.pago_rol(p_usuario uuid) returns text
language sql stable security definer set search_path = '' as $$
  select rol from public.perfiles where id = p_usuario;
$$;

/** Lo necesario para crear (o reintentar) la liga de pago de un apartado vigente. */
create function public.pago_cobro(p_reserva uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_r public.reservas; v_c public.perfiles;
begin
  select * into v_r from public.reservas where id = p_reserva;
  if v_r.id is null then raise exception 'No encontramos esa reserva'; end if;
  if v_r.pago_estado = 'pagado' then raise exception 'Esta reserva ya está pagada'; end if;
  if v_r.pago_estado <> 'esperando' or v_r.estado = 'cancelada' or v_r.pago_expira < now() then
    raise exception 'El tiempo para pagar esta reserva terminó. Haz la reserva de nuevo.';
  end if;
  select * into v_c from public.perfiles where id = v_r.cliente_id;
  return jsonb_build_object(
    'id', v_r.id, 'folio', v_r.folio, 'cliente_id', v_r.cliente_id, 'nombre', v_c.nombre, 'email', v_c.email,
    'monto', v_r.pago_monto, 'expira', v_r.pago_expira, 'servicio_id', v_r.servicio_id,
    'concepto', (select s.nombre from public.servicios s where s.id = v_r.servicio_id)
                || ' · ' || (select m.nombre from public.mascotas m where m.id = v_r.mascota_id)
                || case when v_r.pago_monto < v_r.total then ' (anticipo)' else '' end,
    'access_token', (select nullif(access_token, '') from privado.pago_cuenta where id = 1));
end $$;

/** Registra lo que Mercado Pago dice de un pago. Devuelve 'ok', 'reembolsar' o 'ignorado'. */
create function public.pago_registrar(p_reserva uuid, p_pago_id text, p_estado text, p_monto numeric) returns text
language plpgsql security definer set search_path = '' as $$
declare v_r public.reservas;
begin
  select * into v_r from public.reservas where id = p_reserva for update;
  if v_r.id is null or v_r.pago_monto <= 0 then return 'ignorado'; end if;
  if p_estado <> 'approved' then return 'ok'; end if; -- rechazado: el cliente puede reintentar mientras dure el apartado
  if v_r.pago_id = p_pago_id then return 'ok'; end if; -- aviso repetido
  if v_r.pago_estado in ('pagado', 'por_reembolsar', 'reembolsado') or v_r.estado = 'cancelada' or p_monto + 0.01 < v_r.pago_monto then
    -- Segundo pago, apartado ya cancelado o pago de menos: se devuelve.
    return 'reembolsar';
  end if;
  update public.reservas
     set pago_estado = 'pagado', pago_id = p_pago_id, pagado = round(p_monto, 2),
         estado = case when estado = 'pendiente' then 'confirmada' else estado end
   where id = v_r.id;
  return 'ok';
end $$;

/** Recepción pide devolver lo pagado de una reserva cancelada. */
create function public.pago_por_reembolsar(p_reserva uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('pago_id', pago_id, 'pagado', pagado, 'access_token', (select nullif(access_token, '') from privado.pago_cuenta where id = 1))
    from public.reservas where id = p_reserva and pago_estado = 'por_reembolsar' and pago_id is not null;
$$;

create function public.pago_marcar_reembolso(p_reserva uuid) returns void
language sql security definer set search_path = '' as $$
  update public.reservas set pago_estado = 'reembolsado' where id = p_reserva and pago_estado = 'por_reembolsar';
$$;

revoke execute on function public.pago_guardar_cuenta(text, text, boolean), public.pago_token(), public.pago_rol(uuid),
  public.pago_cobro(uuid), public.pago_registrar(uuid, text, text, numeric), public.pago_por_reembolsar(uuid),
  public.pago_marcar_reembolso(uuid) from public, anon, authenticated;
grant execute on function public.pago_guardar_cuenta(text, text, boolean), public.pago_token(), public.pago_rol(uuid),
  public.pago_cobro(uuid), public.pago_registrar(uuid, text, text, numeric), public.pago_por_reembolsar(uuid),
  public.pago_marcar_reembolso(uuid) to service_role;

/** El administrador desconecta Mercado Pago. */
create function public.pago_desconectar() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then raise exception 'Solo el administrador cambia los pagos'; end if;
  update privado.pago_cuenta set access_token = '', actualizado = now() where id = 1;
  update public.ajustes set pago_modo = 'no', pago_cuenta = null, pago_prueba = false where id = 1;
end $$;
revoke execute on function public.pago_desconectar() from public, anon;
grant execute on function public.pago_desconectar() to authenticated;

/** Recepción marca como reembolsado lo que devolvió por su cuenta (efectivo, transferencia). */
create function public.marcar_reembolsado(p_reserva uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_personal() then raise exception 'Sin permiso'; end if;
  update public.reservas set pago_estado = 'reembolsado' where id = p_reserva and pago_estado = 'por_reembolsar';
end $$;
revoke execute on function public.marcar_reembolsado(uuid) from public, anon;
grant execute on function public.marcar_reembolsado(uuid) to authenticated;
