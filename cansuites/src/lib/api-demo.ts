import type { Api, ClienteConMascotas } from './api';
import { AJUSTES_INICIALES, diasOcupados, horasDelDia } from './api';
import type {
  Ajustes, Mascota, Pedido, Perfil, Producto, RegistroMedico, Reserva, Servicio,
} from './tipos';
import { diasEntre, hoyIso, sumarDiasIso } from './formato';
import { SERVICIOS_INICIALES, PRODUCTOS_INICIALES } from './catalogo';

/**
 * Modo demostración: la "base" vive en localStorage del navegador, con datos de ejemplo.
 * Sirve para ver y probar todo el sitio sin servidor; cada navegador tiene su propia copia.
 */

interface Usuario extends Perfil { clave: string }
interface Db {
  version: 1;
  usuarios: Usuario[];
  sesion: string | null;
  mascotas: Mascota[];
  registros: RegistroMedico[];
  servicios: Servicio[];
  productos: Producto[];
  reservas: Reserva[];
  pedidos: Pedido[];
  ajustes: Ajustes;
}

const CLAVE = 'cansuites.demo.v1';
export const CUENTAS_DEMO = {
  cliente: { email: 'cliente@demo.com', clave: 'demo123' },
  admin: { email: 'admin@cansuites.com', clave: 'cansuites' },
};

const id = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();

function semilla(): Db {
  const hoy = hoyIso();
  const d = (n: number) => sumarDiasIso(hoy, n);
  const servicios = SERVICIOS_INICIALES.map((s, i) => ({ ...s, id: id(), activo: true, orden: i }));
  const productos = PRODUCTOS_INICIALES.map((p, i) => ({ ...p, id: id(), activo: true, orden: i }));
  const admin: Usuario = { id: id(), nombre: 'Recepción CanSuites', telefono: '4424378929', email: CUENTAS_DEMO.admin.email, rol: 'admin', created_at: ahora(), clave: CUENTAS_DEMO.admin.clave };
  const ana: Usuario = { id: id(), nombre: 'Ana López', telefono: '4421234567', email: CUENTAS_DEMO.cliente.email, rol: 'cliente', created_at: ahora(), clave: CUENTAS_DEMO.cliente.clave };
  const luis: Usuario = { id: id(), nombre: 'Luis Hernández', telefono: '4427654321', email: 'luis@demo.com', rol: 'cliente', created_at: ahora(), clave: 'demo123' };
  const base = { color: null, alergias: null, condiciones: null, alimentacion: null, veterinario: null, foto_url: null, notas: null, created_at: ahora() };
  const max: Mascota = { ...base, id: id(), dueno_id: ana.id, nombre: 'Max', raza: 'Golden retriever', sexo: 'macho', nacimiento: d(-365 * 4 - 40), peso_kg: 32, talla: 'G', color: 'Dorado', esterilizado: true, alergias: 'Pollo', alimentacion: 'Croqueta sin pollo, 2 veces al día', veterinario: 'Dra. Ruiz · Clínica UAQ', foto_url: '/img/talla-g.jpg' };
  const luna: Mascota = { ...base, id: id(), dueno_id: ana.id, nombre: 'Luna', raza: 'Chihuahua', sexo: 'hembra', nacimiento: d(-365 * 2 - 100), peso_kg: 3.2, talla: 'CH', esterilizado: false, condiciones: 'Se estresa con ruidos fuertes', foto_url: '/img/talla-ch.jpg' };
  const rocco: Mascota = { ...base, id: id(), dueno_id: luis.id, nombre: 'Rocco', raza: 'Poodle', sexo: 'macho', nacimiento: d(-365 * 6), peso_kg: 14, talla: 'M', esterilizado: true, foto_url: '/img/talla-m.jpg' };
  const reg = (m: Mascota, tipo: RegistroMedico['tipo'], dias: number, titulo: string, detalle: string | null, proxima: number | null, autor: RegistroMedico['autor'] = 'cansuites'): RegistroMedico => ({
    id: id(), mascota_id: m.id, tipo, fecha: d(dias), titulo, detalle, proxima: proxima === null ? null : d(proxima), autor,
    autor_nombre: autor === 'cansuites' ? 'Dra. Fernanda (CanSuites)' : 'Ana López', created_at: ahora(),
  });
  const serv = (tipo: Servicio['tipo'], talla?: string) => servicios.find((s) => s.tipo === tipo && (!talla || s.talla === talla))!;
  const res = (m: Mascota, s: Servicio, entrada: string, salida: string, hora: string | null, estado: Reserva['estado'], folio: number): Reserva => {
    const unidades = s.tipo === 'hotel' ? diasEntre(entrada, salida) : s.tipo === 'guarderia' ? diasEntre(entrada, salida) + 1 : 1;
    return { id: id(), folio, cliente_id: m.dueno_id, mascota_id: m.id, servicio_id: s.id, tipo: s.tipo, entrada, salida, hora, unidades, precio_unit: s.precio, total: s.precio * unidades, estado, notas: null, created_at: ahora() };
  };
  return {
    version: 1,
    usuarios: [admin, ana, luis],
    sesion: null,
    mascotas: [max, luna, rocco],
    registros: [
      reg(max, 'vacuna', -300, 'Rabia', 'Lote RB-2291', 65),
      reg(max, 'vacuna', -280, 'Múltiple (séxtuple)', null, 85),
      reg(max, 'desparasitacion', -60, 'Desparasitación interna', 'Tableta según peso', 30),
      reg(max, 'consulta', -20, 'Revisión de ingreso al hotel', 'Peso 32 kg, temperatura normal, sin pulgas. Apto para áreas de juego.', null),
      reg(max, 'observacion', -19, 'Comió bien y jugó en la alberca', null, null),
      reg(luna, 'vacuna', -400, 'Rabia', null, -35, 'dueno'),
      reg(luna, 'vacuna', -200, 'Bordetella (tos de las perreras)', 'Requisito para guardería', 165),
      reg(rocco, 'vacuna', -100, 'Rabia', null, 265),
    ],
    servicios,
    productos,
    reservas: [
      res(max, serv('hotel'), d(-21), d(-18), null, 'completada', 1),
      res(luna, serv('estetica', 'CH'), d(2), d(2), '11:00', 'confirmada', 2),
      res(max, serv('hotel'), d(10), d(14), null, 'pendiente', 3),
      res(rocco, serv('guarderia'), d(0), d(0), null, 'en_curso', 4),
      res(rocco, serv('estetica', 'M'), d(0), d(0), '12:00', 'confirmada', 5),
    ],
    pedidos: [{
      id: id(), folio: 1, cliente_id: ana.id, estado: 'listo', total: productos[0].precio + productos[2].precio, notas: null, created_at: ahora(),
      items: [productos[0], productos[2]].map((p) => ({ producto_id: p.id, nombre: p.nombre, cantidad: 1, precio_unit: p.precio })),
    }],
    ajustes: AJUSTES_INICIALES,
  };
}

function leer(): Db {
  try {
    const t = localStorage.getItem(CLAVE);
    if (t) return JSON.parse(t) as Db;
  } catch { /* sin almacenamiento */ }
  const db = semilla();
  guardar(db);
  return db;
}

function guardar(db: Db) {
  try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch { /* sin almacenamiento: los cambios duran hasta recargar */ }
}

/** Borra los datos de la demostración y vuelve a los de ejemplo. */
export function reiniciarDemo() {
  try { localStorage.removeItem(CLAVE); } catch { /* nada */ }
}

let oyentes: (() => void)[] = [];
const avisar = () => oyentes.forEach((f) => f());
const pausa = <T,>(v: T) => new Promise<T>((ok) => setTimeout(() => ok(v), 120));

function yo(db: Db): Usuario {
  const u = db.usuarios.find((x) => x.id === db.sesion);
  if (!u) throw new Error('Inicia sesión para continuar');
  return u;
}
const esPersonal = (u: Perfil) => u.rol !== 'cliente';
function sinClave(u: Usuario): Perfil {
  const { clave: _c, ...p } = u;
  return p;
}
function puedeVerMascota(db: Db, mascotaId: string): Mascota {
  const u = yo(db);
  const m = db.mascotas.find((x) => x.id === mascotaId);
  if (!m || (m.dueno_id !== u.id && !esPersonal(u))) throw new Error('No encontramos esa mascota');
  return m;
}
function conNombres(db: Db, r: Reserva): Reserva {
  const c = db.usuarios.find((u) => u.id === r.cliente_id);
  return {
    ...r,
    mascota_nombre: db.mascotas.find((m) => m.id === r.mascota_id)?.nombre,
    servicio_nombre: db.servicios.find((s) => s.id === r.servicio_id)?.nombre,
    cliente_nombre: c?.nombre, cliente_telefono: c?.telefono,
  };
}
function conCliente(db: Db, p: Pedido): Pedido {
  const c = db.usuarios.find((u) => u.id === p.cliente_id);
  return { ...p, cliente_nombre: c?.nombre, cliente_telefono: c?.telefono };
}
const activa = (r: Reserva) => r.estado !== 'cancelada';

function ocupacionDias(db: Db, tipo: 'hotel' | 'guarderia', desde: string, hasta: string, sin?: string) {
  const r: Record<string, number> = {};
  for (const x of db.reservas) {
    if (x.tipo !== tipo || !activa(x) || x.id === sin) continue;
    for (const dia of diasOcupados(tipo, x.entrada, x.salida)) if (dia >= desde && dia <= hasta) r[dia] = (r[dia] || 0) + 1;
  }
  return r;
}

export const apiDemo: Api = {
  modo: 'demo',

  async perfil() {
    const db = leer();
    const u = db.usuarios.find((x) => x.id === db.sesion);
    return pausa(u ? sinClave(u) : null);
  },
  alCambiarSesion(cb) {
    oyentes.push(cb);
    return () => { oyentes = oyentes.filter((f) => f !== cb); };
  },
  async entrar(email, clave) {
    const db = leer();
    const u = db.usuarios.find((x) => x.email?.toLowerCase() === email.trim().toLowerCase());
    if (!u || !u.clave || u.clave !== clave) throw new Error('Correo o contraseña incorrectos');
    db.sesion = u.id; guardar(db); avisar();
  },
  async registrar({ nombre, telefono, email, clave }) {
    const db = leer();
    if (db.usuarios.some((x) => x.email?.toLowerCase() === email.trim().toLowerCase())) throw new Error('Ese correo ya tiene cuenta. Inicia sesión');
    const u: Usuario = { id: id(), nombre: nombre.trim(), telefono: telefono.trim() || null, email: email.trim(), rol: 'cliente', created_at: ahora(), clave };
    db.usuarios.push(u); db.sesion = u.id; guardar(db); avisar();
    return { confirmar: false };
  },
  async recuperar() { /* en la demostración no se mandan correos */ },
  async salir() {
    const db = leer(); db.sesion = null; guardar(db); avisar();
  },
  async actualizarPerfil({ nombre, telefono }) {
    const db = leer(); const u = yo(db);
    u.nombre = nombre.trim(); u.telefono = telefono?.trim() || null; guardar(db); avisar();
  },
  async subirFoto(archivo) {
    if (!archivo.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
    const bmp = await createImageBitmap(archivo);
    const k = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  },

  async ajustes() { return pausa(leer().ajustes); },
  async servicios(todos) {
    return pausa(leer().servicios.filter((s) => todos || s.activo).sort((a, b) => a.orden - b.orden));
  },
  async productos(todos) {
    return pausa(leer().productos.filter((p) => todos || p.activo).sort((a, b) => a.orden - b.orden));
  },
  async ocupacion(tipo, desde, hasta) { return pausa(ocupacionDias(leer(), tipo, desde, hasta)); },
  async ocupacionEstetica(fecha) {
    const r: Record<string, number> = {};
    for (const x of leer().reservas) if (x.tipo === 'estetica' && activa(x) && x.entrada === fecha && x.hora) r[x.hora] = (r[x.hora] || 0) + 1;
    return pausa(r);
  },

  async mascotas(clienteId) {
    const db = leer(); const u = yo(db);
    const dueno = clienteId && esPersonal(u) ? clienteId : u.id;
    return pausa(db.mascotas.filter((m) => m.dueno_id === dueno).sort((a, b) => a.nombre.localeCompare(b.nombre)));
  },
  async mascota(mid) {
    try { return pausa(puedeVerMascota(leer(), mid)); } catch { return null; }
  },
  async guardarMascota(m) {
    const db = leer(); const u = yo(db);
    if (m.id) {
      const actual = puedeVerMascota(db, m.id);
      Object.assign(actual, { ...m, id: actual.id, dueno_id: actual.dueno_id });
      guardar(db); return actual;
    }
    const dueno = m.dueno_id && esPersonal(u) ? m.dueno_id : u.id;
    const nueva: Mascota = {
      raza: null, sexo: 'macho', nacimiento: null, peso_kg: null, talla: 'M', color: null, esterilizado: false, alergias: null,
      condiciones: null, alimentacion: null, veterinario: null, foto_url: null, notas: null,
      ...m, id: id(), dueno_id: dueno, created_at: ahora(),
    };
    db.mascotas.push(nueva); guardar(db); return nueva;
  },
  async historial(mid) {
    const db = leer(); puedeVerMascota(db, mid);
    return pausa(db.registros.filter((r) => r.mascota_id === mid).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at)));
  },
  async guardarRegistro(r) {
    const db = leer(); const u = yo(db); puedeVerMascota(db, r.mascota_id);
    if (r.id) {
      const actual = db.registros.find((x) => x.id === r.id);
      if (!actual) throw new Error('No encontramos ese registro');
      if (actual.autor === 'cansuites' && !esPersonal(u)) throw new Error('Solo CanSuites puede editar este registro');
      Object.assign(actual, { ...r, id: actual.id, autor: actual.autor, autor_nombre: actual.autor_nombre });
      guardar(db); return actual;
    }
    const nuevo: RegistroMedico = {
      tipo: 'observacion', fecha: hoyIso(), detalle: null, proxima: null, ...r,
      id: id(), autor: esPersonal(u) ? 'cansuites' : 'dueno', autor_nombre: u.nombre, created_at: ahora(),
    } as RegistroMedico;
    db.registros.push(nuevo); guardar(db); return nuevo;
  },
  async borrarRegistro(rid) {
    const db = leer(); const u = yo(db);
    const r = db.registros.find((x) => x.id === rid);
    if (!r) return;
    puedeVerMascota(db, r.mascota_id);
    if (r.autor === 'cansuites' && !esPersonal(u)) throw new Error('Solo CanSuites puede borrar este registro');
    db.registros = db.registros.filter((x) => x.id !== rid); guardar(db);
  },

  async reservar(n) {
    const db = leer(); const u = yo(db);
    const m = puedeVerMascota(db, n.mascota_id);
    const s = db.servicios.find((x) => x.id === n.servicio_id && x.activo);
    if (!s) throw new Error('Ese servicio ya no está disponible');
    const hoy = hoyIso();
    if (n.entrada < hoy) throw new Error('Elige una fecha a partir de hoy');
    let unidades = 1;
    if (s.tipo === 'hotel') {
      unidades = diasEntre(n.entrada, n.salida);
      if (unidades < 1) throw new Error('La salida debe ser después de la entrada');
    } else if (s.tipo === 'guarderia') {
      unidades = diasEntre(n.entrada, n.salida) + 1;
      if (unidades < 1) throw new Error('El último día no puede ser antes del primero');
    } else {
      n = { ...n, salida: n.entrada };
      if (!n.hora || !horasDelDia(db.ajustes, n.entrada).includes(n.hora)) throw new Error('Elige un horario disponible');
      const ahoraHm = new Date().toTimeString().slice(0, 5);
      if (n.entrada === hoy && n.hora <= ahoraHm && !esPersonal(u)) throw new Error('Ese horario ya pasó');
      const ocupadas = db.reservas.filter((x) => x.tipo === 'estetica' && activa(x) && x.entrada === n.entrada && x.hora === n.hora).length;
      if (ocupadas >= db.ajustes.estetica_simultaneos) throw new Error('Ese horario se acaba de ocupar. Elige otro.');
    }
    if (unidades > 60) throw new Error('Para estancias de más de 60 días escríbenos por WhatsApp');
    if (s.tipo !== 'estetica') {
      const cap = s.tipo === 'hotel' ? db.ajustes.capacidad_hotel : db.ajustes.capacidad_guarderia;
      const occ = ocupacionDias(db, s.tipo, n.entrada, n.salida);
      const lleno = diasOcupados(s.tipo, n.entrada, n.salida).find((dia) => (occ[dia] || 0) >= cap);
      if (lleno) throw new Error(`No hay lugar el ${lleno}. Prueba otras fechas.`);
    }
    const r: Reserva = {
      id: id(), folio: Math.max(0, ...db.reservas.map((x) => x.folio)) + 1, cliente_id: m.dueno_id, mascota_id: m.id, servicio_id: s.id,
      tipo: s.tipo, entrada: n.entrada, salida: n.salida, hora: s.tipo === 'estetica' ? n.hora : null, unidades, precio_unit: s.precio,
      total: s.precio * unidades, estado: esPersonal(u) ? 'confirmada' : 'pendiente', notas: n.notas, created_at: ahora(),
    };
    db.reservas.push(r); guardar(db);
    return conNombres(db, r);
  },
  async misReservas() {
    const db = leer(); const u = yo(db);
    return pausa(db.reservas.filter((r) => r.cliente_id === u.id).map((r) => conNombres(db, r)).sort((a, b) => b.entrada.localeCompare(a.entrada)));
  },
  async cancelarReserva(rid) {
    const db = leer(); const u = yo(db);
    const r = db.reservas.find((x) => x.id === rid);
    if (!r || (r.cliente_id !== u.id && !esPersonal(u))) throw new Error('No encontramos esa reserva');
    if (!esPersonal(u) && (!['pendiente', 'confirmada'].includes(r.estado) || r.entrada < hoyIso())) throw new Error('Esta reserva ya no se puede cancelar en línea. Escríbenos por WhatsApp.');
    r.estado = 'cancelada'; guardar(db);
  },
  async pedir(items, notas) {
    const db = leer(); const u = yo(db);
    const lineas = items.filter((i) => i.cantidad > 0).map((i) => {
      const p = db.productos.find((x) => x.id === i.producto_id && x.activo);
      if (!p) throw new Error('Un producto ya no está disponible');
      if (p.stock < i.cantidad) throw new Error(`Solo quedan ${p.stock} de ${p.nombre}`);
      return { p, cantidad: i.cantidad };
    });
    if (!lineas.length) throw new Error('Tu carrito está vacío');
    lineas.forEach(({ p, cantidad }) => { p.stock -= cantidad; });
    const pedido: Pedido = {
      id: id(), folio: Math.max(0, ...db.pedidos.map((x) => x.folio)) + 1, cliente_id: u.id, estado: 'pendiente', notas, created_at: ahora(),
      total: lineas.reduce((a, l) => a + l.p.precio * l.cantidad, 0),
      items: lineas.map(({ p, cantidad }) => ({ producto_id: p.id, nombre: p.nombre, cantidad, precio_unit: p.precio })),
    };
    db.pedidos.push(pedido); guardar(db);
    return pedido;
  },
  async misPedidos() {
    const db = leer(); const u = yo(db);
    return pausa(db.pedidos.filter((p) => p.cliente_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  },

  async reservas(desde, hasta) {
    const db = leer(); if (!esPersonal(yo(db))) throw new Error('Sin permiso');
    return pausa(db.reservas.filter((r) => r.entrada <= hasta && r.salida >= desde).map((r) => conNombres(db, r))
      .sort((a, b) => a.entrada.localeCompare(b.entrada) || (a.hora || '').localeCompare(b.hora || '')));
  },
  async reservasDeMascota(mid) {
    const db = leer(); puedeVerMascota(db, mid);
    return pausa(db.reservas.filter((r) => r.mascota_id === mid).map((r) => conNombres(db, r)).sort((a, b) => b.entrada.localeCompare(a.entrada)));
  },
  async estadoReserva(rid, estado) {
    const db = leer(); if (!esPersonal(yo(db))) throw new Error('Sin permiso');
    const r = db.reservas.find((x) => x.id === rid);
    if (r) { r.estado = estado; guardar(db); }
  },
  async clientes(busqueda) {
    const db = leer(); if (!esPersonal(yo(db))) throw new Error('Sin permiso');
    const q = busqueda.trim().toLowerCase();
    const r: ClienteConMascotas[] = db.usuarios.filter((u) => u.rol === 'cliente').map((u) => ({ ...sinClave(u), mascotas: db.mascotas.filter((m) => m.dueno_id === u.id) }))
      .filter((c) => !q || [c.nombre, c.email, c.telefono, ...c.mascotas.map((m) => m.nombre)].some((t) => t?.toLowerCase().includes(q)));
    return pausa(r.sort((a, b) => a.nombre.localeCompare(b.nombre)));
  },
  async altaClienteMostrador({ nombre, telefono, email }) {
    const db = leer(); if (!esPersonal(yo(db))) throw new Error('Sin permiso');
    if (!nombre.trim()) throw new Error('Escribe el nombre del cliente');
    const correo = email?.trim().toLowerCase() || null;
    const existe = correo && db.usuarios.find((x) => x.email?.toLowerCase() === correo);
    if (existe) return sinClave(existe);
    const u: Usuario = { id: id(), nombre: nombre.trim(), telefono: telefono?.trim() || null, email: correo, rol: 'cliente', created_at: ahora(), clave: '' };
    db.usuarios.push(u); guardar(db);
    return sinClave(u);
  },
  async cliente(cid) {
    const db = leer(); const u = yo(db);
    if (!esPersonal(u) && cid !== u.id) return null;
    const c = db.usuarios.find((x) => x.id === cid);
    return c ? sinClave(c) : null;
  },
  async pedidos() {
    const db = leer(); if (!esPersonal(yo(db))) throw new Error('Sin permiso');
    return pausa(db.pedidos.map((p) => conCliente(db, p)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  },
  async estadoPedido(pid, estado) {
    const db = leer(); if (!esPersonal(yo(db))) throw new Error('Sin permiso');
    const p = db.pedidos.find((x) => x.id === pid);
    if (!p) return;
    if (estado === 'cancelado' && p.estado !== 'cancelado') {
      p.items.forEach((i) => { const pr = db.productos.find((x) => x.id === i.producto_id); if (pr) pr.stock += i.cantidad; });
    }
    p.estado = estado; guardar(db);
  },
  async guardarServicio(s) {
    const db = leer(); if (!esPersonal(yo(db))) throw new Error('Sin permiso');
    const actual = s.id && db.servicios.find((x) => x.id === s.id);
    if (actual) Object.assign(actual, s);
    else db.servicios.push({ tipo: 'hotel', descripcion: null, precio: 0, talla: null, incluye: [], activo: true, orden: db.servicios.length, ...s, id: id() });
    guardar(db);
  },
  async guardarProducto(p) {
    const db = leer(); if (!esPersonal(yo(db))) throw new Error('Sin permiso');
    const actual = p.id && db.productos.find((x) => x.id === p.id);
    if (actual) Object.assign(actual, p);
    else db.productos.push({ descripcion: null, categoria: null, precio: 0, stock: 0, foto_url: null, activo: true, orden: db.productos.length, ...p, id: id() });
    guardar(db);
  },
  async guardarAjustes(a) {
    const db = leer(); if (yo(db).rol !== 'admin') throw new Error('Solo el administrador cambia los ajustes');
    db.ajustes = a; guardar(db);
  },
};
