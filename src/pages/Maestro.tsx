import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, mensajeError, llamarPagos, llamarMaestro } from '../lib/supabase';
import { useSesion } from '../lib/sesion';
import { dinero, fechaCorta, isoDia } from '../lib/formato';
import { Icono, Marca } from '../components/Iconos';
import { Aviso, Campo, Cargando, Modal, Vacio } from '../components/ui';

type Plan = { plan: string; negocios_max: number; vence: string; origen: string; nivel: 'basico' | 'completo'; mp_estado?: string | null };
type Barberia = { id: string; nombre: string; slug: string; creada: string; pago_en_linea: string; citas_30d: number; ventas_30d: number; equipo: number };
type Cuenta = { id: string; nombre: string; email: string | null; telefono: string | null; creada: string; ultimo_acceso: string | null; maestro: boolean; suscripcion: Plan | null; barberias: Barberia[] };
type Codigo = { codigo: string; plan: string; nivel: 'basico' | 'completo'; negocios_max: number; dias: number; usos_max: number; usos: number; expira: string | null; nota: string | null; created_at: string };
type Resumen = Record<'cuentas' | 'barberias' | 'activas' | 'prueba' | 'vencidas' | 'por_vencer' | 'citas_30d' | 'ventas_30d' | 'codigos_libres' | 'solicitudes', number>;
type Solicitud = { id: string; nombre: string; barberia: string | null; telefono: string; email: string | null; ciudad: string | null; mensaje: string | null; atendida: boolean; created_at: string };
type Vista = 'resumen' | 'cuentas' | 'solicitudes' | 'codigos' | 'cobro';
type Cobro = { conectada: boolean; cuenta: string | null; prueba: boolean; basico: number; completo: number };
const NIVEL = { basico: 'Básico (sin tienda)', completo: 'Completo (con tienda)' };

const DIA = 864e5;
/** Duraciones de los códigos (como en RestoraGo). */
const DURACIONES: [string, number][] = [['1 mes', 30], ['3 meses', 90], ['6 meses', 180], ['9 meses', 270], ['12 meses', 365]];
const duracionTexto = (dias: number) => DURACIONES.find(([, d]) => d === dias)?.[0] || `${dias} días`;

/** Descarga una hoja CSV (separada por ";" para que Excel en español la abra en columnas). */
function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const celda = (v: string | number) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const texto = '\ufeff' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Estado de un plan para mostrarlo con color. */
function estadoPlan(s: Plan | null): { texto: string; clase: string } {
  if (!s) return { texto: 'Sin plan', clase: '' };
  const resta = new Date(s.vence).getTime() - Date.now();
  if (resta < 0) return { texto: 'Vencida', clase: 'estado-cancelada' };
  if (resta < 7 * DIA) return { texto: 'Por vencer', clase: 'estado-pendiente' };
  if (s.origen === 'prueba') return { texto: 'Prueba', clase: 'estado-confirmada' };
  return { texto: 'Activa', clase: 'estado-en_curso' };
}

function estadoCodigo(c: Codigo): string {
  if (c.usos >= c.usos_max) return 'Usado';
  if (c.expira && new Date(c.expira) < new Date()) return 'Desactivado';
  return 'Disponible';
}

/** Panel maestro: el dueño de BarberaGo ve todas las cuentas, cambia planes y genera códigos. */
export default function Maestro() {
  const { negocio, salir } = useSesion();
  const [vista, setVista] = useState<Vista>('resumen');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [editando, setEditando] = useState<Cuenta | null>(null);
  const [acceso, setAcceso] = useState<Cuenta | null>(null);

  const cargar = useCallback(async () => {
    const [r, c, k, s] = await Promise.all([supabase.rpc('maestro_resumen'), supabase.rpc('maestro_cuentas'), supabase.rpc('maestro_codigos'), supabase.rpc('maestro_solicitudes')]);
    const e = r.error || c.error || k.error || s.error;
    if (e) setError(mensajeError(e));
    setResumen(r.data as Resumen); setCuentas((c.data as Cuenta[]) || []); setCodigos((k.data as Codigo[]) || []);
    setSolicitudes((s.data as Solicitud[]) || []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return cuentas;
    return cuentas.filter((c) => [c.nombre, c.email, c.telefono, ...c.barberias.map((b) => b.nombre)].some((t) => t?.toLowerCase().includes(q)));
  }, [cuentas, buscar]);

  return (
    <div className="maestro">
      <header className="maestro-barra">
        <Marca />
        <span className="maestro-sello">Panel maestro</span>
        <div className="maestro-barra-acciones">
          {negocio && <Link to="/agenda" className="btn btn-chico">Ir a mi barbería</Link>}
          <button className="btn btn-chico" onClick={salir}><Icono nombre="salir" /> Salir</button>
        </div>
      </header>

      <div className="pagina">
        <p className="kicker">Administración de BarberaGo</p>
        <div className="cabecera">
          <h1>Panel maestro</h1>
          <div className="segmentado" role="tablist">
            {(['resumen', 'cuentas', 'solicitudes', 'codigos', 'cobro'] as Vista[]).map((v) => (
              <button key={v} role="tab" aria-selected={vista === v} className={vista === v ? 'activo' : ''} onClick={() => setVista(v)}>
                {v === 'resumen' ? 'Resumen' : v === 'cuentas' ? `Cuentas (${cuentas.length})` : v === 'solicitudes'
                  ? `Solicitudes${solicitudes.some((x) => !x.atendida) ? ` (${solicitudes.filter((x) => !x.atendida).length})` : ''}`
                  : v === 'codigos' ? 'Códigos' : 'Cobro'}
              </button>
            ))}
          </div>
        </div>
        <Aviso>{error}</Aviso>
        {cargando ? <Cargando /> : (
          <>
            {vista === 'resumen' && resumen && <VistaResumen r={resumen} cuentas={cuentas} irCuentas={() => setVista('cuentas')} />}
            {vista === 'cuentas' && (
              <>
                <input className="buscar" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, correo o barbería" aria-label="Buscar cuenta" />
                {filtradas.length === 0 ? <Vacio>No hay cuentas que coincidan.</Vacio> : (
                  <div className="maestro-cuentas">
                    {filtradas.map((c) => <TarjetaCuenta key={c.id} c={c} onEditar={() => setEditando(c)} onAcceso={() => setAcceso(c)} />)}
                  </div>
                )}
              </>
            )}
            {vista === 'solicitudes' && <VistaSolicitudes solicitudes={solicitudes} onCambio={cargar} />}
            {vista === 'codigos' && <VistaCodigos codigos={codigos} onCambio={cargar} />}
            {vista === 'cobro' && <VistaCobro />}
          </>
        )}
      </div>
      {acceso && <AccesoCuenta cuenta={acceso} onCerrar={() => setAcceso(null)} onBorrada={() => { setAcceso(null); cargar(); }} />}
      {editando && <EditarPlan cuenta={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar(); }} />}
    </div>
  );
}

function VistaResumen({ r, cuentas, irCuentas }: { r: Resumen; cuentas: Cuenta[]; irCuentas: () => void }) {
  const porVencer = cuentas
    .filter((c) => c.suscripcion && new Date(c.suscripcion.vence).getTime() < Date.now() + 7 * DIA)
    .sort((a, b) => +new Date(a.suscripcion!.vence) - +new Date(b.suscripcion!.vence));
  const recientes = cuentas.slice(0, 5);
  return (
    <>
      <div className="kpis">
        <div className="kpi"><span>Cuentas</span><strong>{r.cuentas}</strong></div>
        <div className="kpi"><span>Barberías</span><strong>{r.barberias}</strong></div>
        <div className="kpi"><span>Planes activos</span><strong>{r.activas}</strong><small>{r.prueba} en prueba</small></div>
        <div className="kpi"><span>Vencidas</span><strong>{r.vencidas}</strong><small>{r.por_vencer} vencen esta semana</small></div>
        <div className="kpi"><span>Citas (30 días)</span><strong>{r.citas_30d}</strong></div>
        <div className="kpi"><span>Ventas (30 días)</span><strong>{dinero(r.ventas_30d)}</strong><small>de todas las barberías</small></div>
        <div className="kpi"><span>Códigos disponibles</span><strong>{r.codigos_libres}</strong></div>
        <div className="kpi"><span>Solicitudes nuevas</span><strong>{r.solicitudes ?? 0}</strong><small>de la página /promo</small></div>
      </div>
      <div className="dos-columnas">
        <section className="tarjeta">
          <h2>Vencidas o por vencer</h2>
          {porVencer.length === 0 ? <p className="tenue">Ninguna cuenta vence esta semana.</p> : (
            <ul className="lista compacta">
              {porVencer.map((c) => {
                const e = estadoPlan(c.suscripcion);
                return <li key={c.id}><span className="crece">{c.nombre || c.email}</span><span className={`insignia ${e.clase}`}>{e.texto}</span><span className="tenue">{fechaCorta(c.suscripcion!.vence)}</span></li>;
              })}
            </ul>
          )}
        </section>
        <section className="tarjeta">
          <h2>Cuentas nuevas</h2>
          {recientes.length === 0 ? <p className="tenue">Todavía no hay cuentas.</p> : (
            <ul className="lista compacta">
              {recientes.map((c) => <li key={c.id}><span className="crece">{c.nombre || c.email}</span><span className="tenue">{c.barberias.length} barbería(s)</span><span className="tenue">{fechaCorta(c.creada)}</span></li>)}
            </ul>
          )}
          <button className="btn-texto mt" onClick={irCuentas}>Ver todas las cuentas</button>
        </section>
      </div>
    </>
  );
}

function TarjetaCuenta({ c, onEditar, onAcceso }: { c: Cuenta; onEditar: () => void; onAcceso: () => void }) {
  const e = estadoPlan(c.suscripcion);
  return (
    <article className="tarjeta maestro-cuenta">
      <div className="maestro-cuenta-cabeza">
        <div className="crece">
          <strong>{c.nombre || 'Sin nombre'}</strong> {c.maestro && <span className="insignia insignia-oro">Maestro</span>}
          <div className="tenue pequeno">{c.email}{c.telefono && ` · ${c.telefono}`}</div>
        </div>
        <span className={`insignia ${e.clase}`}>{e.texto}</span>
      </div>
      <dl className="datos">
        <dt>Plan</dt><dd>{c.suscripcion ? `${c.suscripcion.plan} · ${c.suscripcion.nivel === 'completo' ? 'con tienda' : 'sin tienda'} · ${c.suscripcion.negocios_max} sucursal(es)` : 'Sin plan'}</dd>
        <dt>Cobro</dt><dd>{c.suscripcion?.origen === 'pago' ? (c.suscripcion.mp_estado === 'authorized' ? 'Cobro automático activo' : c.suscripcion.mp_estado ? 'Cobro automático cancelado' : 'Pago único') : c.suscripcion?.origen === 'codigo' ? 'Código' : c.suscripcion?.origen === 'manual' ? 'Manual' : c.suscripcion ? 'Prueba' : '—'}</dd>
        <dt>Vence</dt><dd>{c.suscripcion ? fechaCorta(c.suscripcion.vence) : '—'}</dd>
        <dt>Alta</dt><dd>{fechaCorta(c.creada)}</dd>
        <dt>Último acceso</dt><dd>{c.ultimo_acceso ? fechaCorta(c.ultimo_acceso) : 'Nunca'}</dd>
      </dl>
      {c.barberias.length > 0 ? (
        <ul className="lista compacta">
          {c.barberias.map((b) => (
            <li key={b.id}>
              <a className="crece" href={`/r/${b.slug}`} target="_blank" rel="noreferrer">{b.nombre}</a>
              <span className="tenue pequeno">{b.citas_30d} citas · {dinero(b.ventas_30d)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="tenue pequeno">Sin barberías todavía.</p>}
      <div className="acciones">
        {!c.maestro && <button className="btn btn-chico" onClick={onAcceso}>Contraseña o borrar</button>}
        <button className="btn btn-chico" onClick={onEditar}>Cambiar plan</button>
      </div>
    </article>
  );
}

function EditarPlan({ cuenta, onCerrar, onGuardado }: { cuenta: Cuenta; onCerrar: () => void; onGuardado: () => void }) {
  const s = cuenta.suscripcion;
  const [plan, setPlan] = useState(s && s.origen !== 'prueba' ? s.plan : 'Básico');
  const [max, setMax] = useState(s?.negocios_max || 1);
  const [nivel, setNivel] = useState<'basico' | 'completo'>(s?.nivel || 'completo');
  const [vence, setVence] = useState(isoDia(new Date(s && new Date(s.vence) > new Date() ? s.vence : Date.now() + 30 * DIA)));
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const sumar = (dias: number) => {
    const base = new Date(`${vence}T12:00:00`) > new Date() ? new Date(`${vence}T12:00:00`) : new Date();
    setVence(isoDia(new Date(base.getTime() + dias * DIA)));
  };

  async function guardar(e?: FormEvent, suspender = false) {
    e?.preventDefault();
    setError(''); setEnviando(true);
    const fecha = suspender ? new Date().toISOString() : new Date(`${vence}T23:59:59`).toISOString();
    const { error } = await supabase.rpc('maestro_plan_nivel', { p_usuario: cuenta.id, p_plan: plan, p_nivel: nivel, p_negocios_max: max, p_vence: fecha });
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    onGuardado();
  }

  return (
    <Modal titulo={`Plan de ${cuenta.nombre || cuenta.email}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <div className="fila-campos">
          <Campo etiqueta="Plan"><input value={plan} onChange={(e) => setPlan(e.target.value)} required maxLength={30} list="planes" /></Campo>
          <Campo etiqueta="Sucursales"><input type="number" min={1} max={100} value={max} onChange={(e) => setMax(Number(e.target.value))} required /></Campo>
        </div>
        <datalist id="planes"><option value="Básico" /><option value="Completo" /></datalist>
        <Campo etiqueta="Incluye"><select value={nivel} onChange={(e) => setNivel(e.target.value as 'basico' | 'completo')}><option value="basico">{NIVEL.basico}</option><option value="completo">{NIVEL.completo}</option></select></Campo>
        <Campo etiqueta="Vence"><input type="date" value={vence} onChange={(e) => setVence(e.target.value)} required /></Campo>
        <div className="chips">
          <button type="button" className="chip" onClick={() => sumar(30)}>+30 días</button>
          <button type="button" className="chip" onClick={() => sumar(90)}>+3 meses</button>
          <button type="button" className="chip" onClick={() => sumar(365)}>+1 año</button>
        </div>
        <Aviso>{error}</Aviso>
        <div className="acciones">
          <button type="button" className="btn btn-peligro" disabled={enviando} onClick={() => { if (confirm('¿Suspender esta cuenta? Sus reservas en línea se pausan hasta que le des un plan.')) guardar(undefined, true); }}>Suspender</button>
          <button className="btn btn-primario" disabled={enviando}>Guardar plan</button>
        </div>
      </form>
    </Modal>
  );
}

/** Cambiar la contraseña de una cuenta o borrarla (cancela su cobro automático y borra sus barberías). */
function AccesoCuenta({ cuenta, onCerrar, onBorrada }: { cuenta: Cuenta; onCerrar: () => void; onBorrada: () => void }) {
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const nombre = cuenta.nombre || cuenta.email || 'esta cuenta';
  const cobra = cuenta.suscripcion?.mp_estado === 'authorized';

  async function cambiar(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk(''); setEnviando(true);
    try { await llamarMaestro({ accion: 'contrasena', usuario: cuenta.id, contrasena }); setContrasena(''); setOk('Contraseña cambiada. Compártela con el cliente por un medio seguro.'); }
    catch (err) { setError(mensajeError(err)); }
    setEnviando(false);
  }

  async function borrar() {
    setError(''); setOk(''); setEnviando(true);
    try { await llamarMaestro({ accion: 'eliminar', usuario: cuenta.id }); onBorrada(); }
    catch (err) { setError(mensajeError(err)); setEnviando(false); }
  }

  return (
    <Modal titulo={`Acceso de ${nombre}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={cambiar}>
        <h3>Cambiar contraseña</h3>
        <Campo etiqueta="Contraseña nueva"><input type="text" value={contrasena} onChange={(e) => setContrasena(e.target.value)} minLength={8} required autoComplete="off" /></Campo>
        <div className="acciones">
          <button type="button" className="btn btn-chico" onClick={() => setContrasena(Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''))}>Generar una</button>
          <button className="btn btn-primario" disabled={enviando}>Cambiar contraseña</button>
        </div>
      </form>
      <hr className="separador" />
      <div className="formulario">
        <h3 className="texto-peligro">Borrar cuenta</h3>
        <p className="tenue pequeno">
          Se {cobra ? 'cancela su cobro automático en Mercado Pago, se ' : ''}borran sus {cuenta.barberias.length} barbería(s) con todas sus citas, ventas y clientes,
          las cuentas con código de su personal y la cuenta. No se puede deshacer.
        </p>
        <Campo etiqueta={`Escribe BORRAR para confirmar`}><input value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="off" /></Campo>
        <div className="acciones"><button type="button" className="btn btn-peligro" disabled={enviando || confirmar.trim().toUpperCase() !== 'BORRAR'} onClick={borrar}>Borrar cuenta</button></div>
      </div>
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
    </Modal>
  );
}

function VistaSolicitudes({ solicitudes, onCambio }: { solicitudes: Solicitud[]; onCambio: () => void }) {
  const [error, setError] = useState('');
  async function marcar(s: Solicitud) {
    const { error } = await supabase.rpc('maestro_solicitud_atender', { p_id: s.id, p_atendida: !s.atendida });
    if (error) return setError(mensajeError(error));
    onCambio();
  }
  const whatsapp = (t: string) => `https://wa.me/${t.replace(/\D/g, '').replace(/^(\d{10})$/, '52$1')}`;
  return (
    <>
      <p className="tenue">Personas que llenaron "Quiero probar BarberaGo" en <a href="/promo" target="_blank" rel="noreferrer">barberago.restorago.com/promo</a>.</p>
      <Aviso>{error}</Aviso>
      {solicitudes.length === 0 ? <Vacio>Todavía no hay solicitudes.</Vacio> : (
        <div className="maestro-cuentas">
          {solicitudes.map((s) => (
            <article key={s.id} className={`tarjeta maestro-cuenta ${s.atendida ? 'inactivo' : ''}`}>
              <div className="maestro-cuenta-cabeza">
                <div className="crece">
                  <strong>{s.nombre}</strong>{s.barberia && <> · {s.barberia}</>}
                  <div className="tenue pequeno">{[s.ciudad, s.email].filter(Boolean).join(' · ')}</div>
                </div>
                <span className={`insignia ${s.atendida ? '' : 'estado-pendiente'}`}>{s.atendida ? 'Atendida' : 'Nueva'}</span>
              </div>
              {s.mensaje && <p>{s.mensaje}</p>}
              <p className="tenue pequeno">{fechaCorta(s.created_at)}</p>
              <div className="acciones">
                <a className="btn btn-chico" href={whatsapp(s.telefono)} target="_blank" rel="noreferrer">WhatsApp {s.telefono}</a>
                <button className="btn btn-chico" onClick={() => marcar(s)}>{s.atendida ? 'Marcar como nueva' : 'Marcar atendida'}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function VistaCodigos({ codigos, onCambio }: { codigos: Codigo[]; onCambio: () => void }) {
  const [plan, setPlan] = useState('Completo');
  const [nivel, setNivel] = useState<'basico' | 'completo'>('completo');
  const [max, setMax] = useState(1);
  const [dias, setDias] = useState(30);
  const [cantidad, setCantidad] = useState(1);
  const [usos, setUsos] = useState(1);
  const [nota, setNota] = useState('');
  const [nuevos, setNuevos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function generar(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk(''); setEnviando(true);
    const { data, error } = await supabase.rpc('maestro_generar_codigos', { p_plan: plan, p_nivel: nivel, p_negocios_max: max, p_dias: dias, p_cantidad: cantidad, p_usos_max: usos, p_nota: nota });
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    setNuevos(data as string[]);
    onCambio();
  }

  const filaCsv = (c: Codigo) => [c.codigo, c.plan, c.negocios_max, duracionTexto(c.dias), c.dias, c.usos_max, c.usos, estadoCodigo(c), c.nota || ''];
  const CABECERA_CSV = ['Código', 'Plan', 'Negocios', 'Duración', 'Días', 'Usos', 'Usados', 'Estado', 'Nota'];
  function exportar(lista: Codigo[], nombre: string) {
    descargarCsv(`${nombre}-${isoDia(new Date())}.csv`, [CABECERA_CSV, ...lista.map(filaCsv)]);
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(nuevos.join('\n')); setOk('Códigos copiados.'); } catch { setOk(''); }
  }

  async function desactivar(c: string) {
    if (!confirm(`¿Desactivar el código ${c}? Ya no se podrá canjear.`)) return;
    const { error } = await supabase.rpc('maestro_desactivar_codigo', { p_codigo: c });
    if (error) return setError(mensajeError(error));
    onCambio();
  }

  return (
    <>
      <form className="tarjeta formulario" onSubmit={generar}>
        <h2>Generar códigos de activación</h2>
        <p className="tenue pequeno">El cliente lo canjea en "Tengo un código de activación" y su plan se activa o se extiende.</p>
        <div className="fila-campos">
          <Campo etiqueta="Plan"><input value={plan} onChange={(e) => setPlan(e.target.value)} required maxLength={30} list="planes-codigo" /></Campo>
          <Campo etiqueta="Sucursales"><input type="number" min={1} max={100} value={max} onChange={(e) => setMax(Number(e.target.value))} required /></Campo>
          <Campo etiqueta="Duración">
            <select value={DURACIONES.some(([, d]) => d === dias) ? dias : 'otro'} onChange={(e) => e.target.value !== 'otro' && setDias(Number(e.target.value))}>
              {DURACIONES.map(([t, d]) => <option key={d} value={d}>{t}</option>)}
              <option value="otro">Otro…</option>
            </select>
          </Campo>
          <Campo etiqueta="Días"><input type="number" min={1} max={3660} value={dias} onChange={(e) => setDias(Number(e.target.value))} required /></Campo>
          <Campo etiqueta="Cuántos códigos"><input type="number" min={1} max={100} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} required /></Campo>
          <Campo etiqueta="Usos por código"><input type="number" min={1} max={10000} value={usos} onChange={(e) => setUsos(Number(e.target.value))} required /></Campo>
        </div>
        <datalist id="planes-codigo"><option value="Básico" /><option value="Completo" /></datalist>
        <Campo etiqueta="Incluye"><select value={nivel} onChange={(e) => { const n = e.target.value as 'basico' | 'completo'; setNivel(n); setPlan(n === 'completo' ? 'Completo' : 'Básico'); }}><option value="basico">{NIVEL.basico}</option><option value="completo">{NIVEL.completo}</option></select></Campo>
        <Campo etiqueta="Nota (para ti)"><input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={120} placeholder="Ej. Barbería El Güero, pagó transferencia" /></Campo>
        <Aviso>{error}</Aviso>
        <div className="acciones"><button className="btn btn-primario" disabled={enviando}>Generar</button></div>
        {nuevos.length > 0 && (
          <div className="codigos-nuevos">
            <ul>{nuevos.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
            <button type="button" className="btn btn-chico" onClick={copiar}>Copiar</button>
            <button type="button" className="btn btn-chico" onClick={() => exportar(codigos.filter((c) => nuevos.includes(c.codigo)), 'codigos-nuevos')}>Descargar hoja (CSV)</button>
            <Aviso tipo="ok">{ok}</Aviso>
          </div>
        )}
      </form>

      <div className="cabecera-seccion">
        <h2 className="subtitulo">Todos los códigos</h2>
        {codigos.length > 0 && (
          <div className="acciones">
            <button className="btn btn-chico" onClick={() => exportar(codigos.filter((c) => estadoCodigo(c) === 'Disponible'), 'codigos-disponibles')}>Exportar disponibles</button>
            <button className="btn btn-chico" onClick={() => exportar(codigos, 'codigos-todos')}>Exportar todos</button>
          </div>
        )}
      </div>
      {codigos.length === 0 ? <Vacio>Todavía no has generado códigos.</Vacio> : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Código</th><th>Plan</th><th>Tienda</th><th className="num">Sucursales</th><th>Duración</th><th className="num">Usos</th><th>Estado</th><th>Nota</th><th>Creado</th><th /></tr></thead>
            <tbody>
              {codigos.map((c) => {
                const est = estadoCodigo(c);
                return (
                  <tr key={c.codigo} className={est === 'Disponible' ? '' : 'inactivo'}>
                    <td><code>{c.codigo}</code></td>
                    <td>{c.plan}</td>
                    <td>{c.nivel === 'completo' ? 'Sí' : 'No'}</td>
                    <td className="num">{c.negocios_max}</td>
                    <td>{duracionTexto(c.dias)}</td>
                    <td className="num">{c.usos}/{c.usos_max}</td>
                    <td>{est}</td>
                    <td className="tenue">{c.nota}</td>
                    <td className="tenue">{fechaCorta(c.created_at)}</td>
                    <td>{est === 'Disponible' && <button className="btn-texto texto-peligro" onClick={() => desactivar(c.codigo)}>Desactivar</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Cuenta de Mercado Pago de BarberaGo (recibe las mensualidades) y precios de los planes. */
function VistaCobro() {
  const [c, setC] = useState<Cobro | null>(null);
  const [token, setToken] = useState('');
  const [basico, setBasico] = useState('');
  const [completo, setCompleto] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const aviso = `${import.meta.env.VITE_SUPABASE_URL || 'https://stcazhnnsisklzpdwltu.supabase.co'}/functions/v1/pagos?accion=webhook_plataforma`;

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('maestro_plataforma');
    if (error) return setError(mensajeError(error));
    const d = data as Cobro;
    setC(d); setBasico(String(d.basico)); setCompleto(String(d.completo));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function conectar(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk(''); setEnviando(true);
    try {
      const r = await llamarPagos<{ cuenta: string; prueba: boolean }>({ accion: 'plataforma_conectar', access_token: token });
      setToken(''); setOk(`Cuenta conectada: ${r.cuenta}${r.prueba ? ' (de prueba)' : ''}.`); cargar();
    } catch (e) { setError(mensajeError(e)); }
    setEnviando(false);
  }

  async function guardarPrecios(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk('');
    const { error } = await supabase.rpc('maestro_precios', { p_basico: Number(basico), p_completo: Number(completo) });
    if (error) return setError(mensajeError(error));
    setOk('Precios guardados. Aplican a las suscripciones nuevas.'); cargar();
  }

  if (!c) return <><Aviso>{error}</Aviso><Cargando /></>;
  return (
    <>
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      <div className="dos-columnas">
        <form className="tarjeta formulario" onSubmit={conectar}>
          <h2>Mercado Pago de BarberaGo</h2>
          <p className="tenue pequeno">Aquí llegan las mensualidades de las barberías. Pega el Access Token de tu cuenta (Mercado Pago Developers → tu aplicación → Credenciales de producción).</p>
          <p>{c.conectada ? <>Conectada: <strong>{c.cuenta}</strong>{c.prueba && <span className="insignia insignia-prueba">Prueba</span>}</> : <span className="texto-peligro">Sin conectar: las barberías no pueden pagar con tarjeta todavía.</span>}</p>
          <Campo etiqueta={c.conectada ? 'Cambiar Access Token' : 'Access Token'}><input value={token} onChange={(e) => setToken(e.target.value)} placeholder="APP_USR-…" required autoComplete="off" /></Campo>
          <div className="acciones"><button className="btn btn-primario" disabled={enviando}>{enviando ? 'Validando…' : 'Conectar'}</button></div>
          <p className="tenue pequeno">Para que los cobros de cada mes se registren solos, en tu aplicación de Mercado Pago entra a Webhooks, pega esta URL y marca "Planes y suscripciones":</p>
          <div className="enlace-reserva"><code>{aviso}</code></div>
        </form>
        <form className="tarjeta formulario" onSubmit={guardarPrecios}>
          <h2>Precios por sucursal al mes</h2>
          <Campo etiqueta="Básico: citas en línea y todo lo demás"><input type="number" min={1} step="0.01" value={basico} onChange={(e) => setBasico(e.target.value)} required /></Campo>
          <Campo etiqueta="Completo: además tienda en línea"><input type="number" min={1} step="0.01" value={completo} onChange={(e) => setCompleto(e.target.value)} required /></Campo>
          <p className="tenue pequeno">Hoy: {dinero(c.basico)} y {dinero(c.completo)}. Los cambios aplican a quien se suscriba después; las mensualidades ya autorizadas conservan su precio.</p>
          <div className="acciones"><button className="btn btn-primario">Guardar precios</button></div>
        </form>
      </div>
    </>
  );
}
