import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, mensajeError } from '../lib/datos';
import { useCuenta } from '../lib/cuenta';
import type { Pedido, Producto } from '../lib/tipos';
import { precio, whatsapp } from '../lib/formato';
import { NEGOCIO } from '../lib/negocio';
import { ICONO_CATEGORIA } from '../lib/catalogo';
import { Aviso, Campo, Cargando, Vacio } from '../components/ui';
import { Kicker, Pagina } from '../components/Sitio';
import { FormularioAcceso } from './Entrar';

type Carrito = Record<string, number>;
const CLAVE_CARRITO = 'cansuites.carrito';

function leerCarrito(): Carrito {
  try { return JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '{}') as Carrito; } catch { return {}; }
}

export default function Tienda() {
  const { perfil } = useCuenta();
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [categoria, setCategoria] = useState('');
  const [carrito, setCarrito] = useState<Carrito>(leerCarrito);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<Pedido | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const cargar = () => api.productos().then(setProductos).catch((e) => { setProductos([]); setError(mensajeError(e)); });
  useEffect(() => { document.title = 'Tienda · CanSuites'; cargar(); }, []);
  useEffect(() => { try { localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito)); } catch { /* sin almacenamiento */ } }, [carrito]);

  const categorias = useMemo(() => [...new Set((productos || []).map((p) => p.categoria).filter(Boolean))] as string[], [productos]);
  const elegidos = (productos || []).filter((p) => (carrito[p.id] || 0) > 0);
  const piezas = elegidos.reduce((a, p) => a + carrito[p.id], 0);
  const total = elegidos.reduce((a, p) => a + p.precio * carrito[p.id], 0);
  const poner = (p: Producto, n: number) => setCarrito((c) => {
    const r = { ...c, [p.id]: Math.max(0, Math.min(p.stock, n)) };
    if (!r[p.id]) delete r[p.id];
    return r;
  });

  async function pedir() {
    setError(''); setEnviando(true);
    try {
      const p = await api.pedir(elegidos.map((x) => ({ producto_id: x.id, cantidad: carrito[x.id] })), notas.trim() || null);
      setHecho(p); setCarrito({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(mensajeError(e));
      cargar();
    }
    setEnviando(false);
  }

  if (hecho) {
    const lista = hecho.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(', ');
    return (
      <Pagina angosta>
        <div className="tarjeta confirmacion centro">
          <div className="palomita" aria-hidden>🛍️</div>
          <h1>¡Pedido apartado!</h1>
          <p className="tenue">Pedido #{hecho.folio}</p>
          <ul className="lista-simple">{hecho.items.map((i) => <li key={i.nombre}>{i.cantidad} × {i.nombre} <span>{precio(i.cantidad * i.precio_unit)}</span></li>)}</ul>
          <p className="total-grande">{precio(hecho.total)}</p>
          <p className="tenue">Lo apartamos para ti. Pagas al recogerlo en recepción, o te lo entregamos junto con tu perro al terminar su estancia o su baño.</p>
          <div className="acciones centro-acciones">
            <a className="btn btn-whatsapp" href={whatsapp(NEGOCIO.whatsapp, `Hola CanSuites, aparté el pedido #${hecho.folio}: ${lista}.`)!} target="_blank" rel="noreferrer">Avisar por WhatsApp</a>
            <Link className="btn btn-primario" to="/cuenta?vista=pedidos">Ver mis pedidos</Link>
          </div>
        </div>
      </Pagina>
    );
  }

  return (
    <Pagina clase={elegidos.length ? 'con-carrito' : ''}>
      <div className="titulo-seccion">
        <Kicker>Tienda en línea</Kicker>
        <h1>Consiente a tu mejor amigo</h1>
        <p className="tenue">Aparta en línea y paga al recoger en CanSuites. Los productos que usamos en la estética y el hotel.</p>
      </div>

      {categorias.length > 1 && (
        <div className="chips-filtro">
          <button className={!categoria ? 'elegida' : ''} onClick={() => setCategoria('')}>Todo</button>
          {categorias.map((c) => <button key={c} className={c === categoria ? 'elegida' : ''} onClick={() => setCategoria(c)}>{ICONO_CATEGORIA[c] || '🐾'} {c}</button>)}
        </div>
      )}

      {productos === null ? <Cargando /> : productos.length === 0 ? <Vacio>Por ahora no hay productos en línea.</Vacio> : (
        <div className="productos-cuadricula">
          {productos.filter((p) => !categoria || p.categoria === categoria).map((p) => {
            const n = carrito[p.id] || 0;
            return (
              <article key={p.id} className={`producto-tarjeta ${n ? 'elegida' : ''}`}>
                <div className="producto-foto">
                  {p.foto_url ? <img src={p.foto_url} alt="" loading="lazy" /> : <span aria-hidden>{ICONO_CATEGORIA[p.categoria || ''] || '🐾'}</span>}
                  {p.stock > 0 && p.stock <= 5 && <em className="producto-etiqueta">Últimas {p.stock}</em>}
                </div>
                <div className="producto-info">
                  {p.categoria && <small className="tenue">{p.categoria}</small>}
                  <h3>{p.nombre}</h3>
                  {p.descripcion && <p className="producto-desc">{p.descripcion}</p>}
                  <div className="producto-pie">
                    <strong className="producto-precio">{precio(p.precio)}</strong>
                    {p.stock <= 0 ? <span className="tenue pequeno">Agotado</span> : n === 0 ? (
                      <button className="btn btn-chico btn-borde-naranja" onClick={() => poner(p, 1)}>Agregar</button>
                    ) : (
                      <div className="contador">
                        <button className="btn-icono" aria-label="Quitar uno" onClick={() => poner(p, n - 1)}>−</button>
                        <span>{n}</span>
                        <button className="btn-icono" aria-label="Agregar uno" disabled={n >= p.stock} onClick={() => poner(p, n + 1)}>＋</button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {elegidos.length > 0 && (
        <div className="caja" ref={caja} id="caja">
          <div className="tarjeta">
            <h2>Tu carrito</h2>
            <ul className="lista-simple">
              {elegidos.map((p) => <li key={p.id}>{carrito[p.id]} × {p.nombre} <span>{precio(p.precio * carrito[p.id])}</span></li>)}
            </ul>
            <div className="resumen-total"><span>Total</span><strong>{precio(total)}</strong></div>
          </div>
          {perfil ? (
            <div className="tarjeta formulario">
              <h2>Apartar pedido</h2>
              <p className="tenue">A nombre de <strong>{perfil.nombre}</strong>. Pagas al recogerlo.</p>
              <Campo etiqueta="Notas (opcional)"><textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Lo recojo con mi perro el sábado, talla del paliacate…" /></Campo>
              <Aviso>{error}</Aviso>
              <button className="btn btn-primario grande ancho" disabled={enviando} onClick={pedir}>{enviando ? 'Apartando…' : `Apartar ${piezas} ${piezas === 1 ? 'producto' : 'productos'}`}</button>
            </div>
          ) : (
            <FormularioAcceso inicial="entrar" titulo="Entra para apartar tu pedido" />
          )}
        </div>
      )}

      {elegidos.length > 0 && (
        <div className="barra-carrito">
          <div className="contenedor barra-carrito-fila">
            <span><strong>{piezas}</strong> {piezas === 1 ? 'producto' : 'productos'} · <strong>{precio(total)}</strong></span>
            <button className="btn btn-primario" onClick={() => caja.current?.scrollIntoView({ behavior: 'smooth' })}>Apartar pedido</button>
          </div>
        </div>
      )}
    </Pagina>
  );
}
