import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { api, mensajeError } from '../../lib/datos';
import { useCuenta } from '../../lib/cuenta';
import type { Reserva } from '../../lib/tipos';
import { esperandoPago } from '../../lib/tipos';
import { precio } from '../../lib/formato';
import { cuandoReserva, restaPorCobrar } from '../../components/Listas';
import { Aviso, Cargando } from '../../components/ui';
import { Pagina } from '../../components/Sitio';

/** Página a la que Mercado Pago regresa al cliente después de pagar (o de no pagar). */
export default function PagoReserva() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { cargando, perfil } = useCuenta();
  const rechazado = ['rejected', 'failure', 'null'].includes(params.get('status') || params.get('collection_status') || '');
  const [r, setR] = useState<Reserva | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const intentos = useRef(0);

  useEffect(() => { document.title = 'Pago · CanSuites'; }, []);
  const cargar = useCallback(async () => {
    const d = await api.reserva(id).catch(() => null);
    setR(d);
    return d;
  }, [id]);

  useEffect(() => {
    if (!perfil) return;
    let vivo = true;
    let espera: ReturnType<typeof setTimeout>;
    // Por si el aviso de Mercado Pago se atrasa, se le pregunta directo.
    const verificar = rechazado ? Promise.resolve() : api.verificarPago(id).catch(() => undefined);
    const ciclo = async () => {
      const d = await cargar();
      if (!vivo) return;
      intentos.current += 1;
      if (d && esperandoPago(d) && !rechazado && intentos.current < 15) espera = setTimeout(ciclo, 3000);
    };
    verificar.then(ciclo);
    return () => { vivo = false; clearTimeout(espera); };
  }, [id, perfil, cargar, rechazado]);

  async function reintentar() {
    setError(''); setEnviando(true);
    try { window.location.href = await api.iniciarPago(id); } catch (e) { setError(mensajeError(e)); setEnviando(false); cargar(); }
  }

  if (cargando) return <Pagina angosta><Cargando /></Pagina>;
  if (!perfil) return <Navigate to={`/entrar?volver=/cuenta/pago/${id}`} replace />;
  if (r === undefined) return <Pagina angosta><Cargando /></Pagina>;
  if (r === null) return <Pagina angosta><div className="tarjeta centro"><h1>No encontramos esa reserva</h1><Link className="btn btn-primario" to="/cuenta?vista=reservas">Mis reservas</Link></div></Pagina>;

  const pagada = r.pago_estado === 'pagado';
  const esperando = esperandoPago(r);
  const resta = restaPorCobrar(r);
  return (
    <Pagina angosta>
      <div className="tarjeta confirmacion centro">
        <div className="palomita" aria-hidden>{pagada ? '🐾' : esperando ? '⏳' : '⚠️'}</div>
        <h1>{pagada ? '¡Pago recibido!' : esperando ? (rechazado ? 'El pago no se completó' : 'Revisando tu pago…') : 'El tiempo para pagar terminó'}</h1>
        <p className="tenue">Reserva #{r.folio}</p>
        <p><strong>{r.servicio_nombre}</strong> para <strong>{r.mascota_nombre}</strong><br />{cuandoReserva(r)}</p>
        {pagada && (
          <>
            <p className="total-grande">{precio(r.pagado)}</p>
            <p className="tenue">{resta > 0 ? `Tu reserva está confirmada. Restan ${precio(resta)} que pagas en CanSuites.` : 'Tu reserva está confirmada y pagada.'} Si luego no puedes venir, cambias la fecha desde Mis reservas sin perder lo pagado.</p>
          </>
        )}
        {esperando && (
          <>
            <p className="tenue">{rechazado ? 'Mercado Pago no aprobó el pago. Tu lugar sigue apartado unos minutos: intenta con otra tarjeta.' : 'Si ya pagaste, en unos segundos se confirma aquí.'}</p>
            <button className="btn btn-primario" disabled={enviando} onClick={reintentar}>{enviando ? 'Abriendo…' : `Pagar ${precio(r.pago_monto)}`}</button>
          </>
        )}
        {!pagada && !esperando && <p className="tenue">El lugar ya no está apartado. Si quieres, vuelve a reservar.</p>}
        <Aviso>{error}</Aviso>
        <div className="acciones centro-acciones">
          {!pagada && !esperando && <Link className="btn btn-primario" to={`/reservar?servicio=${r.tipo}`}>Reservar de nuevo</Link>}
          <Link className="btn" to="/cuenta?vista=reservas">Mis reservas</Link>
        </div>
      </div>
    </Pagina>
  );
}
