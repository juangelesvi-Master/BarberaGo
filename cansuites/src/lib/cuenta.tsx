import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './datos';
import type { Perfil } from './tipos';

interface Estado {
  cargando: boolean;
  perfil: Perfil | null;
  esPersonal: boolean;
  recargar: () => Promise<void>;
  salir: () => Promise<void>;
}

const Ctx = createContext<Estado | null>(null);

export function useCuenta(): Estado {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCuenta fuera de CuentaProvider');
  return v;
}

/** Sesión del visitante: nadie, un cliente o alguien del personal de CanSuites. */
export function CuentaProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    try { setPerfil(await api.perfil()); } catch { setPerfil(null); }
    setCargando(false);
  }, []);

  useEffect(() => {
    recargar();
    return api.alCambiarSesion(() => { recargar(); });
  }, [recargar]);

  const valor: Estado = {
    cargando,
    perfil,
    esPersonal: !!perfil && perfil.rol !== 'cliente',
    recargar,
    salir: async () => { await api.salir(); setPerfil(null); },
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
