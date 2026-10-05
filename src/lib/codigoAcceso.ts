/**
 * Código de acceso del personal (Portal barberos). La cuenta no tiene correo real: el correo interno y la
 * contraseña se derivan del código, igual que en la Edge Function `personal`.
 */
const ALFABETO = /[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g;

/** Mayúsculas y solo caracteres válidos (quita guiones y espacios). */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(ALFABETO, '');
}

export async function credencialesDeCodigo(codigo: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`barberago:${codigo}`));
  const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  return { email: `c${hex.slice(0, 24)}@personal.barberago.restorago.com`, password: `Bg1-${codigo}` };
}
