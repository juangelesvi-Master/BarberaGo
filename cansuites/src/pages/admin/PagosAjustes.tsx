import { useState, type FormEvent } from 'react';
import { api, mensajeError } from '../../lib/datos';
import type { Ajustes, ModoPago } from '../../lib/tipos';
import { Aviso, Campo } from '../../components/ui';

/** Ajustes > Pagos en línea: conectar Mercado Pago y decidir si se cobra al reservar. */
export default function PagosAjustes({ ajustes, onCambio }: { ajustes: Ajustes; onCambio: (c: Partial<Ajustes>) => void }) {
  const [token, setToken] = useState('');
  const [modo, setModo] = useState<ModoPago>(ajustes.pago_modo);
  const [pct, setPct] = useState(ajustes.pago_anticipo);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const conectada = !!ajustes.pago_cuenta;

  async function conectar(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk(''); setEnviando(true);
    try {
      const r = await api.conectarPagos(token);
      setToken('');
      const nuevoModo = ajustes.pago_modo === 'no' ? 'opcional' : ajustes.pago_modo;
      setModo(nuevoModo);
      onCambio({ pago_cuenta: r.cuenta, pago_prueba: r.prueba, pago_modo: nuevoModo });
      setOk(`Cuenta ${r.cuenta} conectada${r.prueba ? ' en modo de prueba' : ''}. Tus clientes ya pueden pagar al reservar.`);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk('');
    try {
      await api.guardarAjustes({ ...ajustes, pago_modo: modo, pago_anticipo: pct });
      onCambio({ pago_modo: modo, pago_anticipo: pct });
      setOk('Cambios guardados.');
    } catch (err) { setError(mensajeError(err)); }
  }

  async function desconectar() {
    if (!confirm('¿Desconectar Mercado Pago? Tus clientes ya no podrán pagar en línea.')) return;
    setError(''); setOk('');
    try {
      await api.desconectarPagos();
      setModo('no');
      onCambio({ pago_modo: 'no', pago_cuenta: null, pago_prueba: false });
      setOk('Mercado Pago desconectado.');
    } catch (err) { setError(mensajeError(err)); }
  }

  return (
    <section className="tarjeta formulario">
      <h2>Pagos en línea</h2>
      {!conectada ? (
        <form onSubmit={conectar} className="formulario">
          <p>Cobra la reserva o un anticipo cuando el cliente reserva. El dinero llega directo a tu cuenta de Mercado Pago.</p>
          <ol className="pequeno">
            <li>Entra a <a href="https://www.mercadopago.com.mx/developers/panel/app" target="_blank" rel="noreferrer">Mercado Pago Developers</a> y crea una aplicación (Checkout Pro).</li>
            <li>En <strong>Credenciales de producción</strong> copia el <strong>Access Token</strong> (empieza con APP_USR-). Para probar sin dinero real, usa el de una cuenta de prueba.</li>
            <li>Pégalo aquí. Se guarda solo en el servidor; nadie lo puede ver desde la página.</li>
          </ol>
          <Campo etiqueta="Access Token de Mercado Pago">
            <input value={token} onChange={(e) => setToken(e.target.value.trim())} required placeholder="APP_USR-…" autoComplete="off" spellCheck={false} />
          </Campo>
          <Aviso>{error}</Aviso>
          <Aviso tipo="ok">{ok}</Aviso>
          <div className="acciones"><button className="btn btn-primario" disabled={enviando}>{enviando ? 'Conectando…' : 'Conectar Mercado Pago'}</button></div>
        </form>
      ) : (
        <form onSubmit={guardar} className="formulario">
          <p>Conectado a Mercado Pago: <strong>{ajustes.pago_cuenta}</strong>{ajustes.pago_prueba && <span className="chip chip-alerta">Modo prueba</span>}</p>
          {ajustes.pago_prueba && <Aviso tipo="info">Es una cuenta de prueba: los pagos no son reales. Para cobrar de verdad, desconecta y pega el Access Token de producción.</Aviso>}
          <Campo etiqueta="Al reservar en línea">
            <select value={modo} onChange={(e) => setModo(e.target.value as ModoPago)}>
              <option value="opcional">El cliente elige: pagar ahora o al llegar</option>
              <option value="obligatorio">Pago obligatorio para reservar</option>
              <option value="no">No cobrar en línea</option>
            </select>
          </Campo>
          {modo !== 'no' && (
            <Campo etiqueta="Cuánto se cobra" ayuda="Un anticipo asegura la reserva; el resto se paga en CanSuites.">
              <select value={pct} onChange={(e) => setPct(Number(e.target.value))}>
                {[100, 50, 30, 20].map((n) => <option key={n} value={n}>{n === 100 ? 'La reserva completa' : `Anticipo del ${n}%`}</option>)}
              </select>
            </Campo>
          )}
          <p className="tenue pequeno">Si un cliente cancela una reserva pagada, primero se le ofrece cambiar la fecha. Si cancela de todos modos, aparece en Reservas como «por reembolsar» para que decidas si le devuelves el dinero.</p>
          <Aviso>{error}</Aviso>
          <Aviso tipo="ok">{ok}</Aviso>
          <div className="acciones">
            <button type="button" className="btn btn-peligro" onClick={desconectar}>Desconectar</button>
            <button className="btn btn-primario">Guardar</button>
          </div>
        </form>
      )}
    </section>
  );
}
