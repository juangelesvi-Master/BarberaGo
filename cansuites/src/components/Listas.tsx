import type { ReactNode } from 'react';
import type { EstadoPedido, EstadoReserva, Pedido, Reserva } from '../lib/tipos';
import { ESTADOS_PEDIDO, ESTADOS_RESERVA, TIPOS_SERVICIO, esperandoPago } from '../lib/tipos';
import { fechaCorta, fechaDia, precio } from '../lib/formato';

const COLOR_RESERVA: Record<EstadoReserva, string> = {
  pendiente: 'chip-alerta', confirmada: 'chip-ok', en_curso: 'chip-naranja', completada: '', cancelada: 'chip-tenue',
};
const COLOR_PEDIDO: Record<EstadoPedido, string> = {
  pendiente: 'chip-alerta', listo: 'chip-ok', entregado: '', cancelado: 'chip-tenue',
};

export function ChipReserva({ estado }: { estado: EstadoReserva }) {
  return <span className={`chip ${COLOR_RESERVA[estado]}`}>{ESTADOS_RESERVA[estado]}</span>;
}
export function ChipPedido({ estado }: { estado: EstadoPedido }) {
  return <span className={`chip ${COLOR_PEDIDO[estado]}`}>{ESTADOS_PEDIDO[estado]}</span>;
}

/** Lo pagado en línea: pagado, esperando el pago, por devolver o devuelto. */
export function ChipPago({ r }: { r: Reserva }) {
  if (r.pago_estado === 'pagado') return <span className="chip chip-ok">💳 Pagado {precio(r.pagado)}</span>;
  if (r.pago_estado === 'por_reembolsar') return <span className="chip chip-peligro">Por reembolsar {precio(r.pagado)}</span>;
  if (r.pago_estado === 'reembolsado') return <span className="chip chip-tenue">Reembolsado {precio(r.pagado)}</span>;
  if (esperandoPago(r)) return <span className="chip chip-alerta">Esperando pago</span>;
  if (r.pago_estado === 'esperando' && r.estado !== 'cancelada') return <span className="chip chip-tenue">Pago no completado</span>;
  return null;
}

/** Lo que falta por cobrar en CanSuites cuando se pagó un anticipo o cambió el total. */
export function restaPorCobrar(r: Reserva): number {
  return r.pago_estado === 'pagado' ? Math.max(0, r.total - r.pagado) : r.total;
}

/** "lun 6 oct · 11:00", "lun 6 → jue 9 oct (3 noches)". */
export function cuandoReserva(r: Reserva): string {
  if (r.tipo === 'estetica') return `${fechaDia(r.entrada)} · ${r.hora}`;
  if (r.entrada === r.salida) return fechaDia(r.entrada);
  const u = TIPOS_SERVICIO[r.tipo];
  return `${fechaDia(r.entrada)} → ${fechaDia(r.salida)} (${r.unidades} ${r.unidades === 1 ? u.unidad : u.unidades})`;
}

export function FilaReserva({ r, mostrarCliente, children }: { r: Reserva; mostrarCliente?: boolean; children?: ReactNode }) {
  return (
    <div className={`fila-reserva ${r.estado === 'cancelada' ? 'cancelada' : ''}`}>
      <span className="circulo-icono chico" aria-hidden>{TIPOS_SERVICIO[r.tipo].icono}</span>
      <div className="crece">
        <div className="fila-reserva-titulo">
          <strong>{r.mascota_nombre}</strong> · {r.servicio_nombre}
          <ChipReserva estado={r.estado} />
          <ChipPago r={r} />
        </div>
        <small className="tenue">
          {cuandoReserva(r)} · {precio(r.total)}{r.pago_estado === 'pagado' && r.estado !== 'cancelada' && restaPorCobrar(r) > 0 && <> (resta {precio(restaPorCobrar(r))})</>} · #{r.folio}
          {mostrarCliente && r.cliente_nombre && <> · {r.cliente_nombre}</>}
        </small>
        {r.notas && <small className="nota">“{r.notas}”</small>}
      </div>
      {children && <div className="fila-reserva-acciones">{children}</div>}
    </div>
  );
}

export function FilaPedido({ p, mostrarCliente, children }: { p: Pedido; mostrarCliente?: boolean; children?: ReactNode }) {
  return (
    <div className="fila-reserva">
      <span className="circulo-icono chico" aria-hidden>🛍️</span>
      <div className="crece">
        <div className="fila-reserva-titulo">
          <strong>Pedido #{p.folio}</strong> · {precio(p.total)}
          <ChipPedido estado={p.estado} />
        </div>
        <small className="tenue">
          {fechaCorta(p.created_at)}{mostrarCliente && p.cliente_nombre && <> · {p.cliente_nombre}</>} · {p.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(', ')}
        </small>
        {p.notas && <small className="nota">“{p.notas}”</small>}
      </div>
      {children && <div className="fila-reserva-acciones">{children}</div>}
    </div>
  );
}
