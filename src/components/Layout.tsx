import { NavLink, Outlet } from 'react-router-dom';
import { useNegocio } from '../lib/sesion';
import type { Permiso } from '../lib/tipos';
import { fechaCorta } from '../lib/formato';
import { Icono, Marca } from './Iconos';

const MENU: { a: string; nombre: string; icono: string; permiso: Permiso; movil?: boolean }[] = [
  { a: '/agenda', nombre: 'Agenda', icono: 'agenda', permiso: 'agenda', movil: true },
  { a: '/cobrar', nombre: 'Cobrar', icono: 'cobrar', permiso: 'cobrar', movil: true },
  { a: '/pedidos', nombre: 'Pedidos', icono: 'pedidos', permiso: 'cobrar' },
  { a: '/clientes', nombre: 'Clientes', icono: 'clientes', permiso: 'clientes', movil: true },
  { a: '/ventas', nombre: 'Ventas', icono: 'ventas', permiso: 'caja' },
  { a: '/reportes', nombre: 'Reportes', icono: 'reportes', permiso: 'reportes', movil: true },
  { a: '/servicios', nombre: 'Servicios', icono: 'servicios', permiso: 'catalogo' },
  { a: '/productos', nombre: 'Productos', icono: 'productos', permiso: 'inventario' },
  { a: '/equipo', nombre: 'Equipo', icono: 'equipo', permiso: 'equipo' },
  { a: '/ajustes', nombre: 'Ajustes', icono: 'ajustes', permiso: 'ajustes' },
];

export default function Layout() {
  const { negocio, negocios, elegirNegocio, puede, salir, suscripcion, session, esMaestro } = useNegocio();
  const menu = MENU.filter((m) => puede(m.permiso));
  const movil = menu.filter((m) => m.movil).slice(0, 4);
  const vencida = suscripcion && negocio.creado_por === session?.user.id && new Date(suscripcion.vence) < new Date();
  const porVencer = suscripcion && !vencida && negocio.creado_por === session?.user.id
    && new Date(suscripcion.vence).getTime() - Date.now() < 5 * 864e5;

  return (
    <div className="app">
      <aside className="lateral">
        <Marca />
        {negocios.length > 1 ? (
          <select className="selector-negocio" value={negocio.id} onChange={(e) => elegirNegocio(e.target.value)} aria-label="Barbería">
            {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
          </select>
        ) : (
          <div className="nombre-negocio">{negocio.nombre}</div>
        )}
        <nav>
          {menu.map((m) => (
            <NavLink key={m.a} to={m.a} className={({ isActive }) => (isActive ? 'activo' : '')}>
              <Icono nombre={m.icono} /> {m.nombre}
            </NavLink>
          ))}
        </nav>
        {esMaestro && <NavLink to="/maestro" className="enlace-maestro"><Icono nombre="maestro" /> Panel maestro</NavLink>}
        <button className="btn-texto salir" onClick={salir}>Cerrar sesión</button>
      </aside>

      <main className="contenido">
        <div className="barra-movil">
          <span className="monograma" aria-hidden>B</span>
          {negocios.length > 1 ? (
            <select value={negocio.id} onChange={(e) => elegirNegocio(e.target.value)} aria-label="Barbería">
              {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
            </select>
          ) : <strong>{negocio.nombre}</strong>}
        </div>
        {vencida && <div className="aviso aviso-error banda">Tu suscripción venció el {fechaCorta(suscripcion!.vence)}. Las reservas en línea están pausadas. <NavLink to="/ajustes">Renovar</NavLink></div>}
        {porVencer && <div className="aviso aviso-info banda">Tu plan ({suscripcion!.plan}) vence el {fechaCorta(suscripcion!.vence)}. <NavLink to="/ajustes">Ver plan</NavLink></div>}
        <Outlet />
      </main>

      <nav className="nav-movil">
        {movil.map((m) => (
          <NavLink key={m.a} to={m.a} className={({ isActive }) => (isActive ? 'activo' : '')}>
            <Icono nombre={m.icono} />
            <small>{m.nombre}</small>
          </NavLink>
        ))}
        <NavLink to="/mas" className={({ isActive }) => (isActive ? 'activo' : '')}>
          <Icono nombre="mas" />
          <small>Más</small>
        </NavLink>
      </nav>
    </div>
  );
}

/** Menú completo para celular. */
export function Mas() {
  const { puede, salir, negocio, esMaestro } = useNegocio();
  return (
    <div className="pagina">
      <p className="kicker">Menú</p>
      <h1>{negocio.nombre}</h1>
      <div className="lista-mas">
        {MENU.filter((m) => puede(m.permiso)).map((m) => (
          <NavLink key={m.a} to={m.a} className="tarjeta fila-enlace">
            <Icono nombre={m.icono} /> {m.nombre}
          </NavLink>
        ))}
        {esMaestro && <NavLink to="/maestro" className="tarjeta fila-enlace"><Icono nombre="maestro" /> Panel maestro</NavLink>}
        <button className="tarjeta fila-enlace" onClick={salir}><Icono nombre="salir" /> Cerrar sesión</button>
      </div>
    </div>
  );
}
