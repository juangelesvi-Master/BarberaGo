-- Citas pagadas en línea: si se cancelan, el pago queda a favor del cliente y la cita se puede reagendar.
-- En productos no hay cambios ni devoluciones (se avisa en la tienda, la reserva y el ticket).

-- El cliente ahora sí puede cancelar una cita pagada; el pago se conserva para reagendar.
create or replace function public.reserva_cancelar(p_cita uuid, p_telefono text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.citas c set estado = 'cancelada',
         pago_estado = case when c.pago_estado = 'pendiente' then 'fallido' else c.pago_estado end
    from public.clientes cl
   where c.id = p_cita and cl.id = c.cliente_id and cl.negocio_id = c.negocio_id
     and cl.telefono = regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g')
     and c.estado in ('pendiente', 'confirmada') and c.inicio > now();
  if not found then raise exception 'No encontramos una cita activa con esos datos'; end if;
end $$;

/** Datos de una cita para la página pública de cancelar o reagendar (pide el teléfono con el que reservó). */
create function public.reserva_cita(p_cita uuid, p_telefono text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  select jsonb_build_object(
           'id', c.id, 'estado', c.estado, 'inicio', c.inicio, 'fin', c.fin,
           'servicio_id', c.servicio_id, 'servicio', s.nombre, 'barbero_id', c.barbero_id, 'barbero', b.nombre,
           'pago_estado', c.pago_estado, 'pago_monto', c.pago_monto,
           'reagendable', c.pago_estado = 'pagado' and c.servicio_id is not null
                          and (c.estado = 'cancelada' or (c.estado in ('pendiente', 'confirmada') and c.inicio > now())))
    into r
    from public.citas c
    join public.clientes cl on cl.id = c.cliente_id and cl.negocio_id = c.negocio_id
    left join public.servicios s on s.id = c.servicio_id
    left join public.barberos b on b.id = c.barbero_id
   where c.id = p_cita and cl.telefono = regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  if r is null then raise exception 'No encontramos una cita con esos datos'; end if;
  return r;
end $$;

/** El cliente mueve su cita pagada (activa o cancelada) a otro horario libre. El pago se conserva. */
create function public.reserva_reagendar(p_cita uuid, p_telefono text, p_inicio timestamptz, p_barbero uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.citas; n public.negocios; s public.servicios; bid uuid;
begin
  select c0.* into c
    from public.citas c0 join public.clientes cl on cl.id = c0.cliente_id and cl.negocio_id = c0.negocio_id
   where c0.id = p_cita and cl.telefono = regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g')
   for update of c0;
  if c is null then raise exception 'No encontramos una cita con esos datos'; end if;
  if c.pago_estado is distinct from 'pagado' then raise exception 'Solo se pueden reagendar las citas pagadas en línea'; end if;
  if not (c.estado = 'cancelada' or (c.estado in ('pendiente', 'confirmada') and c.inicio > now())) then
    raise exception 'Esta cita ya no se puede reagendar';
  end if;
  select * into n from public.negocios where id = c.negocio_id;
  if not n.reserva_online or not privado.negocio_vigente(n.id) then raise exception 'La barbería no recibe reservas en línea por ahora'; end if;
  select * into s from public.servicios where id = c.servicio_id and negocio_id = n.id;
  if s is null then raise exception 'El servicio de esta cita ya no existe, comunícate con la barbería'; end if;
  if p_inicio <= now() then raise exception 'Elige un horario futuro'; end if;

  select l.barbero_id into bid
    from privado.horarios_libres(n.id, s.id, p_barbero, (p_inicio at time zone n.zona_horaria)::date) l
   where l.inicio = p_inicio
   order by l.barbero_id limit 1;
  if bid is null then raise exception 'Ese horario ya no está disponible, elige otro'; end if;

  begin
    update public.citas
       set inicio = p_inicio, fin = p_inicio + make_interval(mins => s.duracion_min), barbero_id = bid, estado = 'confirmada'
     where id = c.id;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar, elige otro';
  end;
  return jsonb_build_object('id', c.id, 'inicio', p_inicio, 'servicio', s.nombre,
                            'barbero', (select nombre from public.barberos where id = bid));
end $$;

revoke execute on function public.reserva_cita(uuid, text) from public;
revoke execute on function public.reserva_reagendar(uuid, text, timestamptz, uuid) from public;
grant execute on function public.reserva_cita(uuid, text) to anon, authenticated;
grant execute on function public.reserva_reagendar(uuid, text, timestamptz, uuid) to anon, authenticated;
