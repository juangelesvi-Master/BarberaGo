import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, mensajeError } from '../lib/datos';
import { horasDelDia, diasOcupados } from '../lib/api';
import { useCuenta } from '../lib/cuenta';
import type { Ajustes, Mascota, Reserva, Servicio, TipoServicio } from '../lib/tipos';
import { TALLAS, TIPOS_SERVICIO } from '../lib/tipos';
import { deIsoDia, diasEntre, fechaDia, fechaLarga, hoyIso, precio, sumarDiasIso, whatsapp } from '../lib/formato';
import { NEGOCIO } from '../lib/negocio';
import { Aviso, Cargando, Campo } from '../components/ui';
import { Kicker, Pagina } from '../components/Sitio';
import { FormularioAcceso } from './Entrar';
import FormMascota from '../components/FormMascota';

const TIPOS: TipoServicio[] = ['hotel', 'guarderia', 'estetica'];

export default function Reservar() {
  const { perfil, cargando, esPersonal } = useCuenta();
  const [params, setParams] = useSearchParams();
  const tipo: TipoServicio = TIPOS.includes(params.get('servicio') as TipoServicio) ? params.get('servicio') as TipoServicio : 'hotel';
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [mascotas, setMascotas] = useState<Mascota[] | null>(null);
  const [mascotaId, setMascotaId] = useState<string>('');
  const [nuevaMascota, setNuevaMascota] = useState(false);
  const [servicioId, setServicioId] = useState('');
  const [entrada, setEntrada] = useState('');
  const [salida, setSalida] = useState('');
  const [hora, setHora] = useState<string | null>(null);
  const [eligiendoFin, setEligiendoFin] = useState(false);
  const [notas, setNotas] = useState('');
  const [ocupacion, setOcupacion] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecha, setHecha] = useState<Reserva | null>(null);

  useEffect(() => { document.title = 'Reservar · CanSuites'; }, []);
  useEffect(() => {
    api.servicios().then(setServicios).catch((e) => setError(mensajeError(e)));
    api.ajustes().then(setAjustes).catch(() => {});
  }, []);

  // Mascotas del cliente; el personal puede llegar con ?mascota= para reservar a nombre de un cliente.
  useEffect(() => {
    if (!perfil) { setMascotas(null); return; }
    const pedida = params.get('mascota');
    (async () => {
      let ms = await api.mascotas();
      if (pedida && esPersonal && !ms.some((m) => m.id === pedida)) {
        const m = await api.mascota(pedida);
        if (m) ms = [m, ...ms];
      }
      setMascotas(ms);
      setMascotaId((actual) => actual || (pedida && ms.some((m) => m.id === pedida) ? pedida : ms[0]?.id || ''));
      if (!ms.length) setNuevaMascota(true);
    })().catch((e) => setError(mensajeError(e)));
  }, [perfil, esPersonal, params]);

  const mascota = mascotas?.find((m) => m.id === mascotaId) || null;
  const opciones = servicios.filter((s) => s.tipo === tipo);

  // Servicio elegido: en estética, el de la talla de la mascota (o la de ?talla=).
  useEffect(() => {
    if (tipo === 'estetica') {
      const talla = mascota?.talla || params.get('talla') || 'M';
      setServicioId(opciones.find((s) => s.talla === talla)?.id || opciones[0]?.id || '');
    } else if (!opciones.some((s) => s.id === servicioId)) {
      setServicioId(opciones[0]?.id || '');
    }
  }, [tipo, mascota?.talla, opciones.map((s) => s.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setEntrada(''); setSalida(''); setHora(null); setError(''); setEligiendoFin(false); }, [tipo]);

  const hoy = hoyIso();
  const servicio = servicios.find((s) => s.id === servicioId) || null;

  const cargarOcupacion = useCallback(async () => {
    if (tipo === 'estetica') {
      setOcupacion(entrada ? await api.ocupacionEstetica(entrada) : {});
    } else {
      setOcupacion(await api.ocupacion(tipo, hoy, sumarDiasIso(hoy, 90)));
    }
  }, [tipo, entrada, hoy]);
  useEffect(() => { cargarOcupacion().catch(() => {}); }, [cargarOcupacion]);

  const capacidad = tipo === 'hotel' ? ajustes?.capacidad_hotel ?? 0 : ajustes?.capacidad_guarderia ?? 0;
  const unidades = !entrada || !salida ? 0
    : tipo === 'hotel' ? diasEntre(entrada, salida)
      : tipo === 'guarderia' ? diasEntre(entrada, salida) + 1 : 1;
  const diasLlenos = useMemo(() => {
    if (tipo === 'estetica' || !entrada || !salida || unidades < 1) return [];
    return diasOcupados(tipo, entrada, salida).filter((d) => (ocupacion[d] || 0) >= capacidad);
  }, [tipo, entrada, salida, unidades, ocupacion, capacidad]);

  const listo = !!mascota && !!servicio && !!entrada && (tipo === 'estetica' ? !!hora : unidades >= 1 && diasLlenos.length === 0);

  async function confirmar() {
    if (!mascota || !servicio) return;
    setError(''); setEnviando(true);
    try {
      const r = await api.reservar({ mascota_id: mascota.id, servicio_id: servicio.id, entrada, salida: tipo === 'estetica' ? entrada : salida, hora, notas: notas.trim() || null });
      setHecha(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(mensajeError(e));
      cargarOcupacion().catch(() => {});
    }
    setEnviando(false);
  }

  if (hecha) return <Confirmacion r={hecha} mascota={mascota} ajustes={ajustes} />;

  return (
    <Pagina clase="reservar">
      <div className="titulo-seccion centro">
        <Kicker>Reserva en línea</Kicker>
        <h1>¿Qué necesita tu mejor amigo?</h1>
      </div>

      <div className="pestanas-servicio" role="tablist">
        {TIPOS.map((t) => (
          <button key={t} role="tab" aria-selected={t === tipo} className={t === tipo ? 'elegida' : ''}
            onClick={() => { params.set('servicio', t); params.delete('talla'); setParams(params, { replace: true }); }}>
            <span aria-hidden>{TIPOS_SERVICIO[t].icono}</span> {TIPOS_SERVICIO[t].nombre}
          </button>
        ))}
      </div>

      {cargando ? <Cargando /> : !perfil ? (
        <div className="reservar-acceso">
          <div>
            <h2>Entra o crea tu cuenta para reservar</h2>
            <p className="tenue">Así guardamos los datos de tu mascota, sus alergias y su expediente, y puedes ver o cancelar tus reservas cuando quieras.</p>
            <ul className="lista-precios">
              {opciones.map((s) => <li key={s.id}><span>{s.nombre}</span><strong>{precio(s.precio)}{tipo !== 'estetica' && <small>/{TIPOS_SERVICIO[tipo].unidad}</small>}</strong></li>)}
            </ul>
          </div>
          <FormularioAcceso inicial="registro" />
        </div>
      ) : (
        <div className="reservar-cuadricula">
          <div className="reservar-pasos">
            <section className="paso">
              <h2 className="paso-titulo"><span className="num-paso">1</span> Tu mascota</h2>
              {mascotas === null ? <Cargando /> : (
                <>
                  {mascotas.length > 0 && (
                    <div className="elegir-mascota">
                      {mascotas.map((m) => (
                        <button key={m.id} type="button" className={`opcion-mascota ${m.id === mascotaId && !nuevaMascota ? 'elegida' : ''}`} onClick={() => { setMascotaId(m.id); setNuevaMascota(false); }}>
                          <span className="avatar-mascota">{m.foto_url ? <img src={m.foto_url} alt="" /> : <span aria-hidden>🐶</span>}</span>
                          <strong>{m.nombre}</strong>
                          <small>{TALLAS.find((t) => t.id === m.talla)?.nombre}</small>
                        </button>
                      ))}
                      <button type="button" className={`opcion-mascota opcion-nueva ${nuevaMascota ? 'elegida' : ''}`} onClick={() => setNuevaMascota(true)}>
                        <span className="avatar-mascota" aria-hidden>＋</span><strong>Agregar</strong><small>otra mascota</small>
                      </button>
                    </div>
                  )}
                  {nuevaMascota && (
                    <div className="tarjeta mt">
                      <FormMascota breve onGuardada={(m) => { setMascotas([...(mascotas || []), m]); setMascotaId(m.id); setNuevaMascota(false); }}
                        onCancelar={mascotas.length ? () => setNuevaMascota(false) : undefined} />
                      <p className="tenue pequeno">Después puedes completar su ficha y expediente en <Link to="/cuenta">Mi cuenta</Link>.</p>
                    </div>
                  )}
                </>
              )}
            </section>

            {mascota && !nuevaMascota && (
              <section className="paso">
                <h2 className="paso-titulo"><span className="num-paso">2</span> {tipo === 'estetica' ? 'Servicio' : tipo === 'hotel' ? 'Tipo de suite' : 'Servicio'}</h2>
                <div className="opciones-servicio">
                  {opciones.map((s) => (
                    <button key={s.id} type="button" className={`opcion ${s.id === servicioId ? 'elegida' : ''}`} onClick={() => setServicioId(s.id)}>
                      <span className="opcion-linea"><strong>{s.nombre}</strong><span className="naranja">{precio(s.precio)}{tipo !== 'estetica' && <small>/{TIPOS_SERVICIO[tipo].unidad}</small>}</span></span>
                      {s.descripcion && <small className="tenue">{s.descripcion}</small>}
                      {tipo === 'estetica' && s.talla === mascota.talla && <small className="chip chip-ok">Talla de {mascota.nombre}</small>}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {mascota && !nuevaMascota && servicio && (
              <section className="paso">
                <h2 className="paso-titulo"><span className="num-paso">3</span> {tipo === 'estetica' ? 'Día y hora' : 'Fechas'}</h2>
                {tipo === 'estetica' ? (
                  <ElegirHora ajustes={ajustes} fecha={entrada} hora={hora} ocupacion={ocupacion}
                    onFecha={(f) => { setEntrada(f); setSalida(f); setHora(null); }} onHora={setHora} />
                ) : (
                  <>
                    <div className="fila-campos">
                      <Campo etiqueta={tipo === 'hotel' ? `Entrada (desde ${ajustes?.check_in || '10:00'})` : 'Primer día'}>
                        <input type="date" min={hoy} value={entrada} onChange={(e) => {
                          const v = e.target.value; setEntrada(v);
                          if (v && (!salida || salida <= v)) setSalida(tipo === 'hotel' ? sumarDiasIso(v, 1) : v);
                        }} />
                      </Campo>
                      <Campo etiqueta={tipo === 'hotel' ? `Salida (hasta ${ajustes?.check_out || '13:00'})` : 'Último día'}>
                        <input type="date" min={entrada ? (tipo === 'hotel' ? sumarDiasIso(entrada, 1) : entrada) : hoy} value={salida} onChange={(e) => setSalida(e.target.value)} />
                      </Campo>
                    </div>
                    <Disponibilidad tipo={tipo} ocupacion={ocupacion} capacidad={capacidad} entrada={entrada} salida={salida}
                      onElegir={(d) => {
                        // Primer toque: el primer día. Segundo toque: el último día (en hotel, la última noche).
                        if (!eligiendoFin || !entrada || d < entrada) {
                          setEntrada(d); setSalida(tipo === 'hotel' ? sumarDiasIso(d, 1) : d); setEligiendoFin(true);
                        } else {
                          setSalida(tipo === 'hotel' ? sumarDiasIso(d, 1) : d); setEligiendoFin(false);
                        }
                      }} />
                    {diasLlenos.length > 0 && <Aviso>No hay lugar {diasLlenos.length === 1 ? 'el' : 'los días'} {diasLlenos.map(fechaDia).join(', ')}. Prueba otras fechas o escríbenos por WhatsApp.</Aviso>}
                  </>
                )}
                <Campo etiqueta="Notas para el equipo (opcional)">
                  <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={tipo === 'estetica' ? 'Corte que te gusta, zonas sensibles…' : 'Horario de llegada, medicamentos, comida que traes…'} />
                </Campo>
              </section>
            )}
          </div>

          <aside className="resumen tarjeta">
            <h2>Tu reserva</h2>
            <dl>
              <dt>Mascota</dt><dd>{mascota && !nuevaMascota ? mascota.nombre : '—'}</dd>
              <dt>Servicio</dt><dd>{servicio?.nombre || '—'}</dd>
              <dt>{tipo === 'estetica' ? 'Cita' : 'Fechas'}</dt>
              <dd>
                {tipo === 'estetica'
                  ? (entrada ? `${fechaDia(entrada)}${hora ? ` · ${hora}` : ''}` : '—')
                  : (entrada && salida && unidades > 0 ? `${fechaDia(entrada)} → ${fechaDia(salida)}` : '—')}
              </dd>
              {tipo !== 'estetica' && unidades > 0 && <><dt>{TIPOS_SERVICIO[tipo].unidades[0].toUpperCase() + TIPOS_SERVICIO[tipo].unidades.slice(1)}</dt><dd>{unidades} × {precio(servicio?.precio)}</dd></>}
            </dl>
            <div className="resumen-total"><span>Total</span><strong>{precio((servicio?.precio || 0) * (unidades || (tipo === 'estetica' && hora ? 1 : 0)))}</strong></div>
            <p className="tenue pequeno">Pagas en CanSuites al llegar. Te confirmamos por WhatsApp.{tipo === 'estetica' ? ' Precio sujeto a revisión conforme al estado del perrito.' : ''}</p>
            <Aviso>{error}</Aviso>
            <button className="btn btn-primario ancho grande" disabled={!listo || enviando} onClick={confirmar}>{enviando ? 'Reservando…' : 'Confirmar reserva'}</button>
          </aside>
        </div>
      )}
    </Pagina>
  );
}

/** Calendario de los próximos días con los lugares libres de hotel o guardería. */
function Disponibilidad({ tipo, ocupacion, capacidad, entrada, salida, onElegir }: {
  tipo: 'hotel' | 'guarderia'; ocupacion: Record<string, number>; capacidad: number; entrada: string; salida: string; onElegir: (d: string) => void;
}) {
  const hoy = hoyIso();
  const inicio = deIsoDia(hoy);
  const dias = Array.from({ length: 35 }, (_, i) => sumarDiasIso(hoy, i));
  const relleno = (inicio.getDay() + 6) % 7;
  const enRango = (d: string) => entrada && salida && d >= entrada && (tipo === 'hotel' ? d < salida : d <= salida);
  return (
    <div className="calendario-disp">
      <div className="calendario-leyenda"><span><i className="libre" /> Hay lugar</span><span><i className="pocos" /> Últimos lugares</span><span><i className="lleno" /> Lleno</span></div>
      <div className="calendario">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <b key={i}>{d}</b>)}
        {Array.from({ length: relleno }, (_, i) => <span key={`r${i}`} />)}
        {dias.map((d) => {
          const libres = capacidad - (ocupacion[d] || 0);
          const estado = libres <= 0 ? 'lleno' : libres <= Math.max(1, Math.round(capacidad * 0.2)) ? 'pocos' : 'libre';
          return (
            <button key={d} type="button" className={`dia-cal ${estado} ${enRango(d) ? 'en-rango' : ''} ${d === entrada ? 'extremo' : ''}`}
              disabled={estado === 'lleno'} onClick={() => onElegir(d)} title={`${fechaLarga(deIsoDia(d))}: ${Math.max(0, libres)} lugares`}>
              {deIsoDia(d).getDate()}
            </button>
          );
        })}
      </div>
      <p className="tenue pequeno">Toca el primer día y luego el último. {tipo === 'hotel' ? 'Cada día marcado es una noche.' : ''}</p>
    </div>
  );
}

function ElegirHora({ ajustes, fecha, hora, ocupacion, onFecha, onHora }: {
  ajustes: Ajustes | null; fecha: string; hora: string | null; ocupacion: Record<string, number>; onFecha: (f: string) => void; onHora: (h: string) => void;
}) {
  if (!ajustes) return <Cargando />;
  const hoy = hoyIso();
  const dias = Array.from({ length: 21 }, (_, i) => sumarDiasIso(hoy, i)).filter((d) => horasDelDia(ajustes, d).length > 0);
  const ahora = new Date().toTimeString().slice(0, 5);
  const horas = fecha ? horasDelDia(ajustes, fecha) : [];
  return (
    <>
      <div className="dias-scroll">
        {dias.map((d) => {
          const f = deIsoDia(d);
          return (
            <button key={d} type="button" className={`dia ${d === fecha ? 'elegida' : ''}`} onClick={() => onFecha(d)}>
              <small>{f.toLocaleDateString('es-MX', { weekday: 'short' })}</small>
              <strong>{f.getDate()}</strong>
              <small>{f.toLocaleDateString('es-MX', { month: 'short' })}</small>
            </button>
          );
        })}
      </div>
      {fecha && (
        <div className="horas">
          {horas.map((h) => {
            const llena = (ocupacion[h] || 0) >= ajustes.estetica_simultaneos || (fecha === hoy && h <= ahora);
            return <button key={h} type="button" className={`hora ${h === hora ? 'elegida' : ''} ${llena ? 'ocupada' : ''}`} disabled={llena} onClick={() => onHora(h)}>{h}</button>;
          })}
        </div>
      )}
    </>
  );
}

function Confirmacion({ r, mascota, ajustes }: { r: Reserva; mascota: Mascota | null; ajustes: Ajustes | null }) {
  const cuando = r.tipo === 'estetica'
    ? `${fechaLarga(deIsoDia(r.entrada))} a las ${r.hora}`
    : r.tipo === 'hotel'
      ? `del ${fechaLarga(deIsoDia(r.entrada))} al ${fechaLarga(deIsoDia(r.salida))} (${r.unidades} ${r.unidades === 1 ? 'noche' : 'noches'})`
      : r.unidades === 1 ? `el ${fechaLarga(deIsoDia(r.entrada))}` : `del ${fechaLarga(deIsoDia(r.entrada))} al ${fechaLarga(deIsoDia(r.salida))} (${r.unidades} días)`;
  const mensaje = `Hola CanSuites, hice la reserva #${r.folio} de ${r.servicio_nombre} para ${mascota?.nombre || r.mascota_nombre} ${cuando}.`;
  return (
    <Pagina angosta>
      <div className="tarjeta confirmacion centro">
        <div className="palomita" aria-hidden>🐾</div>
        <h1>¡Reserva recibida!</h1>
        <p className="tenue">Folio #{r.folio}</p>
        <p><strong>{r.servicio_nombre}</strong> para <strong>{mascota?.nombre || r.mascota_nombre}</strong><br />{cuando}</p>
        <p className="total-grande">{precio(r.total)}</p>
        {r.tipo === 'hotel' && ajustes && <p className="tenue pequeno">Entrada desde las {ajustes.check_in} · salida hasta las {ajustes.check_out}. Trae su cartilla de vacunación y su comida.</p>}
        <p className="tenue">{r.estado === 'pendiente' ? 'Te confirmaremos por WhatsApp. Si quieres, escríbenos ahora para agilizarlo.' : 'Tu reserva ya está confirmada.'}</p>
        <div className="acciones centro-acciones">
          <a className="btn btn-whatsapp" href={whatsapp(NEGOCIO.whatsapp, mensaje)!} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
          <Link className="btn btn-primario" to="/cuenta">Ver mis reservas</Link>
        </div>
      </div>
    </Pagina>
  );
}
