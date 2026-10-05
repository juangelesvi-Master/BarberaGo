-- Cada hora pg_cron llama a la Edge Function `maestro` (accion "limpieza"), que borra con la API de Auth
-- las cuentas de más de 24 h sin barbería, sin equipo y sin pago (ver public.limpieza_candidatos).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'barberago-limpieza-cuentas',
  '17 * * * *',
  $$select net.http_post(
      url := 'https://stcazhnnsisklzpdwltu.supabase.co/functions/v1/maestro',
      body := '{"accion":"limpieza"}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    )$$
);
