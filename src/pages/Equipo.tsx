import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase, mensajeError, llamarPersonal } from '../lib/supabase';
import { useNegocio } from '../lib/sesion';
import { PERMISOS, type Barbero, type Miembro, type Permiso } from '../lib/tipos';
import { Aviso, Cabecera, Campo, Modal } from '../components/ui';
import SubirFoto from '../components/SubirFoto';
import HorarioEditor from '../components/HorarioEditor';

const ROLES = { admin: 'Administrador', recepcion: 'Recepción', barbero: 'Barbero' } as const;
const COLORES = ['#c8102e', '#1d4ed8', '#047857', '#b45309', '#7c3aed', '#0e7490', '#be185d', '#4b5563'];

export default function Equipo() {
  const { negocio, barberos, recargarCatalogo, session, recargar } = useNegocio();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [editarBarbero, setEditarBarbero] = useState<Barbero | 'nuevo' | null>(null);
  const [editarMiembro, setEditarMiembro] = useState<Miembro | null>(null);
  const [invitar, setInvitar] = useState(false);
  const [codigo, setCodigo] = useState<{ nombre: string; codigo: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('miembros').select('*').eq('negocio_id', negocio.id).order('created_at');
    setMiembros((data as Miembro[]) || []);
  }, [negocio.id]);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="pagina">
      <Cabecera titulo="Barberos">
        <button className="btn btn-primario" onClick={() => setEditarBarbero('nuevo')}>+ Barbero</button>
      </Cabecera>
      <p className="tenue pequeno">Cada barbero tiene su columna en la agenda, su horario y sus comisiones. No necesita cuenta para aparecer.</p>
      <ul className="lista">
        {barberos.map((b) => (
          <li key={b.id} className={b.activo ? '' : 'inactivo'}>
            <button className="fila-enlace" onClick={() => setEditarBarbero(b)}>
              {b.foto_url ? <img className="avatar" src={b.foto_url} alt="" /> : <span className="avatar" style={{ background: b.color }}>{b.nombre.slice(0, 1).toUpperCase()}</span>}
              <div className="crece">
                <strong>{b.nombre}</strong>
                <div className="tenue pequeno">
                  {b.comision_servicios}% servicios · {b.comision_productos}% productos
                  {b.horario ? ' · horario propio' : ''}{!b.en_linea && ' · oculto en reservas'}{!b.activo && ' · inactivo'}
                </div>
              </div>
              <span aria-hidden>›</span>
            </button>
          </li>
        ))}
      </ul>

      <Cabecera titulo="Cuentas con acceso">
        <button className="btn" onClick={() => setInvitar(true)}>+ Agregar persona</button>
      </Cabecera>
      <p className="tenue pequeno">Agrega a tu personal por nombre: la app genera un código y entran en <strong>Portal barberos</strong>, sin correo.</p>
      <ul className="lista">
        {miembros.map((m) => (
          <li key={m.usuario_id} className={m.activo ? '' : 'inactivo'}>
            <button className="fila-enlace" onClick={() => setEditarMiembro(m)}>
              <div className="crece">
                <strong>{m.nombre || m.email}</strong>{m.usuario_id === session?.user.id && <span className="tenue"> (tú)</span>}
                <div className="tenue pequeno">
                  {ROLES[m.rol]} · {m.acceso_codigo ? 'entra con código' : m.email}
                  {m.barbero_id && ` · agenda de ${barberos.find((b) => b.id === m.barbero_id)?.nombre}`}
                </div>
              </div>
              <span aria-hidden>›</span>
            </button>
          </li>
        ))}
      </ul>

      {editarBarbero && <FormBarbero barbero={editarBarbero === 'nuevo' ? null : editarBarbero} onCerrar={() => setEditarBarbero(null)}
        onGuardado={() => { setEditarBarbero(null); recargarCatalogo(); }} />}
      {invitar && <FormInvitar onCerrar={() => setInvitar(false)}
        onGuardado={(nuevo) => { setInvitar(false); cargar(); recargarCatalogo(); setCodigo(nuevo); }} />}
      {editarMiembro && <FormMiembro miembro={editarMiembro} onCerrar={() => setEditarMiembro(null)}
        onCodigo={(c) => { setEditarMiembro(null); setCodigo({ nombre: editarMiembro.nombre, codigo: c }); }}
        onGuardado={() => { setEditarMiembro(null); cargar(); recargar(); }} />}
      {codigo && <VerCodigo {...codigo} onCerrar={() => setCodigo(null)} />}
    </div>
  );
}

function FormBarbero({ barbero, onCerrar, onGuardado }: { barbero: Barbero | null; onCerrar: () => void; onGuardado: () => void }) {
  const { negocio, barberos } = useNegocio();
  const [f, setF] = useState({
    nombre: barbero?.nombre || '', telefono: barbero?.telefono || '', color: barbero?.color || COLORES[barberos.length % COLORES.length],
    comision_servicios: barbero?.comision_servicios ?? 50, comision_productos: barbero?.comision_productos ?? 10,
    en_linea: barbero?.en_linea ?? true, activo: barbero?.activo ?? true, orden: barbero?.orden ?? barberos.length,
    foto_url: barbero?.foto_url || null as string | null, bio: barbero?.bio || '',
  });
  const [propio, setPropio] = useState(!!barbero?.horario);
  const [horario, setHorario] = useState(barbero?.horario || negocio.horario);
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = { ...f, negocio_id: negocio.id, nombre: f.nombre.trim(), telefono: f.telefono.trim() || null, bio: f.bio.trim() || null, horario: propio ? horario : null };
    const { error } = barbero
      ? await supabase.from('barberos').update(datos).eq('id', barbero.id)
      : await supabase.from('barberos').insert(datos);
    if (error) return setError(mensajeError(error));
    onGuardado();
  }

  return (
    <Modal titulo={barbero ? 'Editar barbero' : 'Nuevo barbero'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="formulario">
        <div className="fila-campos">
          <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required maxLength={60} /></Campo>
          <Campo etiqueta="Teléfono"><input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} inputMode="tel" /></Campo>
        </div>
        <div className="campo">
          <span>Color en la agenda</span>
          <div className="colores">
            {COLORES.map((c) => (
              <button type="button" key={c} className={`color ${f.color === c ? 'elegido' : ''}`} style={{ background: c }}
                onClick={() => setF({ ...f, color: c })} aria-label={`Color ${c}`} />
            ))}
          </div>
        </div>
        <div className="fila-campos">
          <Campo etiqueta="Comisión servicios %"><input type="number" min={0} max={100} value={f.comision_servicios} onChange={(e) => setF({ ...f, comision_servicios: Number(e.target.value) })} /></Campo>
          <Campo etiqueta="Comisión productos %"><input type="number" min={0} max={100} value={f.comision_productos} onChange={(e) => setF({ ...f, comision_productos: Number(e.target.value) })} /></Campo>
        </div>
        <label className="check"><input type="checkbox" checked={propio} onChange={(e) => setPropio(e.target.checked)} /> Tiene horario distinto al de la barbería</label>
        {propio && <HorarioEditor valor={horario} onCambio={setHorario} />}
        <label className="check"><input type="checkbox" checked={f.en_linea} onChange={(e) => setF({ ...f, en_linea: e.target.checked })} /> Aparece en reservas en línea</label>
        {f.en_linea && (
          <div className="fila-campos">
            <SubirFoto etiqueta="Foto para tu página" forma="redonda" max={800} valor={f.foto_url} onCambio={(u) => setF({ ...f, foto_url: u })} />
            <Campo etiqueta="Especialidad (opcional)"><input value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} maxLength={160} placeholder="Ej. Fades y diseños" /></Campo>
          </div>
        )}
        <label className="check"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo</label>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

type Nuevo = { nombre: string; codigo: string };

function FormInvitar({ onCerrar, onGuardado }: { onCerrar: () => void; onGuardado: (nuevo: Nuevo) => void }) {
  const { negocio, barberos } = useNegocio();
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Miembro['rol']>('barbero');
  const [barberoId, setBarberoId] = useState('nueva');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(''); setEnviando(true);
    try {
      const r = await llamarPersonal<{ codigo: string }>({ accion: 'crear', negocio: negocio.id, nombre, rol, barbero: barberoId || null });
      onGuardado({ nombre: nombre.trim(), codigo: r.codigo });
    } catch (err) { setError(mensajeError(err)); }
    setEnviando(false);
  }

  return (
    <Modal titulo="Agregar persona" onCerrar={onCerrar}>
      <form onSubmit={guardar} className="formulario">
        <p className="tenue pequeno">No necesita correo. Al guardar te damos un código para que entre en <strong>Portal barberos</strong>.</p>
        <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60} placeholder="Ej. Carlos" /></Campo>
        <Campo etiqueta="Rol">
          <select value={rol} onChange={(e) => setRol(e.target.value as Miembro['rol'])}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Su agenda">
          <select value={barberoId} onChange={(e) => setBarberoId(e.target.value)}>
            <option value="nueva">Nueva agenda con su nombre</option>
            {barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            <option value="">No atiende clientes</option>
          </select>
        </Campo>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Crear y ver código'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Muestra el código una sola vez (no se guarda; si se pierde se genera otro). */
function VerCodigo({ nombre, codigo, onCerrar }: Nuevo & { onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Hola ${nombre}, entra a BarberaGo en ${window.location.origin}, toca "Portal barberos" y escribe tu código: ${codigo}`;
  async function copiar() {
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); } catch { /* el código se puede seleccionar a mano */ }
  }
  return (
    <Modal titulo={`Código de ${nombre}`} onCerrar={onCerrar}>
      <div className="formulario">
        <p className="tenue">Dáselo a {nombre}. Entra en <strong>Portal barberos</strong> en la pantalla de inicio de sesión.</p>
        <div className="codigo-grande" aria-label="Código de acceso">{codigo}</div>
        <Aviso tipo="info">Guárdalo o envíalo ahora: por seguridad no lo volverás a ver. Si se pierde, genera uno nuevo desde su ficha.</Aviso>
        <div className="acciones">
          <button type="button" className="btn" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar código'}</button>
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
          <button type="button" className="btn btn-primario" onClick={onCerrar}>Listo</button>
        </div>
      </div>
    </Modal>
  );
}

function FormMiembro({ miembro, onCerrar, onGuardado, onCodigo }: { miembro: Miembro; onCerrar: () => void; onGuardado: () => void; onCodigo: (codigo: string) => void }) {
  const { barberos, negocio } = useNegocio();
  const [nombre, setNombre] = useState(miembro.nombre);
  const [enviando, setEnviando] = useState(false);
  const [rol, setRol] = useState(miembro.rol);
  const [permisos, setPermisos] = useState<Permiso[]>(miembro.permisos);
  const [barberoId, setBarberoId] = useState(miembro.barbero_id || '');
  const [activo, setActivo] = useState(miembro.activo);
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('miembros')
      .update({ rol, permisos, barbero_id: barberoId || null, activo, ...(miembro.acceso_codigo ? { nombre: nombre.trim() || miembro.nombre } : {}) })
      .eq('negocio_id', miembro.negocio_id).eq('usuario_id', miembro.usuario_id);
    if (error) return setError(mensajeError(error));
    onGuardado();
  }

  async function quitar() {
    if (!confirm(`¿Quitar el acceso de ${miembro.nombre || miembro.email}?`)) return;
    if (miembro.acceso_codigo) {
      // La cuenta con código solo existe para esta barbería: se borra completa.
      setEnviando(true);
      try { await llamarPersonal({ accion: 'eliminar', negocio: negocio.id, usuario: miembro.usuario_id }); onGuardado(); }
      catch (err) { setError(mensajeError(err)); }
      setEnviando(false);
      return;
    }
    const { error } = await supabase.from('miembros').delete().eq('negocio_id', miembro.negocio_id).eq('usuario_id', miembro.usuario_id);
    if (error) return setError(mensajeError(error));
    onGuardado();
  }

  async function nuevoCodigo() {
    if (!confirm(`¿Generar un código nuevo para ${miembro.nombre}? El código anterior dejará de servir.`)) return;
    setError(''); setEnviando(true);
    try {
      const r = await llamarPersonal<{ codigo: string }>({ accion: 'nuevo_codigo', negocio: negocio.id, usuario: miembro.usuario_id });
      onCodigo(r.codigo);
    } catch (err) { setError(mensajeError(err)); }
    setEnviando(false);
  }

  return (
    <Modal titulo={miembro.nombre || miembro.email || 'Persona'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="formulario">
        {miembro.acceso_codigo && (
          <>
            <Campo etiqueta="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} required /></Campo>
            <div className="fila">
              <span className="tenue pequeno crece">Entra con código en Portal barberos.</span>
              <button type="button" className="btn btn-chico" disabled={enviando} onClick={nuevoCodigo}>Generar código nuevo</button>
            </div>
          </>
        )}
        <Campo etiqueta="Rol">
          <select value={rol} onChange={(e) => setRol(e.target.value as Miembro['rol'])}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Campo>
        {rol !== 'admin' && (
          <div className="campo">
            <span>Puede usar</span>
            <div className="permisos">
              {PERMISOS.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={permisos.includes(p.id)}
                    onChange={(e) => setPermisos(e.target.checked ? [...permisos, p.id] : permisos.filter((x) => x !== p.id))} />
                  {p.nombre}
                </label>
              ))}
            </div>
          </div>
        )}
        <Campo etiqueta="Su agenda">
          <select value={barberoId} onChange={(e) => setBarberoId(e.target.value)}>
            <option value="">No atiende clientes</option>
            {barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </Campo>
        <label className="check"><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Acceso activo</label>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          <button type="button" className="btn btn-peligro" disabled={enviando} onClick={quitar}>Quitar acceso</button>
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
