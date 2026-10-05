import { createClient } from '@supabase/supabase-js';

// Valores por defecto: proyecto Supabase "barberagosuitestudios-barberaGoBD". La llave publicable es pública por diseño;
// la seguridad la dan las políticas RLS de la base.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://stcazhnnsisklzpdwltu.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_GxCR32wwmIYgifjE-L7xzg_8plHLGfb';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Mensaje legible de un error de Supabase/Postgres. */
export function mensajeError(e: unknown): string {
  if (!e) return 'Ocurrió un error';
  const m = (e as { message?: string }).message || String(e);
  if (m.includes('citas_sin_empalme')) return 'Ese barbero ya tiene una cita en ese horario';
  if (m.includes('negocios_slug_key')) return 'Ese enlace ya lo usa otra barbería';
  if (m.includes('clientes_telefono_uidx')) return 'Ya existe un cliente con ese teléfono';
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos';
  if (m.includes('Email not confirmed')) return 'Confirma tu correo antes de entrar (revisa tu bandeja)';
  if (m.includes('User already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión';
  return m;
}

/** Llama una Edge Function y devuelve su respuesta o lanza el error legible. */
async function llamarFuncion<T>(nombre: string, cuerpo: Record<string, unknown>, porDefecto: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nombre, { body: cuerpo });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const detalle = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error(detalle?.error || porDefecto);
  }
  return data as T;
}

/** Edge Function de pagos (Mercado Pago). */
export function llamarPagos<T>(cuerpo: Record<string, unknown>): Promise<T> {
  return llamarFuncion<T>('pagos', cuerpo, 'No se pudo conectar con el sistema de pagos. Intenta de nuevo.');
}

/** Edge Function del personal con código de acceso. */
export function llamarPersonal<T>(cuerpo: Record<string, unknown>): Promise<T> {
  return llamarFuncion<T>('personal', cuerpo, 'No se pudo completar. Intenta de nuevo.');
}
