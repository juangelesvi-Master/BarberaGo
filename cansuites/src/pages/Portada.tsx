import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/datos';
import type { Ajustes, Producto, Servicio } from '../lib/tipos';
import { TALLAS } from '../lib/tipos';
import { DIAS, precio } from '../lib/formato';
import { NEGOCIO } from '../lib/negocio';
import { INCLUYE_BANO, ICONO_CATEGORIA } from '../lib/catalogo';
import { BotonWhatsApp, Encabezado, IconoUbicacion, IconoWhatsapp, Kicker, Pie } from '../components/Sitio';
import { whatsapp } from '../lib/formato';

const VENTAJAS = [
  { icono: '🏠', titulo: 'Hotel canino', texto: 'con habitaciones premium' },
  { icono: '🎾', titulo: 'Guardería', texto: 'de día, mientras trabajas' },
  { icono: '🐕', titulo: 'Grandes áreas', texto: 'de juego y alberca' },
  { icono: '📹', titulo: 'Monitoreo 24/7', texto: 'cámaras y personal siempre' },
  { icono: '➕', titulo: 'Supervisión veterinaria', texto: 'y expediente de cada huésped' },
];

const ICONOS_INCLUYE = ['✂️', '👂', '🐾', '🧣', '🌸'];

export default function Portada() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);

  useEffect(() => {
    document.title = 'CanSuites · Hotel y Guardería Canina en El Pueblito, Qro.';
    api.servicios().then(setServicios).catch(() => {});
    api.productos().then(setProductos).catch(() => {});
    api.ajustes().then(setAjustes).catch(() => {});
  }, []);

  const hotel = servicios.filter((s) => s.tipo === 'hotel');
  const guarderia = servicios.filter((s) => s.tipo === 'guarderia');
  const estetica = (t: string) => servicios.find((s) => s.tipo === 'estetica' && s.talla === t);
  const desde = (xs: Servicio[]) => (xs.length ? Math.min(...xs.map((s) => s.precio)) : null);

  return (
    <div className="sitio">
      <Encabezado />

      <section className="hero">
        <div className="contenedor hero-cuadricula">
          <div className="hero-texto">
            <p className="hero-etiqueta">Hotel · Guardería · Estética</p>
            <h1>
              Donde ellos <span className="hero-resalta">juegan,</span><br />
              se divierten y son <span className="subrayado">felices</span>
            </h1>
            <p className="hero-lema">
              Suites premium, grandes áreas de juego, alberca y monitoreo 24/7 en El Pueblito, Querétaro.
              Reserva en línea y consulta el expediente de tu perro desde tu cuenta.
            </p>
            <div className="hero-botones">
              <Link to="/reservar" className="btn btn-primario grande">Reservar estancia</Link>
              <Link to="/reservar?servicio=estetica" className="btn btn-negro grande">Agendar baño</Link>
            </div>
          </div>
          <div className="hero-foto">
            <div className="hero-burbuja">Grandes áreas y suites <strong>premium.</strong></div>
            <img src="/img/hero.jpg" alt="Golden retriever feliz con lentes de sol en la alberca de CanSuites" />
            <div className="hero-sello"><span aria-hidden>🐾</span> ¡Vacaciones para ellos, <strong>tranquilidad para ti!</strong></div>
          </div>
        </div>
      </section>

      <section className="ventajas">
        <div className="contenedor ventajas-fila">
          {VENTAJAS.map((v) => (
            <div key={v.titulo} className="ventaja">
              <span className="circulo-icono" aria-hidden>{v.icono}</span>
              <div><strong>{v.titulo}</strong><small>{v.texto}</small></div>
            </div>
          ))}
        </div>
      </section>

      <section id="servicios" className="seccion">
        <div className="contenedor">
          <div className="titulo-seccion">
            <Kicker>Nuestros servicios</Kicker>
            <h2>Todo lo que tu mejor amigo necesita</h2>
          </div>
          <div className="tarjetas-servicio">
            <article className="tarjeta-servicio">
              <span className="circulo-icono grande" aria-hidden>🏨</span>
              <h3>Hotel canino</h3>
              <p>Suites cómodas y seguras para que se quede las noches que necesites. Entrada desde las {ajustes?.check_in || '10:00'} y salida hasta las {ajustes?.check_out || '13:00'}.</p>
              <ul className="lista-precios">
                {hotel.map((s) => <li key={s.id}><span>{s.nombre}</span><strong>{precio(s.precio)}<small>/noche</small></strong></li>)}
              </ul>
              <Link to="/reservar?servicio=hotel" className="btn btn-primario ancho">Reservar hotel</Link>
            </article>
            <article className="tarjeta-servicio destacada">
              <span className="circulo-icono grande" aria-hidden>🎾</span>
              <h3>Guardería</h3>
              <p>Déjalo en la mañana y recógelo feliz y cansado: juego en grandes áreas, socialización supervisada y siesta.</p>
              <ul className="lista-precios">
                {guarderia.map((s) => <li key={s.id}><span>{s.nombre}</span><strong>{precio(s.precio)}<small>/día</small></strong></li>)}
              </ul>
              <Link to="/reservar?servicio=guarderia" className="btn btn-primario ancho">Reservar guardería</Link>
            </article>
            <article className="tarjeta-servicio">
              <span className="circulo-icono grande" aria-hidden>🛁</span>
              <h3>Estética canina</h3>
              <p>Baños que consentirán a tu mejor amigo, con corte de garras, limpieza de oídos y más incluidos.</p>
              <ul className="lista-precios">
                <li><span>Baño y estética</span><strong>desde {precio(desde(servicios.filter((s) => s.tipo === 'estetica')) ?? 250)}</strong></li>
              </ul>
              <a href="#estetica" className="btn btn-negro ancho">Ver precios por talla</a>
            </article>
          </div>
        </div>
      </section>

      <section id="estetica" className="seccion seccion-crema">
        <div className="contenedor">
          <div className="titulo-seccion">
            <Kicker>Estética canina</Kicker>
            <h2>Baños que consentirán a tu mejor amigo</h2>
            <p className="tenue">Precio según el peso aproximado. Precios sujetos a revisión conforme al estado del perrito.</p>
          </div>
          <div className="tallas">
            {TALLAS.map((t, i) => {
              const s = estetica(t.id);
              return (
                <Link key={t.id} to={`/reservar?servicio=estetica&talla=${t.id}`} className={`talla ${i >= 2 ? 'talla-negra' : ''}`}>
                  <div className="talla-cabeza"><span className="talla-letra">{t.id}</span> {t.nombre.toUpperCase()}</div>
                  <div className="talla-cinta">Baño y estética</div>
                  <small>Peso aproximado:</small>
                  <strong className="talla-peso">{t.peso}</strong>
                  <img src={t.foto} alt={`Perro talla ${t.nombre.toLowerCase()}`} loading="lazy" />
                  <div className="talla-precio">{precio(s?.precio ?? 0)} <span aria-hidden>🐾</span></div>
                </Link>
              );
            })}
          </div>
          <div className="incluye">
            <strong>🐾 Todo nuestro servicio de baño incluye:</strong>
            <ul>
              {INCLUYE_BANO.map((x, i) => <li key={x}><span aria-hidden>{ICONOS_INCLUYE[i]}</span>{x}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="seccion">
        <div className="contenedor dos">
          <div>
            <Kicker>Tu cuenta CanSuites</Kicker>
            <h2>El expediente de tu perro, siempre a la mano</h2>
            <p className="texto-largo">
              Crea tu cuenta gratis, registra a tus mascotas y consulta en cualquier momento su historial médico:
              vacunas, desparasitaciones, revisiones de ingreso y notas de nuestro equipo durante cada estancia.
              Te avisamos cuándo toca la próxima vacuna.
            </p>
            <ul className="lista-check">
              <li>Reserva hotel, guardería y estética en minutos</li>
              <li>Historial médico y cartilla de vacunación</li>
              <li>Tus reservas y pedidos en un solo lugar</li>
            </ul>
            <Link to="/entrar?modo=registro" className="btn btn-primario grande">Crear mi cuenta</Link>
          </div>
          <div className="maqueta-expediente" aria-hidden>
            <div className="maqueta-cabeza"><img src="/img/talla-g.jpg" alt="" /><div><strong>Max</strong><small>Golden retriever · 4 años · 32 kg</small></div></div>
            <div className="maqueta-linea"><span>💉</span><div><strong>Rabia</strong><small>Próxima dosis en 2 meses</small></div><em className="chip chip-ok">Al día</em></div>
            <div className="maqueta-linea"><span>💊</span><div><strong>Desparasitación interna</strong><small>Toca en 30 días</small></div><em className="chip chip-alerta">Pronto</em></div>
            <div className="maqueta-linea"><span>🩺</span><div><strong>Revisión de ingreso al hotel</strong><small>Apto para áreas de juego</small></div><em className="chip">CanSuites</em></div>
          </div>
        </div>
      </section>

      {productos.length > 0 && (
        <section className="seccion seccion-crema">
          <div className="contenedor">
            <div className="titulo-seccion titulo-con-accion">
              <div>
                <Kicker>Tienda en línea</Kicker>
                <h2>Lo que usamos y recomendamos</h2>
              </div>
              <Link to="/tienda" className="btn btn-negro">Ver toda la tienda</Link>
            </div>
            <div className="vitrina">
              {productos.slice(0, 4).map((p) => (
                <Link key={p.id} to="/tienda" className="vitrina-item">
                  <div className="producto-foto">
                    {p.foto_url ? <img src={p.foto_url} alt="" loading="lazy" /> : <span aria-hidden>{ICONO_CATEGORIA[p.categoria || ''] || '🐾'}</span>}
                  </div>
                  <h3>{p.nombre}</h3>
                  <strong className="naranja">{precio(p.precio)}</strong>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="contacto" className="seccion">
        <div className="contenedor dos contacto">
          <div>
            <Kicker>Visítanos</Kicker>
            <h2>Estamos en El Pueblito</h2>
            <p className="direccion"><IconoUbicacion /> <span>{NEGOCIO.direccion}<br /><small className="tenue">{NEGOCIO.referencia}</small></span></p>
            <p className="direccion"><IconoWhatsapp tam={24} /> <a href={whatsapp(NEGOCIO.whatsapp, 'Hola CanSuites, quiero información.')!} target="_blank" rel="noreferrer">{NEGOCIO.telefono}</a></p>
            {ajustes && (
              <table className="horario">
                <caption>Horario de recepción y estética</caption>
                <tbody>
                  {DIAS.map((d, i) => {
                    const t = ajustes.horario[String(i + 1)] || [];
                    return <tr key={d}><td>{d}</td><td>{t.length ? t.map(([a, c]) => `${a} – ${c}`).join(', ') : 'Cerrado'}</td></tr>;
                  })}
                </tbody>
              </table>
            )}
            <p className="tenue pequeno">Los huéspedes del hotel están acompañados y monitoreados las 24 horas, también en domingo.</p>
            <a className="btn btn-primario" href={NEGOCIO.comoLlegar} target="_blank" rel="noreferrer">Cómo llegar</a>
          </div>
          <iframe className="mapa" title="Mapa de CanSuites" src={NEGOCIO.mapa} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </section>

      <Pie />
      <BotonWhatsApp />
    </div>
  );
}
