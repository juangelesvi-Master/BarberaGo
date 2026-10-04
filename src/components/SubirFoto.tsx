import { useRef, useState } from 'react';
import { supabase, mensajeError } from '../lib/supabase';
import { useNegocio } from '../lib/sesion';

/** Reduce la foto en el navegador (lado mayor ≤ max px, JPG) para que la página cargue rápido. */
async function reducir(archivo: File, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(archivo);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * k);
  lienzo.height = Math.round(bmp.height * k);
  lienzo.getContext('2d')!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la imagen'))), 'image/jpeg', 0.82));
}

/** Sube una foto a la carpeta de la barbería en el bucket público "sitio" y devuelve su URL. */
export async function subirFoto(negocioId: string, archivo: File, max = 1600): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
  const blob = await reducir(archivo, max);
  const ruta = `${negocioId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('sitio').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from('sitio').getPublicUrl(ruta).data.publicUrl;
}

/** Vista previa con botones para subir, cambiar o quitar una foto. */
export default function SubirFoto({ etiqueta, valor, onCambio, max, forma = 'cuadrada' }: {
  etiqueta: string; valor: string | null | undefined; onCambio: (url: string | null) => void; max?: number; forma?: 'cuadrada' | 'ancha' | 'redonda';
}) {
  const { negocio } = useNegocio();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(''); setSubiendo(true);
    try { onCambio(await subirFoto(negocio.id, archivo, max)); } catch (e) { setError(mensajeError(e)); }
    setSubiendo(false);
    if (entrada.current) entrada.current.value = '';
  }

  return (
    <div className="campo">
      <span>{etiqueta}</span>
      <div className="subir-foto">
        <div className={`subir-foto-vista subir-foto-${forma}`}>
          {valor ? <img src={valor} alt="" /> : <span className="tenue pequeno">Sin foto</span>}
        </div>
        <div className="subir-foto-acciones">
          <button type="button" className="btn btn-chico" disabled={subiendo} onClick={() => entrada.current?.click()}>
            {subiendo ? 'Subiendo…' : valor ? 'Cambiar' : 'Subir foto'}
          </button>
          {valor && <button type="button" className="btn-texto pequeno" onClick={() => onCambio(null)}>Quitar</button>}
        </div>
        <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => elegir(e.target.files?.[0])} />
      </div>
      {error && <small className="texto-peligro">{error}</small>}
    </div>
  );
}
