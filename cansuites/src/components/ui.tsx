import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';

export function Modal({ titulo, onCerrar, children, ancho }: { titulo: string; onCerrar: () => void; children: ReactNode; ancho?: number }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={ancho ? { maxWidth: ancho } : undefined}>
        <div className="modal-cabeza">
          <h2>{titulo}</h2>
          <button className="btn-icono" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

/** Campo de contraseña con botón para mostrarla u ocultarla. */
export function InputClave(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [ver, setVer] = useState(false);
  return (
    <span className="input-clave">
      <input {...props} type={ver ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="ver-clave" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={ver} title={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
        {ver ? (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3.2 4.2M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7a9.8 9.8 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path fill="none" stroke="currentColor" strokeWidth="2" d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        )}
      </button>
    </span>
  );
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return <div className={`aviso aviso-${tipo}`}>{children}</div>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>;
}

export function Cabecera({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="cabecera">
      <h1>{titulo}</h1>
      <div className="cabecera-acciones">{children}</div>
    </div>
  );
}

export function Cargando() {
  return <div className="cargando" aria-live="polite">Cargando…</div>;
}
