import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api, mensajeError } from '../../lib/datos';
import { useCuenta } from '../../lib/cuenta';
import type { ClienteConMascotas } from '../../lib/api';
import type { Ajustes, EstadoPedido, EstadoReserva, Horario, Mascota, Pedido, Perfil, Producto, Reserva, Servicio, Talla, TipoServicio } from '../../lib/tipos';
import { ESTADOS_PEDIDO, ESTADOS_RESERVA, TALLAS, TIPOS_SERVICIO } from '../../lib/tipos';
import { DIAS, deIsoDia, fechaLarga, hoyIso, precio, sumarDiasIso, whatsapp } from '../../lib/formato';
import { ICONO_CATEGORIA } from '../../lib/catalogo';
import { Aviso, Cabecera, Campo, Cargando, Modal, Vacio } from '../../components/ui';
import { Pagina } from '../../components/Sitio';
import { FilaPedido, FilaReserva } from '../../components/Listas';
import Expediente from '../../components/Expediente';
import FormMascota from '../../components/FormMascota';

/** Panel de recepción: solo personal y administradores. */
export default function Admin() {
  const { cargando, perfil, esPersonal } = useCuenta();
  useEffect(() => { document.title = 'Panel · CanSuites'; }, []);
  if (cargando) return <Pagina><Cargando /></Pagina>;
  if (!perfil) return <Navigate to="/entrar?volver=/admin" replace />;
  if (!esPersonal) {
    return <Pagina angosta><Vacio>Esta sección es para el equipo de CanSuites. <Link to="/cuenta">Ir a mi cuenta</Link></Vacio></Pagina>;
  }
  const secciones: [string, string][] = [['/admin', '📋 Hoy'], ['/admin/reservas', '📅 Reservas'], ['/admin/clientes', '🐶 Clientes'], ['/admin/pedidos', '🛍️ Pedidos'], ['/admin/catalogo', '🏷️ Catálogo']];
  if (perfil.rol === 'admin') secciones.push(['/admin/ajustes', '⚙️ Ajustes']);
  return (
    <Pagina clase="admin">
      <nav className="chips-filtro admin-nav" aria-label="Panel">
        {secciones.map(([a, t]) => <NavLink key={a} to={a} end={a === '/admin'} className={({ isActive }) => (isActive ? 'elegida' : '')}>{t}</NavLink>)}
      </nav>
      <Outlet />
    </Pagina>
  );
}

/** Botones para mover una reserva por sus estados. */
function AccionesReserva({ r, onCambio }: { r: Reserva; onCambio: () => void }) {
  const [error, setError] = useState('');
  async function poner(estado: EstadoReserva) {
    if (estado === 'cancelada' && !confirm(`¿Cancelar la reserva #${r.folio} de ${r.mascota_nombre}?`)) return;
    try { await api.estadoReserva(r.id, estado); onCambio(); } catch (e) { setError(mensajeError(e)); }
  }
  const siguiente: Partial<Record<EstadoReserva, [EstadoReserva, string]>> = {
    pendiente: ['confirmada', 'Confirmar'],
    confirmada: ['en_curso', r.tipo === 'hotel' ? 'Check-in' : 'Llegó'],
    en_curso: ['completada', r.tipo === 'hotel' ? 'Check-out' : 'Entregado'],
  };
  const s = siguiente[r.estado];
  const msj = `Hola ${r.cliente_nombre}, te escribimos de CanSuites sobre la reserva #${r.folio} de ${r.mascota_nombre}.`;
  return (
    <>
      {s && <button className="btn btn-chico btn-primario" onClick={() => poner(s[0])}>{s[1]}</button>}
      {r.cliente_telefono && <a className="btn btn-chico" href={whatsapp(r.cliente_telefono, msj)!} target="_blank" rel="noreferrer">WhatsApp</a>}
      <Link className="btn btn-chico" to={`/admin/mascota/${r.mascota_id}`}>Expediente</Link>
      {['pendiente', 'confirmada'].includes(r.estado) && <button className="btn btn-chico btn-peligro" onClick={() => poner('cancelada')}>Cancelar</button>}
      {error && <small className="texto-peligro">{error}</small>}
    </>
  );
}

export function Hoy() {
  const [dia, setDia] = useState(hoyIso());
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const cargar = useCallback(() => api.reservas(dia, dia).then(setReservas).catch(() => setReservas([])), [dia]);
  useEffect(() => { setReservas(null); cargar(); }, [cargar]);
  useEffect(() => { api.ajustes().then(setAjustes).catch(() => {}); }, []);

  const activas = (reservas || []).filter((r) => r.estado !== 'cancelada');
  const llegadas = activas.filter((r) => r.tipo === 'hotel' && r.entrada === dia);
  const salidas = activas.filter((r) => r.tipo === 'hotel' && r.salida === dia);
  const huespedes = activas.filter((r) => r.tipo === 'hotel' && r.entrada <= dia && r.salida > dia);
  const guarderia = activas.filter((r) => r.tipo === 'guarderia');
  const estetica = activas.filter((r) => r.tipo === 'estetica').sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
  const lista = (xs: Reserva[], vacio: string) => xs.length === 0 ? <p className="tenue">{vacio}</p>
    : <div className="lista-filas">{xs.map((r) => <FilaReserva key={r.id} r={r} mostrarCliente><AccionesReserva r={r} onCambio={cargar} /></FilaReserva>)}</div>;

  return (
    <>
      <div className="cabecera">
        <h1 className="titulo-dia">{fechaLarga(deIsoDia(dia))}</h1>
        <div className="cabecera-acciones navegador-dia">
          <button className="btn" onClick={() => setDia(sumarDiasIso(dia, -1))} aria-label="Día anterior">←</button>
          <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} />
          <button className="btn" onClick={() => setDia(sumarDiasIso(dia, 1))} aria-label="Día siguiente">→</button>
          {dia !== hoyIso() && <button className="btn" onClick={() => setDia(hoyIso())}>Hoy</button>}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><span>Huéspedes esta noche</span><strong>{huespedes.length}{ajustes ? ` / ${ajustes.capacidad_hotel}` : ''}</strong></div>
        <div className="kpi"><span>Llegadas · salidas</span><strong>{llegadas.length} · {salidas.length}</strong></div>
        <div className="kpi"><span>Guardería</span><strong>{guarderia.length}{ajustes ? ` / ${ajustes.capacidad_guarderia}` : ''}</strong></div>
        <div className="kpi"><span>Estética</span><strong>{estetica.length}</strong></div>
      </div>
      {reservas === null ? <Cargando /> : (
        <>
          <div className="dos-columnas">
            <section className="tarjeta"><h2>🛬 Llegan al hotel</h2>{lista(llegadas, 'Nadie llega hoy.')}</section>
            <section className="tarjeta"><h2>🏠 Se van del hotel</h2>{lista(salidas, 'Nadie sale hoy.')}</section>
          </div>
          <section className="tarjeta"><h2>🏨 Hospedados esta noche</h2>{lista(huespedes, 'Sin huéspedes esta noche.')}</section>
          <div className="dos-columnas">
            <section className="tarjeta"><h2>🎾 Guardería</h2>{lista(guarderia, 'Sin perritos en guardería.')}</section>
            <section className="tarjeta"><h2>🛁 Estética</h2>{lista(estetica, 'Sin citas de estética.')}</section>
          </div>
        </>
      )}
    </>
  );
}

export function Reservas() {
  const [desde, setDesde] = useState(hoyIso());
  const [hasta, setHasta] = useState(sumarDiasIso(hoyIso(), 30));
  const [tipo, setTipo] = useState<TipoServicio | ''>('');
  const [estado, setEstado] = useState<EstadoReserva | ''>('');
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const cargar = useCallback(() => api.reservas(desde, hasta).then(setReservas).catch(() => setReservas([])), [desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);
  const filtradas = (reservas || []).filter((r) => (!tipo || r.tipo === tipo) && (!estado || r.estado === estado));
  const pendientes = (reservas || []).filter((r) => r.estado === 'pendiente').length;
  return (
    <>
      <Cabecera titulo="Reservas">{pendientes > 0 && <button className="chip chip-alerta" onClick={() => setEstado('pendiente')}>{pendientes} por confirmar</button>}</Cabecera>
      <div className="filtros">
        <Campo etiqueta="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>
        <Campo etiqueta="Servicio">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoServicio | '')}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_SERVICIO).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Estado">
          <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoReserva | '')}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_RESERVA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
      </div>
      {reservas === null ? <Cargando /> : filtradas.length === 0 ? <Vacio>No hay reservas con esos filtros.</Vacio> : (
        <section className="tarjeta"><div className="lista-filas">
          {filtradas.map((r) => <FilaReserva key={r.id} r={r} mostrarCliente><AccionesReserva r={r} onCambio={cargar} /></FilaReserva>)}
        </div></section>
      )}
    </>
  );
}

export function Clientes() {
  const [q, setQ] = useState('');
  const [clientes, setClientes] = useState<ClienteConMascotas[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api.clientes(q).then(setClientes).catch(() => setClientes([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <Cabecera titulo="Clientes y mascotas" />
      <input className="buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente, teléfono, correo o mascota" />
      {clientes === null ? <Cargando /> : clientes.length === 0 ? <Vacio>Sin resultados. Los clientes se registran solos desde la página al crear su cuenta.</Vacio> : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Cliente</th><th>Contacto</th><th>Mascotas</th></tr></thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/admin/clientes/${c.id}`}><strong>{c.nombre}</strong></Link></td>
                  <td className="tenue">{[c.telefono, c.email].filter(Boolean).join(' · ')}</td>
                  <td>{c.mascotas.length === 0 ? <span className="tenue">—</span> : c.mascotas.map((m) => <Link key={m.id} className="chip" to={`/admin/mascota/${m.id}`}>{m.nombre}</Link>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ClienteDetalle() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const [cliente, setCliente] = useState<Perfil | null | undefined>(undefined);
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [nueva, setNueva] = useState(false);
  useEffect(() => {
    api.cliente(id).then(setCliente).catch(() => setCliente(null));
    api.mascotas(id).then(setMascotas).catch(() => {});
  }, [id]);
  if (cliente === undefined) return <Cargando />;
  if (!cliente) return <Vacio>No encontramos ese cliente.</Vacio>;
  return (
    <>
      <Link to="/admin/clientes" className="btn-texto">← Clientes</Link>
      <Cabecera titulo={cliente.nombre}>
        {cliente.telefono && <a className="btn" href={whatsapp(cliente.telefono, `Hola ${cliente.nombre}, te escribimos de CanSuites.`)!} target="_blank" rel="noreferrer">WhatsApp</a>}
        <button className="btn btn-primario" onClick={() => setNueva(true)}>＋ Agregar mascota</button>
      </Cabecera>
      <p className="tenue">{[cliente.telefono, cliente.email].filter(Boolean).join(' · ')}</p>
      <div className="mascotas-cuadricula">
        {mascotas.map((m) => (
          <Link key={m.id} to={`/admin/mascota/${m.id}`} className="tarjeta tarjeta-mascota">
            <div className="avatar-mascota grande">{m.foto_url ? <img src={m.foto_url} alt="" /> : <span aria-hidden>🐶</span>}</div>
            <h3>{m.nombre}</h3>
            <small className="tenue">{[m.raza, TALLAS.find((t) => t.id === m.talla)?.nombre].filter(Boolean).join(' · ')}</small>
            {m.alergias && <span className="chip chip-peligro">Alergias: {m.alergias}</span>}
          </Link>
        ))}
        {mascotas.length === 0 && <Vacio>Sin mascotas registradas.</Vacio>}
      </div>
      {nueva && (
        <Modal titulo={`Nueva mascota de ${cliente.nombre}`} onCerrar={() => setNueva(false)} ancho={640}>
          <FormMascota duenoId={cliente.id} onGuardada={(m) => navegar(`/admin/mascota/${m.id}`)} onCancelar={() => setNueva(false)} />
        </Modal>
      )}
    </>
  );
}

export function MascotaAdmin() {
  const { id = '' } = useParams();
  return <Expediente mascotaId={id} volver="/admin/clientes" />;
}

export function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [ver, setVer] = useState<'abiertos' | 'todos'>('abiertos');
  const cargar = useCallback(() => api.pedidos().then(setPedidos).catch(() => setPedidos([])), []);
  useEffect(() => { cargar(); }, [cargar]);
  async function poner(p: Pedido, estado: EstadoPedido) {
    if (estado === 'cancelado' && !confirm(`¿Cancelar el pedido #${p.folio}? Los productos regresan al inventario.`)) return;
    await api.estadoPedido(p.id, estado); cargar();
  }
  const lista = (pedidos || []).filter((p) => ver === 'todos' || p.estado === 'pendiente' || p.estado === 'listo');
  return (
    <>
      <Cabecera titulo="Pedidos de la tienda">
        <div className="segmentado">
          <button className={ver === 'abiertos' ? 'activo' : ''} onClick={() => setVer('abiertos')}>Por entregar</button>
          <button className={ver === 'todos' ? 'activo' : ''} onClick={() => setVer('todos')}>Todos</button>
        </div>
      </Cabecera>
      {pedidos === null ? <Cargando /> : lista.length === 0 ? <Vacio>No hay pedidos {ver === 'abiertos' ? 'por entregar' : ''}.</Vacio> : (
        <section className="tarjeta"><div className="lista-filas">
          {lista.map((p) => (
            <FilaPedido key={p.id} p={p} mostrarCliente>
              {p.estado === 'pendiente' && <button className="btn btn-chico btn-primario" onClick={() => poner(p, 'listo')}>Marcar listo</button>}
              {p.estado === 'listo' && <button className="btn btn-chico btn-primario" onClick={() => poner(p, 'entregado')}>Entregado y cobrado</button>}
              {p.estado === 'listo' && p.cliente_telefono && <a className="btn btn-chico" target="_blank" rel="noreferrer" href={whatsapp(p.cliente_telefono, `Hola ${p.cliente_nombre}, tu pedido #${p.folio} de CanSuites ya está listo para recoger. Total: ${precio(p.total)}.`)!}>Avisar</a>}
              {(p.estado === 'pendiente' || p.estado === 'listo') && <button className="btn btn-chico btn-peligro" onClick={() => poner(p, 'cancelado')}>Cancelar</button>}
              {(p.estado === 'entregado' || p.estado === 'cancelado') && <small className="tenue">{ESTADOS_PEDIDO[p.estado]}</small>}
            </FilaPedido>
          ))}
        </div></section>
      )}
    </>
  );
}

export function Catalogo() {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [servicio, setServicio] = useState<Partial<Servicio> | null>(null);
  const [producto, setProducto] = useState<Partial<Producto> | null>(null);
  const cargar = useCallback(() => {
    api.servicios(true).then(setServicios).catch(() => setServicios([]));
    api.productos(true).then(setProductos).catch(() => setProductos([]));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  return (
    <>
      <Cabecera titulo="Servicios y precios"><button className="btn btn-primario" onClick={() => setServicio({ tipo: 'hotel', activo: true, incluye: [] })}>＋ Servicio</button></Cabecera>
      {servicios === null ? <Cargando /> : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Servicio</th><th>Tipo</th><th className="num">Precio</th><th>En línea</th></tr></thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className={s.activo ? '' : 'inactivo'} onClick={() => setServicio(s)} style={{ cursor: 'pointer' }}>
                  <td><strong>{s.nombre}</strong>{s.descripcion && <><br /><small className="tenue">{s.descripcion}</small></>}</td>
                  <td>{TIPOS_SERVICIO[s.tipo].nombre}{s.talla && ` · ${s.talla}`}</td>
                  <td className="num">{precio(s.precio)}{s.tipo !== 'estetica' && <small className="tenue">/{TIPOS_SERVICIO[s.tipo].unidad}</small>}</td>
                  <td>{s.activo ? 'Sí' : 'Oculto'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Cabecera titulo="Productos de la tienda"><button className="btn btn-primario" onClick={() => setProducto({ activo: true, stock: 0, precio: 0 })}>＋ Producto</button></Cabecera>
      {productos === null ? <Cargando /> : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Producto</th><th>Categoría</th><th className="num">Precio</th><th className="num">Existencia</th><th>En línea</th></tr></thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id} className={p.activo ? '' : 'inactivo'} onClick={() => setProducto(p)} style={{ cursor: 'pointer' }}>
                  <td>{p.foto_url ? <img className="mini-foto" src={p.foto_url} alt="" /> : <span className="mini-icono" aria-hidden>{ICONO_CATEGORIA[p.categoria || ''] || '🐾'}</span>}<strong>{p.nombre}</strong></td>
                  <td>{p.categoria || '—'}</td>
                  <td className="num">{precio(p.precio)}</td>
                  <td className={`num ${p.stock <= 3 ? 'texto-peligro' : ''}`}>{p.stock}</td>
                  <td>{p.activo ? 'Sí' : 'Oculto'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {servicio && <EditarServicio inicial={servicio} onCerrar={() => setServicio(null)} onGuardado={() => { setServicio(null); cargar(); }} />}
      {producto && <EditarProducto inicial={producto} onCerrar={() => setProducto(null)} onGuardado={() => { setProducto(null); cargar(); }} />}
    </>
  );
}

function EditarServicio({ inicial, onCerrar, onGuardado }: { inicial: Partial<Servicio>; onCerrar: () => void; onGuardado: () => void }) {
  const [s, setS] = useState(inicial);
  const [error, setError] = useState('');
  const cambia = (c: Partial<Servicio>) => setS((x) => ({ ...x, ...c }));
  async function guardar(e: FormEvent) {
    e.preventDefault();
    try {
      await api.guardarServicio({ ...s, nombre: (s.nombre || '').trim(), talla: s.tipo === 'estetica' ? s.talla || 'M' : null, precio: Number(s.precio || 0) });
      onGuardado();
    } catch (err) { setError(mensajeError(err)); }
  }
  return (
    <Modal titulo={s.id ? 'Editar servicio' : 'Nuevo servicio'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <Campo etiqueta="Nombre"><input value={s.nombre || ''} onChange={(e) => cambia({ nombre: e.target.value })} required /></Campo>
        <div className="fila-campos">
          <Campo etiqueta="Tipo">
            <select value={s.tipo} onChange={(e) => cambia({ tipo: e.target.value as TipoServicio })} disabled={!!s.id}>
              {Object.entries(TIPOS_SERVICIO).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
            </select>
          </Campo>
          {s.tipo === 'estetica' && (
            <Campo etiqueta="Talla">
              <select value={s.talla || 'M'} onChange={(e) => cambia({ talla: e.target.value as Talla })}>
                {TALLAS.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.peso})</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta={`Precio${s.tipo && s.tipo !== 'estetica' ? ` por ${TIPOS_SERVICIO[s.tipo].unidad}` : ''}`}>
            <input type="number" min={0} step={1} value={s.precio ?? ''} onChange={(e) => cambia({ precio: Number(e.target.value) })} required />
          </Campo>
        </div>
        <Campo etiqueta="Descripción"><textarea rows={2} value={s.descripcion || ''} onChange={(e) => cambia({ descripcion: e.target.value || null })} /></Campo>
        <Campo etiqueta="Incluye (separado por comas)"><input value={(s.incluye || []).join(', ')} onChange={(e) => cambia({ incluye: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Campo>
        <label className="check"><input type="checkbox" checked={s.activo !== false} onChange={(e) => cambia({ activo: e.target.checked })} /> Se puede reservar en línea</label>
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button className="btn btn-primario">Guardar</button></div>
      </form>
    </Modal>
  );
}

function EditarProducto({ inicial, onCerrar, onGuardado }: { inicial: Partial<Producto>; onCerrar: () => void; onGuardado: () => void }) {
  const [p, setP] = useState(inicial);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const cambia = (c: Partial<Producto>) => setP((x) => ({ ...x, ...c }));
  async function guardar(e: FormEvent) {
    e.preventDefault();
    try { await api.guardarProducto({ ...p, nombre: (p.nombre || '').trim(), precio: Number(p.precio || 0), stock: Math.max(0, Math.round(Number(p.stock || 0))) }); onGuardado(); } catch (err) { setError(mensajeError(err)); }
  }
  async function foto(f: File | undefined) {
    if (!f) return;
    setSubiendo(true);
    try { cambia({ foto_url: await api.subirFoto(f) }); } catch (err) { setError(mensajeError(err)); }
    setSubiendo(false);
  }
  return (
    <Modal titulo={p.id ? 'Editar producto' : 'Nuevo producto'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <div className="subir-foto">
          <div className="subir-foto-vista">{p.foto_url ? <img src={p.foto_url} alt="" /> : <span className="tenue pequeno">Sin foto</span>}</div>
          <label className="btn btn-chico">{subiendo ? 'Subiendo…' : p.foto_url ? 'Cambiar foto' : 'Subir foto'}<input type="file" accept="image/*" hidden onChange={(e) => foto(e.target.files?.[0])} /></label>
          {p.foto_url && <button type="button" className="btn-texto pequeno" onClick={() => cambia({ foto_url: null })}>Quitar</button>}
        </div>
        <Campo etiqueta="Nombre"><input value={p.nombre || ''} onChange={(e) => cambia({ nombre: e.target.value })} required /></Campo>
        <div className="fila-campos">
          <Campo etiqueta="Categoría">
            <input value={p.categoria || ''} onChange={(e) => cambia({ categoria: e.target.value || null })} list="categorias" />
            <datalist id="categorias">{Object.keys(ICONO_CATEGORIA).map((c) => <option key={c} value={c} />)}</datalist>
          </Campo>
          <Campo etiqueta="Precio"><input type="number" min={0} step={1} value={p.precio ?? ''} onChange={(e) => cambia({ precio: Number(e.target.value) })} required /></Campo>
          <Campo etiqueta="Existencia"><input type="number" min={0} step={1} value={p.stock ?? ''} onChange={(e) => cambia({ stock: Number(e.target.value) })} required /></Campo>
        </div>
        <Campo etiqueta="Descripción"><textarea rows={2} value={p.descripcion || ''} onChange={(e) => cambia({ descripcion: e.target.value || null })} /></Campo>
        <label className="check"><input type="checkbox" checked={p.activo !== false} onChange={(e) => cambia({ activo: e.target.checked })} /> Mostrar en la tienda</label>
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button className="btn btn-primario" disabled={subiendo}>Guardar</button></div>
      </form>
    </Modal>
  );
}

export function AjustesAdmin() {
  const { perfil } = useCuenta();
  const [a, setA] = useState<Ajustes | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  useEffect(() => { api.ajustes().then(setA).catch(() => {}); }, []);
  if (perfil?.rol !== 'admin') return <Vacio>Solo el administrador cambia los ajustes.</Vacio>;
  if (!a) return <Cargando />;
  const cambia = (c: Partial<Ajustes>) => { setA({ ...a, ...c }); setAviso(null); };
  async function guardar(e: FormEvent) {
    e.preventDefault();
    try { await api.guardarAjustes(a!); setAviso({ tipo: 'ok', texto: 'Cambios guardados' }); } catch (err) { setAviso({ tipo: 'error', texto: mensajeError(err) }); }
  }
  return (
    <form className="formulario" onSubmit={guardar}>
      <Cabecera titulo="Ajustes" />
      <section className="tarjeta formulario">
        <h2>Cupo</h2>
        <div className="fila-campos">
          <Campo etiqueta="Suites del hotel" ayuda="Perros por noche"><input type="number" min={0} value={a.capacidad_hotel} onChange={(e) => cambia({ capacidad_hotel: Number(e.target.value) })} /></Campo>
          <Campo etiqueta="Lugares de guardería" ayuda="Perros por día"><input type="number" min={0} value={a.capacidad_guarderia} onChange={(e) => cambia({ capacidad_guarderia: Number(e.target.value) })} /></Campo>
          <Campo etiqueta="Baños a la vez" ayuda="Citas de estética por horario"><input type="number" min={0} value={a.estetica_simultaneos} onChange={(e) => cambia({ estetica_simultaneos: Number(e.target.value) })} /></Campo>
        </div>
      </section>
      <section className="tarjeta formulario">
        <h2>Hotel</h2>
        <div className="fila-campos">
          <Campo etiqueta="Entrada desde"><input type="time" value={a.check_in} onChange={(e) => cambia({ check_in: e.target.value })} /></Campo>
          <Campo etiqueta="Salida hasta"><input type="time" value={a.check_out} onChange={(e) => cambia({ check_out: e.target.value })} /></Campo>
        </div>
      </section>
      <section className="tarjeta formulario">
        <h2>Horario de recepción y estética</h2>
        <Campo etiqueta="Duración de cada cita de estética">
          <select value={a.intervalo_min} onChange={(e) => cambia({ intervalo_min: Number(e.target.value) })}>
            {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutos</option>)}
          </select>
        </Campo>
        <HorarioEditor valor={a.horario} onCambio={(horario) => cambia({ horario })} />
      </section>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <div className="acciones"><button className="btn btn-primario grande">Guardar ajustes</button></div>
      <p className="tenue pequeno">Para dar acceso al panel a alguien del equipo: que cree su cuenta en la página y luego, en Supabase, cambia su <code>rol</code> en la tabla <code>perfiles</code> a <code>personal</code> (o <code>admin</code>).</p>
    </form>
  );
}

function HorarioEditor({ valor, onCambio }: { valor: Horario; onCambio: (h: Horario) => void }) {
  return (
    <div className="horario-editor">
      {DIAS.map((nombre, i) => {
        const k = String(i + 1);
        const tramos = valor[k] || [];
        const [abre, cierra] = tramos[0] || ['09:00', '18:00'];
        const poner = (t: [string, string][]) => onCambio({ ...valor, [k]: t });
        return (
          <div className="horario-dia" key={k}>
            <label className="check"><input type="checkbox" checked={tramos.length > 0} onChange={(e) => poner(e.target.checked ? [[abre, cierra]] : [])} /> {nombre}</label>
            {tramos.length > 0 ? (
              <span className="horario-horas">
                <input type="time" value={abre} onChange={(e) => poner([[e.target.value, cierra]])} aria-label={`${nombre} abre`} />
                <span>a</span>
                <input type="time" value={cierra} onChange={(e) => poner([[abre, e.target.value]])} aria-label={`${nombre} cierra`} />
              </span>
            ) : <span className="tenue">Cerrado</span>}
          </div>
        );
      })}
    </div>
  );
}
