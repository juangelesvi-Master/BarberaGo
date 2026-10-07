import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, mensajeError } from '../../lib/datos';
import { useCuenta } from '../../lib/cuenta';
import type { Camara, Reserva } from '../../lib/tipos';
import { TIPOS_SERVICIO } from '../../lib/tipos';
import { hoyIso, sumarDiasIso } from '../../lib/formato';
import { Aviso, Cabecera, Campo, Cargando, Modal, Vacio } from '../../components/ui';

/**
 * Cámaras en vivo para los clientes. Se activan solas: el cliente las ve en Mi cuenta desde que se hace
 * el check-in (o «Llegó» en guardería) y dejan de aparecerle al hacer el check-out.
 */
export default function CamarasAdmin() {
  const { perfil } = useCuenta();
  const [camaras, setCamaras] = useState<Camara[] | null>(null);
  const [dentro, setDentro] = useState<Reserva[] | null>(null);
  const [editar, setEditar] = useState<Partial<Camara> | null>(null);
  const [ver, setVer] = useState<Camara | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => api.camaras().then(setCamaras).catch((e) => { setError(mensajeError(e)); setCamaras([]); }), []);
  useEffect(() => {
    cargar();
    // Quién las puede ver ahora: hotel o guardería con check-in hecho.
    const hoy = hoyIso();
    api.reservas(sumarDiasIso(hoy, -60), sumarDiasIso(hoy, 60))
      .then((rs) => setDentro(rs.filter((r) => r.estado === 'en_curso' && r.tipo !== 'estetica')))
      .catch(() => setDentro([]));
  }, [cargar]);

  if (perfil?.rol !== 'admin') return <Vacio>Solo el administrador configura las cámaras.</Vacio>;

  async function borrar(c: Camara) {
    if (!confirm(`¿Quitar la cámara «${c.nombre}»?`)) return;
    try { await api.borrarCamara(c.id); cargar(); } catch (e) { setError(mensajeError(e)); }
  }
  async function alternar(c: Camara) {
    try { await api.guardarCamara({ ...c, activa: !c.activa }); cargar(); } catch (e) { setError(mensajeError(e)); }
  }

  const clientes = [...new Map((dentro || []).map((r) => [r.cliente_id, r])).values()];
  return (
    <>
      <Cabecera titulo="Cámaras en vivo">
        <button className="btn btn-primario" onClick={() => setEditar({ activa: true })}>＋ Cámara</button>
      </Cabecera>
      <p className="tenue">Tus clientes ven estas cámaras en <strong>Mi cuenta</strong> solo mientras su perro está en el hotel o la guardería: se activan al hacer el check-in y se apagan al hacer el check-out.</p>
      <Aviso>{error}</Aviso>
      {camaras === null ? <Cargando /> : camaras.length === 0 ? (
        <Vacio>Aún no hay cámaras. Agrega el enlace del reproductor de IPCamLive (o Angelcam) de tu cámara del patio.</Vacio>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Cámara</th><th>Enlace</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {camaras.map((c) => (
                <tr key={c.id} className={c.activa ? '' : 'inactivo'}>
                  <td><strong>{c.nombre}</strong></td>
                  <td className="tenue celda-enlace">{c.url}</td>
                  <td>{c.activa ? 'Visible' : 'Apagada'}</td>
                  <td className="acciones-fila">
                    <button className="btn btn-chico" onClick={() => setVer(c)}>Probar</button>
                    <button className="btn btn-chico" onClick={() => setEditar(c)}>Editar</button>
                    <button className="btn btn-chico" onClick={() => alternar(c)}>{c.activa ? 'Apagar' : 'Encender'}</button>
                    <button className="btn btn-chico btn-peligro" onClick={() => borrar(c)}>Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="tarjeta mt">
        <h2>Quién puede verlas ahora</h2>
        {dentro === null ? <Cargando /> : clientes.length === 0 ? <p className="tenue">Nadie: no hay perros con check-in en hotel o guardería.</p> : (
          <ul className="lista-simple">
            {clientes.map((r) => {
              const suyas = (dentro || []).filter((x) => x.cliente_id === r.cliente_id);
              return <li key={r.cliente_id} className="fila-camara-cliente"><strong>{r.cliente_nombre}</strong><span className="tenue">{suyas.map((x) => `${x.mascota_nombre} (${TIPOS_SERVICIO[x.tipo].nombre})`).join(', ')}</span></li>;
            })}
          </ul>
        )}
      </section>

      {editar && <EditarCamara inicial={editar} onCerrar={() => setEditar(null)} onGuardada={() => { setEditar(null); cargar(); }} />}
      {ver && <VisorCamara nombre={ver.nombre} url={ver.url} onCerrar={() => setVer(null)} />}
    </>
  );
}

function EditarCamara({ inicial, onCerrar, onGuardada }: { inicial: Partial<Camara>; onCerrar: () => void; onGuardada: () => void }) {
  const [c, setC] = useState(inicial);
  const [error, setError] = useState('');
  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    const url = (c.url || '').trim();
    if (!/^https:\/\//.test(url)) { setError('El enlace debe empezar con https://'); return; }
    try { await api.guardarCamara({ ...c, nombre: (c.nombre || '').trim(), url }); onGuardada(); } catch (err) { setError(mensajeError(err)); }
  }
  return (
    <Modal titulo={c.id ? 'Editar cámara' : 'Nueva cámara'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <Campo etiqueta="Nombre" ayuda="Así la ven tus clientes, por ejemplo «Patio de juegos»."><input value={c.nombre || ''} onChange={(e) => setC({ ...c, nombre: e.target.value })} required /></Campo>
        <Campo etiqueta="Enlace del reproductor" ayuda="En IPCamLive: tu cámara → «Embed» o «Share» → copia la dirección del reproductor (empieza con https://).">
          <input value={c.url || ''} onChange={(e) => setC({ ...c, url: e.target.value })} placeholder="https://g0.ipcamlive.com/player/player.php?alias=…" required spellCheck={false} />
        </Campo>
        <label className="check"><input type="checkbox" checked={c.activa !== false} onChange={(e) => setC({ ...c, activa: e.target.checked })} /> Visible para clientes con perro hospedado</label>
        <Aviso>{error}</Aviso>
        <div className="acciones"><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button className="btn btn-primario">Guardar</button></div>
      </form>
    </Modal>
  );
}

/** Reproductor de una cámara (se usa en el panel y en Mi cuenta). */
export function VisorCamara({ nombre, url, onCerrar, otras }: { nombre: string; url: string; onCerrar: () => void; otras?: { nombre: string; url: string }[] }) {
  const [actual, setActual] = useState({ nombre, url });
  return (
    <Modal titulo={`📹 ${actual.nombre}`} onCerrar={onCerrar} ancho={900}>
      {otras && otras.length > 1 && (
        <div className="chips-filtro">
          {otras.map((o) => <button key={o.url} className={o.url === actual.url ? 'elegida' : ''} onClick={() => setActual(o)}>{o.nombre}</button>)}
        </div>
      )}
      <div className="visor-camara">
        <iframe key={actual.url} src={actual.url} title={actual.nombre} allow="autoplay; fullscreen" allowFullScreen referrerPolicy="no-referrer" />
      </div>
      <p className="tenue pequeno">¿No se ve? <a href={actual.url} target="_blank" rel="noreferrer">Ábrela en otra pestaña</a>.</p>
    </Modal>
  );
}
