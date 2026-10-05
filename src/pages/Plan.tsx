import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, mensajeError, llamarPagos } from '../lib/supabase';
import { useNegocio } from '../lib/sesion';
import { dinero, fechaCorta } from '../lib/formato';
import type { NivelPlan } from '../lib/tipos';
import { Aviso, Cabecera } from '../components/ui';

type Precios = { basico: number; completo: number; cobro: boolean };

const PLANES: { nivel: NivelPlan; nombre: string; lema: string; incluye: string[] }[] = [
  {
    nivel: 'basico', nombre: 'Básico', lema: 'Citas en línea y toda la barbería en orden',
    incluye: ['Reservas en línea con tu página web', 'Pagos y anticipos con Mercado Pago', 'Agenda, fila sin cita y bloqueos', 'Cobro, ventas, propinas y comisiones', 'Clientes, reportes y equipo'],
  },
  {
    nivel: 'completo', nombre: 'Completo', lema: 'Todo lo del Básico más tu tienda en línea',
    incluye: ['Todo lo del plan Básico', 'Tienda en línea con fotos de tus productos', 'Venta de productos al reservar', 'Pedidos para recoger en la sucursal'],
  },
];

/** Mi plan: mensualidad de BarberaGo con Mercado Pago (o código de activación). */
export default function Plan() {
  const { negocio, session, suscripcion, recargar } = useNegocio();
  const [params, setParams] = useSearchParams();
  const [precios, setPrecios] = useState<Precios | null>(null);
  const [sucursales, setSucursales] = useState(Math.max(1, suscripcion?.negocios_max || 1));
  const [enviando, setEnviando] = useState<string>('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [codigo, setCodigo] = useState('');
  const esDueno = negocio.creado_por === session?.user.id;

  useEffect(() => { supabase.rpc('planes_precios').then(({ data }) => setPrecios(data as Precios)); }, []);

  // Al volver de Mercado Pago se confirma la suscripción.
  useEffect(() => {
    if (!params.get('suscripcion')) return;
    setEnviando('verificar');
    llamarPagos({ accion: 'suscripcion_verificar' })
      .then(async () => { await recargar(); setOk('Listo. Si autorizaste el cobro, tu plan ya quedó activo.'); })
      .catch((e) => setError(mensajeError(e)))
      .finally(() => { setEnviando(''); setParams({}, { replace: true }); });
  }, [params, recargar, setParams]);

  if (!esDueno) {
    return <div className="pagina angosta"><Cabecera titulo="Plan" /><p className="tenue">Solo el dueño de la barbería puede ver y pagar el plan.</p></div>;
  }

  const vigente = suscripcion && new Date(suscripcion.vence) > new Date();
  const pagando = suscripcion?.mp_suscripcion && suscripcion.mp_estado === 'authorized';

  async function suscribir(nivel: NivelPlan) {
    setError(''); setOk(''); setEnviando(nivel);
    try {
      const r = await llamarPagos<{ url: string }>({ accion: 'suscribir', nivel, sucursales });
      window.location.href = r.url;
    } catch (e) { setError(mensajeError(e)); setEnviando(''); }
  }

  async function cancelar() {
    if (!confirm(`¿Cancelar la mensualidad? Ya no se cobrará y tu plan sigue activo hasta el ${fechaCorta(suscripcion!.vence)}.`)) return;
    setError(''); setOk(''); setEnviando('cancelar');
    try { await llamarPagos({ accion: 'suscripcion_cancelar' }); await recargar(); setOk('Mensualidad cancelada.'); }
    catch (e) { setError(mensajeError(e)); }
    setEnviando('');
  }

  async function canjear(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk('');
    const { error } = await supabase.rpc('canjear_codigo', { p_codigo: codigo });
    if (error) return setError(mensajeError(error));
    setCodigo(''); setOk('Código aplicado a tu plan.');
    recargar();
  }

  return (
    <div className="pagina">
      <p className="kicker">Tu mensualidad</p>
      <Cabecera titulo="Mi plan" />

      <section className="tarjeta plan-actual">
        {suscripcion ? (
          <>
            <div>
              <span className="tenue pequeno">Plan actual</span>
              <strong className="plan-nombre">{suscripcion.origen === 'prueba' ? 'Prueba gratis (Completo)' : `${suscripcion.plan} · ${suscripcion.nivel === 'completo' ? 'con tienda' : 'sin tienda'}`}</strong>
            </div>
            <div>
              <span className="tenue pequeno">{vigente ? (pagando ? 'Siguiente cobro' : 'Vence') : 'Venció'}</span>
              <strong>{fechaCorta(suscripcion.vence)}</strong>
            </div>
            <div><span className="tenue pequeno">Sucursales</span><strong>{suscripcion.negocios_max}</strong></div>
            {pagando && <button className="btn btn-chico btn-peligro" disabled={!!enviando} onClick={cancelar}>Cancelar mensualidad</button>}
          </>
        ) : <p>Todavía no tienes plan.</p>}
      </section>
      {suscripcion?.mp_estado === 'cancelled' && vigente && <Aviso tipo="info">Cancelaste la mensualidad. Tu plan sigue activo hasta el {fechaCorta(suscripcion.vence)}.</Aviso>}
      {enviando === 'verificar' && <Aviso tipo="info">Confirmando con Mercado Pago…</Aviso>}
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>

      <div className="plan-sucursales">
        <span>Sucursales a pagar</span>
        <div className="contador">
          <button type="button" className="btn-icono" aria-label="Menos sucursales" onClick={() => setSucursales((n) => Math.max(1, n - 1))}>−</button>
          <span aria-live="polite">{sucursales}</span>
          <button type="button" className="btn-icono" aria-label="Más sucursales" onClick={() => setSucursales((n) => Math.min(20, n + 1))}>+</button>
        </div>
      </div>

      <div className="planes">
        {PLANES.map((p) => {
          const precio = precios ? Number(p.nivel === 'completo' ? precios.completo : precios.basico) : null;
          const actual = pagando && suscripcion?.nivel === p.nivel && suscripcion.negocios_max === sucursales;
          return (
            <article key={p.nivel} className={`tarjeta plan ${p.nivel === 'completo' ? 'plan-destacado' : ''}`}>
              {p.nivel === 'completo' && <span className="plan-cinta">Con tienda en línea</span>}
              <h2>{p.nombre}</h2>
              <p className="tenue">{p.lema}</p>
              <p className="plan-precio">
                {precio != null ? dinero(precio * sucursales) : '…'}<small> / mes</small>
              </p>
              {sucursales > 1 && precio != null && <p className="tenue pequeno">{dinero(precio)} por sucursal</p>}
              <ul className="plan-lista">{p.incluye.map((x) => <li key={x}>{x}</li>)}</ul>
              <button className={`btn ancho ${p.nivel === 'completo' ? 'btn-primario' : ''}`} disabled={!!enviando || actual || precios?.cobro === false}
                onClick={() => suscribir(p.nivel)}>
                {actual ? 'Tu plan actual' : enviando === p.nivel ? 'Abriendo Mercado Pago…' : pagando ? 'Cambiar a este plan' : 'Suscribirme'}
              </button>
            </article>
          );
        })}
      </div>
      {precios?.cobro === false && <Aviso tipo="info">El cobro con tarjeta todavía no está activo. Por ahora pide un código de activación.</Aviso>}
      <p className="tenue pequeno">El cobro es automático cada mes con Mercado Pago (tarjeta de crédito o débito). Puedes cancelar cuando quieras y tu plan sigue activo hasta el fin del mes pagado.</p>

      <section className="tarjeta mt">
        <h2>¿Tienes un código de activación?</h2>
        <form onSubmit={canjear} className="fila">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="BG-XXXX-XXXX" required aria-label="Código" />
          <button className="btn">Canjear</button>
        </form>
      </section>
    </div>
  );
}
