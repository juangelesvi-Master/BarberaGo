import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Horario, Sitio } from '../lib/tipos';
import { DIAS, whatsapp } from '../lib/formato';

/** Lo que la página web pública necesita de la barbería (viene de reserva_negocio). */
export interface NegocioPublico {
  nombre: string;
  slug: string;
  telefono: string | null;
  direccion: string | null;
  logo_url: string | null;
  zona_horaria: string;
  horario: Horario;
  sitio?: Sitio;
}

/** Día ISO de hoy ("1" = lunes … "7" = domingo) en la zona horaria de la barbería. */
export function diaHoy(tz: string): string {
  const d = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date());
  return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(d) + 1);
}

export function horarioDia(h: Horario, dia: string): string {
  const tramos = h[dia] || [];
  return tramos.length ? tramos.map(([a, c]) => `${a} – ${c}`).join(', ') : 'Cerrado';
}

function abiertoAhora(h: Horario, tz: string): boolean {
  const ahora = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  return (h[diaHoy(tz)] || []).some(([a, c]) => ahora >= a && ahora < c);
}

/** "Abierto ahora · cierra 20:00" o "Cerrado · hoy 10:00 – 20:00". */
export function estadoHoy(h: Horario, tz: string): { abierto: boolean; texto: string } {
  const hoy = h[diaHoy(tz)] || [];
  if (abiertoAhora(h, tz)) return { abierto: true, texto: `Abierto ahora · cierra ${hoy[hoy.length - 1][1]}` };
  return { abierto: false, texto: hoy.length ? `Cerrado ahora · hoy ${horarioDia(h, diaHoy(tz))}` : 'Hoy cerrado' };
}

function red(valor: string | undefined, base: string): string | null {
  if (!valor?.trim()) return null;
  const v = valor.trim();
  return /^https?:\/\//.test(v) ? v : base + v.replace(/^@/, '');
}

export function numeroWhatsapp(n: NegocioPublico): string | null {
  return n.sitio?.whatsapp || n.telefono || null;
}

/** Logo de la barbería o un monograma con su inicial. */
export function Marca({ negocio, tam = 40 }: { negocio: NegocioPublico; tam?: number }) {
  if (negocio.logo_url) return <img className="s-marca-logo" src={negocio.logo_url} alt="" width={tam} height={tam} />;
  return <span className="s-monograma" style={{ width: tam, height: tam, fontSize: tam * 0.48 }} aria-hidden>{negocio.nombre.trim()[0]}</span>;
}

/** Barra de navegación fija de la página web. En la tienda los enlaces llevan de vuelta a la portada. */
export function SitioNav({ negocio, enPortada, tieneTienda, secciones }: {
  negocio: NegocioPublico; enPortada: boolean; tieneTienda: boolean; secciones: [string, string][];
}) {
  const [abierto, setAbierto] = useState(false);
  const [scroll, setScroll] = useState(false);
  useEffect(() => {
    const f = () => setScroll(window.scrollY > 40);
    f(); window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  const a = (id: string) => (enPortada ? `#${id}` : `/r/${negocio.slug}#${id}`);
  const cerrar = () => setAbierto(false);
  return (
    <nav className={`s-nav ${scroll || !enPortada ? 's-nav-solida' : ''} ${abierto ? 's-nav-abierta' : ''}`}>
      <div className="s-contenedor s-nav-fila">
        <Link to={`/r/${negocio.slug}`} className="s-marca" onClick={cerrar}>
          <Marca negocio={negocio} tam={36} />
          <span>{negocio.nombre}</span>
        </Link>
        <div className="s-nav-enlaces">
          {secciones.map(([id, t]) => <a key={id} href={a(id)} onClick={cerrar}>{t}</a>)}
          {tieneTienda && <Link to={`/r/${negocio.slug}/productos`} onClick={cerrar}>Tienda</Link>}
          <a className="s-btn s-btn-oro s-btn-chico" href={a('reservar')} onClick={cerrar}>Reservar cita</a>
        </div>
        <button className="s-hamburguesa" aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          <span /><span /><span />
        </button>
      </div>
    </nav>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="s-kicker">{children}</p>;
}

/** Pie de página con horario corto, contacto y redes. */
export function SitioPie({ negocio, tieneTienda }: { negocio: NegocioPublico; tieneTienda: boolean }) {
  const s = negocio.sitio || {};
  const redes = [
    { url: red(s.instagram, 'https://instagram.com/'), nombre: 'Instagram', icono: <IconoInstagram /> },
    { url: red(s.facebook, 'https://facebook.com/'), nombre: 'Facebook', icono: <IconoFacebook /> },
    { url: red(s.tiktok, 'https://www.tiktok.com/@'), nombre: 'TikTok', icono: <IconoTiktok /> },
  ].filter((r) => r.url);
  return (
    <footer className="s-pie">
      <div className="s-contenedor s-pie-cuadricula">
        <div>
          <div className="s-marca"><Marca negocio={negocio} tam={40} /><span>{negocio.nombre}</span></div>
          {s.lema && <p className="s-tenue">{s.lema}</p>}
          {redes.length > 0 && (
            <div className="s-redes">
              {redes.map((r) => <a key={r.nombre} href={r.url!} target="_blank" rel="noreferrer" aria-label={r.nombre}>{r.icono}</a>)}
            </div>
          )}
        </div>
        <div>
          <h4>Visítanos</h4>
          {negocio.direccion && <p className="s-tenue">{negocio.direccion}</p>}
          {negocio.telefono && <p><a href={`tel:${negocio.telefono}`}>{negocio.telefono}</a></p>}
        </div>
        <div>
          <h4>Explora</h4>
          <p><Link to={`/r/${negocio.slug}#reservar`}>Reservar cita</Link></p>
          {tieneTienda && <p><Link to={`/r/${negocio.slug}/productos`}>Tienda en línea</Link></p>}
          <p><Link to={`/r/${negocio.slug}#contacto`}>Horario y ubicación</Link></p>
        </div>
      </div>
      <div className="s-contenedor s-pie-legal">
        <span>© {new Date().getFullYear()} {negocio.nombre}</span>
        <span>
          {s.demo && <>Barbería ficticia de demostración · </>}
          Página, reservas y tienda con <a href="/" target="_blank" rel="noreferrer">BarberaGo</a>
        </span>
      </div>
    </footer>
  );
}

export function BotonWhatsApp({ negocio }: { negocio: NegocioPublico }) {
  const url = whatsapp(numeroWhatsapp(negocio), `Hola ${negocio.nombre}, quiero información.`);
  if (!url) return null;
  return (
    <a className="s-whatsapp" href={url} target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp">
      <IconoWhatsapp />
    </a>
  );
}

/** Tabla de horario de la semana con el día de hoy resaltado. */
export function TablaHorario({ negocio }: { negocio: NegocioPublico }) {
  const hoy = diaHoy(negocio.zona_horaria);
  return (
    <table className="s-horario">
      <tbody>
        {DIAS.map((d, i) => {
          const k = String(i + 1);
          return (
            <tr key={k} className={k === hoy ? 's-hoy' : ''}>
              <td>{d}</td>
              <td>{horarioDia(negocio.horario, k)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function IconoWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3Z" />
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
function IconoTiktok() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M16.5 3c.4 2.2 1.8 3.6 4 3.9v3.3a7.5 7.5 0 0 1-4-1.2v6.3a6 6 0 1 1-6-6h.6v3.4a2.7 2.7 0 1 0 2 2.6V3h3.4Z" />
    </svg>
  );
}
