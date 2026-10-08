import { useEffect, useState, type FormEvent } from 'react';
import { Aviso, Campo, Modal } from './ui';
import { useNegocio } from '../lib/sesion';
import {
  anchoGuardado, appConBluetooth, crearCodigoPuente, DESCARGA_PUENTE, enAppAndroid, estadoPuente, estadoPuenteNube, escposTicket,
  vincularPuenteLocal, type EstadoPuenteNube, guardarAncho, guardarImpresora, imprimirEnImpresora,
  imprimirTicket, impresoraGuardada, listarBluetooth, ticketPrueba, type AnchoTicket, type Impresora,
} from '../lib/ticket';

type Conexion = 'android' | 'red' | 'bluetooth';
const CONEXIONES: { valor: Conexion; texto: string }[] = [
  { valor: 'android', texto: 'Android' }, { valor: 'red', texto: 'Red (IP)' }, { valor: 'bluetooth', texto: 'Bluetooth' },
];
// En el navegador: ventana de impresión del sistema, o impresora de red por el puente.
const CONEXIONES_WEB: { valor: Conexion; texto: string }[] = [
  { valor: 'android', texto: 'Navegador' }, { valor: 'red', texto: 'Red (IP)' },
];

/** Configuración de la impresora de tickets de ESTE dispositivo (se guarda en el dispositivo, no en la cuenta). */
export default function ImpresoraTickets({ onCerrar }: { onCerrar: () => void }) {
  const guardada = impresoraGuardada();
  const app = enAppAndroid();
  const conBt = appConBluetooth();
  const [ancho, setAncho] = useState<AnchoTicket>(anchoGuardado);
  const [conexion, setConexion] = useState<Conexion>(guardada?.tipo === 'bluetooth' && !app ? 'android' : guardada?.tipo || 'android');
  const { negocio, miembro } = useNegocio();
  const esAdmin = miembro.rol === 'admin';
  // Puente de impresión (solo en el navegador): el de la barbería en la nube y el de esta computadora.
  const [nube, setNube] = useState<EstadoPuenteNube | null | undefined>(undefined);
  const [local, setLocal] = useState<{ version: string; vinculado: boolean } | null>(null);
  const [codigo, setCodigo] = useState('');
  const verPuente = !app && conexion === 'red';
  useEffect(() => {
    if (!verPuente) return;
    let vivo = true;
    const revisar = () => Promise.all([estadoPuenteNube(negocio.id), estadoPuente()]).then(([n, l]) => { if (vivo) { setNube(n); setLocal(l); } });
    revisar();
    const t = setInterval(revisar, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [verPuente, negocio.id]);

  async function instalarPuente() {
    setError(''); setOk('');
    if (nube?.configurado && !confirm('Se creará un código nuevo y el puente actual dejará de funcionar hasta que le pongas el nuevo. ¿Continuar?')) return;
    try {
      const c = await crearCodigoPuente(negocio.id);
      if (local) {
        await vincularPuenteLocal(c);
        setCodigo('');
        setOk('Listo: esta computadora quedó como puente de impresión de la barbería.');
      } else setCodigo(c);
      setNube(await estadoPuenteNube(negocio.id));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  const [ip, setIp] = useState(guardada?.tipo === 'red' ? guardada.ip : '');
  const [puerto, setPuerto] = useState(guardada?.tipo === 'red' ? guardada.puerto : 9100);
  const [bt, setBt] = useState(guardada?.tipo === 'bluetooth' ? { mac: guardada.mac, nombre: guardada.nombre } : null);
  const [emparejadas, setEmparejadas] = useState<{ nombre: string; mac: string }[] | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  function elegida(): Impresora | null {
    if (conexion === 'red' && ip.trim()) return { tipo: 'red', ip: ip.trim(), puerto };
    if (conexion === 'bluetooth' && bt) return { tipo: 'bluetooth', ...bt };
    return null;
  }

  function guardar(e?: FormEvent) {
    e?.preventDefault();
    setError(''); setOk('');
    if (conexion === 'bluetooth' && !bt) { setError('Elige la impresora Bluetooth de la lista.'); return; }
    guardarAncho(ancho);
    const imp = elegida();
    guardarImpresora(imp);
    setOk(imp ? 'Guardada. Los tickets se imprimirán directo en esta impresora.' : 'Guardado.');
  }

  function buscar() {
    setError(''); setOk('');
    try {
      const lista = listarBluetooth();
      setEmparejadas(lista);
      if (!lista.length) setError('No hay dispositivos emparejados. Empareja la impresora en los ajustes de Bluetooth de Android y vuelve a buscar.');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function probar() {
    setError(''); setOk('');
    try {
      const imp = elegida();
      if (imp) await imprimirEnImpresora(escposTicket(ticketPrueba(), ancho), imp, negocio.id);
      else await imprimirTicket(ticketPrueba(), ancho, negocio.id);
      setOk('Ticket de prueba enviado.');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  return (
    <Modal titulo="Impresora de tickets" onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <div className="campo">
          <span>Ancho del papel</span>
          <div className="segmentado" role="radiogroup" aria-label="Ancho del papel">
            {(['58', '80'] as AnchoTicket[]).map((a) => (
              <button type="button" key={a} role="radio" aria-checked={ancho === a} className={ancho === a ? 'activo' : ''} onClick={() => setAncho(a)}>{a} mm</button>
            ))}
          </div>
        </div>
        {app ? (
          <>
            <div className="campo">
              <span>Conexión</span>
              <div className="segmentado" role="radiogroup" aria-label="Conexión">
                {CONEXIONES.map((c) => (
                  <button type="button" key={c.valor} role="radio" aria-checked={conexion === c.valor} className={conexion === c.valor ? 'activo' : ''}
                    onClick={() => { setConexion(c.valor); setError(''); setOk(''); }}>{c.texto}</button>
                ))}
              </div>
            </div>
            {conexion === 'android' && (
              <p className="tenue pequeno">El ticket sale por la impresión de Android (Mopria o la app de la marca de tu impresora).</p>
            )}
            {conexion === 'red' && (
              <>
                <p className="tenue pequeno">Impresora térmica conectada a la red (Wi-Fi o cable). Su IP sale en la hoja de configuración que imprime al encenderla manteniendo el botón FEED.</p>
                <div className="fila-campos">
                  <Campo etiqueta="IP de la impresora"><input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.100" inputMode="decimal" autoComplete="off" /></Campo>
                  <Campo etiqueta="Puerto"><input type="number" min={1} max={65535} value={puerto} onChange={(e) => setPuerto(Number(e.target.value) || 9100)} /></Campo>
                </div>
              </>
            )}
            {conexion === 'bluetooth' && (conBt ? (
              <>
                <p className="tenue pequeno">Primero empareja la impresora en los ajustes de Bluetooth de Android (el PIN suele ser 0000 o 1234). Luego búscala aquí.</p>
                {bt && <p className="pequeno">Elegida: <b>{bt.nombre}</b> <span className="tenue">({bt.mac})</span></p>}
                <button type="button" className="btn" onClick={buscar}>Buscar impresoras emparejadas</button>
                {emparejadas && emparejadas.length > 0 && (
                  <div className="segmentado vertical" role="radiogroup" aria-label="Impresoras emparejadas">
                    {emparejadas.map((d) => (
                      <button type="button" key={d.mac} role="radio" aria-checked={bt?.mac === d.mac} className={bt?.mac === d.mac ? 'activo' : ''}
                        onClick={() => setBt(d)}>{d.nombre}</button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="tenue pequeno">Para imprimir por Bluetooth actualiza la app: cierra sesión y toca “Actualizar la app”, o descárgala de nuevo desde barberago.restorago.com.</p>
            ))}
          </>
        ) : (
          <>
            <div className="campo">
              <span>Conexión</span>
              <div className="segmentado" role="radiogroup" aria-label="Conexión">
                {CONEXIONES_WEB.map((c) => (
                  <button type="button" key={c.valor} role="radio" aria-checked={conexion === c.valor} className={conexion === c.valor ? 'activo' : ''}
                    onClick={() => { setConexion(c.valor); setError(''); setOk(''); }}>{c.texto}</button>
                ))}
              </div>
            </div>
            {conexion === 'android' ? (
              <p className="tenue pequeno">
                El ticket sale por la ventana de impresión del sistema. En iPhone o iPad la impresora necesita AirPrint.
              </p>
            ) : (
              <>
                <p className="tenue pequeno">Impresora térmica conectada a la red (Wi-Fi o cable). Su IP sale en la hoja de configuración que imprime al encenderla manteniendo el botón FEED.</p>
                <div className="fila-campos">
                  <Campo etiqueta="IP de la impresora"><input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.100" inputMode="decimal" autoComplete="off" /></Campo>
                  <Campo etiqueta="Puerto"><input type="number" min={1} max={65535} value={puerto} onChange={(e) => setPuerto(Number(e.target.value) || 9100)} /></Campo>
                </div>
                <div className={`puente ${nube?.activo ? 'puente-ok' : ''}`}>
                  {nube === undefined ? <span className="tenue pequeno">Revisando el puente de impresión…</span> : nube?.activo ? (
                    <span className="pequeno">✓ Puente encendido{nube.equipo && ` en ${nube.equipo}`}. Cualquier celular, tablet o computadora de la barbería imprime por él.</span>
                  ) : (
                    <>
                      <p className="pequeno">
                        {nube?.configurado
                          ? <><b>El puente está apagado.</b> Ábrelo en la computadora de la barbería{nube.equipo && ` (${nube.equipo})`} para que salgan los tickets.</>
                          : <><b>Falta el puente de impresión.</b> Ningún navegador puede hablar directo con una impresora de red; un programa en una computadora de la barbería (con Windows y en la misma red) imprime por todos los dispositivos, como en RestoraGo.</>}
                      </p>
                      {!nube?.configurado && (esAdmin ? (
                        <ol className="pequeno">
                          <li>En la computadora de la barbería descarga el puente y ábrelo. Si Windows avisa, toca “Más información” y “Ejecutar de todas formas”.</li>
                          <li>Toca “Instalar puente” (si lo haces en esa misma computadora se conecta solo; si no, pega el código en la ventana del puente).</li>
                          <li>Deja abierta la ventana del puente (puedes minimizarla).</li>
                        </ol>
                      ) : <p className="tenue pequeno">Pide al administrador de la barbería que lo instale.</p>)}
                      {local && !nube?.configurado && <p className="tenue pequeno">Mientras tanto, esta computadora ya puede imprimir con su puente.</p>}
                      <div className="acciones-fila">
                        <a className="btn btn-chico" href={DESCARGA_PUENTE} download="BarberaGoPuente.exe">Descargar puente para Windows</a>
                        {esAdmin && !nube?.configurado && <button type="button" className="btn btn-chico btn-primario" onClick={instalarPuente}>Instalar puente</button>}
                      </div>
                    </>
                  )}
                  {codigo && (
                    <div className="codigo-puente">
                      <p className="pequeno">Pega este código en la ventana del puente (se muestra una sola vez):</p>
                      <code>{codigo}</code>
                      <button type="button" className="btn btn-chico" onClick={() => navigator.clipboard?.writeText(codigo).then(() => setOk('Código copiado.'))}>Copiar código</button>
                    </div>
                  )}
                  {esAdmin && nube?.configurado && (
                    <button type="button" className="btn-texto pequeno" onClick={instalarPuente}>{local && !local.vinculado ? 'Usar esta computadora como puente' : 'Cambiar el código del puente'}</button>
                  )}
                </div>
                <p className="tenue pequeno">En tablets y celulares Android también puedes usar la app BarberaGo, que imprime directo sin puente.</p>
              </>
            )}
          </>
        )}
        <Aviso>{error}</Aviso>
        <Aviso tipo="ok">{ok}</Aviso>
        <div className="acciones">
          <button type="button" className="btn" onClick={probar}>Imprimir prueba</button>
          <button className="btn btn-primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}
