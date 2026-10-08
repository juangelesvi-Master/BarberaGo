export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function dinero(n: number | null | undefined, moneda = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(Number(n || 0));
}

export function hora(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function fechaLarga(d: Date | string): string {
  return new Date(d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fechaCorta(d: Date | string): string {
  return new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "YYYY-MM-DD" de una fecha en hora local. */
export function isoDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function deIsoDia(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function sumarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Día ISO (1 = lunes … 7 = domingo). */
export function diaIso(d: Date): string {
  return String(((d.getDay() + 6) % 7) + 1);
}

export function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function soloDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

export function whatsapp(tel: string | null | undefined, texto: string): string | null {
  if (!tel) return null;
  let t = soloDigitos(tel);
  if (t.length === 10) t = '52' + t; // número mexicano sin lada internacional
  return `https://wa.me/${t}?text=${encodeURIComponent(texto)}`;
}

/** Precio para la página pública: sin centavos cuando es cerrado ($250 en vez de $250.00). */
export function precio(n: number | null | undefined, moneda = 'MXN'): string {
  const v = Number(n || 0);
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
}

/** Hoy como "YYYY-MM-DD" en hora local. */
export function hoyIso(): string {
  return isoDia(new Date());
}

/** Suma días a un "YYYY-MM-DD". */
export function sumarDiasIso(s: string, n: number): string {
  return isoDia(sumarDias(deIsoDia(s), n));
}

/** Días de diferencia entre dos "YYYY-MM-DD" (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((deIsoDia(b).getTime() - deIsoDia(a).getTime()) / 864e5);
}

/** "lun 6 oct" de un "YYYY-MM-DD". */
export function fechaDia(s: string): string {
  return deIsoDia(s).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Edad legible a partir de la fecha de nacimiento ("3 años", "7 meses"). */
export function edad(nacimiento: string | null): string | null {
  if (!nacimiento) return null;
  const n = deIsoDia(nacimiento);
  const hoy = new Date();
  let meses = (hoy.getFullYear() - n.getFullYear()) * 12 + hoy.getMonth() - n.getMonth();
  if (hoy.getDate() < n.getDate()) meses--;
  if (meses < 1) return 'menos de un mes';
  if (meses < 12) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const a = Math.floor(meses / 12);
  return `${a} ${a === 1 ? 'año' : 'años'}`;
}

/** "HH:MM" de un valor de hora que puede venir como "HH:MM:SS". */
export function horaCorta(h: string | null | undefined): string {
  return h ? h.slice(0, 5) : '';
}
