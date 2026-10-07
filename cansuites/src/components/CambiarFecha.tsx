import { useEffect, useState, type FormEvent } from 'react';
import { api, mensajeError } from '../lib/datos';
import { horasDelDia } from '../lib/api';
import type { Ajustes, Reserva } from '../lib/tipos';
import { TIPOS_SERVICIO } from '../lib/tipos';
import { diasEntre, hoyIso, precio, sumarDiasIso } from '../lib/formato';
import { cuandoReserva } from './Listas';
import { Aviso, Campo, Modal } from './ui';

/**
 * Cambiar la fecha de una reserva (cliente o recepción). Se queda la misma reserva y lo pagado;
 * el total se recalcula con el mismo precio por noche/día.
 */
export default function CambiarFecha({ r, onCerrar, onHecho }: { r: Reserva; onCerrar: () => void; onHecho: (r: Reserva) => void }) {
  const hoy = hoyIso();
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [entrada, setEntrada] = useState(r.entrada >= hoy ? r.entrada : hoy);
  const [salida, setSalida] = useState(r.salida);
  const [hora, setHora] = useState<string | null>(null);
  const [ocupacion, setOcupacion] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { api.ajustes().then(setAjustes).catch(() => {}); }, []);
  useEffect(() => {
    if (r.tipo !== 'estetica') return;
    setHora(null);
    api.ocupacionEstetica(entrada).then(setOcupacion).catch(() => setOcupacion({}));
  }, [r.tipo, entrada]);

  const unidades = r.tipo === 'hotel' ? diasEntre(entrada, salida) : r.tipo === 'guarderia' ? diasEntre(entrada, salida) + 1 : 1;
  const total = r.precio_unit * Math.max(unidades, 0);
  const pagado = r.pago_estado === 'pagado' ? r.pagado : 0;
  const horas = ajustes && r.tipo === 'estetica' ? horasDelDia(ajustes, entrada) : [];
  const ahora = new Date().toTimeString().slice(0, 5);

  function cambiaEntrada(v: string) {
    if (!v) return;
    // Se conserva la duración: mover la entrada mueve también la salida.
    const dur = diasEntre(entrada, salida);
    setEntrada(v);
    if (r.tipo !== 'estetica') setSalida(sumarDiasIso(v, Math.max(dur, r.tipo === 'hotel' ? 1 : 0)));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (r.tipo === 'estetica' && !hora) { setError('Elige la hora'); return; }
    setGuardando(true);
    try {
      onHecho(await api.reagendar(r.id, { entrada, salida: r.tipo === 'estetica' ? entrada : salida, hora }));
    } catch (err) {
      setError(mensajeError(err));
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={`Cambiar fecha · ${r.mascota_nombre || 'reserva'} #${r.folio}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="tenue">Ahora: {cuandoReserva(r)} · {r.servicio_nombre}</p>
        <div className="fila-campos">
          <Campo etiqueta={r.tipo === 'hotel' ? 'Nueva entrada' : r.tipo === 'guarderia' ? 'Primer día' : 'Nuevo día'}>
            <input type="date" min={hoy} value={entrada} onChange={(e) => cambiaEntrada(e.target.value)} />
          </Campo>
          {r.tipo !== 'estetica' && (
            <Campo etiqueta={r.tipo === 'hotel' ? 'Nueva salida' : 'Último día'}>
              <input type="date" min={r.tipo === 'hotel' ? sumarDiasIso(entrada, 1) : entrada} value={salida} onChange={(e) => e.target.value && setSalida(e.target.value)} />
            </Campo>
          )}
        </div>
        {r.tipo === 'estetica' && (horas.length === 0 ? <p className="tenue pequeno">Ese día no hay horario de estética.</p> : (
          <div className="horas">
            {horas.map((h) => {
              const llena = (ocupacion[h] || 0) >= (ajustes?.estetica_simultaneos || 0) || (entrada === hoy && h <= ahora);
              return <button key={h} type="button" className={`hora ${h === hora ? 'elegida' : ''} ${llena ? 'ocupada' : ''}`} disabled={llena} onClick={() => setHora(h)}>{h}</button>;
            })}
          </div>
        ))}
        {unidades >= 1 && (
          <div className="resumen-total">
            <span>{r.tipo === 'estetica' ? 'Total' : `${unidades} ${unidades === 1 ? TIPOS_SERVICIO[r.tipo].unidad : TIPOS_SERVICIO[r.tipo].unidades} × ${precio(r.precio_unit)}`}</span>
            <strong>{precio(total)}</strong>
          </div>
        )}
        {pagado > 0 && unidades >= 1 && (
          <Aviso tipo="info">
            Lo que ya se pagó ({precio(pagado)}) se queda para la nueva fecha.
            {total > pagado ? ` Resta ${precio(total - pagado)} que se paga en CanSuites.` : total < pagado ? ` Quedan ${precio(pagado - total)} a favor; CanSuites te contacta para devolverlos o usarlos.` : ''}
          </Aviso>
        )}
        <Aviso>{error}</Aviso>
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Volver</button>
          <button className="btn btn-primario" disabled={guardando || unidades < 1}>{guardando ? 'Guardando…' : 'Cambiar fecha'}</button>
        </div>
      </form>
    </Modal>
  );
}
