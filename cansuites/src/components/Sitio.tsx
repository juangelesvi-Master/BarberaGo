import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCuenta } from '../lib/cuenta';
import { api } from '../lib/datos';
import { NEGOCIO } from '../lib/negocio';
import { whatsapp } from '../lib/formato';
import { CUENTAS_DEMO, reiniciarDemo } from '../lib/api-demo';

export function Logo({ alto = 44 }: { alto?: number }) {
  return <img className="logo" src="/img/logo.png" alt="CanSuites · Hotel · Guardería" height={alto} style={{ height: alto }} />;
}

/** Barra superior fija. En la portada los enlaces bajan a cada sección; en otras páginas regresan a ella. */
export function Encabezado() {
  const { perfil, esPersonal } = useCuenta();
  const { pathname } = useLocation();
  const [abierto, setAbierto] = useState(false);
  const enPortada = pathname === '/';
  useEffect(() => setAbierto(false), [pathname]);
  const a = (id: string) => (enPortada ? `#${id}` : `/#${id}`);
  return (
    <header className={`encabezado ${abierto ? 'abierto' : ''}`}>
      <div className="contenedor encabezado-fila">
        <Link to="/" className="encabezado-logo" aria-label="CanSuites, inicio"><Logo alto={46} /></Link>
        <nav className="encabezado-nav" aria-label="Principal">
          <a href={a('servicios')}>Servicios</a>
          <a href={a('estetica')}>Estética</a>
          <NavLink to="/tienda">Tienda</NavLink>
          <a href={a('contacto')}>Contacto</a>
          {esPersonal && <NavLink to="/admin">Panel</NavLink>}
          <NavLink to={perfil ? '/cuenta' : '/entrar'} className="encabezado-cuenta">
            <span aria-hidden>🐾</span> {perfil ? 'Mi cuenta' : 'Entrar'}
          </NavLink>
          <Link to="/reservar" className="btn btn-primario">Reservar</Link>
        </nav>
        <button className="hamburguesa" aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          <span /><span /><span />
        </button>
      </div>
      {api.modo === 'demo' && <AvisoDemo />}
    </header>
  );
}

function AvisoDemo() {
  const [ver, setVer] = useState(false);
  return (
    <div className="aviso-demo">
      <div className="contenedor">
        <strong>Modo demostración:</strong> los datos se guardan solo en este navegador.{' '}
        <button className="btn-texto" onClick={() => setVer(!ver)}>{ver ? 'Ocultar cuentas' : 'Ver cuentas de prueba'}</button>
        {ver && (
          <span className="aviso-demo-cuentas">
            Cliente: <code>{CUENTAS_DEMO.cliente.email}</code> / <code>{CUENTAS_DEMO.cliente.clave}</code> ·
            Recepción: <code>{CUENTAS_DEMO.admin.email}</code> / <code>{CUENTAS_DEMO.admin.clave}</code> ·{' '}
            <button className="btn-texto" onClick={() => { reiniciarDemo(); window.location.href = '/'; }}>Reiniciar datos</button>
          </span>
        )}
      </div>
    </div>
  );
}

export function Pie() {
  return (
    <footer className="pie">
      <div className="contenedor pie-cuadricula">
        <div>
          <div className="pie-logo"><Logo alto={56} /></div>
          <p className="pie-lema">¡Vacaciones para ellos, <span>tranquilidad para ti!</span></p>
        </div>
        <div className="pie-dato">
          <IconoUbicacion />
          <div><small>Dirección</small><a href={NEGOCIO.comoLlegar} target="_blank" rel="noreferrer">E. Portes Gil No. 95<br />Col. Santa Bárbara, El Pueblito</a></div>
        </div>
        <div className="pie-dato">
          <IconoWhatsapp tam={26} />
          <div><small>WhatsApp</small><a href={whatsapp(NEGOCIO.whatsapp, 'Hola CanSuites, quiero información.')!} target="_blank" rel="noreferrer">{NEGOCIO.telefono}</a></div>
        </div>
        <div className="pie-dato pie-redes">
          <a href={NEGOCIO.facebook} target="_blank" rel="noreferrer"><IconoFacebook /> {NEGOCIO.facebookNombre}</a>
          <a href={NEGOCIO.instagram} target="_blank" rel="noreferrer"><IconoInstagram /> {NEGOCIO.instagramNombre}</a>
        </div>
      </div>
      <div className="contenedor pie-legal">
        <span>© {new Date().getFullYear()} CanSuites · Hotel · Guardería · Estética canina</span>
        <span><Link to="/reservar">Reservar</Link> · <Link to="/tienda">Tienda</Link> · <Link to="/cuenta">Mi cuenta</Link></span>
      </div>
    </footer>
  );
}

export function BotonWhatsApp() {
  return (
    <a className="flotante-whatsapp" href={whatsapp(NEGOCIO.whatsapp, 'Hola CanSuites, quiero información.')!} target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp">
      <IconoWhatsapp />
    </a>
  );
}

/** Página con encabezado y pie (todo menos la portada, que arma su propio contenido). */
export function Pagina({ children, angosta, clase = '' }: { children: ReactNode; angosta?: boolean; clase?: string }) {
  return (
    <div className="sitio">
      <Encabezado />
      <main className={`contenedor pagina ${angosta ? 'angosta' : ''} ${clase}`}>{children}</main>
      <Pie />
      <BotonWhatsApp />
    </div>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="kicker">{children}</p>;
}

export function IconoWhatsapp({ tam = 28 }: { tam?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3Z" />
    </svg>
  );
}
export function IconoUbicacion() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
      <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  );
}
function IconoInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}
function IconoFacebook() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5Z" />
    </svg>
  );
}
