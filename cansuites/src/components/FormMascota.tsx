import { useRef, useState, type FormEvent } from 'react';
import { api, mensajeError } from '../lib/datos';
import type { Mascota, Talla } from '../lib/tipos';
import { TALLAS, tallaPorPeso } from '../lib/tipos';
import { Aviso, Campo } from './ui';

/** Alta o edición de una mascota. `breve` pide solo lo indispensable (para reservar rápido). */
export default function FormMascota({ mascota, duenoId, breve, onGuardada, onCancelar }: {
  mascota?: Mascota | null; duenoId?: string; breve?: boolean; onGuardada: (m: Mascota) => void; onCancelar?: () => void;
}) {
  const [m, setM] = useState<Partial<Mascota>>(mascota || { sexo: 'macho', talla: 'M', esterilizado: false });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const cambia = (c: Partial<Mascota>) => setM((x) => ({ ...x, ...c }));
  const texto = (k: keyof Mascota) => ({
    value: (m[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => cambia({ [k]: e.target.value || null } as Partial<Mascota>),
  });

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(''); setGuardando(true);
    try {
      const g = await api.guardarMascota({ ...m, nombre: (m.nombre || '').trim(), ...(duenoId && !m.id ? { dueno_id: duenoId } : {}) });
      onGuardada(g);
    } catch (err) {
      setError(mensajeError(err));
      setGuardando(false);
    }
  }

  async function foto(f: File | undefined) {
    if (!f) return;
    setSubiendo(true); setError('');
    try { cambia({ foto_url: await api.subirFoto(f) }); } catch (err) { setError(mensajeError(err)); }
    setSubiendo(false);
    if (archivo.current) archivo.current.value = '';
  }

  return (
    <form className="formulario" onSubmit={guardar}>
      {!breve && (
        <div className="subir-foto">
          <div className="avatar-mascota grande">{m.foto_url ? <img src={m.foto_url} alt="" /> : <span aria-hidden>🐶</span>}</div>
          <div className="fila">
            <button type="button" className="btn btn-chico" disabled={subiendo} onClick={() => archivo.current?.click()}>{subiendo ? 'Subiendo…' : m.foto_url ? 'Cambiar foto' : 'Subir foto'}</button>
            {m.foto_url && <button type="button" className="btn-texto pequeno" onClick={() => cambia({ foto_url: null })}>Quitar</button>}
          </div>
          <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => foto(e.target.files?.[0])} />
        </div>
      )}
      <div className="fila-campos">
        <Campo etiqueta="Nombre"><input value={m.nombre || ''} onChange={(e) => cambia({ nombre: e.target.value })} required /></Campo>
        <Campo etiqueta="Raza"><input {...texto('raza')} placeholder="Mestizo, Labrador…" /></Campo>
      </div>
      <div className="fila-campos">
        <Campo etiqueta="Sexo">
          <select value={m.sexo || 'macho'} onChange={(e) => cambia({ sexo: e.target.value as Mascota['sexo'] })}>
            <option value="macho">Macho</option><option value="hembra">Hembra</option>
          </select>
        </Campo>
        <Campo etiqueta="Peso (kg)">
          <input type="number" min={0} max={150} step={0.1} value={m.peso_kg ?? ''} onChange={(e) => {
            const p = e.target.value === '' ? null : Number(e.target.value);
            cambia({ peso_kg: p, ...(p ? { talla: tallaPorPeso(p) } : {}) });
          }} />
        </Campo>
        <Campo etiqueta="Talla">
          <select value={m.talla || 'M'} onChange={(e) => cambia({ talla: e.target.value as Talla })}>
            {TALLAS.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.peso})</option>)}
          </select>
        </Campo>
      </div>
      {!breve && (
        <>
          <div className="fila-campos">
            <Campo etiqueta="Fecha de nacimiento"><input type="date" {...texto('nacimiento')} /></Campo>
            <Campo etiqueta="Color"><input {...texto('color')} /></Campo>
          </div>
          <label className="check"><input type="checkbox" checked={!!m.esterilizado} onChange={(e) => cambia({ esterilizado: e.target.checked })} /> Esterilizado(a)</label>
          <Campo etiqueta="Alergias"><input {...texto('alergias')} placeholder="Alimentos, medicamentos…" /></Campo>
          <Campo etiqueta="Condiciones o cuidados especiales"><textarea rows={2} {...texto('condiciones')} placeholder="Ansiedad, displasia, no convive con gatos…" /></Campo>
          <Campo etiqueta="Alimentación"><input {...texto('alimentacion')} placeholder="Marca, cantidad y horario" /></Campo>
          <Campo etiqueta="Veterinario de cabecera"><input {...texto('veterinario')} placeholder="Nombre y teléfono" /></Campo>
          <Campo etiqueta="Notas"><textarea rows={2} {...texto('notas')} /></Campo>
        </>
      )}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        {onCancelar && <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>}
        <button className="btn btn-primario" disabled={guardando || subiendo}>{guardando ? 'Guardando…' : m.id ? 'Guardar cambios' : 'Agregar mascota'}</button>
      </div>
    </form>
  );
}
