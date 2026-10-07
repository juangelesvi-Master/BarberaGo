import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CuentaProvider } from './lib/cuenta';
import Portada from './pages/Portada';
import Reservar from './pages/Reservar';
import Tienda from './pages/Tienda';
import Entrar from './pages/Entrar';
import Cuenta, { MascotaCuenta } from './pages/cuenta/Cuenta';
import PagoReserva from './pages/cuenta/PagoReserva';
import Ventas from './pages/admin/Ventas';
import CamarasAdmin from './pages/admin/Camaras';
import Admin, { AjustesAdmin, Catalogo, ClienteDetalle, Clientes, Hoy, MascotaAdmin, Pedidos, Reservas } from './pages/admin/Admin';

/** Al cambiar de página sube al inicio, o baja a la sección del #ancla. */
function Desplazar() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 80);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <CuentaProvider>
        <Desplazar />
        <Routes>
          <Route path="/" element={<Portada />} />
          <Route path="/reservar" element={<Reservar />} />
          <Route path="/tienda" element={<Tienda />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="/cuenta/mascota/:id" element={<MascotaCuenta />} />
          <Route path="/cuenta/pago/:id" element={<PagoReserva />} />
          <Route path="/admin" element={<Admin />}>
            <Route index element={<Hoy />} />
            <Route path="reservas" element={<Reservas />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/:id" element={<ClienteDetalle />} />
            <Route path="mascota/:id" element={<MascotaAdmin />} />
            <Route path="pedidos" element={<Pedidos />} />
            <Route path="catalogo" element={<Catalogo />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="camaras" element={<CamarasAdmin />} />
            <Route path="ajustes" element={<AjustesAdmin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CuentaProvider>
    </BrowserRouter>
  );
}
