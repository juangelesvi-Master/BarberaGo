import type { Producto, Servicio } from './tipos';

/** Lo que incluye todo baño de la estética (volante "Estética canina"). */
export const INCLUYE_BANO = ['Corte de garras', 'Limpieza de oídos', 'Perfilado de patitas (huellitas, en caso de requerir)', 'Paliacate', 'Perfumito o accesorios'];

/**
 * Catálogo inicial. Los precios de estética vienen del volante; los de hotel y guardería son de ejemplo
 * y se cambian en el panel (Catálogo).
 */
export const SERVICIOS_INICIALES: Omit<Servicio, 'id' | 'activo' | 'orden'>[] = [
  { tipo: 'hotel', nombre: 'Suite estándar', descripcion: 'Habitación individual con cama, agua fresca, 3 salidas a las áreas de juego y monitoreo 24/7.', precio: 450, talla: null, incluye: ['Áreas de juego', 'Monitoreo 24/7', 'Supervisión veterinaria'] },
  { tipo: 'hotel', nombre: 'Suite premium', descripcion: 'Suite amplia con cama ortopédica, alberca, juego guiado y reporte con fotos por WhatsApp.', precio: 650, talla: null, incluye: ['Alberca', 'Reporte con fotos', 'Monitoreo 24/7', 'Supervisión veterinaria'] },
  { tipo: 'guarderia', nombre: 'Guardería por día', descripcion: 'Déjalo en la mañana y recógelo en la tarde: juego en grandes áreas, socialización y descanso.', precio: 250, talla: null, incluye: ['Grandes áreas de juego', 'Socialización supervisada', 'Siesta'] },
  { tipo: 'estetica', nombre: 'Baño y estética · Chico', descripcion: 'Peso aproximado 1 – 10 kg.', precio: 250, talla: 'CH', incluye: [] },
  { tipo: 'estetica', nombre: 'Baño y estética · Mediano', descripcion: 'Peso aproximado 11 – 25 kg.', precio: 300, talla: 'M', incluye: [] },
  { tipo: 'estetica', nombre: 'Baño y estética · Grande', descripcion: 'Peso aproximado 26 – 40 kg.', precio: 350, talla: 'G', incluye: [] },
  { tipo: 'estetica', nombre: 'Baño y estética · Extra grande', descripcion: 'Peso aproximado + 40 kg.', precio: 400, talla: 'EG', incluye: [] },
];

export const PRODUCTOS_INICIALES: Omit<Producto, 'id' | 'activo' | 'orden'>[] = [
  { nombre: 'Croqueta premium adulto 4 kg', descripcion: 'Proteína de cordero, sin colorantes.', categoria: 'Alimento', precio: 689, stock: 15, foto_url: null },
  { nombre: 'Premios naturales de res', descripcion: 'Bolsa de 200 g, deshidratados.', categoria: 'Alimento', precio: 149, stock: 30, foto_url: null },
  { nombre: 'Shampoo de avena', descripcion: 'Piel sensible, 500 ml. El mismo que usamos en la estética.', categoria: 'Higiene', precio: 189, stock: 20, foto_url: null },
  { nombre: 'Cepillo de cerdas suaves', descripcion: 'Para pelo corto y largo.', categoria: 'Higiene', precio: 129, stock: 12, foto_url: null },
  { nombre: 'Pelota de hule resistente', descripcion: 'Rebota y flota: perfecta para la alberca.', categoria: 'Juguetes', precio: 99, stock: 40, foto_url: null },
  { nombre: 'Cuerda para jalar', descripcion: 'Algodón trenzado, 40 cm.', categoria: 'Juguetes', precio: 119, stock: 25, foto_url: null },
  { nombre: 'Paliacate CanSuites', descripcion: 'Naranja con huellitas, tallas CH a EG.', categoria: 'Accesorios', precio: 89, stock: 50, foto_url: null },
  { nombre: 'Cama ortopédica mediana', descripcion: 'Espuma viscoelástica y funda lavable.', categoria: 'Descanso', precio: 899, stock: 6, foto_url: null },
];

export const ICONO_CATEGORIA: Record<string, string> = {
  Alimento: '🦴', Higiene: '🧴', Juguetes: '🎾', Accesorios: '🎀', Descanso: '🛏️',
};
