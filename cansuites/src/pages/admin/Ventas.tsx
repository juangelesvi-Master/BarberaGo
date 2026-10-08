import { useEffect, useMemo, useState } from 'react';
import { api, mensajeError } from '../../lib/datos';
import { useCuenta } from '../../lib/cuenta';
import type { ReporteVentas } from '../../lib/tipos';
import { TIPOS_SERVICIO } from '../../lib/tipos';
import { deIsoDia, diasEntre, fechaDia, hoyIso, isoDia, precio, sumarDiasIso } from '../../lib/formato';
import { Aviso, Cabecera, Campo, Cargando, Vacio } from '../../components/ui';

type Periodo = 'hoy' | 'semana' | 'mes' | 'mes_pasado' | 'otro';
const PERIODOS: [Periodo, string][] = [['hoy', 'Hoy'], ['semana', '7 días'], ['mes', 'Este mes'], ['mes_pasado', 'Mes pasado'], ['otro', 'Otro']];

function rango(p: Periodo): [string, string] {
  const hoy = hoyIso();
  const d = deIsoDia(hoy);
  if (p === 'hoy') return [hoy, hoy];
  if (p === 'semana') return [sumarDiasIso(hoy, -6), hoy];
  if (p === 'mes') return [isoDia(new Date(d.getFullYear(), d.getMonth(), 1)), hoy];
  return [isoDia(new Date(d.getFullYear(), d.getMonth() - 1, 1)), isoDia(new Date(d.getFullYear(), d.getMonth(), 0))];
}

/** Reporte de ventas: reservas terminadas (check-out / entregado) y pedidos entregados, por el día en que se cerraron. */
export default function Ventas() {
  const { perfil } = useCuenta();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [[desde, hasta], setRango] = useState(rango('mes'));
  const [r, setR] = useState<ReporteVentas | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (desde > hasta) return;
    setR(null); setError('');
    api.reporteVentas(desde, hasta).then(setR).catch((e) => setError(mensajeError(e)));
  }, [desde, hasta]);

  if (perfil?.rol !== 'admin') return <Vacio>Solo el administrador ve el reporte de ventas.</Vacio>;

  function elegir(p: Periodo) {
    setPeriodo(p);
    if (p !== 'otro') setRango(rango(p));
  }
  const total = r ? r.servicios.total + r.tienda.total : 0;
  const ventas = r ? r.servicios.cantidad + r.tienda.cantidad : 0;

  function descargar() {
    if (!r) return;
    const filas: (string | number)[][] = [
      ['Reporte de ventas CanSuites', `${desde} a ${hasta}`], [],
      ['Día', 'Servicios', 'Tienda', 'Total'],
      ...r.por_dia.map((d) => [d.dia, d.servicios, d.tienda, d.servicios + d.tienda]), [],
      ['Servicio', 'Tipo', 'Reservas', 'Noches/días', 'Total'],
      ...r.por_servicio.map((s) => [s.nombre, TIPOS_SERVICIO[s.tipo].nombre, s.cantidad, s.unidades, s.total]), [],
      ['Producto', 'Piezas', 'Total'],
      ...r.productos.map((p) => [p.nombre, p.cantidad, p.total]), [],
      ['Total vendido', total], ['Cobrado en línea', r.servicios.en_linea], ['Reembolsado', r.reembolsos.total],
    ];
    const csv = filas.map((f) => f.map((c) => (typeof c === 'number' ? String(c) : `"${String(c).replace(/"/g, '""')}"`)).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `ventas-cansuites-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Cabecera titulo="Ventas">
        <button className="btn" onClick={descargar} disabled={!r}>Descargar (Excel)</button>
      </Cabecera>
      <div className="filtros filtros-ventas">
        <div className="segmentado">
          {PERIODOS.map(([p, t]) => <button key={p} className={periodo === p ? 'activo' : ''} onClick={() => elegir(p)}>{t}</button>)}
        </div>
        {periodo === 'otro' && (
          <>
            <Campo etiqueta="Desde"><input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setRango([e.target.value, hasta])} /></Campo>
            <Campo etiqueta="Hasta"><input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setRango([desde, e.target.value])} /></Campo>
          </>
        )}
      </div>
      <Aviso>{error}</Aviso>
      {!r ? (!error && <Cargando />) : (
        <>
          <div className="kpis">
            <div className="kpi"><span>Total vendido</span><strong>{precio(total)}</strong><small className="tenue">{ventas} {ventas === 1 ? 'venta' : 'ventas'}</small></div>
            <div className="kpi"><span>Servicios</span><strong>{precio(r.servicios.total)}</strong><small className="tenue">{r.servicios.cantidad} {r.servicios.cantidad === 1 ? 'reserva terminada' : 'reservas terminadas'}</small></div>
            <div className="kpi"><span>Tienda</span><strong>{precio(r.tienda.total)}</strong><small className="tenue">{r.tienda.cantidad} {r.tienda.cantidad === 1 ? 'pedido entregado' : 'pedidos entregados'}</small></div>
            <div className="kpi"><span>Cobrado en línea</span><strong>{precio(r.servicios.en_linea)}</strong><small className="tenue">El resto se cobró en mostrador</small></div>
          </div>
          <div className="kpis kpis-secundarios">
            <div className="kpi"><span>Por cobrar ahora</span><strong>{precio(r.por_cobrar.total)}</strong><small className="tenue">{r.por_cobrar.cantidad} {r.por_cobrar.cantidad === 1 ? 'perro' : 'perros'} en CanSuites</small></div>
            <div className="kpi"><span>Reembolsado</span><strong>{precio(r.reembolsos.total)}</strong><small className="tenue">{r.reembolsos.cantidad} {r.reembolsos.cantidad === 1 ? 'reserva' : 'reservas'}</small></div>
            <div className="kpi"><span>Venta promedio</span><strong>{precio(ventas ? Math.round(total / ventas) : 0)}</strong><small className="tenue">por reserva o pedido</small></div>
          </div>

          <section className="tarjeta">
            <h2>Ventas por día</h2>
            {total === 0 ? <p className="tenue">Sin ventas en este periodo.</p> : <GraficaDias datos={r.por_dia} desde={desde} hasta={hasta} />}
          </section>

          <div className="dos-columnas">
            <section className="tarjeta">
              <h2>Por servicio</h2>
              {r.por_servicio.length === 0 ? <p className="tenue">Sin reservas terminadas.</p> : (
                <table className="tabla">
                  <thead><tr><th>Servicio</th><th className="num">Cant.</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {r.por_servicio.map((s) => (
                      <tr key={s.nombre}>
                        <td>{TIPOS_SERVICIO[s.tipo].icono} {s.nombre}{s.tipo !== 'estetica' && <small className="tenue"> · {s.unidades} {s.unidades === 1 ? TIPOS_SERVICIO[s.tipo].unidad : TIPOS_SERVICIO[s.tipo].unidades}</small>}</td>
                        <td className="num">{s.cantidad}</td>
                        <td className="num">{precio(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="tarjeta">
              <h2>Lo más vendido en la tienda</h2>
              {r.productos.length === 0 ? <p className="tenue">Sin pedidos entregados.</p> : (
                <table className="tabla">
                  <thead><tr><th>Producto</th><th className="num">Piezas</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {r.productos.map((p) => <tr key={p.nombre}><td>{p.nombre}</td><td className="num">{p.cantidad}</td><td className="num">{precio(p.total)}</td></tr>)}
                  </tbody>
                </table>
              )}
            </section>
          </div>
          <p className="tenue pequeno">Cuenta las reservas el día del check-out (o «Entregado») y los pedidos el día que se entregan. Las reservas canceladas no suman.</p>
        </>
      )}
    </>
  );
}

/** Barras apiladas por día (o por mes si el periodo es largo): servicios + tienda. */
function GraficaDias({ datos, desde, hasta }: { datos: ReporteVentas['por_dia']; desde: string; hasta: string }) {
  const [foco, setFoco] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const barras = useMemo(() => {
    const porMes = diasEntre(desde, hasta) > 62;
    const clave = (d: string) => (porMes ? d.slice(0, 7) : d);
    const m = new Map<string, { clave: string; servicios: number; tienda: number }>();
    for (let d = desde; d <= hasta; d = sumarDiasIso(d, 1)) if (!m.has(clave(d))) m.set(clave(d), { clave: clave(d), servicios: 0, tienda: 0 });
    for (const x of datos) { const b = m.get(clave(x.dia)); if (b) { b.servicios += x.servicios; b.tienda += x.tienda; } }
    const etiqueta = (k: string) => deIsoDia(porMes ? `${k}-01` : k).toLocaleDateString('es-MX', porMes ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
    return [...m.values()].map((b) => ({ ...b, etiqueta: etiqueta(b.clave) }));
  }, [datos, desde, hasta]);
  const max = Math.max(...barras.map((b) => b.servicios + b.tienda), 1);
  const cada = Math.ceil(barras.length / 6);
  const f = foco === null ? null : barras[foco];

  return (
    <div className="grafica">
      <div className="grafica-leyenda">
        <span><i className="muestra muestra-servicios" /> Servicios</span>
        <span><i className="muestra muestra-tienda" /> Tienda</span>
        <span className="tenue">Máx. {precio(max)}</span>
      </div>
      <div className="grafica-area" onMouseLeave={() => setFoco(null)}>
        {barras.map((b, i) => (
          <div key={b.clave} className={`grafica-col ${foco === i ? 'foco' : ''}`} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}
            aria-label={`${b.etiqueta}: servicios ${precio(b.servicios)}, tienda ${precio(b.tienda)}`}>
            <div className="grafica-pila">
              {b.tienda > 0 && <div className="seg seg-tienda" style={{ height: `${(b.tienda / max) * 100}%` }} />}
              {b.servicios > 0 && <div className="seg seg-servicios" style={{ height: `${(b.servicios / max) * 100}%` }} />}
            </div>
            <small className={i % cada === 0 ? '' : 'oculta'}>{b.etiqueta}</small>
          </div>
        ))}
        {f && (
          <div className="grafica-tip" style={{ left: `${((foco! + 0.5) / barras.length) * 100}%` }}>
            <strong>{f.clave.length === 10 ? fechaDia(f.clave) : f.etiqueta}</strong>
            <span><i className="muestra muestra-servicios" /> Servicios {precio(f.servicios)}</span>
            <span><i className="muestra muestra-tienda" /> Tienda {precio(f.tienda)}</span>
            <span>Total {precio(f.servicios + f.tienda)}</span>
          </div>
        )}
      </div>
      <button className="btn-texto pequeno" onClick={() => setTabla(!tabla)}>{tabla ? 'Ocultar tabla' : 'Ver como tabla'}</button>
      {tabla && (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Día</th><th className="num">Servicios</th><th className="num">Tienda</th><th className="num">Total</th></tr></thead>
            <tbody>
              {barras.filter((b) => b.servicios + b.tienda > 0).map((b) => (
                <tr key={b.clave}><td>{b.etiqueta}</td><td className="num">{precio(b.servicios)}</td><td className="num">{precio(b.tienda)}</td><td className="num">{precio(b.servicios + b.tienda)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
