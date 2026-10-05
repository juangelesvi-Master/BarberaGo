import { Link } from 'react-router-dom';
import { useNegocio } from '../lib/sesion';

/** Recordatorio para el dueño con plan Básico: la tienda en línea viene en el plan Completo. */
export default function AvisoTienda() {
  const { negocio, session, suscripcion } = useNegocio();
  if (negocio.creado_por !== session?.user.id || suscripcion?.nivel !== 'basico') return null;
  return (
    <div className="aviso aviso-info">
      Tu plan Básico no incluye la tienda en línea: tus clientes no verán productos en tu página. <Link to="/plan">Cambiar al plan Completo</Link>
    </div>
  );
}
