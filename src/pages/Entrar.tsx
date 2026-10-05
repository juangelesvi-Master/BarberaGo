import { useState, type FormEvent } from 'react';
import { supabase, mensajeError } from '../lib/supabase';
import { Marca } from '../components/Iconos';
import { Aviso, Campo } from '../components/ui';
import { credencialesDeCodigo, normalizarCodigo } from '../lib/codigoAcceso';

type Modo = 'entrar' | 'registro' | 'recuperar' | 'codigo';

/** Dentro de la app de Android no se ofrece descargarla. */
const enApp = navigator.userAgent.includes('BarberaGoAndroid');
// Las apps 1.0 (sin impresión) y 1.1 (sin Bluetooth) reciben la versión nueva.
const appVieja = /BarberaGoAndroid\/1\.[01]\b/.test(navigator.userAgent);
// La app 1.0 no sabe descargar archivos; con el dominio en mayúsculas la abre en el navegador, que sí descarga.
const APK_FUERA = 'https://BarberaGo.restorago.com/descargas/BarberaGo.apk';

export default function Entrar() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk(''); setEnviando(true);
    try {
      if (modo === 'codigo') {
        const limpio = normalizarCodigo(codigo);
        if (limpio.length !== 10) throw new Error('El código tiene 10 letras y números, por ejemplo 7KQ4M-X9TB2');
        const { error } = await supabase.auth.signInWithPassword(await credencialesDeCodigo(limpio));
        if (error) throw new Error(error.message.includes('Invalid login') ? 'Código incorrecto. Pídele uno nuevo al administrador' : error.message);
      } else if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
        if (error) throw error;
      } else if (modo === 'registro') {
        const { data, error } = await supabase.auth.signUp({
          email, password: clave,
          options: { data: { nombre }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setOk('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setOk('Si el correo existe, te llegará un enlace para cambiar tu contraseña.');
      }
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (modo === 'codigo') {
    return (
      <div className="pantalla-centro">
        <form className="tarjeta acceso" onSubmit={enviar}>
          <Marca grande />
          <p className="kicker">Portal barberos</p>
          <p className="tenue">Entra con el código que te dio el administrador de tu barbería.</p>
          <Campo etiqueta="Código de acceso">
            <input className="codigo-acceso" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} required
              autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXXX-XXXXX" maxLength={14} />
          </Campo>
          <Aviso>{error}</Aviso>
          <button className="btn btn-primario ancho" disabled={enviando}>Entrar</button>
          <div className="enlaces-acceso">
            <button type="button" className="btn-texto" onClick={() => { setModo('entrar'); setError(''); }}>Soy dueño · entrar con correo</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="pantalla-centro">
      <form className="tarjeta acceso" onSubmit={enviar}>
        <Marca grande />
        <p className="tenue">Agenda, reservas en línea, cobro y comisiones para tu barbería.</p>
        {modo === 'registro' && (
          <Campo etiqueta="Tu nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="name" />
          </Campo>
        )}
        <Campo etiqueta="Correo">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Campo>
        {modo !== 'recuperar' && (
          <Campo etiqueta="Contraseña">
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required minLength={6}
              autoComplete={modo === 'registro' ? 'new-password' : 'current-password'} />
          </Campo>
        )}
        <Aviso>{error}</Aviso>
        <Aviso tipo="ok">{ok}</Aviso>
        <button className="btn btn-primario ancho" disabled={enviando}>
          {modo === 'entrar' ? 'Entrar' : modo === 'registro' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>
        <div className="enlaces-acceso">
          {modo !== 'entrar' && <button type="button" className="btn-texto" onClick={() => setModo('entrar')}>Ya tengo cuenta</button>}
          {modo !== 'registro' && <button type="button" className="btn-texto" onClick={() => setModo('registro')}>Crear cuenta nueva</button>}
          {modo === 'entrar' && <button type="button" className="btn-texto" onClick={() => setModo('recuperar')}>Olvidé mi contraseña</button>}
        </div>
        <div className="separador-acceso"><span>¿Trabajas en una barbería?</span></div>
        <button type="button" className="btn ancho" onClick={() => { setModo('codigo'); setError(''); setOk(''); }}>Portal barberos</button>
        {(!enApp || appVieja) && (
          <a className="btn ancho btn-descargar" href={appVieja ? APK_FUERA : '/descargas/BarberaGo.apk'} download="BarberaGo.apk">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M17.6 9.48l1.84-3.18a.38.38 0 00-.66-.38l-1.86 3.22a11.4 11.4 0 00-9.84 0L5.22 5.92a.38.38 0 10-.66.38L6.4 9.48A10.8 10.8 0 001 18h22a10.8 10.8 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" /></svg>
            {appVieja ? 'Actualizar la app' : 'Descargar la app para Android'}
          </a>
        )}
        {modo === 'registro' && <a className="btn-texto descargar-app" href="/promo">¿Qué incluye BarberaGo?</a>}
      </form>
    </div>
  );
}
