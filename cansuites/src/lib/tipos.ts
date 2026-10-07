/** Horario semanal: día ISO ("1" = lunes … "7" = domingo) → tramos [abre, cierra] en "HH:MM". */
export type Horario = Record<string, [string, string][]>;

export type Rol = 'cliente' | 'personal' | 'admin';

export interface Perfil {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  rol: Rol;
  created_at: string;
}

/** Tallas de la estética (como en el volante): el precio del baño depende del peso. */
export type Talla = 'CH' | 'M' | 'G' | 'EG';
export const TALLAS: { id: Talla; nombre: string; peso: string; foto: string }[] = [
  { id: 'CH', nombre: 'Chico', peso: '1 – 10 kg', foto: '/img/talla-ch.jpg' },
  { id: 'M', nombre: 'Mediano', peso: '11 – 25 kg', foto: '/img/talla-m.jpg' },
  { id: 'G', nombre: 'Grande', peso: '26 – 40 kg', foto: '/img/talla-g.jpg' },
  { id: 'EG', nombre: 'Extra grande', peso: '+ 40 kg', foto: '/img/talla-eg.jpg' },
];

/** Talla sugerida a partir del peso. */
export function tallaPorPeso(kg: number | null | undefined): Talla {
  const p = Number(kg || 0);
  if (p <= 10) return 'CH';
  if (p <= 25) return 'M';
  if (p <= 40) return 'G';
  return 'EG';
}

export interface Mascota {
  id: string;
  dueno_id: string;
  nombre: string;
  raza: string | null;
  sexo: 'macho' | 'hembra';
  nacimiento: string | null;
  peso_kg: number | null;
  talla: Talla;
  color: string | null;
  esterilizado: boolean;
  alergias: string | null;
  condiciones: string | null;
  alimentacion: string | null;
  veterinario: string | null;
  foto_url: string | null;
  notas: string | null;
  created_at: string;
}

export type TipoRegistro = 'vacuna' | 'desparasitacion' | 'consulta' | 'tratamiento' | 'cirugia' | 'observacion';
export const TIPOS_REGISTRO: Record<TipoRegistro, { nombre: string; icono: string }> = {
  vacuna: { nombre: 'Vacuna', icono: '💉' },
  desparasitacion: { nombre: 'Desparasitación', icono: '💊' },
  consulta: { nombre: 'Consulta', icono: '🩺' },
  tratamiento: { nombre: 'Tratamiento', icono: '🧪' },
  cirugia: { nombre: 'Cirugía', icono: '🏥' },
  observacion: { nombre: 'Observación', icono: '📝' },
};

/** Entrada del expediente médico. `autor` distingue lo que registró CanSuites de lo que agregó el dueño. */
export interface RegistroMedico {
  id: string;
  mascota_id: string;
  tipo: TipoRegistro;
  fecha: string;
  titulo: string;
  detalle: string | null;
  proxima: string | null;
  autor: 'cansuites' | 'dueno';
  autor_nombre: string | null;
  created_at: string;
}

export type TipoServicio = 'hotel' | 'guarderia' | 'estetica';
export const TIPOS_SERVICIO: Record<TipoServicio, { nombre: string; icono: string; unidad: string; unidades: string }> = {
  hotel: { nombre: 'Hotel canino', icono: '🏨', unidad: 'noche', unidades: 'noches' },
  guarderia: { nombre: 'Guardería', icono: '🎾', unidad: 'día', unidades: 'días' },
  estetica: { nombre: 'Estética canina', icono: '🛁', unidad: 'servicio', unidades: 'servicios' },
};

export interface Servicio {
  id: string;
  tipo: TipoServicio;
  nombre: string;
  descripcion: string | null;
  precio: number;
  /** Solo estética: talla a la que aplica el precio. */
  talla: Talla | null;
  incluye: string[];
  activo: boolean;
  orden: number;
}

export type EstadoReserva = 'pendiente' | 'confirmada' | 'en_curso' | 'completada' | 'cancelada';
export const ESTADOS_RESERVA: Record<EstadoReserva, string> = {
  pendiente: 'Por confirmar',
  confirmada: 'Confirmada',
  en_curso: 'En CanSuites',
  completada: 'Terminada',
  cancelada: 'Cancelada',
};

/**
 * Reserva de cualquier servicio. Hotel: noches de `entrada` a `salida` (sale ese día).
 * Guardería: días de `entrada` a `salida`, ambos incluidos. Estética: un día (`entrada` = `salida`) a una `hora`.
 */
export interface Reserva {
  id: string;
  folio: number;
  cliente_id: string;
  mascota_id: string;
  servicio_id: string;
  tipo: TipoServicio;
  entrada: string;
  salida: string;
  hora: string | null;
  unidades: number;
  precio_unit: number;
  total: number;
  estado: EstadoReserva;
  notas: string | null;
  created_at: string;
  /** Pago en línea: `esperando` = lugar apartado mientras el cliente paga (vence en `pago_expira`). */
  pago_estado: PagoEstado;
  /** Lo que se cobra en línea (todo o anticipo). */
  pago_monto: number;
  /** Lo que ya se pagó en línea. */
  pagado: number;
  pago_expira: string | null;
  mascota_nombre?: string;
  servicio_nombre?: string;
  cliente_nombre?: string;
  cliente_telefono?: string | null;
}

export type PagoEstado = 'sin_pago' | 'esperando' | 'pagado' | 'por_reembolsar' | 'reembolsado';

/** ¿El apartado sigue esperando el pago a tiempo? */
export const esperandoPago = (r: Pick<Reserva, 'pago_estado' | 'pago_expira' | 'estado'>) =>
  r.pago_estado === 'esperando' && r.estado !== 'cancelada' && !!r.pago_expira && new Date(r.pago_expira).getTime() > Date.now();

export interface NuevaReserva {
  mascota_id: string;
  servicio_id: string;
  entrada: string;
  salida: string;
  hora: string | null;
  notas: string | null;
  /** Pagar en línea al reservar (si CanSuites cobra en línea). */
  pagar?: boolean;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precio: number;
  stock: number;
  foto_url: string | null;
  activo: boolean;
  orden: number;
}

export type EstadoPedido = 'pendiente' | 'listo' | 'entregado' | 'cancelado';
export const ESTADOS_PEDIDO: Record<EstadoPedido, string> = {
  pendiente: 'Recibido',
  listo: 'Listo para recoger',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export interface PedidoItem {
  producto_id: string | null;
  nombre: string;
  cantidad: number;
  precio_unit: number;
}

/** Pedido de la tienda: se aparta en línea y se paga al recoger (o al entregar a tu perro). */
export interface Pedido {
  id: string;
  folio: number;
  cliente_id: string;
  estado: EstadoPedido;
  total: number;
  notas: string | null;
  created_at: string;
  items: PedidoItem[];
  cliente_nombre?: string;
  cliente_telefono?: string | null;
}

/** Reglas del negocio (una sola fila). */
export interface Ajustes {
  capacidad_hotel: number;
  capacidad_guarderia: number;
  estetica_simultaneos: number;
  intervalo_min: number;
  horario: Horario;
  check_in: string;
  check_out: string;
  /** Pagos en línea: no se cobra, el cliente elige, o es obligatorio. */
  pago_modo: ModoPago;
  /** Porcentaje que se cobra en línea (100 = todo). */
  pago_anticipo: number;
  /** Cuenta de Mercado Pago conectada (null = sin conectar). */
  pago_cuenta: string | null;
  pago_prueba: boolean;
}

export type ModoPago = 'no' | 'opcional' | 'obligatorio';
