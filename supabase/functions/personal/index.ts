// BarberaGo · personal con código de acceso (sin correo).
//
// El administrador da de alta a su gente por nombre y agenda; esta función crea la cuenta de Auth con un
// correo interno derivado del código (nunca recibe correos, así no se envía email ni se topa el límite de
// envíos) y devuelve el código para que se lo entregue. La persona entra en "Portal barberos" con el código.
//
// verify_jwt = false (como `pagos`): la sesión se valida aquí mismo con /auth/v1/user.
//   POST {accion:"crear", negocio, nombre, rol, barbero: uuid | "nueva" | null}   → {codigo}
//   POST {accion:"nuevo_codigo", negocio, usuario}                               → {codigo}  (el anterior deja de servir)
//   POST {accion:"eliminar", negocio, usuario}                                   → borra la cuenta
//
// El código nunca se guarda: si se pierde, el administrador genera uno nuevo.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRETA = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default as string | undefined; } catch { return undefined; }
})() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  if (!r.ok) throw new Error(`auth ${metodo} ${ruta}: ${r.status} ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

async function usuarioDe(req: Request) {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SECRETA, Authorization: `Bearer ${jwt}` } });
  if (!u.ok) throw new ErrorVisible('Inicia sesión de nuevo');
  return await u.json() as { id: string };
}

// ── Código de acceso (misma derivación que src/lib/codigoAcceso.ts) ──
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // sin 0/O, 1/I/L
const UUID = /^[0-9a-f-]{36}$/i;

function generarCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

async function credenciales(codigo: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`barberago:${codigo}`));
  const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  return { email: `c${hex.slice(0, 24)}@personal.barberago.restorago.com`, password: `Bg1-${codigo}` };
}

const bonito = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;

async function manejar(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const b = await req.json().catch(() => ({}));
    const actor = await usuarioDe(req);
    const negocio = String(b.negocio || '');
    if (!UUID.test(negocio)) throw new ErrorVisible('Barbería no válida');

    if (b.accion === 'crear') {
      const nombre = String(b.nombre || '').trim();
      const rol = ['admin', 'recepcion', 'barbero'].includes(b.rol) ? b.rol : 'barbero';
      const nueva = b.barbero === 'nueva';
      const barbero = !nueva && UUID.test(String(b.barbero || '')) ? String(b.barbero) : null;
      if (!nombre) throw new ErrorVisible('Escribe el nombre');
      await rpc('personal_validar', { p_actor: actor.id, p_negocio: negocio });

      const codigo = generarCodigo();
      const { email, password } = await credenciales(codigo);
      const u = await authAdmin('', 'POST', {
        email, password, email_confirm: true,
        user_metadata: { nombre }, app_metadata: { personal: true },
      });
      try {
        await rpc('personal_registrar', {
          p_actor: actor.id, p_negocio: negocio, p_usuario: u.id, p_nombre: nombre, p_rol: rol,
          p_barbero: barbero, p_crear_agenda: nueva,
        });
      } catch (e) {
        await authAdmin(`/${u.id}`, 'DELETE').catch(() => {});
        throw e;
      }
      return json({ codigo: bonito(codigo) });
    }

    const usuario = String(b.usuario || '');
    if (!UUID.test(usuario)) throw new ErrorVisible('Persona no válida');

    if (b.accion === 'nuevo_codigo') {
      await rpc('personal_validar', { p_actor: actor.id, p_negocio: negocio, p_usuario: usuario });
      const codigo = generarCodigo();
      const { email, password } = await credenciales(codigo);
      await authAdmin(`/${usuario}`, 'PUT', { email, password, email_confirm: true });
      return json({ codigo: bonito(codigo) });
    }

    if (b.accion === 'eliminar') {
      await rpc('personal_validar', { p_actor: actor.id, p_negocio: negocio, p_usuario: usuario });
      await authAdmin(`/${usuario}`, 'DELETE');
      return json({ ok: true });
    }

    throw new ErrorVisible('Acción no válida');
  } catch (e) {
    if (e instanceof ErrorVisible) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'No se pudo completar. Intenta de nuevo.' }, 500);
  }
}

Deno.serve(manejar);
