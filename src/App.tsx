import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SesionProvider, useSesion } from './lib/sesion';
import Layout, { Mas } from './components/Layout';
import { Cargando } from './components/ui';
import type { Permiso } from './lib/tipos';
import Entrar from './pages/Entrar';
import Bienvenida from './pages/Bienvenida';
import Agenda from './pages/Agenda';
import Cobrar from './pages/Cobrar';
import Clientes from './pages/Clientes';
import Ventas from './pages/Ventas';
import Reportes from './pages/Reportes';
import Servicios from './pages/Servicios';
import Productos from './pages/Productos';
import Equipo from './pages/Equipo';
import Ajustes from './pages/Ajustes';
import Reservar from './pages/Reservar';
import CancelarReserva from './pages/CancelarReserva';
import PagoReserva from './pages/PagoReserva';
import Tienda from './pages/Tienda';
import PagoPedido from './pages/PagoPedido';
import Pedidos from './pages/Pedidos';
import Maestro from './pages/Maestro';
import Plan from './pages/Plan';

function Interno() {
  const { cargando, session, negocio, miembro, puede, esMaestro } = useSesion();
  const { pathname } = useLocation();
  if (cargando) return <Cargando />;
  if (!session) return <Entrar />;
  // El panel maestro no depende de tener barbería propia.
  if (esMaestro && pathname.startsWith('/maestro')) return <Maestro />;
  if (!negocio || !miembro) return <Bienvenida />;
  const inicio = puede('agenda') ? '/agenda' : puede('cobrar') ? '/cobrar' : '/mas';
  // Cada pantalla exige su permiso aunque se escriba la ruta a mano (la base también lo exige).
  const con = (p: Permiso, pagina: ReactElement) => (puede(p) ? pagina : <Navigate to={inicio} replace />);
  const esDueno = negocio.creado_por === session.user.id;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/agenda" element={con('agenda', <Agenda />)} />
        <Route path="/cobrar" element={con('cobrar', <Cobrar />)} />
        <Route path="/pedidos" element={con('cobrar', <Pedidos />)} />
        <Route path="/clientes" element={con('clientes', <Clientes />)} />
        <Route path="/ventas" element={con('caja', <Ventas />)} />
        <Route path="/reportes" element={con('reportes', <Reportes />)} />
        <Route path="/servicios" element={con('catalogo', <Servicios />)} />
        <Route path="/productos" element={con('inventario', <Productos />)} />
        <Route path="/equipo" element={con('equipo', <Equipo />)} />
        <Route path="/ajustes" element={con('ajustes', <Ajustes />)} />
        <Route path="/mas" element={<Mas />} />
        <Route path="/plan" element={esDueno ? <Plan /> : <Navigate to={inicio} replace />} />
        <Route path="/nueva-barberia" element={miembro.rol === 'admin' && !session.user.app_metadata?.personal ? <Bienvenida /> : <Navigate to={inicio} replace />} />
        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Páginas públicas para clientes: no requieren cuenta. */}
        <Route path="/r/:slug" element={<Reservar />} />
        <Route path="/r/:slug/cancelar/:cita" element={<CancelarReserva />} />
        <Route path="/r/:slug/pago/:cita" element={<PagoReserva />} />
        <Route path="/r/:slug/productos" element={<Tienda />} />
        <Route path="/r/:slug/pedido/:pedido" element={<PagoPedido />} />
        <Route path="/*" element={<SesionProvider><Interno /></SesionProvider>} />
      </Routes>
    </BrowserRouter>
  );
}
