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

export type DatosTicket = {
  negocio: string; direccion?: string | null; telefono?: string | null; moneda: string;
  folio: number; fecha: Date; cliente?: string; barbero?: string;
  partidas: { cantidad: number; nombre: string; importe: number }[];
  descuento: number; propina: number; total: number; enLinea: number;
  metodo: string; recibido?: number; anulada?: boolean;
};

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
</div></body></html>`;
}

/** Imprime el ticket en un marco oculto (el navegador abre su ventana de impresión). */
export function imprimirTicket(d: DatosTicket, ancho: AnchoTicket) {
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
