import { useRef, useState, type FormEvent } from 'react';
import { supabase, mensajeError } from '../lib/supabase';
import { useNegocio } from '../lib/sesion';
import type { Sitio } from '../lib/tipos';
import { Aviso, Campo } from './ui';
import SubirFoto, { subirFoto } from './SubirFoto';

/** Ajustes: textos, fotos y redes de la página web pública de la barbería. */
export default function PaginaWebAjustes() {
  const { negocio, recargar } = useNegocio();
  const [s, setS] = useState<Sitio>(negocio.sitio || {});
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const galeria = s.galeria || [];
  const texto = (k: keyof Sitio) => ({
    value: (s[k] as string) || '',
    onChange: (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value }),
  });

  async function agregarFotos(archivos: FileList | null) {
    if (!archivos?.length) return;
    setError(''); setSubiendo(true);
    try {
      const urls: string[] = [];
      for (const a of Array.from(archivos).slice(0, 12 - galeria.length)) urls.push(await subirFoto(negocio.id, a, 1400));
      setS((x) => ({ ...x, galeria: [...(x.galeria || []), ...urls] }));
    } catch (e) { setError(mensajeError(e)); }
    setSubiendo(false);
    if (entrada.current) entrada.current.value = '';
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(''); setOk('');
    // Se guardan solo los campos con contenido.
    const limpio = Object.fromEntries(Object.entries(s).filter(([, v]) => (Array.isArray(v) ? v.length : typeof v === 'string' ? v.trim() : v)));
    const { error } = await supabase.from('negocios').update({ sitio: limpio }).eq('id', negocio.id);
    if (error) return setError(mensajeError(error));
    setOk('Página actualizada.');
    recargar();
  }

  return (
    <form onSubmit={guardar} className="tarjeta formulario">
      <h2>Página web</h2>
      <p className="tenue pequeno">
        Lo que ven tus clientes en <a href={`/r/${negocio.slug}`} target="_blank" rel="noreferrer">tu página</a>.
        Servicios, barberos, productos y horario se toman de tu catálogo automáticamente.
      </p>
      <Campo etiqueta="Titular de la portada" ayuda={`Si lo dejas vacío se muestra "${negocio.nombre}".`}>
        <input {...texto('titular')} maxLength={60} placeholder="Ej. El corte que te mereces" />
      </Campo>
      <Campo etiqueta="Frase corta"><input {...texto('lema')} maxLength={160} placeholder="Ej. Barbería clásica con oficio moderno" /></Campo>
      <SubirFoto etiqueta="Foto de portada" forma="ancha" max={1920} valor={s.portada} onCambio={(u) => setS({ ...s, portada: u || undefined })} />
      <Campo etiqueta="Sobre nosotros"><textarea {...texto('descripcion')} rows={4} maxLength={800} placeholder="Cuenta la historia de tu barbería" /></Campo>
      <SubirFoto etiqueta="Foto de “nosotros”" valor={s.foto_nosotros} onCambio={(u) => setS({ ...s, foto_nosotros: u || undefined })} />
      <Campo etiqueta="Abiertos desde (año)"><input {...texto('desde')} inputMode="numeric" maxLength={4} placeholder="2015" /></Campo>

      <div className="campo">
        <span>Galería ({galeria.length}/12)</span>
        <div className="galeria-editor">
          {galeria.map((u, i) => (
            <div key={u + i} className="galeria-editor-foto">
              <img src={u} alt="" />
              <button type="button" aria-label="Quitar foto" onClick={() => setS({ ...s, galeria: galeria.filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          {galeria.length < 12 && (
            <button type="button" className="galeria-editor-agregar" disabled={subiendo} onClick={() => entrada.current?.click()}>
              {subiendo ? 'Subiendo…' : '+ Agregar fotos'}
            </button>
          )}
        </div>
        <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => agregarFotos(e.target.files)} />
      </div>

      <h3>Contacto y redes</h3>
      <Campo etiqueta="WhatsApp (botón flotante; si está vacío se usa el teléfono)"><input {...texto('whatsapp')} inputMode="tel" placeholder="10 dígitos" /></Campo>
      <div className="fila-campos">
        <Campo etiqueta="Instagram"><input {...texto('instagram')} placeholder="@tubarberia" /></Campo>
        <Campo etiqueta="TikTok"><input {...texto('tiktok')} placeholder="@tubarberia" /></Campo>
      </div>
      <Campo etiqueta="Facebook"><input {...texto('facebook')} placeholder="tubarberia o enlace" /></Campo>
      <Aviso>{error}</Aviso>
      <Aviso tipo="ok">{ok}</Aviso>
      <button className="btn btn-primario" disabled={subiendo}>Guardar página</button>
    </form>
  );
}
