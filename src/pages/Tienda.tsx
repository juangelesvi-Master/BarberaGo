import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, mensajeError, llamarPagos } from '../lib/supabase';
import type { Horario, ModoPago, Sitio } from '../lib/tipos';
import { dinero } from '../lib/formato';
import { Aviso, Campo, Cargando } from '../components/ui';
import ProductosTienda, { lineasDelCarrito, type Carrito, type ProductoEnLinea } from '../components/ProductosTienda';
import { BotonWhatsApp, Kicker, SitioNav, SitioPie } from '../components/Sitio';

interface Info {
  negocio: { nombre: string; slug: string; telefono: string | null; direccion: string | null; logo_url: string | null; moneda: string; pago_en_linea: ModoPago; zona_horaria: string; horario: Horario; sitio?: Sitio };
  productos?: ProductoEnLinea[];
  barberos?: unknown[];
}

/** Tienda en línea pública: comprar productos sin reservar y recogerlos en la sucursal. */
export default function Tienda() {
  const { slug = '' } = useParams();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [carrito, setCarrito] = useState<Carrito>({});
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const caja = useRef<HTMLFormElement>(null);

  const cargar = useCallback(() => supabase.rpc('reserva_negocio', { p_slug: slug }).then(({ data }) => {
    setInfo((data as Info) || null);
    if (data) document.title = `Tienda · ${(data as Info).negocio.nombre}`;
  }), [slug]);
  useEffect(() => { cargar(); }, [cargar]);

  async function pagar(e: FormEvent) {
    e.preventDefault();
    setError(''); setEnviando(true);
    try {
      const r = await llamarPagos<{ url: string }>({
        accion: 'pedir', slug, nombre, telefono, notas: notas || null, productos: lineasDelCarrito(carrito),
      });
      window.location.href = r.url;
    } catch (err) {
      setEnviando(false);
      setError(mensajeError(err));
      cargar(); // la existencia pudo cambiar
    }
  }

  if (info === undefined) return <div className="sitio pantalla-centro"><Cargando /></div>;
  const productos = info && info.negocio.pago_en_linea !== 'desactivado' ? info.productos || [] : [];
  if (!info || productos.length === 0) {
    return (
      <div className="sitio pantalla-centro">
        <div className="tarjeta acceso centro">
          <h2>Por ahora no hay productos en línea</h2>
          <p className="tenue">Esta barbería todavía no vende productos por internet.</p>
          {info && <Link className="btn btn-primario" to={`/r/${info.negocio.slug}`}>Reservar una cita</Link>}
        </div>
      </div>
    );
  }

  const { negocio } = info;
  const m = (n: number) => dinero(n, negocio.moneda);
  const elegidos = productos.filter((p) => (carrito[p.id] || 0) > 0);
  const piezas = elegidos.reduce((a, p) => a + carrito[p.id], 0);
  const total = elegidos.reduce((a, p) => a + p.precio * carrito[p.id], 0);
  const secciones: [string, string][] = [['servicios', 'Servicios']];
  if (info.barberos?.length) secciones.push(['equipo', 'Equipo']);
  if (negocio.sitio?.galeria?.length) secciones.push(['galeria', 'Galería']);
  secciones.push(['contacto', 'Contacto']);

  return (
    <div className="sitio">
      <SitioNav negocio={negocio} enPortada={false} tieneTienda secciones={secciones} />

      <header className="s-banda" style={negocio.sitio?.portada ? { backgroundImage: `url("${negocio.sitio.portada}")` } : undefined}>
        <div className="s-contenedor">
          <Kicker>Tienda en línea</Kicker>
          <h1>Productos {negocio.nombre}</h1>
          <p className="s-hero-lema">Lo mismo que usamos en la barbería. Paga en línea y recoge en la sucursal.</p>
          <div className="s-ventajas">
            <span>✓ Pago seguro con Mercado Pago</span>
            <span>✓ Recoge sin filas</span>
            <span>✓ Te avisamos por WhatsApp</span>
          </div>
        </div>
      </header>

      <section className="s-seccion s-tienda">
        <div className="s-contenedor">
          <ProductosTienda vista="cuadricula" productos={productos} carrito={carrito} moneda={negocio.moneda}
            onCambiar={(id, n) => setCarrito((c) => ({ ...c, [id]: n }))} />

          {elegidos.length > 0 && (
            <form className="s-caja tarjeta formulario" onSubmit={pagar} ref={caja} id="caja">
              <div>
                <h2>Tu pedido</h2>
                <table className="resumen-tabla">
                  <tbody>
                    {elegidos.map((p) => (
                      <tr key={p.id}><td>{carrito[p.id]} × {p.nombre}</td><td className="num">{m(p.precio * carrito[p.id])}</td></tr>
                    ))}
                    <tr className="total"><td>Total a pagar</td><td className="num">{m(total)}</td></tr>
                  </tbody>
                </table>
                <div className="recoger">
                  <p><strong>Recoger en sucursal</strong></p>
                  <p className="pequeno">{negocio.direccion || negocio.nombre}</p>
                  <p className="tenue pequeno">Cuando pagues te damos un número de pedido; muéstralo en la barbería para recoger.</p>
                </div>
              </div>
              <div>
                <h2>Tus datos</h2>
                <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></Campo>
                <Campo etiqueta="WhatsApp o teléfono"><input value={telefono} onChange={(e) => setTelefono(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="10 dígitos" /></Campo>
                <Campo etiqueta="Comentario (opcional)"><input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} /></Campo>
                <Aviso>{error}</Aviso>
                <button className="btn btn-primario ancho grande" disabled={enviando}>
                  {enviando ? 'Abriendo Mercado Pago…' : `Pagar ${m(total)}`}
                </button>
                <p className="tenue pequeno">Pago seguro con Mercado Pago. Tus productos quedan apartados 20 minutos mientras pagas.</p>
              </div>
            </form>
          )}
          {elegidos.length === 0 && <Aviso>{error}</Aviso>}
        </div>
      </section>

      {elegidos.length > 0 && (
        <div className="s-barra-carrito">
          <div className="s-contenedor s-barra-carrito-fila">
            <span><strong>{piezas} {piezas === 1 ? 'producto' : 'productos'}</strong> · {m(total)}</span>
            <button className="s-btn s-btn-oro s-btn-chico" onClick={() => caja.current?.scrollIntoView({ behavior: 'smooth' })}>Continuar al pago</button>
          </div>
        </div>
      )}

      <SitioPie negocio={negocio} tieneTienda />
      <BotonWhatsApp negocio={negocio} />
    </div>
  );
}
