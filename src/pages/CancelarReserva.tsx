import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeError } from '../lib/supabase';
import { dinero, DIAS } from '../lib/formato';
import { Aviso, Campo, Cargando } from '../components/ui';

type MiCita = {
  id: string; estado: string; inicio: string; fin: string; servicio_id: string | null; servicio: string | null;
  barbero_id: string | null; barbero: string | null; pago_estado: string | null; pago_monto: number | null; reagendable: boolean;
};
type Hueco = { inicio: string; barbero_id: string | null; libre?: boolean };
type Negocio = { nombre: string; zona_horaria: string; moneda: string; telefono: string | null };

/** Página pública para que el cliente cancele su cita o, si ya la pagó, la reagende (el pago se conserva). */
export default function CancelarReserva() {
  const { slug = '', cita = '' } = useParams();
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [telefono, setTelefono] = useState('');
  const [miCita, setMiCita] = useState<MiCita | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<'cancelada' | 'reagendada' | null>(null);
  const [reagendando, setReagendando] = useState(false);
  const [dia, setDia] = useState('');
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [hueco, setHueco] = useState<Hueco | null>(null);

  useEffect(() => {
    supabase.rpc('reserva_negocio', { p_slug: slug }).then(({ data }) => setNegocio((data as { negocio: Negocio } | null)?.negocio || null));
  }, [slug]);

  const tz = negocio?.zona_horaria || 'America/Mexico_City';
  const diaEnTz = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const horaEnTz = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const fechaEnTz = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
  const dias = Array.from({ length: 21 }, (_, i) => {
    const iso = diaEnTz(new Date(Date.now() + i * 864e5));
    return { iso, d: new Date(iso + 'T12:00:00') };
  });

  useEffect(() => {
    if (!reagendando || !dia || !miCita?.servicio_id) { setHuecos(null); return; }
    setHuecos(null); setHueco(null);
    supabase.rpc('reserva_horarios', { p_slug: slug, p_servicio: miCita.servicio_id, p_barbero: miCita.barbero_id, p_fecha: dia })
      .then(({ data, error }) => { if (error) setError(mensajeError(error)); setHuecos((data as Hueco[]) || []); });
  }, [slug, reagendando, dia, miCita?.servicio_id, miCita?.barbero_id]);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    setError('');
    const { data, error } = await supabase.rpc('reserva_cita', { p_cita: cita, p_telefono: telefono });
    if (error) return setError(mensajeError(error));
    setMiCita(data as MiCita);
  }

  async function cancelar() {
    setError(''); setEnviando(true);
    const { error } = await supabase.rpc('reserva_cancelar', { p_cita: cita, p_telefono: telefono });
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    setHecho('cancelada');
    setMiCita((c) => c && { ...c, estado: 'cancelada' });
  }

  async function reagendar() {
    if (!hueco) return;
    setError(''); setEnviando(true);
    const { error } = await supabase.rpc('reserva_reagendar', { p_cita: cita, p_telefono: telefono, p_inicio: hueco.inicio, p_barbero: miCita?.barbero_id || null });
    setEnviando(false);
    if (error) {
      setError(mensajeError(error));
      setHueco(null);
      const d = dia; setDia(''); setTimeout(() => setDia(d)); // recarga horarios
      return;
    }
    const { data } = await supabase.rpc('reserva_cita', { p_cita: cita, p_telefono: telefono });
    if (data) setMiCita(data as MiCita);
    setReagendando(false);
    setHecho('reagendada');
  }

  const m = (n: number | null) => dinero(n || 0, negocio?.moneda || 'MXN');
  const pagada = miCita?.pago_estado === 'pagado';
  const activa = miCita && (miCita.estado === 'pendiente' || miCita.estado === 'confirmada') && new Date(miCita.inicio) > new Date();

  return (
    <div className="sitio pantalla-centro">
      <div className={`tarjeta acceso${reagendando ? ' reagendar' : ''}`}>
        {!miCita ? (
          <form onSubmit={buscar} className="formulario">
            <h2>Mi cita</h2>
            <p className="tenue">Escribe el teléfono con el que reservaste para cancelar o cambiar tu cita.</p>
            <Campo etiqueta="Teléfono"><input value={telefono} onChange={(e) => setTelefono(e.target.value)} required inputMode="tel" /></Campo>
            <Aviso>{error}</Aviso>
            <button className="btn btn-primario ancho">Ver mi cita</button>
            <Link to={`/r/${slug}`} className="btn-texto">Volver</Link>
          </form>
        ) : reagendando ? (
          <div className="formulario">
            <h2>Reagendar cita</h2>
            <p className="tenue">{miCita.servicio}{miCita.barbero && ` con ${miCita.barbero}`}. Tu pago de {m(miCita.pago_monto)} se conserva.</p>
            <div className="dias">
              {dias.map(({ iso, d }) => (
                <button key={iso} type="button" className={`dia ${dia === iso ? 'elegida' : ''}`} onClick={() => setDia(iso)}>
                  <small>{DIAS[(d.getDay() + 6) % 7].slice(0, 3)}</small>
                  <strong>{d.getDate()}</strong>
                  <small>{d.toLocaleDateString('es-MX', { month: 'short' })}</small>
                </button>
              ))}
            </div>
            {!dia ? <p className="tenue pequeno">Elige el día.</p> : huecos === null ? <Cargando /> : !huecos.some((h) => h.libre !== false) ? (
              <p className="tenue">No hay horarios libres ese día. Prueba otro.</p>
            ) : (
              <div className="horas">
                {huecos.map((h) => (
                  <button key={h.inicio} type="button" disabled={h.libre === false} title={h.libre === false ? 'Ocupado' : undefined}
                    className={`hora ${h.libre === false ? 'ocupada' : ''} ${hueco?.inicio === h.inicio ? 'elegida' : ''}`} onClick={() => setHueco(h)}>
                    {horaEnTz(h.inicio)}
                  </button>
                ))}
              </div>
            )}
            {hueco && <p>Nueva cita: <strong>{fechaEnTz(hueco.inicio)} a las {horaEnTz(hueco.inicio)}</strong></p>}
            <Aviso>{error}</Aviso>
            <button className="btn btn-primario ancho" onClick={reagendar} disabled={!hueco || enviando}>{enviando ? 'Guardando…' : 'Confirmar nuevo horario'}</button>
            <button type="button" className="btn-texto" onClick={() => { setReagendando(false); setError(''); }}>Volver</button>
          </div>
        ) : (
          <div className="formulario">
            <h2>{hecho === 'reagendada' ? '¡Cita reagendada!' : hecho === 'cancelada' ? 'Cita cancelada' : 'Mi cita'}</h2>
            <p className="grande-texto">{fechaEnTz(miCita.inicio)}<br />{horaEnTz(miCita.inicio)}</p>
            <p>{miCita.servicio}{miCita.barbero && ` con ${miCita.barbero}`}{negocio && ` · ${negocio.nombre}`}</p>
            {miCita.estado === 'cancelada' && <p><span className="insignia estado-cancelada">Cancelada</span></p>}
            {pagada && <p className="tenue">Pagaste {m(miCita.pago_monto)} en línea.{miCita.estado === 'cancelada' && ' Tu pago se conserva: reagenda cuando quieras.'}</p>}
            <Aviso>{error}</Aviso>
            {miCita.reagendable && (
              <button className="btn btn-primario ancho" onClick={() => { setReagendando(true); setHecho(null); setError(''); }}>Reagendar cita</button>
            )}
            {activa && (
              <button className="btn btn-peligro ancho" disabled={enviando} onClick={() => confirm(pagada
                ? 'Tu pago no se devuelve, pero se conserva para reagendar tu cita cuando quieras. ¿Cancelar la cita?'
                : '¿Cancelar la cita?') && cancelar()}>Cancelar cita</button>
            )}
            {!activa && !miCita.reagendable && <Link className="btn btn-primario" to={`/r/${slug}`}>Reservar otra vez</Link>}
            {pagada && negocio?.telefono && <p className="tenue pequeno">¿Dudas? Llama a la barbería al <a href={`tel:${negocio.telefono}`}>{negocio.telefono}</a>.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
