import { useEffect, useState, type FormEvent } from 'react';
import { api, mensajeError } from '../../lib/datos';
import { horasDelDia } from '../../lib/api';
import type { ClienteConMascotas } from '../../lib/api';
import type { Ajustes, Reserva, Servicio, Talla, TipoServicio } from '../../lib/tipos';
import { TALLAS, TIPOS_SERVICIO } from '../../lib/tipos';
import { diasEntre, hoyIso, precio, sumarDiasIso } from '../../lib/formato';
import { Aviso, Campo, Modal } from '../../components/ui';

/**
 * Reserva capturada en recepción: para clientes con cuenta que llegan sin reserva y para quienes no tienen
 * cuenta (se les da de alta con nombre y teléfono). La reserva queda confirmada; si es para hoy se puede
 * marcar de una vez que ya llegó.
 */
export default function NuevaReservaAdmin({ fecha, onCerrar, onCreada }: { fecha?: string; onCerrar: () => void; onCreada: (r: Reserva) => void }) {
  const hoy = hoyIso();
  const inicio = fecha && fecha >= hoy ? fecha : hoy;

  const [modo, setModo] = useState<'buscar' | 'nuevo'>('buscar');
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ClienteConMascotas[] | null>(null);
  const [cliente, setCliente] = useState<ClienteConMascotas | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', telefono: '', email: '' });

  const [mascotaId, setMascotaId] = useState<string>('nueva');
  const [mascotaNueva, setMascotaNueva] = useState<{ nombre: string; raza: string; talla: Talla }>({ nombre: '', raza: '', talla: 'M' });

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [tipo, setTipo] = useState<TipoServicio>('hotel');
  const [servicioId, setServicioId] = useState('');
  const [entrada, setEntrada] = useState(inicio);
  const [salida, setSalida] = useState(sumarDiasIso(inicio, 1));
  const [hora, setHora] = useState<string | null>(null);
  const [ocupacion, setOcupacion] = useState<Record<string, number>>({});
  const [notas, setNotas] = useState('');
  const [llego, setLlego] = useState(true);

  // Lo que ya se dio de alta en un intento anterior (por ejemplo, si no había lugar), para no duplicarlo.
  const [creados, setCreados] = useState<{ cliente?: string; mascota?: string }>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.servicios().then(setServicios).catch((e) => setError(mensajeError(e)));
    api.ajustes().then(setAjustes).catch(() => {});
  }, []);

  useEffect(() => {
    if (modo !== 'buscar' || cliente) return;
    const t = setTimeout(() => {
      if (!q.trim()) { setResultados(null); return; }
      api.clientes(q).then((r) => setResultados(r.slice(0, 8))).catch(() => setResultados([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, modo, cliente]);

  const mascotas = modo === 'buscar' ? cliente?.mascotas || [] : [];
  const mascota = mascotas.find((m) => m.id === mascotaId) || null;
  const talla = mascota?.talla || mascotaNueva.talla;
  const opciones = servicios.filter((s) => s.tipo === tipo);

  // Al cambiar de servicio o de mascota: en estética, el de su talla.
  useEffect(() => {
    if (opciones.some((s) => s.id === servicioId) && tipo !== 'estetica') return;
    setServicioId((tipo === 'estetica' && opciones.find((s) => s.talla === talla)?.id) || opciones[0]?.id || '');
  }, [tipo, talla, opciones.map((s) => s.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guardería: por omisión solo el día de entrada (lo normal en quien llega sin reserva).
  useEffect(() => { if (tipo === 'guarderia') setSalida(entrada); }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tipo === 'hotel' && salida <= entrada) setSalida(sumarDiasIso(entrada, 1));
    if (tipo === 'guarderia' && salida < entrada) setSalida(entrada);
  }, [tipo, entrada]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tipo !== 'estetica') return;
    setHora(null);
    api.ocupacionEstetica(entrada).then(setOcupacion).catch(() => setOcupacion({}));
  }, [tipo, entrada]);

  const servicio = servicios.find((s) => s.id === servicioId) || null;
  const unidades = tipo === 'hotel' ? diasEntre(entrada, salida) : tipo === 'guarderia' ? diasEntre(entrada, salida) + 1 : 1;
  const horas = ajustes && tipo === 'estetica' ? horasDelDia(ajustes, entrada) : [];

  function elegirCliente(c: ClienteConMascotas) {
    setCliente(c);
    setMascotaId(c.mascotas[0]?.id || 'nueva');
    setCreados({});
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (modo === 'buscar' && !cliente) { setError('Elige al cliente o da de alta uno nuevo'); return; }
    if (mascotaId === 'nueva' && !mascotaNueva.nombre.trim()) { setError('Escribe el nombre de la mascota'); return; }
    if (!servicio) { setError('Elige el servicio'); return; }
    if (tipo === 'estetica' && !hora) { setError('Elige la hora'); return; }
    if (tipo !== 'estetica' && unidades < 1) { setError(tipo === 'hotel' ? 'La salida debe ser después de la entrada' : 'El último día no puede ser antes del primero'); return; }
    setGuardando(true);
    try {
      let clienteId = modo === 'buscar' ? cliente!.id : creados.cliente;
      if (!clienteId) {
        const p = await api.altaClienteMostrador({ nombre: nuevo.nombre.trim(), telefono: nuevo.telefono.trim() || null, email: nuevo.email.trim() || null });
        clienteId = p.id;
        setCreados((c) => ({ ...c, cliente: p.id }));
      }
      let idMascota = mascotaId !== 'nueva' ? mascotaId : creados.mascota;
      if (!idMascota) {
        const m = await api.guardarMascota({ dueno_id: clienteId, nombre: mascotaNueva.nombre.trim(), raza: mascotaNueva.raza.trim() || null, talla: mascotaNueva.talla });
        idMascota = m.id;
        setCreados((c) => ({ ...c, mascota: m.id }));
      }
      const r = await api.reservar({
        mascota_id: idMascota, servicio_id: servicio.id, entrada, salida: tipo === 'estetica' ? entrada : salida,
        hora: tipo === 'estetica' ? hora : null, notas: notas.trim() || null,
      });
      if (llego && entrada === hoy) {
        await api.estadoReserva(r.id, 'en_curso');
        r.estado = 'en_curso';
      }
      onCreada(r);
    } catch (err) {
      setError(mensajeError(err));
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Nueva reserva" onCerrar={onCerrar} ancho={640}>
      <form className="formulario" onSubmit={guardar}>
        <h3>Cliente</h3>
        <div className="segmentado">
          <button type="button" className={modo === 'buscar' ? 'activo' : ''} onClick={() => { setModo('buscar'); setMascotaId(cliente?.mascotas[0]?.id || 'nueva'); }}>Ya es cliente</button>
          <button type="button" className={modo === 'nuevo' ? 'activo' : ''} onClick={() => { setModo('nuevo'); setMascotaId('nueva'); }}>Cliente nuevo</button>
        </div>
        {modo === 'buscar' ? (
          cliente ? (
            <div className="opcion elegida">
              <div className="opcion-linea">
                <strong>{cliente.nombre}</strong>
                <button type="button" className="btn-texto pequeno" onClick={() => { setCliente(null); setMascotaId('nueva'); }}>Cambiar</button>
              </div>
              <small className="tenue">{[cliente.telefono, cliente.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small>
            </div>
          ) : (
            <>
              <input className="buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, teléfono, correo o nombre del perro" autoFocus />
              {resultados && (resultados.length === 0
                ? <p className="tenue pequeno">No lo encontramos. Usa «Cliente nuevo».</p>
                : (
                  <div className="opciones-servicio">
                    {resultados.map((c) => (
                      <button type="button" key={c.id} className="opcion" onClick={() => elegirCliente(c)}>
                        <span className="opcion-linea"><strong>{c.nombre}</strong><small>{c.mascotas.map((m) => m.nombre).join(', ')}</small></span>
                        <small className="tenue">{[c.telefono, c.email].filter(Boolean).join(' · ')}</small>
                      </button>
                    ))}
                  </div>
                ))}
            </>
          )
        ) : (
          <>
            <div className="fila-campos">
              <Campo etiqueta="Nombre"><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required autoFocus /></Campo>
              <Campo etiqueta="WhatsApp"><input type="tel" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} placeholder="442 123 4567" /></Campo>
            </div>
            <Campo etiqueta="Correo (opcional)" ayuda="Si lo das, después puede entrar a su cuenta con «Olvidé mi contraseña» y ver el expediente de su perro.">
              <input type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
            </Campo>
          </>
        )}

        {(modo === 'nuevo' || cliente) && (
          <>
            <h3>Mascota</h3>
            {mascotas.length > 0 && (
              <div className="chips-filtro">
                {mascotas.map((m) => (
                  <button type="button" key={m.id} className={m.id === mascotaId ? 'elegida' : ''} onClick={() => setMascotaId(m.id)}>
                    🐶 {m.nombre} <small>· {m.talla}</small>
                  </button>
                ))}
                <button type="button" className={mascotaId === 'nueva' ? 'elegida' : ''} onClick={() => setMascotaId('nueva')}>＋ Otra</button>
              </div>
            )}
            {mascotaId === 'nueva' && (
              <div className="fila-campos">
                <Campo etiqueta="Nombre del perro"><input value={mascotaNueva.nombre} onChange={(e) => setMascotaNueva({ ...mascotaNueva, nombre: e.target.value })} /></Campo>
                <Campo etiqueta="Raza"><input value={mascotaNueva.raza} onChange={(e) => setMascotaNueva({ ...mascotaNueva, raza: e.target.value })} placeholder="Mestizo, Labrador…" /></Campo>
                <Campo etiqueta="Talla">
                  <select value={mascotaNueva.talla} onChange={(e) => setMascotaNueva({ ...mascotaNueva, talla: e.target.value as Talla })}>
                    {TALLAS.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.peso})</option>)}
                  </select>
                </Campo>
              </div>
            )}

            <h3>Servicio</h3>
            <div className="chips-filtro">
              {(Object.keys(TIPOS_SERVICIO) as TipoServicio[]).map((t) => (
                <button type="button" key={t} className={t === tipo ? 'elegida' : ''} onClick={() => setTipo(t)}>{TIPOS_SERVICIO[t].icono} {TIPOS_SERVICIO[t].nombre}</button>
              ))}
            </div>
            <div className="fila-campos">
              <Campo etiqueta="Servicio">
                <select value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
                  {opciones.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {precio(s.precio)}</option>)}
                </select>
              </Campo>
              <Campo etiqueta={tipo === 'hotel' ? 'Entrada' : tipo === 'guarderia' ? 'Primer día' : 'Día'}>
                <input type="date" min={hoy} value={entrada} onChange={(e) => e.target.value && setEntrada(e.target.value)} />
              </Campo>
              {tipo !== 'estetica' && (
                <Campo etiqueta={tipo === 'hotel' ? 'Salida' : 'Último día'}>
                  <input type="date" min={tipo === 'hotel' ? sumarDiasIso(entrada, 1) : entrada} value={salida} onChange={(e) => e.target.value && setSalida(e.target.value)} />
                </Campo>
              )}
            </div>
            {tipo === 'estetica' && (horas.length === 0 ? <p className="tenue pequeno">Ese día no hay horario de estética.</p> : (
              <div className="horas">
                {horas.map((h) => {
                  const llena = (ocupacion[h] || 0) >= (ajustes?.estetica_simultaneos || 0);
                  return <button key={h} type="button" className={`hora ${h === hora ? 'elegida' : ''} ${llena ? 'ocupada' : ''}`} disabled={llena} onClick={() => setHora(h)}>{h}</button>;
                })}
              </div>
            ))}
            <Campo etiqueta="Notas (opcional)"><input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Comida, medicamentos, quién lo recoge…" /></Campo>
            {entrada === hoy && (
              <label className="check"><input type="checkbox" checked={llego} onChange={(e) => setLlego(e.target.checked)} /> Ya está aquí (registrar {tipo === 'hotel' ? 'check-in' : 'llegada'} ahora)</label>
            )}
            {servicio && unidades >= 1 && (
              <div className="resumen-total">
                <span>{tipo === 'estetica' ? servicio.nombre : `${unidades} ${unidades === 1 ? TIPOS_SERVICIO[tipo].unidad : TIPOS_SERVICIO[tipo].unidades} × ${precio(servicio.precio)}`}</span>
                <strong>{precio(servicio.precio * unidades)}</strong>
              </div>
            )}
          </>
        )}

        <Aviso>{error}</Aviso>
        <div className="acciones">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primario" disabled={guardando || (modo === 'buscar' && !cliente)}>{guardando ? 'Guardando…' : 'Crear reserva'}</button>
        </div>
      </form>
    </Modal>
  );
}
