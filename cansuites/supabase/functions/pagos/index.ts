// CanSuites · pagos en línea con Mercado Pago (Checkout Pro). Adaptado de la función de BarberaGo.
//
// Una sola función con varias acciones (verify_jwt = false: Mercado Pago no manda JWT; cada acción valida lo suyo):
//   POST {accion:"cobrar", reserva}          (sesión del cliente) Liga de pago de su reserva apartada.
//   POST {accion:"verificar", reserva}       Pregunta a Mercado Pago por los pagos (respaldo si el aviso se atrasa).
//   POST {accion:"conectar", access_token}   (sesión del administrador) Valida la llave y la guarda en el servidor.
//   POST {accion:"reembolsar", reserva}      (sesión del personal) Devuelve lo pagado de una reserva cancelada.
//   POST ?accion=webhook                     Aviso de Mercado Pago: consulta el pago y confirma la reserva.
//
// La llave de Mercado Pago solo vive en privado.pago_cuenta; nunca llega al navegador.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRETA = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined; } catch { return undefined; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || 'https://cansuites.restorago.com';
const ORIGENES = (Deno.env.get('ORIGENES') || `${APP_URL},https://cansuites.com,https://www.cansuites.com,http://localhost:5173,http://localhost:4173`).split(',');
const MP = 'https://api.mercadopago.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

class ErrorVisible extends Error {}

/** Llama una función de la base con la llave secreta (solo service_role puede usar las pago_*). */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { apikey: SECRETA, 'Content-Type': 'application/json' };
  if (SECRETA.startsWith('eyJ')) headers.Authorization = `Bearer ${SECRETA}`; // llave antigua (JWT)
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!r.ok) {
    if (datos?.code === 'P0001') throw new ErrorVisible(datos.message);
    throw new Error(`rpc ${fn}: ${r.status} ${texto}`);
  }
  return datos as T;
}

async function mp(token: string, ruta: string, init: RequestInit = {}) {
  const r = await fetch(`${MP}${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const datos = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, datos };
}

/** Usuario de la sesión (por el JWT que manda supabase-js) y su rol. */
async function usuario(req: Request): Promise<{ id: string; rol: string }> {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SECRETA, Authorization: `Bearer ${jwt}` } });
  if (!u.ok) throw new ErrorVisible('Inicia sesión de nuevo');
  const { id } = await u.json();
  return { id, rol: (await rpc<string | null>('pago_rol', { p_usuario: id })) || 'cliente' };
}

type Pago = { id: number; status: string; transaction_amount: number; external_reference: string | null };
const UUID = /^[0-9a-f-]{36}$/i;

/** Registra un pago en la reserva y lo devuelve si ya no corresponde (apartado vencido, pago doble). */
async function procesarPago(token: string, pago: Pago) {
  const id = pago.external_reference || '';
  if (!UUID.test(id)) return 'ignorado';
  const res = await rpc<string>('pago_registrar', { p_reserva: id, p_pago_id: String(pago.id), p_estado: pago.status, p_monto: pago.transaction_amount });
  if (res === 'reembolsar') {
    const r = await mp(token, `/v1/payments/${pago.id}/refunds`, { method: 'POST', body: '{}', headers: { 'X-Idempotency-Key': `reembolso-${pago.id}` } });
    if (!r.ok && r.status !== 400) console.error('No se pudo reembolsar', pago.id, r.status, r.datos);
  }
  return res;
}

type Cobro = { id: string; folio: number; cliente_id: string; nombre: string; email: string | null; monto: number; expira: string; servicio_id: string; concepto: string; access_token: string | null };

async function cobrar(req: Request, b: Record<string, unknown>) {
  const yo = await usuario(req);
  const reserva = String(b.reserva || '');
  if (!UUID.test(reserva)) throw new ErrorVisible('Reserva no válida');
  const c = await rpc<Cobro>('pago_cobro', { p_reserva: reserva });
  if (c.cliente_id !== yo.id && yo.rol === 'cliente') throw new ErrorVisible('No encontramos esa reserva');
  if (!c.access_token) throw new ErrorVisible('CanSuites no tiene pagos en línea por ahora. Paga al llegar.');

  const origen = req.headers.get('origin') || '';
  const base = ORIGENES.includes(origen) ? origen : APP_URL;
  const regreso = `${base}/cuenta/pago/${c.id}`;
  const preferencia = {
    items: [{ id: c.servicio_id, title: `${c.concepto} · CanSuites`.slice(0, 250), quantity: 1, unit_price: Number(c.monto), currency_id: 'MXN' }],
    payer: { name: (c.nombre || '').slice(0, 80), ...(c.email ? { email: c.email } : {}) },
    external_reference: c.id,
    metadata: { reserva_id: c.id, folio: c.folio },
    notification_url: `${SUPABASE_URL}/functions/v1/pagos?accion=webhook`,
    back_urls: { success: regreso, failure: regreso, pending: regreso },
    ...(base.startsWith('https://') ? { auto_return: 'approved' } : {}),
    // Solo pagos al instante (tarjeta o saldo): OXXO o depósito tardarían más que el apartado.
    binary_mode: true,
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 1 },
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(c.expira).toISOString(),
    statement_descriptor: 'CANSUITES',
  };
  const p = await mp(c.access_token, '/checkout/preferences', {
    method: 'POST', body: JSON.stringify(preferencia), headers: { 'X-Idempotency-Key': `pref-${c.id}-${Date.now()}` },
  });
  if (!p.ok || !p.datos?.init_point) {
    console.error('Mercado Pago rechazó la preferencia', p.status, p.datos);
    throw new ErrorVisible('No se pudo iniciar el pago. Intenta de nuevo o escríbenos por WhatsApp.');
  }
  return json({ url: p.datos.init_point, monto: c.monto, expira: c.expira });
}

async function verificar(b: Record<string, unknown>) {
  const id = String(b.reserva || '');
  if (!UUID.test(id)) throw new ErrorVisible('Reserva no válida');
  const token = await rpc<string | null>('pago_token', {});
  if (!token) return json({ ok: true });
  const r = await mp(token, `/v1/payments/search?external_reference=${id}&sort=date_created&criteria=desc`);
  for (const pago of (r.datos?.results || []) as Pago[]) {
    if (pago.external_reference === id && pago.status === 'approved') await procesarPago(token, pago);
  }
  return json({ ok: true });
}

async function conectar(req: Request, b: Record<string, unknown>) {
  const yo = await usuario(req);
  if (yo.rol !== 'admin') throw new ErrorVisible('Solo el administrador puede conectar los pagos');
  const token = String(b.access_token || '').trim();
  if (!/^(APP_USR|TEST)-[\w-]{20,}$/.test(token)) throw new ErrorVisible('Pega el Access Token completo (empieza con APP_USR- o TEST-)');
  const cuenta = await mp(token, '/users/me');
  if (!cuenta.ok) throw new ErrorVisible('Mercado Pago no reconoce ese Access Token');
  const prueba = token.startsWith('TEST-') || /^TEST/i.test(cuenta.datos?.nickname || '') || (cuenta.datos?.tags || []).includes('test_user');
  const nombre = String(cuenta.datos?.nickname || cuenta.datos?.email || cuenta.datos?.id);
  await rpc('pago_guardar_cuenta', { p_token: token, p_cuenta: nombre, p_prueba: prueba });
  return json({ cuenta: nombre, prueba });
}

async function reembolsar(req: Request, b: Record<string, unknown>) {
  const yo = await usuario(req);
  if (yo.rol === 'cliente') throw new ErrorVisible('Sin permiso');
  const id = String(b.reserva || '');
  if (!UUID.test(id)) throw new ErrorVisible('Reserva no válida');
  const r = await rpc<{ pago_id: string; pagado: number; access_token: string | null } | null>('pago_por_reembolsar', { p_reserva: id });
  if (!r) throw new ErrorVisible('Esta reserva no tiene un pago en línea por devolver');
  if (!r.access_token) throw new ErrorVisible('Mercado Pago está desconectado. Devuélvelo por tu cuenta y márcalo como reembolsado.');
  const res = await mp(r.access_token, `/v1/payments/${encodeURIComponent(r.pago_id)}/refunds`, {
    method: 'POST', body: '{}', headers: { 'X-Idempotency-Key': `reembolso-${r.pago_id}` },
  });
  if (!res.ok) {
    console.error('Reembolso rechazado', r.pago_id, res.status, res.datos);
    throw new ErrorVisible('Mercado Pago no aceptó el reembolso. Revísalo en tu cuenta de Mercado Pago.');
  }
  await rpc('pago_marcar_reembolso', { p_reserva: id });
  return json({ ok: true, monto: r.pagado });
}

async function webhook(url: URL, req: Request) {
  const cuerpo = await req.json().catch(() => ({} as Record<string, any>));
  const tipo = cuerpo.type || cuerpo.topic || url.searchParams.get('type') || url.searchParams.get('topic');
  const id = cuerpo.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
  if (tipo !== 'payment' || !id) return json({ ok: true });
  const token = await rpc<string | null>('pago_token', {});
  if (!token) return json({ ok: true });
  // Nunca se confía en el cuerpo del aviso: se consulta el pago con la llave de CanSuites.
  const r = await mp(token, `/v1/payments/${encodeURIComponent(String(id))}`);
  if (!r.ok) return json({ ok: false }, r.status === 404 ? 200 : 500);
  await procesarPago(token, r.datos as Pago);
  return json({ ok: true });
}

export async function manejar(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = new URL(req.url);
  try {
    if (url.searchParams.get('accion') === 'webhook') return await webhook(url, req);
    const b = await req.json().catch(() => ({}));
    switch (b.accion) {
      case 'cobrar': return await cobrar(req, b);
      case 'verificar': return await verificar(b);
      case 'conectar': return await conectar(req, b);
      case 'reembolsar': return await reembolsar(req, b);
      default: return json({ error: 'Acción no válida' }, 400);
    }
  } catch (e) {
    if (e instanceof ErrorVisible) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'Ocurrió un error con el pago. Intenta de nuevo.' }, 500);
  }
}

Deno.serve(manejar);
