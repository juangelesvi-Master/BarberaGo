-- Cualquier miembro del equipo puede subir fotos (productos, barberos), no solo el admin.
-- Borrar sigue siendo solo del admin.
create policy "sitio: el equipo sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'sitio' and exists (
    select 1 from public.negocios n where n.id::text = (storage.foldername(name))[1] and privado.es_miembro(n.id)));
create policy "sitio: el equipo cambia" on storage.objects for update to authenticated
  using (bucket_id = 'sitio' and exists (
    select 1 from public.negocios n where n.id::text = (storage.foldername(name))[1] and privado.es_miembro(n.id)));
