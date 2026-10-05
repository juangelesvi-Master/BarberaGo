import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeError } from '../lib/supabase';
import { dinero } from '../lib/formato';
import { Marca } from '../components/Iconos';
import { Aviso, Campo } from '../components/ui';

const FUNCIONES: [string, string][] = [
  ['Reservas en línea', 'Tu página web con tus servicios, tu equipo y los horarios libres. El cliente reserva solo, a cualquier hora.'],
  ['Anticipos con Mercado Pago', 'Cobra la cita completa o un anticipo al reservar y olvídate de los clientes que no llegan.'],
  ['Agenda del equipo', 'Cada barbero con su columna, fila sin cita y bloqueos de horario.'],
  ['Cobro y ticket', 'Cobra servicios y productos, propinas y comisiones. Imprime el ticket en tu impresora térmica.'],
  ['Inventario', 'Productos, existencias y los insumos que gasta cada servicio se descuentan solos.'],
  ['Portal barberos', 'Tu equipo entra con un código, sin correo, y solo ve lo que tú le permites.'],
];

/** Página de promoción de BarberaGo con el formulario "Quiero probar". */
export default function Promo() {
  const [precios, setPrecios] = useState<{ basico: number; completo: number } | null>(null);
  const [f, setF] = useState({ nombre: '', barberia: '', telefono: '', email: '', ciudad: '', mensaje: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  useEffect(() => {
    document.title = 'BarberaGo · El sistema para tu barbería';
    supabase.rpc('planes_precios').then(({ data }) => data && setPrecios(data as { basico: number; completo: number }));
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(''); setEnviando(true);
    const { error } = await supabase.rpc('solicitar_prueba', {
      p_nombre: f.nombre, p_barberia: f.barberia, p_telefono: f.telefono, p_email: f.email, p_ciudad: f.ciudad, p_mensaje: f.mensaje,
    });
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    setListo(true);
  }

  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });

  return (
    <div className="promo">
      <header className="promo-barra">
        <Marca />
        <div className="promo-barra-acciones">
          <a className="btn-texto" href="#probar">Quiero probar</a>
          <Link className="btn btn-chico" to="/">Entrar</Link>
        </div>
      </header>

      <section className="promo-portada">
        <p className="kicker">Software para barberías</p>
        <h1>Tu barbería en orden,<br />tus clientes reservando solos.</h1>
        <p className="promo-lema">Agenda, reservas en línea con anticipo, cobro, comisiones e inventario en una sola app. Funciona en la computadora, la tablet y el celular.</p>
        <div className="promo-cta">
          <a className="btn btn-primario grande" href="#probar">Quiero probar BarberaGo</a>
          <Link className="btn grande" to="/">Crear mi cuenta</Link>
        </div>
        <p className="tenue pequeno">30 días de prueba gratis. Sin tarjeta.</p>
      </section>

      <section className="promo-funciones">
        {FUNCIONES.map(([t, d]) => (
          <article key={t} className="tarjeta">
            <h2>{t}</h2>
            <p className="tenue">{d}</p>
          </article>
        ))}
      </section>

      <section className="promo-precios">
        <h2 className="promo-titulo">Precios por sucursal</h2>
        <div className="planes">
          <article className="tarjeta plan">
            <h2>Básico</h2>
            <p className="plan-precio">{precios ? dinero(precios.basico) : '…'}<small> / mes</small></p>
            <p className="tenue">Reservas en línea, pagos, agenda, cobro, clientes, reportes y equipo.</p>
          </article>
          <article className="tarjeta plan plan-destacado">
            <span className="plan-cinta">Con tienda en línea</span>
            <h2>Completo</h2>
            <p className="plan-precio">{precios ? dinero(precios.completo) : '…'}<small> / mes</small></p>
            <p className="tenue">Todo lo del Básico más venta de productos en línea y pedidos para recoger.</p>
          </article>
        </div>
        <p className="tenue centro">Paga cada mes o un año completo con 2 meses gratis. Con tarjeta o en efectivo en OXXO.</p>
      </section>

      <section className="promo-formulario" id="probar">
        {listo ? (
          <div className="tarjeta acceso centro">
            <h2>¡Gracias, {f.nombre.split(' ')[0]}!</h2>
            <p>Recibimos tu solicitud. Te contactaremos por WhatsApp para ayudarte a dejar lista tu barbería.</p>
            <Link className="btn btn-primario" to="/">Mientras, crea tu cuenta</Link>
          </div>
        ) : (
          <form className="tarjeta acceso" onSubmit={enviar}>
            <h2>Quiero probar BarberaGo</h2>
            <p className="tenue">Déjanos tus datos y te ayudamos a configurarla sin costo.</p>
            <Campo etiqueta="Tu nombre"><input {...campo('nombre')} required maxLength={80} autoComplete="name" /></Campo>
            <Campo etiqueta="Nombre de la barbería"><input {...campo('barberia')} maxLength={80} /></Campo>
            <Campo etiqueta="WhatsApp"><input {...campo('telefono')} required inputMode="tel" maxLength={20} autoComplete="tel" placeholder="55 1234 5678" /></Campo>
            <Campo etiqueta="Correo (opcional)"><input {...campo('email')} type="email" maxLength={120} autoComplete="email" /></Campo>
            <Campo etiqueta="Ciudad"><input {...campo('ciudad')} maxLength={60} /></Campo>
            <Campo etiqueta="¿Algo que debamos saber? (opcional)"><textarea {...campo('mensaje')} rows={2} maxLength={500} placeholder="Cuántos barberos son, si ya usan otro sistema…" /></Campo>
            <Aviso>{error}</Aviso>
            <button className="btn btn-primario ancho" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar'}</button>
          </form>
        )}
      </section>

      <footer className="promo-pie tenue pequeno">BarberaGo · Agenda y punto de venta para barberías</footer>
    </div>
  );
}
