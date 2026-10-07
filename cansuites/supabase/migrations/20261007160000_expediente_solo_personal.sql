-- CanSuites · el historial médico lo llena solo el personal (en la cita). El dueño lo consulta, no lo modifica.
-- Las entradas que ya había registrado algún dueño se quedan; solo el personal puede editarlas o borrarlas.
alter policy registros_alta on public.registros_medicos with check (privado.es_personal());
alter policy registros_editar on public.registros_medicos using (privado.es_personal()) with check (privado.es_personal());
alter policy registros_borrar on public.registros_medicos using (privado.es_personal());
