-- ───────────────────────── Página web de la barbería ─────────────────────────
-- Textos, portada, galería y redes que se muestran en la página pública /r/:slug.
alter table public.negocios add column sitio jsonb not null default '{}'
  check (jsonb_typeof(sitio) = 'object' and octet_length(sitio::text) <= 20000);
alter table public.productos add column foto_url text check (char_length(foto_url) <= 500);
alter table public.barberos add column bio text check (char_length(bio) <= 160);

-- Fotos públicas de la página: cada barbería sube en su carpeta (/<negocio_id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sitio', 'sitio', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "sitio: el admin sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'sitio' and exists (
    select 1 from public.negocios n where n.id::text = (storage.foldername(name))[1] and privado.es_admin_de(n.id)));
create policy "sitio: el admin cambia" on storage.objects for update to authenticated
  using (bucket_id = 'sitio' and exists (
    select 1 from public.negocios n where n.id::text = (storage.foldername(name))[1] and privado.es_admin_de(n.id)));
create policy "sitio: el admin borra" on storage.objects for delete to authenticated
  using (bucket_id = 'sitio' and exists (
    select 1 from public.negocios n where n.id::text = (storage.foldername(name))[1] and privado.es_admin_de(n.id)));

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
    -- Los productos solo se venden en línea cuando hay pago en línea.
    'productos', case when privado.tiene_pagos(n.id) and n.pago_en_linea <> 'desactivado' then coalesce((
                   select jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'descripcion', x.descripcion, 'foto_url', x.foto_url,
                                                       'precio', x.precio, 'disponible', least(x.disp, 20)) order by x.nombre)
                     from (select p.*, privado.producto_disponible(p.id) as disp from public.productos p
                            where p.negocio_id = n.id and p.activo and p.en_linea and p.precio > 0) x
                    where x.disp > 0), '[]') else '[]' end)
    from public.negocios n
   where n.slug = lower(trim(p_slug)) and n.reserva_online and privado.negocio_vigente(n.id);
$$;
