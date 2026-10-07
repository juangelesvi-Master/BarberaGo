import type { Api } from './api';
import { apiDemo } from './api-demo';
import { apiSupabase } from './api-supabase';

/** Base real de Supabase, o modo demostración en el navegador con VITE_DEMO=1 (`npm run dev:demo`). */
export const api: Api = import.meta.env.VITE_DEMO === '1' ? apiDemo : apiSupabase;

/** Mensaje legible de un error de Supabase/Postgres o de la demostración. */
export function mensajeError(e: unknown): string {
  if (!e) return 'Ocurrió un error';
  const m = (e as { message?: string }).message || String(e);
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos';
  if (m.includes('Email not confirmed')) return 'Confirma tu correo antes de entrar (revisa tu bandeja)';
  if (m.includes('User already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión';
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres';
  if (m.includes('Failed to fetch')) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
  return m;
}
