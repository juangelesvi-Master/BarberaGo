import type {
  Ajustes, EstadoPedido, EstadoReserva, Mascota, NuevaReserva, Pedido, Perfil, Producto, RegistroMedico, Reserva, Servicio,
} from './tipos';
import { diaIso, deIsoDia, minutos } from './formato';

export interface ClienteConMascotas extends Perfil {
  mascotas: Mascota[];
}

/**
 * Todo lo que la app necesita de la base. Hay dos implementaciones con el mismo contrato:
 * Supabase (producción) y demostración (datos de ejemplo en el navegador, sin servidor).
 */
export interface Api {
  modo: 'supabase' | 'demo';

  // Cuenta
  perfil(): Promise<Perfil | null>;
  alCambiarSesion(cb: () => void): () => void;
  entrar(email: string, clave: string): Promise<void>;
  registrar(datos: { nombre: string; telefono: string; email: string; clave: string }): Promise<{ confirmar: boolean }>;
  recuperar(email: string): Promise<void>;
  salir(): Promise<void>;
  actualizarPerfil(datos: { nombre: string; telefono: string | null }): Promise<void>;
  subirFoto(archivo: File): Promise<string>;

  // Público
  ajustes(): Promise<Ajustes>;
  servicios(todos?: boolean): Promise<Servicio[]>;
  productos(todos?: boolean): Promise<Producto[]>;
  /** Lugares ocupados por día ("YYYY-MM-DD" → cuántos) de hotel o guardería en el rango, ambos incluidos. */
  ocupacion(tipo: 'hotel' | 'guarderia', desde: string, hasta: string): Promise<Record<string, number>>;
  /** Citas de estética ocupadas por hora ("HH:MM" → cuántas) en un día. */
  ocupacionEstetica(fecha: string): Promise<Record<string, number>>;

  // Cliente (o personal, que ve a todos)
  mascotas(clienteId?: string): Promise<Mascota[]>;
  mascota(id: string): Promise<Mascota | null>;
  guardarMascota(m: Partial<Mascota> & { nombre: string }): Promise<Mascota>;
  historial(mascotaId: string): Promise<RegistroMedico[]>;
  guardarRegistro(r: Partial<RegistroMedico> & { mascota_id: string; titulo: string }): Promise<RegistroMedico>;
  borrarRegistro(id: string): Promise<void>;
  reservar(r: NuevaReserva): Promise<Reserva>;
  misReservas(): Promise<Reserva[]>;
  cancelarReserva(id: string): Promise<void>;
  pedir(items: { producto_id: string; cantidad: number }[], notas: string | null): Promise<Pedido>;
  misPedidos(): Promise<Pedido[]>;

  // Personal
  reservas(desde: string, hasta: string): Promise<Reserva[]>;
  reservasDeMascota(mascotaId: string): Promise<Reserva[]>;
  estadoReserva(id: string, estado: EstadoReserva): Promise<void>;
  clientes(busqueda: string): Promise<ClienteConMascotas[]>;
  /** Cliente que llega al mostrador sin cuenta. Si el correo ya tiene cuenta, regresa esa. */
  altaClienteMostrador(datos: { nombre: string; telefono: string | null; email: string | null }): Promise<Perfil>;
  cliente(id: string): Promise<Perfil | null>;
  pedidos(): Promise<Pedido[]>;
  estadoPedido(id: string, estado: EstadoPedido): Promise<void>;
  guardarServicio(s: Partial<Servicio> & { nombre: string }): Promise<void>;
  guardarProducto(p: Partial<Producto> & { nombre: string }): Promise<void>;
  guardarAjustes(a: Ajustes): Promise<void>;
}

/** Horas de inicio de la estética para un día según el horario y el intervalo. */
export function horasDelDia(a: Ajustes, fecha: string): string[] {
  const tramos = a.horario[diaIso(deIsoDia(fecha))] || [];
  const r: string[] = [];
  const p = (n: number) => String(n).padStart(2, '0');
  for (const [abre, cierra] of tramos) {
    for (let m = minutos(abre); m + a.intervalo_min <= minutos(cierra); m += a.intervalo_min) {
      r.push(`${p(Math.floor(m / 60))}:${p(m % 60)}`);
    }
  }
  return r;
}

/** Días que ocupa una reserva de hotel (noches) o guardería (días). */
export function diasOcupados(tipo: 'hotel' | 'guarderia', entrada: string, salida: string): string[] {
  const r: string[] = [];
  const d = deIsoDia(entrada);
  const fin = deIsoDia(salida);
  const p = (n: number) => String(n).padStart(2, '0');
  while (tipo === 'hotel' ? d < fin : d <= fin) {
    r.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return r;
}

export const AJUSTES_INICIALES: Ajustes = {
  capacidad_hotel: 12,
  capacidad_guarderia: 20,
  estetica_simultaneos: 2,
  intervalo_min: 60,
  horario: {
    '1': [['09:00', '18:00']], '2': [['09:00', '18:00']], '3': [['09:00', '18:00']], '4': [['09:00', '18:00']],
    '5': [['09:00', '18:00']], '6': [['09:00', '15:00']], '7': [],
  },
  check_in: '10:00',
  check_out: '13:00',
};
