import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { supabase, mensajeError, llamarPagos } from '../lib/supabase';
import type { Horario, ModoPago, Sitio } from '../lib/tipos';
import { dinero, DIAS, precio } from '../lib/formato';
import { Aviso, Campo, Cargando } from '../components/ui';
import ProductosTienda, { lineasDelCarrito, type Carrito, type ProductoEnLinea } from '../components/ProductosTienda';
import { BotonWhatsApp, Kicker, SitioNav, SitioPie, TablaHorario, estadoHoy } from '../components/Sitio';

interface Info {
  negocio: { id: string; nombre: string; slug: string; telefono: string | null; direccion: string | null; logo_url: string | null; zona_horaria: string; moneda: string; horario: Horario; pago_en_linea: ModoPago; anticipo_pct: number; sitio?: Sitio };
  servicios: { id: string; nombre: string; descripcion: string | null; categoria: string | null; duracion_min: number; precio: number }[];
  barberos: { id: string; nombre: string; foto_url: string | null; color: string; bio?: string | null }[];
  /** Productos que se pueden comprar con la reserva (solo si la barbería cobra en línea). */
  productos?: ProductoEnLinea[];
}
/** Hora de inicio posible; las ocupadas vienen con libre = false y sin barbero. */
type Hueco = { inicio: string; barbero_id: string | null; libre?: boolean };
type Confirmacion = { id: string; inicio: string; servicio: string; barbero: string; precio: number };

/** Página web pública de la barbería: portada, servicios, equipo, reservas en línea, tienda, galería y contacto. */
export default function Reservar() {
  const { slug = '' } = useParams();
  const { hash } = useLocation();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [servicioId, setServicioId] = useState('');
  const [barberoId, setBarberoId] = useState<string>('');
  const [dia, setDia] = useState('');
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [hueco, setHueco] = useState<Hueco | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<Confirmacion | null>(null);
  const [carrito, setCarrito] = useState<Carrito>({});
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    supabase.rpc('reserva_negocio', { p_slug: slug }).then(({ data }) => {
      setInfo((data as Info) || null);
      if (data) document.title = `${(data as Info).negocio.nombre} · Reserva en línea`;
    });
  }, [slug]);

  // Al llegar con #reservar, #contacto, etc. (desde la tienda) se baja a esa sección.
  useEffect(() => {
    if (info && hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 50);
  }, [info, hash]);

  const tz = info?.negocio.zona_horaria || 'America/Mexico_City';
  const diaEnTz = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const horaEnTz = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const fechaEnTz = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });

  // Próximos 21 días contados en la zona horaria de la barbería.
  const dias = Array.from({ length: 21 }, (_, i) => {
    const iso = diaEnTz(new Date(Date.now() + i * 864e5));
    return { iso, d: new Date(iso + 'T12:00:00') };
  });

  useEffect(() => {
    if (!servicioId || !dia) { setHuecos(null); return; }
    setHuecos(null); setHueco(null);
    supabase.rpc('reserva_horarios', { p_slug: slug, p_servicio: servicioId, p_barbero: barberoId || null, p_fecha: dia })
      .then(({ data, error }) => { if (error) setError(mensajeError(error)); setHuecos((data as Hueco[]) || []); });
  }, [slug, servicioId, barberoId, dia]);

  const irAReservar = () => setTimeout(() => document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth' }), 30);

  async function reservar(e: FormEvent) {
    e.preventDefault();
    if (!hueco) return;
    // Con pago obligatorio, Enter en el formulario también lleva a pagar.
    if (info?.negocio.pago_en_linea === 'obligatorio') return pagar();
    setError(''); setEnviando(true);
    const { data, error } = await supabase.rpc('reservar', {
      p_slug: slug, p_servicio: servicioId, p_barbero: barberoId || null, p_inicio: hueco.inicio,
      p_nombre: nombre, p_telefono: telefono, p_notas: notas || null,
    });
    setEnviando(false);
    if (error) {
      setError(mensajeError(error));
      setHueco(null);
      const d = dia; setDia(''); setTimeout(() => setDia(d)); // recarga horarios
      return;
    }
    setListo(data as Confirmacion);
    window.scrollTo({ top: 0 });
  }

  /** Aparta el horario y manda al cliente a pagar a Mercado Pago. */
  async function pagar() {
    if (!hueco || !formulario.current?.reportValidity()) return;
    setError(''); setEnviando(true);
    try {
      const r = await llamarPagos<{ url: string }>({
        accion: 'crear', slug, servicio: servicioId, barbero: barberoId || null, inicio: hueco.inicio,
        nombre, telefono, notas: notas || null,
        productos: lineasDelCarrito(carrito),
      });
      window.location.href = r.url;
    } catch (err) {
      setEnviando(false);
      setError(mensajeError(err));
      setHueco(null);
      const d = dia; setDia(''); setTimeout(() => setDia(d)); // recarga horarios
    }
  }

  if (info === undefined) return <div className="sitio pantalla-centro"><Cargando /></div>;
  if (info === null) {
    return (
      <div className="sitio pantalla-centro">
        <div className="tarjeta acceso centro">
          <h2>Barbería no encontrada</h2>
          <p className="tenue">El enlace no existe o la barbería no está recibiendo reservas en línea por ahora.</p>
        </div>
      </div>
    );
  }

  const { negocio, servicios, barberos } = info;
  const sitio = negocio.sitio || {};
  const serv = servicios.find((s) => s.id === servicioId);
  const m = (n: number) => dinero(n, negocio.moneda);
  const pc = (n: number) => precio(n, negocio.moneda);
  const modoPago = negocio.pago_en_linea;
  const anticipo = serv ? Math.round(serv.precio * negocio.anticipo_pct) / 100 : 0;
  const cobraEnLinea = modoPago !== 'desactivado' && anticipo > 0;
  const enTienda = modoPago !== 'desactivado' ? info.productos || [] : [];
  const productos = cobraEnLinea ? enTienda : [];
  const elegidos = productos.filter((p) => (carrito[p.id] || 0) > 0);
  const totalProductos = elegidos.reduce((a, p) => a + p.precio * carrito[p.id], 0);
  const aPagar = anticipo + totalProductos;
  const cambiarCantidad = (id: string, n: number) => setCarrito((c) => ({ ...c, [id]: n }));
  const tieneTienda = enTienda.length > 0;
  const galeria = sitio.galeria || [];
  const hoy = estadoHoy(negocio.horario, tz);
  const colonia = negocio.direccion?.split(',').slice(1, 2).join('').trim();
  const desdePrecio = servicios.length ? Math.min(...servicios.map((s) => s.precio)) : 0;

  // Servicios agrupados por categoría, en el orden en que llegan.
  const categorias: [string, Info['servicios']][] = [];
  for (const s of servicios) {
    const c = s.categoria || 'Servicios';
    const g = categorias.find(([n]) => n === c);
    if (g) g[1].push(s); else categorias.push([c, [s]]);
  }

  const secciones: [string, string][] = [['servicios', 'Servicios']];
  if (barberos.length) secciones.push(['equipo', 'Equipo']);
  if (galeria.length) secciones.push(['galeria', 'Galería']);
  secciones.push(['contacto', 'Contacto']);

  if (listo) {
    return (
      <div className="sitio">
        <SitioNav negocio={negocio} enPortada={false} tieneTienda={tieneTienda} secciones={secciones} />
        <div className="s-contenedor s-confirmacion">
          <div className="tarjeta acceso centro">
            <div className="palomita" aria-hidden>✓</div>
            <h2>¡Listo, {nombre.split(' ')[0]}!</h2>
            <p>Tu cita en <strong>{negocio.nombre}</strong> quedó agendada:</p>
            <p className="grande-texto">{fechaEnTz(listo.inicio)}<br />{horaEnTz(listo.inicio)}</p>
            <p>{listo.servicio} con {listo.barbero} · {m(listo.precio)}</p>
            {negocio.direccion && <p className="tenue">{negocio.direccion}</p>}
            <p className="tenue pequeno">Guarda este enlace por si necesitas cancelar:</p>
            <Link to={`/r/${negocio.slug}/cancelar/${listo.id}`}>Cancelar mi cita</Link>
          </div>
        </div>
        <SitioPie negocio={negocio} tieneTienda={tieneTienda} />
      </div>
    );
  }

  return (
    <div className="sitio">
      <SitioNav negocio={negocio} enPortada tieneTienda={tieneTienda} secciones={secciones} />

      {/* Portada */}
      <header className={`s-hero ${sitio.portada ? '' : 's-hero-sin-foto'}`} style={sitio.portada ? { backgroundImage: `url("${sitio.portada}")` } : undefined}>
        <div className="s-contenedor s-hero-contenido">
          <Kicker>Barbería{colonia && ` · ${colonia}`}{sitio.desde && ` · Desde ${sitio.desde}`}</Kicker>
          <h1>{sitio.titular || negocio.nombre}</h1>
          <p className="s-hero-lema">{sitio.lema || 'Reserva tu cita en línea en menos de un minuto.'}</p>
          <div className="s-hero-botones">
            <a className="s-btn s-btn-oro" href="#reservar">Reservar cita</a>
            {tieneTienda
              ? <Link className="s-btn s-btn-borde" to={`/r/${negocio.slug}/productos`}>Comprar productos</Link>
              : <a className="s-btn s-btn-borde" href="#servicios">Ver servicios</a>}
          </div>
        </div>
        <div className="s-hero-franja">
          <div className="s-contenedor s-hero-datos">
            <span><i className={`s-punto ${hoy.abierto ? 's-punto-ok' : ''}`} />{hoy.texto}</span>
            {negocio.direccion && <span>{negocio.direccion}</span>}
            {desdePrecio > 0 && <span>Servicios desde {pc(desdePrecio)}</span>}
          </div>
        </div>
      </header>

      {/* Servicios */}
      <section id="servicios" className="s-seccion">
        <div className="s-contenedor">
          <div className="s-titulo-seccion">
            <Kicker>Carta de servicios</Kicker>
            <h2>Servicios y precios</h2>
          </div>
          <div className="s-carta">
            {categorias.map(([cat, lista]) => (
              <div key={cat} className="s-carta-grupo">
                <h3>{cat}</h3>
                {lista.map((s) => (
                  <button key={s.id} className="s-carta-item" onClick={() => { setServicioId(s.id); irAReservar(); }}>
                    <span className="s-carta-linea">
                      <strong>{s.nombre}</strong>
                      <span className="s-puntos" aria-hidden />
                      <span className="s-precio">{pc(s.precio)}</span>
                    </span>
                    <span className="s-carta-desc">{s.duracion_min} min{s.descripcion && ` · ${s.descripcion}`}</span>
                    <span className="s-carta-accion">Reservar →</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nosotros */}
      {sitio.descripcion && (
        <section className="s-seccion s-nosotros">
          <div className="s-contenedor s-dos">
            {sitio.foto_nosotros && <img className="s-nosotros-foto" src={sitio.foto_nosotros} alt="" loading="lazy" />}
            <div>
              <Kicker>Nuestra casa</Kicker>
              <h2>Oficio, ambiente y buen servicio</h2>
              <p className="s-texto-largo">{sitio.descripcion}</p>
              <div className="s-cifras">
                {sitio.desde && <div><strong>{new Date().getFullYear() - Number(sitio.desde) || sitio.desde}</strong><span>años de oficio</span></div>}
                <div><strong>{barberos.length}</strong><span>barberos</span></div>
                <div><strong>{servicios.length}</strong><span>servicios</span></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Equipo */}
      {barberos.length > 0 && (
        <section id="equipo" className="s-seccion">
          <div className="s-contenedor">
            <div className="s-titulo-seccion">
              <Kicker>El equipo</Kicker>
              <h2>Nuestros barberos</h2>
            </div>
            <div className="s-equipo">
              {barberos.map((b) => (
                <article key={b.id} className="s-barbero">
                  <div className="s-barbero-foto">
                    {b.foto_url ? <img src={b.foto_url} alt={b.nombre} loading="lazy" /> : <span style={{ background: b.color }}>{b.nombre[0]}</span>}
                  </div>
                  <h3>{b.nombre}</h3>
                  {b.bio && <p>{b.bio}</p>}
                  <button className="s-enlace" onClick={() => { setBarberoId(b.id); irAReservar(); }}>Reservar con {b.nombre.split(' ')[0]} →</button>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Reservar */}
      <section id="reservar" className="s-seccion s-reserva">
        <div className="s-contenedor s-reserva-caja">
          <div className="s-titulo-seccion">
            <Kicker>Reserva en línea</Kicker>
            <h2>Aparta tu lugar</h2>
            <p className="s-tenue">Elige servicio, barbero y horario. {cobraEnLinea || modoPago === 'obligatorio' ? 'Pagas en línea de forma segura con Mercado Pago.' : 'Sin crear cuenta.'}</p>
          </div>

          <div className="paso">
            <h3 className="s-paso"><span className="num-paso">1</span> Servicio</h3>
            <div className="opciones">
              {servicios.map((s) => (
                <button key={s.id} className={`opcion ${servicioId === s.id ? 'elegida' : ''}`} onClick={() => setServicioId(s.id)}>
                  <div className="crece">
                    <strong>{s.nombre}</strong>
                    <div className="tenue pequeno">{s.duracion_min} min{s.descripcion && ` · ${s.descripcion}`}</div>
                  </div>
                  <strong>{pc(s.precio)}</strong>
                </button>
              ))}
            </div>
          </div>

          {serv && barberos.length > 1 && (
            <div className="paso">
              <h3 className="s-paso"><span className="num-paso">2</span> ¿Con quién?</h3>
              <div className="s-elegir-barbero">
                <button className={`s-avatar-opcion ${!barberoId ? 'elegida' : ''}`} onClick={() => setBarberoId('')}>
                  <span className="s-avatar s-avatar-cualquiera">✂</span>Cualquiera
                </button>
                {barberos.map((b) => (
                  <button key={b.id} className={`s-avatar-opcion ${barberoId === b.id ? 'elegida' : ''}`} onClick={() => setBarberoId(b.id)}>
                    {b.foto_url ? <img className="s-avatar" src={b.foto_url} alt="" /> : <span className="s-avatar" style={{ background: b.color }}>{b.nombre[0]}</span>}
                    {b.nombre.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {serv && (
            <div className="paso">
              <h3 className="s-paso"><span className="num-paso">{barberos.length > 1 ? 3 : 2}</span> Día y hora</h3>
              <div className="dias">
                {dias.map(({ iso, d }) => (
                  <button key={iso} className={`dia ${dia === iso ? 'elegida' : ''}`} onClick={() => setDia(iso)}>
                    <small>{DIAS[(d.getDay() + 6) % 7].slice(0, 3)}</small>
                    <strong>{d.getDate()}</strong>
                    <small>{d.toLocaleDateString('es-MX', { month: 'short' })}</small>
                  </button>
                ))}
              </div>
              {dia && (huecos === null ? <Cargando /> : !huecos.some((h) => h.libre !== false) ? (
                <p className="tenue">No hay horarios libres ese día. Prueba otro.</p>
              ) : (
                <>
                  <div className="horas">
                    {huecos.map((h) => h.libre === false ? (
                      <button key={h.inicio} type="button" className="hora ocupada" disabled aria-label={`${horaEnTz(h.inicio)} ocupado`} title="Ocupado">
                        {horaEnTz(h.inicio)}
                      </button>
                    ) : (
                      <button key={h.inicio} className={`hora ${hueco?.inicio === h.inicio ? 'elegida' : ''}`} onClick={() => setHueco(h)}>
                        {horaEnTz(h.inicio)}
                      </button>
                    ))}
                  </div>
                  {huecos.some((h) => h.libre === false) && (
                    <p className="tenue pequeno leyenda-horas"><span className="muestra-ocupada" aria-hidden /> Ocupado</p>
                  )}
                </>
              ))}
            </div>
          )}

          {hueco && serv && (
            <form className="paso tarjeta formulario" onSubmit={reservar} ref={formulario}>
              <h3 className="s-paso"><span className="num-paso">{barberos.length > 1 ? 4 : 3}</span> Tus datos</h3>
              <p>
                <strong>{serv.nombre}</strong> el {fechaEnTz(hueco.inicio)} a las {horaEnTz(hueco.inicio)}
                {' '}con {barberos.find((b) => b.id === hueco.barbero_id)?.nombre} · {m(serv.precio)}
              </p>
              <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></Campo>
              <Campo etiqueta="WhatsApp o teléfono"><input value={telefono} onChange={(e) => setTelefono(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="10 dígitos" /></Campo>
              <Campo etiqueta="Comentario (opcional)"><input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} /></Campo>
              {productos.length > 0 && (
                <div className="tienda">
                  <h3>¿Quieres llevar algo más?</h3>
                  <p className="tenue pequeno">Págalo ahora y te lo entregan en tu cita.</p>
                  <ProductosTienda productos={productos} carrito={carrito} onCambiar={cambiarCantidad} moneda={negocio.moneda} />
                </div>
              )}
              {cobraEnLinea && (
                <div className="pago-resumen">
                  {elegidos.length > 0 && (
                    <table className="resumen-tabla">
                      <tbody>
                        <tr><td>{serv.nombre}{anticipo < serv.precio && ` (anticipo ${negocio.anticipo_pct}%)`}</td><td className="num">{m(anticipo)}</td></tr>
                        {elegidos.map((p) => (
                          <tr key={p.id}><td>{carrito[p.id]} × {p.nombre}</td><td className="num">{m(p.precio * carrito[p.id])}</td></tr>
                        ))}
                        <tr className="total"><td>Total a pagar</td><td className="num">{m(aPagar)}</td></tr>
                      </tbody>
                    </table>
                  )}
                  {anticipo < serv.precio ? (
                    <p>Para apartar se paga un anticipo de <strong>{m(anticipo)}</strong>; el resto del servicio ({m(serv.precio - anticipo)}) en la barbería.</p>
                  ) : elegidos.length === 0 && <p>Puedes pagar ahora <strong>{m(anticipo)}</strong> con tarjeta o Mercado Pago.</p>}
                  <p className="tenue pequeno">Pago seguro con Mercado Pago. Tu horario queda apartado 20 minutos mientras pagas.</p>
                </div>
              )}
              <Aviso>{error}</Aviso>
              {cobraEnLinea ? (
                <>
                  <button type="button" className="btn btn-primario ancho grande" disabled={enviando} onClick={pagar}>
                    {enviando ? 'Abriendo Mercado Pago…' : `Pagar ${m(aPagar)} y reservar`}
                  </button>
                  {modoPago === 'opcional' && elegidos.length === 0 && (
                    <button className="btn ancho" disabled={enviando}>Reservar y pagar en la barbería</button>
                  )}
                </>
              ) : (
                <button className="btn btn-primario ancho grande" disabled={enviando}>Confirmar reserva</button>
              )}
            </form>
          )}
          {!hueco && <Aviso>{error}</Aviso>}
        </div>
      </section>

      {/* Tienda */}
      {tieneTienda && (
        <section id="tienda" className="s-seccion">
          <div className="s-contenedor">
            <div className="s-titulo-seccion s-titulo-con-accion">
              <div>
                <Kicker>Tienda en línea</Kicker>
                <h2>Lleva la barbería a casa</h2>
                <p className="s-tenue">Compra en línea y recoge en la sucursal, sin filas.</p>
              </div>
              <Link className="s-btn s-btn-borde" to={`/r/${negocio.slug}/productos`}>Ver toda la tienda</Link>
            </div>
            <div className="s-vitrina">
              {enTienda.slice(0, 4).map((p) => (
                <Link key={p.id} className="s-vitrina-item" to={`/r/${negocio.slug}/productos`}>
                  <div className="producto-foto">
                    {p.foto_url ? <img src={p.foto_url} alt={p.nombre} loading="lazy" /> : <span aria-hidden>{p.nombre[0]}</span>}
                  </div>
                  <h3>{p.nombre}</h3>
                  <span className="producto-precio">{pc(p.precio)}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Galería */}
      {galeria.length > 0 && (
        <section id="galeria" className="s-seccion">
          <div className="s-contenedor">
            <div className="s-titulo-seccion">
              <Kicker>Galería</Kicker>
              <h2>Nuestro trabajo</h2>
            </div>
            <div className="s-galeria">
              {galeria.map((url, i) => <img key={url + i} src={url} alt={`Trabajo ${i + 1} de ${negocio.nombre}`} loading="lazy" />)}
            </div>
          </div>
        </section>
      )}

      {/* Contacto */}
      <section id="contacto" className="s-seccion s-contacto">
        <div className="s-contenedor s-dos">
          <div>
            <Kicker>Visítanos</Kicker>
            <h2>Horario y ubicación</h2>
            <TablaHorario negocio={negocio} />
            {negocio.direccion && (
              <p className="s-direccion">
                {negocio.direccion}<br />
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negocio.direccion)}`} target="_blank" rel="noreferrer">Cómo llegar →</a>
              </p>
            )}
            {negocio.telefono && <p><a href={`tel:${negocio.telefono}`}>{negocio.telefono}</a></p>}
            <a className="s-btn s-btn-oro" href="#reservar">Reservar cita</a>
          </div>
          {negocio.direccion && (
            <iframe className="s-mapa" title={`Mapa de ${negocio.nombre}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps?q=${encodeURIComponent(negocio.direccion)}&output=embed`} />
          )}
        </div>
      </section>

      <SitioPie negocio={negocio} tieneTienda={tieneTienda} />
      <BotonWhatsApp negocio={negocio} />
    </div>
  );
}
