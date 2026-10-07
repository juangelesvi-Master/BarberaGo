import { createClient } from '@supabase/supabase-js';
import type { Api, ClienteConMascotas } from './api';
import type { Camara, CamaraCliente, Mascota, Pedido, Perfil, ReporteVentas, Reserva } from './tipos';

// Valores por defecto: proyecto Supabase "CanSuites". La llave publicable es pública por diseño;
// la seguridad la dan las políticas RLS de la base.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://btlxpxqqnkkwqnmurszl.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_eqTXZ5CfkIxe8xUkfM4Ldw_0l7ZiUT_';

export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });

function ok<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Inicia sesión para continuar');
  return id;
}

const CAMPOS_RESERVA = '*, mascotas(nombre), servicios(nombre), perfiles(nombre, telefono)';
type ReservaFila = Reserva & { mascotas?: { nombre: string } | null; servicios?: { nombre: string } | null; perfiles?: { nombre: string; telefono: string | null } | null };
function reserva(r: ReservaFila): Reserva {
  const { mascotas, servicios, perfiles, ...resto } = r;
  return {
    ...resto, precio_unit: Number(resto.precio_unit), total: Number(resto.total), pago_monto: Number(resto.pago_monto || 0), pagado: Number(resto.pagado || 0),
    mascota_nombre: mascotas?.nombre, servicio_nombre: servicios?.nombre, cliente_nombre: perfiles?.nombre, cliente_telefono: perfiles?.telefono,
  };
}

const CAMPOS_PEDIDO = '*, items:pedido_items(producto_id, nombre, cantidad, precio_unit), perfiles(nombre, telefono)';
type PedidoFila = Pedido & { perfiles?: { nombre: string; telefono: string | null } | null };
function pedido(p: PedidoFila): Pedido {
  const { perfiles, ...resto } = p;
  return {
    ...resto, total: Number(resto.total), items: (resto.items || []).map((i) => ({ ...i, precio_unit: Number(i.precio_unit) })),
    cliente_nombre: perfiles?.nombre, cliente_telefono: perfiles?.telefono,
  };
}

/** Llama la Edge Function `pagos` con la sesión actual; los errores vienen en español. */
async function pagos<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('pagos', { body: cuerpo });
  if (error) {
    const r = (error as { context?: Response }).context;
    const detalle = r && typeof r.json === 'function' ? await r.json().catch(() => null) : null;
    throw new Error(detalle?.error || 'No se pudo conectar con el cobro. Intenta de nuevo.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const numeros = <T extends { precio: number }>(xs: T[]) => xs.map((x) => ({ ...x, precio: Number(x.precio) }));
const mascota = (m: Mascota) => ({ ...m, peso_kg: m.peso_kg === null ? null : Number(m.peso_kg) });

export const apiSupabase: Api = {
  modo: 'supabase',

  async perfil() {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user.id;
    if (!id) return null;
    return ok(await supabase.from('perfiles').select('*').eq('id', id).maybeSingle()) as Perfil | null;
  },
  alCambiarSesion(cb) {
    // Fuera del callback: llamar a Supabase dentro de onAuthStateChange puede trabarse.
    const { data } = supabase.auth.onAuthStateChange((evento) => { if (evento !== 'TOKEN_REFRESHED') setTimeout(cb, 0); });
    return () => data.subscription.unsubscribe();
  },
  async entrar(email, clave) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) throw error;
  },
  async registrar({ nombre, telefono, email, clave }) {
    const { data, error } = await supabase.auth.signUp({
      email, password: clave, options: { data: { nombre, telefono }, emailRedirectTo: `${window.location.origin}/cuenta` },
    });
    if (error) throw error;
    return { confirmar: !data.session };
  },
  async recuperar(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/cuenta` });
    if (error) throw error;
  },
  async salir() { await supabase.auth.signOut(); },
  async actualizarPerfil({ nombre, telefono }) {
    ok(await supabase.from('perfiles').update({ nombre: nombre.trim(), telefono: telefono?.trim() || null }).eq('id', await uid()));
  },
  async subirFoto(archivo) {
    if (!archivo.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
    const bmp = await createImageBitmap(archivo);
    const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo leer la imagen'))), 'image/jpeg', 0.82));
    const ruta = `${await uid()}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from('fotos').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) throw error;
    return supabase.storage.from('fotos').getPublicUrl(ruta).data.publicUrl;
  },

  async ajustes() {
    return ok(await supabase.from('ajustes').select('capacidad_hotel, capacidad_guarderia, estetica_simultaneos, intervalo_min, horario, check_in, check_out, pago_modo, pago_anticipo, pago_cuenta, pago_prueba').eq('id', 1).single());
  },
  async servicios(todos) {
    let q = supabase.from('servicios').select('*').order('orden').order('nombre');
    if (!todos) q = q.eq('activo', true);
    return numeros(ok(await q) || []);
  },
  async productos(todos) {
    let q = supabase.from('productos').select('*').order('orden').order('nombre');
    if (!todos) q = q.eq('activo', true);
    return numeros(ok(await q) || []);
  },
  async ocupacion(tipo, desde, hasta) {
    const filas = ok(await supabase.rpc('ocupacion', { p_tipo: tipo, p_desde: desde, p_hasta: hasta })) as { dia: string; ocupados: number }[];
    return Object.fromEntries((filas || []).map((f) => [f.dia, f.ocupados]));
  },
  async ocupacionEstetica(fecha) {
    const filas = ok(await supabase.rpc('ocupacion_estetica', { p_fecha: fecha })) as { hora: string; ocupadas: number }[];
    return Object.fromEntries((filas || []).map((f) => [f.hora, f.ocupadas]));
  },

  async mascotas(clienteId) {
    const dueno = clienteId || await uid();
    return (ok(await supabase.from('mascotas').select('*').eq('dueno_id', dueno).order('nombre')) as Mascota[]).map(mascota);
  },
  async mascota(id) {
    const m = ok(await supabase.from('mascotas').select('*').eq('id', id).maybeSingle()) as Mascota | null;
    return m ? mascota(m) : null;
  },
  async guardarMascota(m) {
    const { id, created_at: _c, ...datos } = m;
    if (id) return mascota(ok(await supabase.from('mascotas').update(datos).eq('id', id).select().single()));
    return mascota(ok(await supabase.from('mascotas').insert({ ...datos, dueno_id: datos.dueno_id || await uid() }).select().single()));
  },
  async historial(mascotaId) {
    return ok(await supabase.from('registros_medicos').select('*').eq('mascota_id', mascotaId).order('fecha', { ascending: false }).order('created_at', { ascending: false })) || [];
  },
  async guardarRegistro(r) {
    const { id, autor: _a, autor_nombre: _n, created_at: _c, ...datos } = r;
    if (id) return ok(await supabase.from('registros_medicos').update(datos).eq('id', id).select().single());
    return ok(await supabase.from('registros_medicos').insert(datos).select().single());
  },
  async borrarRegistro(id) {
    ok(await supabase.from('registros_medicos').delete().eq('id', id));
  },
  async reservar(n) {
    const r = ok(await supabase.rpc('reservar', {
      p_mascota: n.mascota_id, p_servicio: n.servicio_id, p_entrada: n.entrada, p_salida: n.salida, p_hora: n.hora, p_notas: n.notas,
      p_pagar: !!n.pagar,
    })) as Reserva;
    return reserva(ok(await supabase.from('reservas').select(CAMPOS_RESERVA).eq('id', r.id).single()));
  },
  async reserva(id) {
    const r = ok(await supabase.from('reservas').select(CAMPOS_RESERVA).eq('id', id).maybeSingle()) as ReservaFila | null;
    return r ? reserva(r) : null;
  },
  async reagendar(id, { entrada, salida, hora }) {
    ok(await supabase.rpc('reagendar', { p_id: id, p_entrada: entrada, p_salida: salida, p_hora: hora }));
    return reserva(ok(await supabase.from('reservas').select(CAMPOS_RESERVA).eq('id', id).single()));
  },
  async iniciarPago(reservaId) {
    return (await pagos<{ url: string }>({ accion: 'cobrar', reserva: reservaId })).url;
  },
  async verificarPago(reservaId) {
    await pagos({ accion: 'verificar', reserva: reservaId });
  },
  async misReservas() {
    return (ok(await supabase.from('reservas').select(CAMPOS_RESERVA).eq('cliente_id', await uid()).order('entrada', { ascending: false })) as ReservaFila[]).map(reserva);
  },
  async cancelarReserva(id) {
    ok(await supabase.rpc('cancelar_reserva', { p_id: id }));
  },
  async pedir(items, notas) {
    const p = ok(await supabase.rpc('pedir', { p_items: items, p_notas: notas })) as Pedido;
    return pedido(ok(await supabase.from('pedidos').select(CAMPOS_PEDIDO).eq('id', p.id).single()));
  },
  async misPedidos() {
    return (ok(await supabase.from('pedidos').select(CAMPOS_PEDIDO).eq('cliente_id', await uid()).order('created_at', { ascending: false })) as PedidoFila[]).map(pedido);
  },

  async reservas(desde, hasta) {
    return (ok(await supabase.from('reservas').select(CAMPOS_RESERVA).lte('entrada', hasta).gte('salida', desde)
      .order('entrada').order('hora', { nullsFirst: true })) as ReservaFila[]).map(reserva);
  },
  async reservasDeMascota(mascotaId) {
    return (ok(await supabase.from('reservas').select(CAMPOS_RESERVA).eq('mascota_id', mascotaId).order('entrada', { ascending: false })) as ReservaFila[]).map(reserva);
  },
  async estadoReserva(id, estado) {
    ok(await supabase.from('reservas').update({ estado }).eq('id', id));
  },
  async clientes(busqueda) {
    const filas = ok(await supabase.from('perfiles').select('*, mascotas(*)').eq('rol', 'cliente').order('nombre').limit(500)) as ClienteConMascotas[];
    const q = busqueda.trim().toLowerCase();
    return (filas || []).filter((c) => !q || [c.nombre, c.email, c.telefono, ...c.mascotas.map((m) => m.nombre)].some((t) => t?.toLowerCase().includes(q)));
  },
  async altaClienteMostrador({ nombre, telefono, email }) {
    return ok(await supabase.rpc('alta_cliente_mostrador', { p_nombre: nombre, p_telefono: telefono, p_email: email })) as Perfil;
  },
  async cliente(id) {
    return ok(await supabase.from('perfiles').select('*').eq('id', id).maybeSingle());
  },
  async pedidos() {
    return (ok(await supabase.from('pedidos').select(CAMPOS_PEDIDO).order('created_at', { ascending: false }).limit(300)) as PedidoFila[]).map(pedido);
  },
  async estadoPedido(id, estado) {
    ok(await supabase.rpc('estado_pedido', { p_id: id, p_estado: estado }));
  },
  async guardarServicio(s) {
    const { id, ...datos } = s;
    ok(id ? await supabase.from('servicios').update(datos).eq('id', id) : await supabase.from('servicios').insert(datos));
  },
  async guardarProducto(p) {
    const { id, ...datos } = p;
    ok(id ? await supabase.from('productos').update(datos).eq('id', id) : await supabase.from('productos').insert(datos));
  },
  async guardarAjustes(a) {
    // pago_cuenta y pago_prueba solo los cambia el servidor al conectar Mercado Pago.
    const { pago_cuenta: _c, pago_prueba: _p, ...cambios } = a;
    ok(await supabase.from('ajustes').update(cambios).eq('id', 1));
  },
  async conectarPagos(accessToken) {
    return pagos({ accion: 'conectar', access_token: accessToken });
  },
  async desconectarPagos() {
    ok(await supabase.rpc('pago_desconectar'));
  },
  async reembolsar(reservaId) {
    await pagos({ accion: 'reembolsar', reserva: reservaId });
  },
  async marcarReembolsado(reservaId) {
    ok(await supabase.rpc('marcar_reembolsado', { p_reserva: reservaId }));
  },
  async misCamaras() {
    return (ok(await supabase.rpc('mis_camaras')) as CamaraCliente[]) || [];
  },
  async camaras() {
    return ok(await supabase.from('camaras').select('*').order('orden').order('nombre')) as Camara[];
  },
  async guardarCamara(c) {
    const { id, created_at: _c, ...datos } = c;
    ok(id ? await supabase.from('camaras').update(datos).eq('id', id) : await supabase.from('camaras').insert(datos));
  },
  async borrarCamara(id) {
    ok(await supabase.from('camaras').delete().eq('id', id));
  },
  async reporteVentas(desde, hasta) {
    const r = ok(await supabase.rpc('reporte_ventas', { p_desde: desde, p_hasta: hasta })) as ReporteVentas;
    // numeric llega como número en jsonb; se normaliza por si acaso.
    const n = (x: unknown) => Number(x || 0);
    return {
      servicios: { total: n(r.servicios.total), cantidad: n(r.servicios.cantidad), en_linea: n(r.servicios.en_linea) },
      por_servicio: r.por_servicio.map((x) => ({ ...x, cantidad: n(x.cantidad), unidades: n(x.unidades), total: n(x.total) })),
      tienda: { total: n(r.tienda.total), cantidad: n(r.tienda.cantidad) },
      productos: r.productos.map((x) => ({ ...x, cantidad: n(x.cantidad), total: n(x.total) })),
      por_dia: r.por_dia.map((x) => ({ dia: x.dia, servicios: n(x.servicios), tienda: n(x.tienda) })),
      reembolsos: { total: n(r.reembolsos.total), cantidad: n(r.reembolsos.cantidad) },
      por_cobrar: { total: n(r.por_cobrar.total), cantidad: n(r.por_cobrar.cantidad) },
    };
  },
};
