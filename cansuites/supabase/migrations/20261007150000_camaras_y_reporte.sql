-- CanSuites · cámaras para clientes con mascota hospedada, y reporte de ventas.

-- ───────────────────────── Cámaras ─────────────────────────
-- El administrador da de alta las cámaras (enlace del reproductor de IPCamLive, Angelcam, etc.).
-- Los clientes no leen la tabla: solo reciben las cámaras por mis_camaras() mientras tienen
-- una mascota en hotel o guardería con check-in hecho (estado en_curso). Al hacer check-out deja de regresarlas.

create table public.camaras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  url text not null check (url ~ '^https://'),
  activa boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.camaras enable row level security;
create policy camaras_ver on public.camaras for select to authenticated using (privado.es_personal());
create policy camaras_admin on public.camaras for all to authenticated
  using (privado.es_admin()) with check (privado.es_admin());

create function public.mis_camaras() returns table (id uuid, nombre text, url text, mascotas text)
language sql stable security definer set search_path = '' as $$
  with dentro as (
    select string_agg(distinct m.nombre, ', ') as mascotas
    from public.reservas r join public.mascotas m on m.id = r.mascota_id
    where r.cliente_id = (select auth.uid()) and r.estado = 'en_curso' and r.tipo in ('hotel', 'guarderia')
  )
  select c.id, c.nombre, c.url, d.mascotas
  from public.camaras c cross join dentro d
  where c.activa and d.mascotas is not null
  order by c.orden, c.nombre;
$$;
revoke execute on function public.mis_camaras() from public, anon;
grant execute on function public.mis_camaras() to authenticated;

-- ───────────────────────── Reporte de ventas ─────────────────────────
-- Una venta cuenta el día que se cierra: reserva terminada (check-out / entregado) o pedido entregado.

alter table public.reservas add column cerrada_at timestamptz;
alter table public.pedidos add column entregado_at timestamptz;

create function privado.reserva_cerrada() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado = 'completada' and old.estado is distinct from 'completada' then new.cerrada_at := now(); end if;
  return new;
end $$;
create trigger al_cerrar_reserva before update of estado on public.reservas
  for each row execute function privado.reserva_cerrada();

create function privado.pedido_entregado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado = 'entregado' and old.estado is distinct from 'entregado' then new.entregado_at := now(); end if;
  return new;
end $$;
create trigger al_entregar_pedido before update of estado on public.pedidos
  for each row execute function privado.pedido_entregado();

revoke all on function privado.reserva_cerrada(), privado.pedido_entregado() from public, anon, authenticated;

create function public.reporte_ventas(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not privado.es_admin() then raise exception 'Solo el administrador ve el reporte de ventas'; end if;
  with
  res as (
    select r.*, s.nombre as servicio,
      coalesce((r.cerrada_at at time zone 'America/Mexico_City')::date, r.salida) as dia,
      case when r.pago_estado = 'pagado' then r.pagado else 0 end as en_linea
    from public.reservas r join public.servicios s on s.id = r.servicio_id
    where r.estado = 'completada'
  ),
  res_r as (select * from res where dia between p_desde and p_hasta),
  ped_r as (
    select * from (
      select p.*, (coalesce(p.entregado_at, p.created_at) at time zone 'America/Mexico_City')::date as dia
      from public.pedidos p where p.estado = 'entregado'
    ) x where dia between p_desde and p_hasta
  )
  select jsonb_build_object(
    'servicios', (select jsonb_build_object('total', coalesce(sum(total), 0), 'cantidad', count(*), 'en_linea', coalesce(sum(en_linea), 0)) from res_r),
    'por_servicio', (select coalesce(jsonb_agg(x order by x.total desc), '[]') from (
      select tipo, servicio as nombre, count(*) as cantidad, sum(unidades) as unidades, sum(total) as total from res_r group by tipo, servicio) x),
    'tienda', (select jsonb_build_object('total', coalesce(sum(total), 0), 'cantidad', count(*)) from ped_r),
    'productos', (select coalesce(jsonb_agg(x order by x.total desc), '[]') from (
      select i.nombre, sum(i.cantidad) as cantidad, sum(i.cantidad * i.precio_unit) as total
      from ped_r p join public.pedido_items i on i.pedido_id = p.id group by i.nombre order by 3 desc limit 15) x),
    'por_dia', (select coalesce(jsonb_agg(x order by x.dia), '[]') from (
      select dia, sum(s) as servicios, sum(t) as tienda from (
        select dia, total as s, 0 as t from res_r union all select dia, 0, total from ped_r) u group by dia) x),
    'reembolsos', (select jsonb_build_object('total', coalesce(sum(pagado), 0), 'cantidad', count(*))
      from public.reservas where pago_estado = 'reembolsado' and entrada between p_desde and p_hasta),
    'por_cobrar', (select jsonb_build_object('total', coalesce(sum(total - case when pago_estado = 'pagado' then pagado else 0 end), 0), 'cantidad', count(*))
      from public.reservas where estado = 'en_curso')
  ) into v;
  return v;
end $$;
revoke execute on function public.reporte_ventas(date, date) from public, anon;
grant execute on function public.reporte_ventas(date, date) to authenticated;
