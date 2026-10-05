// BarberaGo · acciones del panel maestro que necesitan la API de administración de Auth.
//
// verify_jwt = false: la sesión se valida aquí con /auth/v1/user y la base confirma que es maestro.
//   POST {accion:"contrasena", usuario, contrasena}  → cambia la contraseña de una cuenta
//   POST {accion:"eliminar", usuario}                → cancela su mensualidad en Mercado Pago, borra sus barberías,
//                                                       las cuentas con código de su personal y la cuenta
//   POST {accion:"limpieza"}                         → (pg_cron cada hora) borra las cuentas de más de 24 h que nunca
//                                                       crearon barbería, ni pagaron, ni son parte de un equipo.
//                                                       No necesita sesión: la base decide qué cuentas califican.
// Nunca se puede cambiar ni borrar una cuenta maestra ni la propia.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRETA = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined; } catch { return undefined; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

function cabeceras(): Record<string, string> {
  const h: Record<string, string> = { apikey: SECRETA, 'Content-Type': 'application/json' };
  if (SECRETA.startsWith('eyJ')) h.Authorization = `Bearer ${SECRETA}`; // llave antigua (JWT)
  return h;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: cabeceras(), body: JSON.stringify(args) });
  const texto = await r.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!r.ok) {
    if (datos?.code === 'P0001') throw new ErrorVisible(datos.message);
    throw new Error(`rpc ${fn}: ${r.status} ${texto}`);
  }
  return datos as T;
}

async function authAdmin(ruta: string, metodo: string, cuerpo?: unknown) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users${ruta}`, {
    method: metodo, headers: cabeceras(), body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  if (!r.ok && !(metodo === 'DELETE' && r.status === 404)) throw new Error(`auth ${metodo} ${ruta}: ${r.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

async function usuarioDe(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SECRETA, Authorization: `Bearer ${jwt}` } });
  if (!u.ok) throw new ErrorVisible('Inicia sesión de nuevo');
  return await u.json() as { id: string };
}

const UUID = /^[0-9a-f-]{36}$/i;

type Preparado = { personal: boolean; negocios: string[]; mp_suscripcion: string | null; personal_equipo: string[] };

async function eliminar(actor: string, usuario: string) {
  const d = await rpc<Preparado>('maestro_cuenta_preparar', { p_actor: actor, p_usuario: usuario });
  // 1. Deja de cobrarle: cancela la mensualidad en Mercado Pago.
  if (d.mp_suscripcion) {
    const p = await rpc<{ token: string | null }>('plataforma_token', {});
    if (p?.token) {
      const r = await fetch(`${MP}/preapproval/${encodeURIComponent(d.mp_suscripcion)}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${p.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!r.ok) {
        console.error('No se pudo cancelar la suscripción', d.mp_suscripcion, r.status, await r.text());
        throw new ErrorVisible('Mercado Pago no permitió cancelar su mensualidad. Intenta de nuevo antes de borrar la cuenta.');
      }
    }
  }
  // 2. Sus barberías (con todo lo que tienen dentro).
  if (d.negocios.length) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/negocios?id=in.(${d.negocios.join(',')})`, { method: 'DELETE', headers: cabeceras() });
    if (!r.ok) throw new Error(`borrar negocios: ${r.status} ${await r.text()}`);
  }
  // 3. Las cuentas con código de su personal y la cuenta misma.
  for (const id of d.personal_equipo) await authAdmin(`/${id}`, 'DELETE');
  await authAdmin(`/${usuario}`, 'DELETE');
  return { ok: true, barberias: d.negocios.length, personal: d.personal_equipo.length };
}

async function limpieza() {
  const ids = await rpc<string[]>('limpieza_candidatos', {});
  let borradas = 0;
  for (const id of ids || []) {
    try { await authAdmin(`/${id}`, 'DELETE'); borradas++; } catch (e) { console.error(e); }
  }
  return { borradas };
}

async function manejar(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const b = await req.json().catch(() => ({}));
    if (b.accion === 'limpieza') return json(await limpieza());

    const actor = await usuarioDe(req);
    const usuario = String(b.usuario || '');
    if (!UUID.test(usuario)) throw new ErrorVisible('Cuenta no válida');

    if (b.accion === 'contrasena') {
      const contrasena = String(b.contrasena || '');
      if (contrasena.length < 8) throw new ErrorVisible('La contraseña debe tener al menos 8 caracteres');
      const d = await rpc<Preparado>('maestro_cuenta_preparar', { p_actor: actor.id, p_usuario: usuario });
      if (d.personal) throw new ErrorVisible('Esta cuenta entra con código: genera un código nuevo desde Equipo de su barbería');
      await authAdmin(`/${usuario}`, 'PUT', { password: contrasena });
      return json({ ok: true });
    }

    if (b.accion === 'eliminar') return json(await eliminar(actor.id, usuario));

    throw new ErrorVisible('Acción no válida');
  } catch (e) {
    if (e instanceof ErrorVisible) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'No se pudo completar. Intenta de nuevo.' }, 500);
  }
}

Deno.serve(manejar);
