import { useState, type FormEvent } from 'react';
import { Aviso, Campo, Modal } from './ui';
import {
  anchoGuardado, enAppAndroid, escposTicket, guardarAncho, guardarImpresora, imprimirEnRed, imprimirTicket,
  impresoraGuardada, ticketPrueba, type AnchoTicket,
} from '../lib/ticket';

/** Configuración de la impresora de tickets de ESTE dispositivo (se guarda en el dispositivo, no en la cuenta). */
export default function ImpresoraTickets({ onCerrar }: { onCerrar: () => void }) {
  const guardada = impresoraGuardada();
  const app = enAppAndroid();
  const [ancho, setAncho] = useState<AnchoTicket>(anchoGuardado);
  const [ip, setIp] = useState(guardada?.ip || '');
  const [puerto, setPuerto] = useState(guardada?.puerto || 9100);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  function guardar(e?: FormEvent) {
    e?.preventDefault();
    guardarAncho(ancho);
    guardarImpresora(ip.trim() ? { ip: ip.trim(), puerto } : null);
    setError(''); setOk(ip.trim() ? 'Guardada. Los tickets se imprimirán directo en esta impresora.' : 'Guardado.');
  }

  function probar() {
    setError(''); setOk('');
    try {
      if (app && ip.trim()) imprimirEnRed(escposTicket(ticketPrueba(), ancho), { ip: ip.trim(), puerto });
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
            <p className="tenue pequeno">Impresora térmica conectada a la red (Wi-Fi o cable). Su IP sale en la hoja de configuración que imprime al encenderla manteniendo el botón FEED. Déjala vacía para usar la impresión de Android.</p>
            <div className="fila-campos">
              <Campo etiqueta="IP de la impresora"><input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.100" inputMode="decimal" autoComplete="off" /></Campo>
              <Campo etiqueta="Puerto"><input type="number" min={1} max={65535} value={puerto} onChange={(e) => setPuerto(Number(e.target.value) || 9100)} /></Campo>
            </div>
          </>
        ) : (
          <p className="tenue pequeno">
            En el navegador el ticket sale por la ventana de impresión del sistema. Para imprimir directo a una impresora térmica de red usa la app BarberaGo para Android.
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
