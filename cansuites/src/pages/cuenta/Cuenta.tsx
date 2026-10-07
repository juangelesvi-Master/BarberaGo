import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, mensajeError } from '../../lib/datos';
import { useCuenta } from '../../lib/cuenta';
import type { Mascota, Pedido, Reserva } from '../../lib/tipos';
import { TALLAS } from '../../lib/tipos';
import { edad, hoyIso } from '../../lib/formato';
import { Aviso, Campo, Cargando, Vacio } from '../../components/ui';
import { Pagina } from '../../components/Sitio';
import { FilaPedido, FilaReserva } from '../../components/Listas';
import Expediente from '../../components/Expediente';
import FormMascota from '../../components/FormMascota';

type Vista = 'mascotas' | 'reservas' | 'pedidos' | 'datos';
const VISTAS: { id: Vista; nombre: string }[] = [
  { id: 'mascotas', nombre: '🐶 Mis mascotas' },
  { id: 'reservas', nombre: '📅 Reservas' },
  { id: 'pedidos', nombre: '🛍️ Pedidos' },
  { id: 'datos', nombre: '👤 Mis datos' },
];

/** Exige sesión; si no hay, manda a /entrar y regresa aquí al terminar. */
function useConSesion(ruta: string) {
  const { cargando, perfil } = useCuenta();
  if (cargando) return { espera: <Pagina><Cargando /></Pagina> };
  if (!perfil) return { espera: <Navigate to={`/entrar?volver=${encodeURIComponent(ruta)}`} replace /> };
  return { espera: null, perfil };
}

export default function Cuenta() {
  const { espera, perfil } = useConSesion('/cuenta');
  const { salir } = useCuenta();
  const [params, setParams] = useSearchParams();
  const vista = (VISTAS.some((v) => v.id === params.get('vista')) ? params.get('vista') : 'mascotas') as Vista;
  useEffect(() => { document.title = 'Mi cuenta · CanSuites'; }, []);
  if (espera) return espera;

  return (
    <Pagina>
      <div className="cabecera">
        <div>
          <p className="kicker">Mi cuenta</p>
          <h1>¡Hola, {perfil!.nombre.split(' ')[0]}!</h1>
        </div>
        <div className="cabecera-acciones">
          <Link to="/reservar" className="btn btn-primario">Nueva reserva</Link>
          <button className="btn" onClick={salir}>Cerrar sesión</button>
        </div>
      </div>
      <div className="chips-filtro pestanas-cuenta" role="tablist">
        {VISTAS.map((v) => (
          <button key={v.id} role="tab" aria-selected={v.id === vista} className={v.id === vista ? 'elegida' : ''}
            onClick={() => setParams(v.id === 'mascotas' ? {} : { vista: v.id }, { replace: true })}>{v.nombre}</button>
        ))}
      </div>
      {vista === 'mascotas' && <MisMascotas />}
      {vista === 'reservas' && <MisReservas />}
      {vista === 'pedidos' && <MisPedidos />}
      {vista === 'datos' && <MisDatos />}
    </Pagina>
  );
}

function MisMascotas() {
  const [mascotas, setMascotas] = useState<Mascota[] | null>(null);
  const navegar = useNavigate();
  useEffect(() => { api.mascotas().then(setMascotas).catch(() => setMascotas([])); }, []);
  if (!mascotas) return <Cargando />;
  return (
    <div className="mascotas-cuadricula">
      {mascotas.map((m) => (
        <Link key={m.id} to={`/cuenta/mascota/${m.id}`} className="tarjeta tarjeta-mascota">
          <div className="avatar-mascota grande">{m.foto_url ? <img src={m.foto_url} alt="" /> : <span aria-hidden>🐶</span>}</div>
          <h3>{m.nombre}</h3>
          <small className="tenue">{[m.raza, edad(m.nacimiento), TALLAS.find((t) => t.id === m.talla)?.nombre].filter(Boolean).join(' · ')}</small>
          {m.alergias && <span className="chip chip-peligro">Alergias</span>}
          <span className="btn-texto">Ver expediente →</span>
        </Link>
      ))}
      <button className="tarjeta tarjeta-mascota tarjeta-nueva" onClick={() => navegar('/cuenta/mascota/nueva')}>
        <div className="avatar-mascota grande" aria-hidden>＋</div>
        <h3>Agregar mascota</h3>
        <small className="tenue">Registra su ficha y su cartilla</small>
      </button>
    </div>
  );
}

function MisReservas() {
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => api.misReservas().then(setReservas).catch((e) => setError(mensajeError(e))), []);
  useEffect(() => { cargar(); }, [cargar]);
  if (!reservas) return <><Aviso>{error}</Aviso><Cargando /></>;
  const hoy = hoyIso();
  const proximas = reservas.filter((r) => r.salida >= hoy && r.estado !== 'cancelada' && r.estado !== 'completada').reverse();
  const pasadas = reservas.filter((r) => !proximas.includes(r));
  async function cancelar(r: Reserva) {
    if (!confirm(`¿Cancelar la reserva #${r.folio} de ${r.mascota_nombre}?`)) return;
    setError('');
    try { await api.cancelarReserva(r.id); cargar(); } catch (e) { setError(mensajeError(e)); }
  }
  return (
    <>
      <Aviso>{error}</Aviso>
      <section className="tarjeta">
        <h2>Próximas</h2>
        {proximas.length === 0 ? <Vacio>No tienes reservas próximas. <Link to="/reservar">Reserva ahora</Link></Vacio> : (
          <div className="lista-filas">
            {proximas.map((r) => (
              <FilaReserva key={r.id} r={r}>
                {['pendiente', 'confirmada'].includes(r.estado) && r.entrada >= hoy && <button className="btn btn-chico btn-peligro" onClick={() => cancelar(r)}>Cancelar</button>}
              </FilaReserva>
            ))}
          </div>
        )}
      </section>
      {pasadas.length > 0 && (
        <section className="tarjeta">
          <h2>Historial</h2>
          <div className="lista-filas">{pasadas.map((r) => <FilaReserva key={r.id} r={r} />)}</div>
        </section>
      )}
    </>
  );
}

function MisPedidos() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  useEffect(() => { api.misPedidos().then(setPedidos).catch(() => setPedidos([])); }, []);
  if (!pedidos) return <Cargando />;
  if (!pedidos.length) return <Vacio>Aún no has apartado productos. <Link to="/tienda">Ir a la tienda</Link></Vacio>;
  return <section className="tarjeta"><div className="lista-filas">{pedidos.map((p) => <FilaPedido key={p.id} p={p} />)}</div></section>;
}

function MisDatos() {
  const { perfil, recargar } = useCuenta();
  const [nombre, setNombre] = useState(perfil!.nombre);
  const [telefono, setTelefono] = useState(perfil!.telefono || '');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  async function guardar(e: FormEvent) {
    e.preventDefault();
    try { await api.actualizarPerfil({ nombre, telefono }); await recargar(); setAviso({ tipo: 'ok', texto: 'Cambios guardados' }); } catch (err) { setAviso({ tipo: 'error', texto: mensajeError(err) }); }
  }
  return (
    <form className="tarjeta formulario angosta-form" onSubmit={guardar}>
      <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></Campo>
      <Campo etiqueta="WhatsApp" ayuda="Aquí te confirmamos reservas y te mandamos fotos de tu perro."><input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Campo>
      <Campo etiqueta="Correo"><input value={perfil!.email || ''} disabled /></Campo>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <div className="acciones"><button className="btn btn-primario">Guardar</button></div>
    </form>
  );
}

/** /cuenta/mascota/:id (expediente) y /cuenta/mascota/nueva (alta). */
export function MascotaCuenta() {
  const { id = '' } = useParams();
  const { espera } = useConSesion(`/cuenta/mascota/${id}`);
  const navegar = useNavigate();
  if (espera) return espera;
  if (id === 'nueva') {
    return (
      <Pagina angosta>
        <Link to="/cuenta" className="btn-texto">← Regresar</Link>
        <div className="tarjeta mt">
          <h1>Nueva mascota</h1>
          <p className="tenue">Entre más completa su ficha, mejor la cuidamos: alergias, alimentación y cuidados especiales.</p>
          <FormMascota onGuardada={(m) => navegar(`/cuenta/mascota/${m.id}`, { replace: true })} onCancelar={() => navegar('/cuenta')} />
        </div>
      </Pagina>
    );
  }
  return <Pagina><Expediente mascotaId={id} volver="/cuenta" /></Pagina>;
}
