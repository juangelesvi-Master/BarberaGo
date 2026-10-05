import { useState, type FormEvent } from 'react';
import { Aviso, Campo, Modal } from './ui';
import {
  anchoGuardado, appConBluetooth, enAppAndroid, escposTicket, guardarAncho, guardarImpresora, imprimirEnImpresora,
  imprimirTicket, impresoraGuardada, listarBluetooth, ticketPrueba, type AnchoTicket, type Impresora,
} from '../lib/ticket';

type Conexion = 'android' | 'red' | 'bluetooth';
const CONEXIONES: { valor: Conexion; texto: string }[] = [
  { valor: 'android', texto: 'Android' }, { valor: 'red', texto: 'Red (IP)' }, { valor: 'bluetooth', texto: 'Bluetooth' },
];

/** Configuración de la impresora de tickets de ESTE dispositivo (se guarda en el dispositivo, no en la cuenta). */
export default function ImpresoraTickets({ onCerrar }: { onCerrar: () => void }) {
  const guardada = impresoraGuardada();
  const app = enAppAndroid();
  const conBt = appConBluetooth();
  const [ancho, setAncho] = useState<AnchoTicket>(anchoGuardado);
  const [conexion, setConexion] = useState<Conexion>(guardada?.tipo || 'android');
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

  function probar() {
    setError(''); setOk('');
    try {
      const imp = elegida();
      if (app && imp) imprimirEnImpresora(escposTicket(ticketPrueba(), ancho), imp);
      else imprimirTicket(ticketPrueba(), ancho);
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
          <p className="tenue pequeno">
            En el navegador el ticket sale por la ventana de impresión del sistema. Para imprimir directo a una impresora térmica de red o Bluetooth usa la app BarberaGo para Android.
            En iPhone o iPad la impresora necesita AirPrint.
          </p>
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
