import { dinero, precio } from '../lib/formato';

export type ProductoEnLinea = { id: string; nombre: string; descripcion: string | null; precio: number; disponible: number; foto_url?: string | null };
export type Carrito = Record<string, number>;

/**
 * Productos con botón Agregar y contador −/+ (página de reservas y tienda).
 * "lista" es compacta (dentro del formulario de reserva); "cuadricula" muestra tarjetas con foto.
 */
export default function ProductosTienda({ productos, carrito, onCambiar, moneda, vista = 'lista' }: {
  productos: ProductoEnLinea[]; carrito: Carrito; onCambiar: (id: string, n: number) => void; moneda: string; vista?: 'lista' | 'cuadricula';
}) {
  return (
    <div className={vista === 'cuadricula' ? 'productos-cuadricula' : 'productos-lista'}>
      {productos.map((p) => {
        const n = carrito[p.id] || 0;
        const control = n === 0 ? (
          <button type="button" className="btn btn-agregar" onClick={() => onCambiar(p.id, 1)}>Agregar</button>
        ) : (
          <div className="contador" role="group" aria-label={`Cantidad de ${p.nombre}`}>
            <button type="button" className="btn-icono" aria-label="Quitar uno" onClick={() => onCambiar(p.id, n - 1)}>−</button>
            <span aria-live="polite">{n}</span>
            <button type="button" className="btn-icono" aria-label="Agregar uno" disabled={n >= p.disponible} onClick={() => onCambiar(p.id, n + 1)}>+</button>
          </div>
        );
        if (vista === 'cuadricula') {
          return (
            <article key={p.id} className={`producto-tarjeta ${n ? 'elegida' : ''}`}>
              <div className="producto-foto">
                {p.foto_url ? <img src={p.foto_url} alt={p.nombre} loading="lazy" /> : <span aria-hidden>{p.nombre[0]}</span>}
                {p.disponible <= 3 && <span className="producto-etiqueta">Últimas {p.disponible}</span>}
              </div>
              <div className="producto-info">
                <h3>{p.nombre}</h3>
                {p.descripcion && <p className="producto-desc">{p.descripcion}</p>}
                <div className="producto-pie">
                  <strong className="producto-precio">{precio(p.precio, moneda)}</strong>
                  {control}
                </div>
              </div>
            </article>
          );
        }
        return (
          <div key={p.id} className={`producto-tienda ${n ? 'elegida' : ''}`}>
            {p.foto_url && <img className="producto-mini" src={p.foto_url} alt="" loading="lazy" width={48} height={48} />}
            <div className="crece">
              <strong>{p.nombre}</strong>
              <div className="tenue pequeno">{dinero(p.precio, moneda)}{p.descripcion && <span className="producto-tienda-desc"> · {p.descripcion}</span>}</div>
            </div>
            {control}
          </div>
        );
      })}
    </div>
  );
}

/** Productos del carrito con su cantidad, listos para mandar a la función de pagos. */
export function lineasDelCarrito(carrito: Carrito) {
  return Object.entries(carrito).filter(([, n]) => n > 0).map(([id, cantidad]) => ({ id, cantidad }));
}
