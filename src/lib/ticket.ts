import qrcode from 'qrcode-generator';
import { dinero } from './formato';

/** Ancho del papel de la impresora térmica (se recuerda en este dispositivo). */
export type AnchoTicket = '58' | '80';
const CLAVE = 'barberago-ticket-ancho';

export function anchoGuardado(): AnchoTicket {
  try { return localStorage.getItem(CLAVE) === '58' ? '58' : '80'; } catch { return '80'; }
}
export function guardarAncho(a: AnchoTicket) {
  try { localStorage.setItem(CLAVE, a); } catch { /* sin almacenamiento: no pasa nada */ }
}

/** Puente de la app BarberaGo para Android (android-web/…/Impresora.java). Bluetooth llegó en la 1.2. */
type Nativo = {
  version(): string;
  imprimirRed(ip: string, puerto: number, base64: string): string;
  imprimirHtml(html: string, titulo: string): void;
  listarBluetooth?(): string;
  imprimirBluetooth?(mac: string, base64: string): string;
};
const nativo = () => (window as unknown as { BarberaGoNativo?: Nativo }).BarberaGoNativo;
export const enAppAndroid = () => !!nativo();
export const appConBluetooth = () => typeof nativo()?.listarBluetooth === 'function';

/** Impresora térmica de este dispositivo (solo la usa la app de Android): por red (IP) o Bluetooth emparejada. */
export type ImpresoraRed = { tipo: 'red'; ip: string; puerto: number };
export type ImpresoraBluetooth = { tipo: 'bluetooth'; mac: string; nombre: string };
export type Impresora = ImpresoraRed | ImpresoraBluetooth;
const CLAVE_RED = 'barberago-impresora-red';
export function impresoraGuardada(): Impresora | null {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_RED) || 'null');
    if (d?.tipo === 'bluetooth' && d.mac) return { tipo: 'bluetooth', mac: String(d.mac), nombre: String(d.nombre || d.mac) };
    return d?.ip ? { tipo: 'red', ip: String(d.ip), puerto: Number(d.puerto) || 9100 } : null;
  } catch { return null; }
}
export function guardarImpresora(r: Impresora | null) {
  try { if (r) localStorage.setItem(CLAVE_RED, JSON.stringify(r)); else localStorage.removeItem(CLAVE_RED); } catch { /* nada */ }
}

/** Dispositivos Bluetooth emparejados en Android. Lanza el error (permiso, Bluetooth apagado…). */
export function listarBluetooth(): { nombre: string; mac: string }[] {
  const n = nativo();
  if (!n?.listarBluetooth) throw new Error('Actualiza la app BarberaGo para Android para usar impresoras Bluetooth');
  const r = JSON.parse(n.listarBluetooth());
  if (!Array.isArray(r)) throw new Error(r?.error || 'No se pudo leer la lista de Bluetooth');
  return r;
}

/** Liga pública de reservas de la barbería (la misma que comparte en redes). */
export const ligaReservas = (slug: string) => `https://barberago.restorago.com/r/${slug}`;

function matrizQr(texto: string) {
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  return q;
}

export type DatosTicket = {
  negocio: string; direccion?: string | null; telefono?: string | null; moneda: string;
  folio: number; fecha: Date; cliente?: string; barbero?: string;
  partidas: { cantidad: number; nombre: string; importe: number; producto?: boolean }[];
  descuento: number; propina: number; total: number; enLinea: number;
  metodo: string; recibido?: number; anulada?: boolean;
  /** Liga de la página de reservas: se imprime como código QR al final. */
  qr?: string;
};

const SIN_DEVOLUCIONES = 'Productos sin cambios ni devoluciones';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** HTML del ticket, en blanco y negro y a la medida del papel térmico. */
export function htmlTicket(d: DatosTicket, ancho: AnchoTicket): string {
  const m = (n: number) => esc(dinero(n, d.moneda));
  const fila = (a: string, b: string, clase = '') => `<tr class="${clase}"><td>${a}</td><td class="n">${b}</td></tr>`;
  const aqui = d.total - d.enLinea;
  const filas = [
    ...d.partidas.map((p) => fila(`${p.cantidad} × ${esc(p.nombre)}`, m(p.importe))),
    d.descuento > 0 ? fila('Descuento', `−${m(d.descuento)}`) : '',
    d.propina > 0 ? fila('Propina', m(d.propina)) : '',
    fila('TOTAL', m(d.total), 'total'),
    d.enLinea > 0 ? fila('Pagado en línea', `−${m(d.enLinea)}`) : '',
    d.enLinea > 0 ? fila(`Pagado aquí (${esc(d.metodo)})`, m(aqui), 'total') : fila(`Pago: ${esc(d.metodo)}`, ''),
    d.metodo === 'efectivo' && d.recibido && d.recibido > aqui ? fila('Recibido', m(d.recibido)) + fila('Cambio', m(d.recibido - aqui)) : '',
  ].join('');
  const mm = ancho === '58' ? 48 : 72; // área imprimible
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${d.folio}</title><style>
@page { size: ${ancho}mm auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; padding: 3mm ${ancho === '58' ? 2 : 4}mm; width: ${ancho}mm; font: ${ancho === '58' ? 11 : 12.5}px/1.35 'Courier New', monospace; color: #000; background: #fff; }
.t { width: ${mm}mm; margin: 0 auto; }
h1 { font-size: 1.25em; text-align: center; margin: 0 0 1mm; text-transform: uppercase; }
.c { text-align: center; margin: 0; }
hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: .4mm 0; vertical-align: top; }
td.n { text-align: right; white-space: nowrap; padding-left: 2mm; }
tr.total td { font-weight: bold; font-size: 1.1em; border-top: 1px dashed #000; padding-top: 1mm; }
.qr { width: ${ancho === '58' ? 30 : 36}mm; margin: 3mm auto 1mm; }
.qr svg { display: block; width: 100%; height: auto; }
.url { font-size: .85em; word-break: break-all; }
.aviso { font-size: .85em; margin-top: 1mm; }
.anulada { text-align: center; font-weight: bold; border: 2px solid #000; margin: 2mm 0; padding: 1mm; }
</style></head><body><div class="t">
<h1>${esc(d.negocio)}</h1>
${d.direccion ? `<p class="c">${esc(d.direccion)}</p>` : ''}
${d.telefono ? `<p class="c">Tel. ${esc(d.telefono)}</p>` : ''}
<hr>
<p>Folio: <b>#${d.folio}</b><br>${esc(d.fecha.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }))}
${d.cliente ? `<br>Cliente: ${esc(d.cliente)}` : ''}${d.barbero ? `<br>Atendió: ${esc(d.barbero)}` : ''}</p>
${d.anulada ? '<div class="anulada">VENTA ANULADA</div>' : ''}
<hr><table>${filas}</table><hr>
<p class="c">¡Gracias por tu visita!</p>
${d.partidas.some((p) => p.producto) ? `<p class="c aviso">${SIN_DEVOLUCIONES}</p>` : ''}
${d.qr ? `<div class="qr">${matrizQr(d.qr).createSvgTag({ cellSize: 4, margin: 0, scalable: true })}</div>
<p class="c"><b>Reserva tu próxima cita</b><br><span class="url">${esc(d.qr.replace(/^https:\/\//, ''))}</span></p>` : ''}
</div></body></html>`;
}

// ───────────── ESC/POS para impresoras térmicas de red ─────────────

// Página de códigos 850 (la que traen casi todas las térmicas) para los acentos del español.
const CP850: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9, '¿': 0xa8, '¡': 0xad, '°': 0xf8,
};
function bytesTexto(t: string): number[] {
  const r: number[] = [];
  for (const c of t.replace(/×/g, 'x').replace(/[−–—]/g, '-')) {
    if (CP850[c] !== undefined) r.push(CP850[c]);
    else {
      const simple = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const code = simple.charCodeAt(0);
      r.push(code >= 32 && code < 127 ? code : 0x3f);
    }
  }
  return r;
}

/** Ticket en comandos ESC/POS: 32 columnas en papel de 58 mm, 48 en 80 mm. */
export function escposTicket(d: DatosTicket, ancho: AnchoTicket): Uint8Array {
  const cols = ancho === '58' ? 32 : 48;
  const b: number[] = [];
  const ESC = 0x1b, GS = 0x1d;
  const cmd = (...x: number[]) => b.push(...x);
  const linea = (t = '') => { b.push(...bytesTexto(t)); b.push(0x0a); };
  const centro = (on: boolean) => cmd(ESC, 0x61, on ? 1 : 0);
  const negrita = (on: boolean) => cmd(ESC, 0x45, on ? 1 : 0);
  const partir = (t: string, w: number) => { const r: string[] = []; let x = t; while (x.length > w) { r.push(x.slice(0, w)); x = x.slice(w); } r.push(x); return r; };
  const dosCol = (a: string, z: string) => {
    const izq = partir(a, Math.max(8, cols - z.length - 1));
    izq.forEach((t, i) => linea(i === izq.length - 1 ? t + ' '.repeat(Math.max(1, cols - t.length - z.length)) + z : t));
  };
  const guiones = () => linea('-'.repeat(cols));
  const m = (n: number) => dinero(n, d.moneda);
  const aqui = d.total - d.enLinea;

  cmd(ESC, 0x40);            // reinicia
  cmd(ESC, 0x74, 2);         // página de códigos 850
  centro(true);
  cmd(GS, 0x21, 0x11); negrita(true);
  partir(d.negocio.toUpperCase(), Math.floor(cols / 2)).forEach((t) => linea(t));
  cmd(GS, 0x21, 0x00); negrita(false);
  if (d.direccion) partir(d.direccion, cols).forEach((t) => linea(t));
  if (d.telefono) linea(`Tel. ${d.telefono}`);
  centro(false);
  guiones();
  negrita(true); linea(`Folio #${d.folio}`); negrita(false);
  linea(d.fecha.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }));
  if (d.cliente) linea(`Cliente: ${d.cliente}`);
  if (d.barbero) linea(`Atendió: ${d.barbero}`);
  if (d.anulada) { centro(true); negrita(true); linea('*** VENTA ANULADA ***'); negrita(false); centro(false); }
  guiones();
  for (const p of d.partidas) dosCol(`${p.cantidad} x ${p.nombre}`, m(p.importe));
  if (d.descuento > 0) dosCol('Descuento', `-${m(d.descuento)}`);
  if (d.propina > 0) dosCol('Propina', m(d.propina));
  guiones();
  negrita(true); dosCol('TOTAL', m(d.total)); negrita(false);
  if (d.enLinea > 0) { dosCol('Pagado en línea', `-${m(d.enLinea)}`); negrita(true); dosCol(`Pagado aquí (${d.metodo})`, m(aqui)); negrita(false); }
  else dosCol('Pago', d.metodo);
  if (d.metodo === 'efectivo' && d.recibido && d.recibido > aqui) { dosCol('Recibido', m(d.recibido)); dosCol('Cambio', m(d.recibido - aqui)); }
  guiones();
  centro(true); linea('¡Gracias por tu visita!');
  if (d.partidas.some((p) => p.producto)) partir(SIN_DEVOLUCIONES, cols).forEach((t) => linea(t));
  if (d.qr) {
    linea();
    imagenQr(b, d.qr, ancho);
    negrita(true); linea('Reserva tu próxima cita'); negrita(false);
    partir(d.qr.replace(/^https:\/\//, ''), cols).forEach((t) => linea(t));
  }
  centro(false);
  linea(); linea(); linea();
  cmd(GS, 0x56, 0x42, 0x00); // corte parcial
  return new Uint8Array(b);
}

/** Código QR como imagen de puntos (GS v 0): la imprimen todas las térmicas compatibles con ESC/POS. */
function imagenQr(b: number[], texto: string, ancho: AnchoTicket) {
  const q = matrizQr(texto);
  const n = q.getModuleCount();
  const margen = 2;
  const escala = Math.max(2, Math.floor((ancho === '58' ? 210 : 260) / (n + margen * 2)));
  const lado = (n + margen * 2) * escala;
  const bytesFila = Math.ceil(lado / 8);
  b.push(0x1d, 0x76, 0x30, 0x00, bytesFila & 0xff, bytesFila >> 8, lado & 0xff, lado >> 8);
  for (let y = 0; y < lado; y++) {
    const fila = new Array(bytesFila).fill(0);
    const my = Math.floor(y / escala) - margen;
    for (let x = 0; x < lado; x++) {
      const mx = Math.floor(x / escala) - margen;
      if (my >= 0 && mx >= 0 && my < n && mx < n && q.isDark(my, mx)) fila[x >> 3] |= 0x80 >> (x & 7);
    }
    b.push(...fila);
  }
  b.push(0x0a);
}

function base64(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((x) => { s += String.fromCharCode(x); });
  return btoa(s);
}

/** Manda bytes ESC/POS a la impresora: desde la app de Android (red o Bluetooth) o, en el navegador, por el puente (red). */
export async function imprimirEnImpresora(bytes: Uint8Array, r: Impresora) {
  const n = nativo();
  if (!n) {
    if (r.tipo === 'red') return imprimirPorPuente(bytes, r);
    throw new Error('Las impresoras Bluetooth solo funcionan en la app BarberaGo para Android');
  }
  let error: string;
  if (r.tipo === 'bluetooth') {
    if (!n.imprimirBluetooth) throw new Error('Actualiza la app BarberaGo para Android para usar impresoras Bluetooth');
    error = n.imprimirBluetooth(r.mac, base64(bytes));
  } else error = n.imprimirRed(r.ip, r.puerto, base64(bytes));
  if (error) throw new Error(error);
}

// ───────────── Puente de impresión (puente-impresora/, programa para la computadora) ─────────────
// El navegador no puede abrir conexiones TCP; el puente escucha en esta misma computadora y
// reenvía el ticket a la impresora de red.
const PUENTE = 'http://127.0.0.1:9123';
export const DESCARGA_PUENTE = '/descargas/BarberaGoPuente.exe';
const SIN_PUENTE = 'No encontramos el puente de impresión en esta computadora. Ábrelo (BarberaGoPuente) y vuelve a intentar.';

/** Versión del puente si está abierto en esta computadora, o null. */
export async function estadoPuente(): Promise<string | null> {
  try {
    const r = await fetch(`${PUENTE}/estado`, { signal: AbortSignal.timeout(2000) });
    const d = await r.json();
    return d?.ok ? String(d.version) : null;
  } catch { return null; }
}

async function imprimirPorPuente(bytes: Uint8Array, r: ImpresoraRed) {
  let resp: Response;
  try {
    resp = await fetch(`${PUENTE}/imprimir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: r.ip, puerto: r.puerto, datos: base64(bytes) }), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error(SIN_PUENTE); }
  const d = await resp.json().catch(() => null);
  if (!resp.ok || !d?.ok) throw new Error(d?.error || 'No se pudo imprimir');
}

/** Ticket de prueba para revisar la conexión y el ancho del papel. */
export function ticketPrueba(): DatosTicket {
  return {
    negocio: 'BarberaGo', direccion: 'Prueba de impresora', moneda: 'MXN', folio: 0, fecha: new Date(),
    partidas: [{ cantidad: 1, nombre: 'Corte clásico', importe: 250 }, { cantidad: 2, nombre: 'Cera para peinar con acabado mate', importe: 360 }],
    descuento: 0, propina: 30, total: 640, enLinea: 0, metodo: 'efectivo', recibido: 700, qr: ligaReservas('tu-barberia'),
  };
}

/**
 * Imprime el ticket:
 *  - en la app de Android con impresora guardada → directo por IP o Bluetooth (ESC/POS);
 *  - en la app de Android sin impresora → diálogo de impresión de Android;
 *  - en el navegador con impresora de red guardada → por el puente de impresión de la computadora;
 *  - en el navegador sin impresora → ventana de impresión del navegador.
 * Lanza el error si la impresora no respondió.
 */
export async function imprimirTicket(d: DatosTicket, ancho: AnchoTicket) {
  const n = nativo();
  const imp = impresoraGuardada();
  if (n) {
    if (imp) return imprimirEnImpresora(escposTicket(d, ancho), imp);
    return n.imprimirHtml(htmlTicket(d, ancho), `Ticket ${d.folio}`);
  }
  if (imp?.tipo === 'red') return imprimirPorPuente(escposTicket(d, ancho), imp);
  imprimirNavegador(d, ancho);
}

/** Imprime el ticket en un marco oculto (el navegador abre su ventana de impresión). */
function imprimirNavegador(d: DatosTicket, ancho: AnchoTicket) {
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(marco);
  const doc = marco.contentDocument!;
  doc.open(); doc.write(htmlTicket(d, ancho)); doc.close();
  const quitar = () => setTimeout(() => marco.remove(), 1000);
  setTimeout(() => {
    const w = marco.contentWindow!;
    w.addEventListener('afterprint', quitar);
    w.focus(); w.print();
    setTimeout(quitar, 60000);
  }, 150);
}
