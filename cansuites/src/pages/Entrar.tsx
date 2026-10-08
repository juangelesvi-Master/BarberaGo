import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api, mensajeError } from '../lib/datos';
import { useCuenta } from '../lib/cuenta';
import { CUENTAS_DEMO } from '../lib/api-demo';
import { Aviso, Campo, InputClave } from '../components/ui';
import { Pagina } from '../components/Sitio';

type Modo = 'entrar' | 'registro' | 'recuperar';

/** Formulario de acceso para usar dentro de otras páginas (reservar, tienda) o en /entrar. */
export function FormularioAcceso({ inicial = 'entrar', titulo }: { inicial?: Modo; titulo?: string }) {
  const [modo, setModo] = useState<Modo>(inicial);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk(''); setEnviando(true);
    try {
      if (modo === 'entrar') await api.entrar(email, clave);
      else if (modo === 'registro') {
        const r = await api.registrar({ nombre, telefono, email, clave });
        if (r.confirmar) setOk('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.');
      } else {
        await api.recuperar(email);
        setOk('Si el correo existe, te llegará un enlace para cambiar tu contraseña.');
      }
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta acceso" onSubmit={enviar}>
      <h2>{titulo || (modo === 'entrar' ? 'Entra a tu cuenta' : modo === 'registro' ? 'Crea tu cuenta' : 'Recupera tu contraseña')}</h2>
      {modo === 'registro' && <p className="tenue">Con tu cuenta reservas en línea, registras a tus mascotas y ves su expediente médico.</p>}
      {modo === 'registro' && (
        <div className="fila-campos">
          <Campo etiqueta="Tu nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="name" /></Campo>
          <Campo etiqueta="WhatsApp"><input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} required autoComplete="tel" placeholder="442 000 0000" /></Campo>
        </div>
      )}
      <Campo etiqueta="Correo">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </Campo>
      {modo !== 'recuperar' && (
        <Campo etiqueta="Contraseña">
          <InputClave value={clave} onChange={(e) => setClave(e.target.value)} required minLength={6}
            autoComplete={modo === 'registro' ? 'new-password' : 'current-password'} />
        </Campo>
      )}
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      <button className="btn btn-primario ancho grande" disabled={enviando}>
        {enviando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : modo === 'registro' ? 'Crear cuenta' : 'Enviar enlace'}
      </button>
      <div className="enlaces-acceso">
        {modo !== 'entrar' && <button type="button" className="btn-texto" onClick={() => setModo('entrar')}>Ya tengo cuenta</button>}
        {modo !== 'registro' && <button type="button" className="btn-texto" onClick={() => setModo('registro')}>Crear cuenta nueva</button>}
        {modo === 'entrar' && <button type="button" className="btn-texto" onClick={() => setModo('recuperar')}>Olvidé mi contraseña</button>}
      </div>
      {api.modo === 'demo' && modo === 'entrar' && (
        <div className="aviso aviso-info pequeno">
          Demostración: entra como cliente con <button type="button" className="btn-texto" onClick={() => { setEmail(CUENTAS_DEMO.cliente.email); setClave(CUENTAS_DEMO.cliente.clave); }}>{CUENTAS_DEMO.cliente.email}</button>{' '}
          o como recepción con <button type="button" className="btn-texto" onClick={() => { setEmail(CUENTAS_DEMO.admin.email); setClave(CUENTAS_DEMO.admin.clave); }}>{CUENTAS_DEMO.admin.email}</button>.
        </div>
      )}
    </form>
  );
}

export default function Entrar() {
  const { perfil, esPersonal } = useCuenta();
  const [params] = useSearchParams();
  useEffect(() => { document.title = 'Entrar · CanSuites'; }, []);
  if (perfil) return <Navigate to={params.get('volver') || (esPersonal ? '/admin' : '/cuenta')} replace />;
  return (
    <Pagina angosta clase="pagina-acceso">
      <FormularioAcceso inicial={params.get('modo') === 'registro' ? 'registro' : 'entrar'} />
    </Pagina>
  );
}
