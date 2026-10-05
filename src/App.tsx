import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SesionProvider, useSesion } from './lib/sesion';
import Layout, { Mas } from './components/Layout';
import { Cargando } from './components/ui';
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
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/cobrar" element={<Cobrar />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/servicios" element={<Servicios />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/equipo" element={<Equipo />} />
        <Route path="/ajustes" element={<Ajustes />} />
        <Route path="/mas" element={<Mas />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/nueva-barberia" element={<Bienvenida />} />
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
