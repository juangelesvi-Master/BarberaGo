import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, mensajeError } from '../lib/datos';
import { useCuenta } from '../lib/cuenta';
import type { Mascota, Perfil, RegistroMedico, Reserva, TipoRegistro } from '../lib/tipos';
import { TALLAS, TIPOS_REGISTRO } from '../lib/tipos';
import { diasEntre, edad, fechaCorta, hoyIso, whatsapp } from '../lib/formato';
import { Aviso, Campo, Cargando, Modal, Vacio } from './ui';
import FormMascota from './FormMascota';
import { FilaReserva } from './Listas';

/** Estado de una próxima dosis: vencida, pronto (≤ 30 días) o al día. */
function estadoProxima(proxima: string): { clase: string; texto: string } {
  const d = diasEntre(hoyIso(), proxima);
  if (d < 0) return { clase: 'chip-peligro', texto: `Vencida hace ${-d} ${d === -1 ? 'día' : 'días'}` };
  if (d <= 30) return { clase: 'chip-alerta', texto: d === 0 ? 'Toca hoy' : `Toca en ${d} ${d === 1 ? 'día' : 'días'}` };
  return { clase: 'chip-ok', texto: `Próxima: ${fechaCorta(proxima)}` };
}

/**
 * Ficha y expediente médico de una mascota. La ve el dueño desde Mi cuenta y el personal desde el panel;
 * lo que registra el personal queda firmado por CanSuites y el dueño no lo puede cambiar.
 */
export default function Expediente({ mascotaId, volver }: { mascotaId: string; volver: string }) {
  const { esPersonal } = useCuenta();
  const [mascota, setMascota] = useState<Mascota | null | undefined>(undefined);
  const [registros, setRegistros] = useState<RegistroMedico[] | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [dueno, setDueno] = useState<Perfil | null>(null);
  const [editando, setEditando] = useState(false);
  const [registro, setRegistro] = useState<Partial<RegistroMedico> | null>(null);
  const [filtro, setFiltro] = useState<TipoRegistro | ''>('');

  const cargar = useCallback(async () => {
    const m = await api.mascota(mascotaId);
    setMascota(m);
    if (!m) return;
    const [r, rs] = await Promise.all([api.historial(mascotaId), api.reservasDeMascota(mascotaId)]);
    setRegistros(r); setReservas(rs);
    if (esPersonal) setDueno(await api.cliente(m.dueno_id));
  }, [mascotaId, esPersonal]);
  useEffect(() => { cargar().catch(() => setMascota(null)); }, [cargar]);
  useEffect(() => { if (mascota) document.title = `${mascota.nombre} · CanSuites`; }, [mascota]);

  if (mascota === undefined) return <Cargando />;
  if (mascota === null) return <Vacio>No encontramos esa mascota. <Link to={volver}>Regresar</Link></Vacio>;

  // Cartilla: la vacuna o desparasitación más reciente de cada nombre con su próxima dosis.
  const cartilla = new Map<string, RegistroMedico>();
  for (const r of registros || []) {
    if ((r.tipo === 'vacuna' || r.tipo === 'desparasitacion') && !cartilla.has(r.titulo.toLowerCase())) cartilla.set(r.titulo.toLowerCase(), r);
  }
  const talla = TALLAS.find((t) => t.id === mascota.talla);
  const linea = (r: RegistroMedico) => !filtro || r.tipo === filtro;
  // El historial médico solo lo llena CanSuites (en la cita); el dueño lo consulta.
  const puedeEditar = (_r: RegistroMedico) => esPersonal;

  return (
    <div className="expediente">
      <Link to={volver} className="btn-texto">← Regresar</Link>
      <div className="ficha tarjeta">
        <div className="avatar-mascota enorme">{mascota.foto_url ? <img src={mascota.foto_url} alt="" /> : <span aria-hidden>🐶</span>}</div>
        <div className="crece">
          <h1>{mascota.nombre}</h1>
          <p className="tenue">
            {[mascota.raza, mascota.sexo === 'macho' ? 'Macho' : 'Hembra', edad(mascota.nacimiento), mascota.peso_kg ? `${mascota.peso_kg} kg` : null, talla && `Talla ${talla.nombre.toLowerCase()}`]
              .filter(Boolean).join(' · ')}
          </p>
          <div className="ficha-datos">
            {mascota.alergias && <span className="chip chip-peligro">⚠️ Alergias: {mascota.alergias}</span>}
            {mascota.condiciones && <span className="chip chip-alerta">Cuidado: {mascota.condiciones}</span>}
            <span className="chip">{mascota.esterilizado ? 'Esterilizado(a)' : 'Sin esterilizar'}</span>
          </div>
          <dl className="ficha-lista">
            {mascota.alimentacion && <><dt>Alimentación</dt><dd>{mascota.alimentacion}</dd></>}
            {mascota.veterinario && <><dt>Veterinario</dt><dd>{mascota.veterinario}</dd></>}
            {mascota.color && <><dt>Color</dt><dd>{mascota.color}</dd></>}
            {mascota.notas && <><dt>Notas</dt><dd>{mascota.notas}</dd></>}
            {esPersonal && dueno && (
              <><dt>Dueño</dt><dd>
                <Link to={`/admin/clientes/${dueno.id}`}>{dueno.nombre}</Link>
                {dueno.telefono && <> · <a href={whatsapp(dueno.telefono, `Hola ${dueno.nombre}, te escribimos de CanSuites sobre ${mascota.nombre}.`)!} target="_blank" rel="noreferrer">WhatsApp {dueno.telefono}</a></>}
              </dd></>
            )}
          </dl>
        </div>
        <div className="ficha-acciones">
          <button className="btn" onClick={() => setEditando(true)}>Editar ficha</button>
          <Link className="btn btn-primario" to={`/reservar?mascota=${mascota.id}`}>Reservar</Link>
        </div>
      </div>

      <div className="dos-columnas">
        <section className="tarjeta">
          <h2>💉 Cartilla de vacunación</h2>
          {cartilla.size === 0 ? <p className="tenue">Aún no hay vacunas registradas. Agrégalas para que el equipo sepa que está protegido.</p> : (
            <ul className="cartilla">
              {[...cartilla.values()].map((r) => {
                const e = r.proxima ? estadoProxima(r.proxima) : null;
                return (
                  <li key={r.id}>
                    <span aria-hidden>{TIPOS_REGISTRO[r.tipo].icono}</span>
                    <div className="crece"><strong>{r.titulo}</strong><small className="tenue">Aplicada el {fechaCorta(r.fecha)}</small></div>
                    {e && <span className={`chip ${e.clase}`}>{e.texto}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="tarjeta">
          <h2>📅 Estancias y servicios</h2>
          {reservas.length === 0 ? <p className="tenue">Todavía no ha venido a CanSuites.</p> : (
            <div className="lista-filas">{reservas.slice(0, 6).map((r) => <FilaReserva key={r.id} r={r} />)}</div>
          )}
        </section>
      </div>

      <section className="tarjeta">
        <div className="cabecera">
          <h2>🩺 Historial médico</h2>
          <div className="cabecera-acciones">
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as TipoRegistro | '')} aria-label="Filtrar por tipo">
              <option value="">Todo</option>
              {Object.entries(TIPOS_REGISTRO).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
            </select>
            {esPersonal && <button className="btn btn-primario" onClick={() => setRegistro({ tipo: 'vacuna', fecha: hoyIso() })}>＋ Agregar registro</button>}
          </div>
        </div>
        {registros === null ? <Cargando /> : registros.filter(linea).length === 0 ? <Vacio>{esPersonal ? 'Sin registros todavía.' : 'Sin registros todavía. El equipo de CanSuites anota aquí sus vacunas y consultas cuando viene a cita; trae su cartilla en tu próxima visita.'}</Vacio> : (
          <ol className="linea-tiempo">
            {registros.filter(linea).map((r) => (
              <li key={r.id}>
                <span className="linea-icono" aria-hidden>{TIPOS_REGISTRO[r.tipo].icono}</span>
                <div className="crece">
                  <div className="linea-titulo">
                    <strong>{r.titulo}</strong>
                    <span className="chip">{TIPOS_REGISTRO[r.tipo].nombre}</span>
                    {r.autor === 'cansuites' ? <span className="chip chip-naranja">CanSuites</span> : <span className="chip chip-tenue">Registrado por el dueño</span>}
                  </div>
                  <small className="tenue">{fechaCorta(r.fecha)}{r.autor_nombre ? ` · ${r.autor_nombre}` : ''}</small>
                  {r.detalle && <p>{r.detalle}</p>}
                  {r.proxima && <small className={`chip ${estadoProxima(r.proxima).clase}`}>{estadoProxima(r.proxima).texto}</small>}
                </div>
                {puedeEditar(r) && <button className="btn-texto pequeno" onClick={() => setRegistro(r)}>Editar</button>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {editando && (
        <Modal titulo={`Ficha de ${mascota.nombre}`} onCerrar={() => setEditando(false)} ancho={640}>
          <FormMascota mascota={mascota} onGuardada={(m) => { setMascota(m); setEditando(false); }} onCancelar={() => setEditando(false)} />
        </Modal>
      )}
      {registro && (
        <EditarRegistro mascota={mascota} registro={registro} onCerrar={() => setRegistro(null)} onGuardado={() => { setRegistro(null); cargar(); }} />
      )}
    </div>
  );
}

function EditarRegistro({ mascota, registro, onCerrar, onGuardado }: {
  mascota: Mascota; registro: Partial<RegistroMedico>; onCerrar: () => void; onGuardado: () => void;
}) {
  const [r, setR] = useState(registro);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cambia = (c: Partial<RegistroMedico>) => setR((x) => ({ ...x, ...c }));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      await api.guardarRegistro({ ...r, mascota_id: mascota.id, titulo: (r.titulo || '').trim(), detalle: r.detalle?.trim() || null, proxima: r.proxima || null });
      onGuardado();
    } catch (err) { setError(mensajeError(err)); setGuardando(false); }
  }
  async function borrar() {
    if (!r.id || !confirm('¿Borrar este registro del expediente?')) return;
    try { await api.borrarRegistro(r.id); onGuardado(); } catch (err) { setError(mensajeError(err)); }
  }

  return (
    <Modal titulo={r.id ? 'Editar registro' : `Nuevo registro de ${mascota.nombre}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <div className="fila-campos">
          <Campo etiqueta="Tipo">
            <select value={r.tipo || 'observacion'} onChange={(e) => cambia({ tipo: e.target.value as TipoRegistro })}>
              {Object.entries(TIPOS_REGISTRO).map(([k, v]) => <option key={k} value={k}>{v.icono} {v.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Fecha"><input type="date" value={r.fecha || ''} max={hoyIso()} onChange={(e) => cambia({ fecha: e.target.value })} required /></Campo>
        </div>
        <Campo etiqueta={r.tipo === 'vacuna' ? 'Vacuna' : r.tipo === 'desparasitacion' ? 'Producto' : 'Título'}>
          <input value={r.titulo || ''} onChange={(e) => cambia({ titulo: e.target.value })} required
            placeholder={r.tipo === 'vacuna' ? 'Rabia, Múltiple, Bordetella…' : r.tipo === 'consulta' ? 'Revisión general' : ''} list={r.tipo === 'vacuna' ? 'vacunas-comunes' : undefined} />
          <datalist id="vacunas-comunes">
            {['Rabia', 'Múltiple (séxtuple)', 'Parvovirus', 'Moquillo', 'Bordetella (tos de las perreras)', 'Leptospirosis', 'Giardia'].map((v) => <option key={v} value={v} />)}
          </datalist>
        </Campo>
        <Campo etiqueta="Detalle (opcional)"><textarea rows={3} value={r.detalle || ''} onChange={(e) => cambia({ detalle: e.target.value })} placeholder="Lote, dosis, diagnóstico, indicaciones…" /></Campo>
        {(r.tipo === 'vacuna' || r.tipo === 'desparasitacion' || r.tipo === 'tratamiento') && (
          <Campo etiqueta="Próxima dosis o revisión (opcional)"><input type="date" value={r.proxima || ''} onChange={(e) => cambia({ proxima: e.target.value })} /></Campo>
        )}
        {!r.id && <p className="tenue pequeno">Quedará firmado por CanSuites.</p>}
        <Aviso>{error}</Aviso>
        <div className="acciones">
          {r.id && <button type="button" className="btn btn-peligro" onClick={borrar}>Borrar</button>}
          <span className="crece" />
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  );
}
