import { useEffect, useState, type FormEvent } from 'react';
import { supabase, mensajeError } from '../lib/supabase';
import { useNegocio } from '../lib/sesion';
import type { Producto, Servicio } from '../lib/tipos';
import { dinero } from '../lib/formato';
import { Aviso, Cabecera, Campo, Modal, Vacio } from '../components/ui';

export default function Servicios() {
  const { negocio, servicios, recargarCatalogo, puede } = useNegocio();
  const [editar, setEditar] = useState<Servicio | 'nuevo' | null>(null);

  return (
    <div className="pagina">
      <Cabecera titulo="Servicios">
        {puede('catalogo') && <button className="btn btn-primario" onClick={() => setEditar('nuevo')}>+ Servicio</button>}
      </Cabecera>
      {servicios.length === 0 ? <Vacio>Agrega tus servicios: corte, barba, cejas, tinte…</Vacio> : (
        <ul className="lista">
          {servicios.map((s) => (
            <li key={s.id} className={s.activo ? '' : 'inactivo'}>
              <button className="fila-enlace" onClick={() => puede('catalogo') && setEditar(s)}>
                <div className="crece">
                  <strong>{s.nombre}</strong>
                  <div className="tenue pequeno">{s.duracion_min} min{s.categoria && ` · ${s.categoria}`}{!s.en_linea && ' · no se reserva en línea'}{!s.activo && ' · inactivo'}</div>
                </div>
                <strong>{dinero(s.precio, negocio.moneda)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editar && <FormServicio servicio={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)}
        onGuardado={() => { setEditar(null); recargarCatalogo(); }} />}
    </div>
  );
}

function FormServicio({ servicio, onCerrar, onGuardado }: { servicio: Servicio | null; onCerrar: () => void; onGuardado: () => void }) {
  const { negocio, servicios } = useNegocio();
  const [f, setF] = useState({
    nombre: servicio?.nombre || '', descripcion: servicio?.descripcion || '', categoria: servicio?.categoria || '',
    duracion_min: servicio?.duracion_min || 30, precio: servicio?.precio ?? 0,
    en_linea: servicio?.en_linea ?? true, activo: servicio?.activo ?? true, orden: servicio?.orden ?? servicios.length + 1,
  });
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = { ...f, negocio_id: negocio.id, nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, categoria: f.categoria.trim() || null };
    const { error } = servicio
      ? await supabase.from('servicios').update(datos).eq('id', servicio.id)
      : await supabase.from('servicios').insert(datos);
    if (error) return setError(mensajeError(error));
    onGuardado();
  }

  async function borrar() {
    if (!servicio || !confirm(`¿Borrar "${servicio.nombre}"? Si ya tiene ventas, mejor desactívalo.`)) return;
    const { error } = await supabase.from('servicios').delete().eq('id', servicio.id);
    if (error) return setError(mensajeError(error));
    onGuardado();
  }

  return (
    <Modal titulo={servicio ? 'Editar servicio' : 'Nuevo servicio'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="formulario">
        <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={80} /></Campo>
        <div className="fila-campos">
          <Campo etiqueta="Precio"><input type="number" min={0} step="0.5" value={f.precio} onChange={(e) => setF({ ...f, precio: Number(e.target.value) })} required /></Campo>
          <Campo etiqueta="Duración (min)"><input type="number" min={5} max={480} step={5} value={f.duracion_min} onChange={(e) => setF({ ...f, duracion_min: Number(e.target.value) })} required /></Campo>
        </div>
        <div className="fila-campos">
          <Campo etiqueta="Categoría"><input value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Cabello, barba…" /></Campo>
          <Campo etiqueta="Orden"><input type="number" value={f.orden} onChange={(e) => setF({ ...f, orden: Number(e.target.value) })} /></Campo>
        </div>
        <Campo etiqueta="Descripción (se ve al reservar)"><textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Campo>
        <label className="check"><input type="checkbox" checked={f.en_linea} onChange={(e) => setF({ ...f, en_linea: e.target.checked })} /> Se puede reservar en línea</label>
        <label className="check"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo</label>
        {servicio ? <Insumos servicio={servicio} /> : <p className="tenue pequeno">Guarda el servicio y vuelve a abrirlo para indicar qué productos gasta.</p>}
        <Aviso>{error}</Aviso>
        <div className="acciones">
          {servicio && <button type="button" className="btn btn-peligro" onClick={borrar}>Borrar</button>}
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

type Insumo = { producto_id: string; cantidad: number };

/** Productos del inventario que gasta el servicio: se descuentan solos cada vez que se cobra. */
function Insumos({ servicio }: { servicio: Servicio }) {
  const { negocio } = useNegocio();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [lista, setLista] = useState<Insumo[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('productos').select('*').eq('negocio_id', negocio.id).eq('activo', true).order('nombre'),
      supabase.from('servicio_insumos').select('producto_id, cantidad').eq('servicio_id', servicio.id),
    ]).then(([p, i]) => { setProductos((p.data as Producto[]) || []); setLista((i.data as Insumo[]) || []); });
  }, [negocio.id, servicio.id]);

  async function agregar() {
    if (!nuevo) return;
    setError('');
    const { error } = await supabase.from('servicio_insumos').insert({ negocio_id: negocio.id, servicio_id: servicio.id, producto_id: nuevo, cantidad: 1 });
    if (error) return setError(mensajeError(error));
    setLista((l) => [...l, { producto_id: nuevo, cantidad: 1 }]); setNuevo('');
  }

  async function cambiar(id: string, cantidad: number) {
    const c = Math.max(1, Math.min(999, Math.floor(cantidad) || 1));
    setLista((l) => l.map((x) => (x.producto_id === id ? { ...x, cantidad: c } : x)));
    const { error } = await supabase.from('servicio_insumos').update({ cantidad: c }).eq('servicio_id', servicio.id).eq('producto_id', id);
    if (error) setError(mensajeError(error));
  }

  async function quitar(id: string) {
    const { error } = await supabase.from('servicio_insumos').delete().eq('servicio_id', servicio.id).eq('producto_id', id);
    if (error) return setError(mensajeError(error));
    setLista((l) => l.filter((x) => x.producto_id !== id));
  }

  const nombre = (id: string) => productos.find((p) => p.id === id)?.nombre || 'Producto';
  const libres = productos.filter((p) => !lista.some((x) => x.producto_id === p.id));

  return (
    <fieldset className="campo">
      <span>Insumos que gasta (se descuentan del inventario al cobrar)</span>
      {lista.length > 0 && (
        <ul className="insumos">
          {lista.map((x) => (
            <li key={x.producto_id}>
              <span className="crece">{nombre(x.producto_id)}</span>
              <input className="cant" type="number" min={1} max={999} value={x.cantidad} aria-label={`Cantidad de ${nombre(x.producto_id)}`}
                onChange={(e) => cambiar(x.producto_id, Number(e.target.value))} />
              <button type="button" className="btn-icono" onClick={() => quitar(x.producto_id)} aria-label={`Quitar ${nombre(x.producto_id)}`}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {productos.length === 0 ? <p className="tenue pequeno">Primero agrega tus productos en Productos.</p> : libres.length > 0 && (
        <div className="fila">
          <select value={nuevo} onChange={(e) => setNuevo(e.target.value)} aria-label="Producto que gasta">
            <option value="">Elige un producto…</option>
            {libres.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.stock} en stock)</option>)}
          </select>
          <button type="button" className="btn" onClick={agregar} disabled={!nuevo}>Agregar</button>
        </div>
      )}
      <Aviso>{error}</Aviso>
    </fieldset>
  );
}
