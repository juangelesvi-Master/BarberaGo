// BeatyNails · cobros en línea con Mercado Pago y Stripe, y código por SMS para confirmar citas,
// para la página estática (beatynails/).
//
// Las llaves secretas viven solo aquí, como secretos de la función:
//   BN_MP_ACCESS_TOKEN    Access Token de Mercado Pago (APP_USR-... o TEST-...)
//   BN_STRIPE_SECRET_KEY  Llave secreta de Stripe (sk_live_... o sk_test_...)
//   BN_ORIGENES           Dominios de la página separados por coma (https://beatynails.com,...)
//   BN_MONEDA             Moneda, por defecto MXN
//   BN_TWILIO_SID         Account SID de Twilio (AC...) para mandar el código por SMS
//   BN_TWILIO_TOKEN       Auth Token de Twilio
//   BN_TWILIO_FROM        Número de Twilio que envía (+1...) o Messaging Service SID (MG...)
//   BN_CODIGO_SECRETO     Texto largo al azar para firmar los códigos (opcional; si falta se usa el Auth Token)
//   BN_PAIS               Lada del país para números de 10 dígitos, por defecto 52 (México)
//
// Acciones (POST JSON):
//   {accion:"estado"}  → qué proveedores tienen llave
//   {accion:"crear", proveedor:"mp"|"stripe", referencia, items:[{nombre, cantidad, precio}], cliente:{nombre}, regreso}
//        → {url}: liga de pago. Al terminar, el proveedor regresa a `regreso` con ?pago=...&prov=...&ref=...
//   {accion:"verificar", proveedor, id, referencia}
//        → {pagado, estado, monto}: se consulta al proveedor; nunca se confía en lo que diga el navegador.
//   {accion:"codigo-enviar", telefono}
//        → {token}: manda por SMS un código de 4 números. El navegador nunca recibe el código, solo
//          un token firmado que sirve para revisarlo durante 10 minutos.
//   {accion:"codigo-verificar", telefono, token, codigo} → {ok}
//
// Despliegue: supabase functions deploy beatynails-pagos --no-verify-jwt

type Env = (k: string) => string | undefined;
type Item = { nombre: string; cantidad: number; precio: number };

const MP = "https://api.mercadopago.com";
const STRIPE = "https://api.stripe.com/v1";
const REF = /^[A-Za-z0-9-]{1,40}$/;

class ErrorVisible extends Error {}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(datos: unknown, status = 200) {
  return new Response(JSON.stringify(datos), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function leerItems(b: Record<string, unknown>): Item[] {
  const lista = Array.isArray(b.items) ? b.items : [];
  if (!lista.length || lista.length > 30) throw new ErrorVisible("El cobro no tiene artículos.");
  return lista.map((i: Record<string, unknown>) => {
    const nombre = String(i?.nombre || "").trim().slice(0, 120);
    const cantidad = Math.trunc(Number(i?.cantidad));
    const precio = Math.round(Number(i?.precio) * 100) / 100;
    if (!nombre || !(cantidad >= 1 && cantidad <= 99) || !(precio > 0 && precio <= 100000)) throw new ErrorVisible("Hay un artículo con datos no válidos.");
    return { nombre, cantidad, precio };
  });
}

/** La página solo puede pedir que el cliente regrese a uno de sus propios dominios. */
function leerRegreso(b: Record<string, unknown>, req: Request, env: Env): URL {
  let url: URL;
  try { url = new URL(String(b.regreso || "")); } catch { throw new ErrorVisible("Falta la dirección de regreso."); }
  const permitidos = (env("BN_ORIGENES") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origen = req.headers.get("origin") || "";
  const ok = permitidos.length ? permitidos.includes(url.origin) : url.origin === origen;
  if (!ok || !/^https?:$/.test(url.protocol)) throw new ErrorVisible("Este dominio no está autorizado para cobrar.");
  url.search = ""; url.hash = "";
  return url;
}

function conParams(base: URL, params: Record<string, string>) {
  const u = new URL(base.toString());
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  // Stripe reemplaza {CHECKOUT_SESSION_ID} solo si va sin codificar
  return u.toString().replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}");
}

async function crearMP(token: string, ref: string, items: Item[], cliente: string, regreso: URL, moneda: string) {
  const vuelta = conParams(regreso, { pago: "vuelta", prov: "mp", ref });
  const r = await fetch(`${MP}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": `bn-${ref}-${Date.now()}` },
    body: JSON.stringify({
      items: items.map((i, n) => ({ id: `${ref}-${n + 1}`, title: i.nombre, quantity: i.cantidad, unit_price: i.precio, currency_id: moneda })),
      payer: { name: cliente.slice(0, 80) },
      external_reference: ref,
      back_urls: { success: vuelta, failure: vuelta, pending: vuelta },
      ...(regreso.protocol === "https:" ? { auto_return: "approved" } : {}),
      statement_descriptor: "BEATYNAILS",
    }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.init_point) { console.error("Mercado Pago", r.status, d); throw new ErrorVisible("Mercado Pago no pudo iniciar el pago. Intenta de nuevo."); }
  return { url: d.init_point as string, id: String(d.id) };
}

async function crearStripe(key: string, ref: string, items: Item[], regreso: URL, moneda: string) {
  const f = new URLSearchParams();
  f.set("mode", "payment");
  f.set("client_reference_id", ref);
  f.set("metadata[referencia]", ref);
  f.set("success_url", conParams(regreso, { pago: "vuelta", prov: "stripe", ref, id: "{CHECKOUT_SESSION_ID}" }));
  f.set("cancel_url", conParams(regreso, { pago: "cancelado", prov: "stripe", ref }));
  items.forEach((i, n) => {
    f.set(`line_items[${n}][quantity]`, String(i.cantidad));
    f.set(`line_items[${n}][price_data][currency]`, moneda.toLowerCase());
    f.set(`line_items[${n}][price_data][unit_amount]`, String(Math.round(i.precio * 100)));
    f.set(`line_items[${n}][price_data][product_data][name]`, i.nombre);
  });
  const r = await fetch(`${STRIPE}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `bn-${ref}-${Date.now()}` },
    body: f.toString(),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.url) { console.error("Stripe", r.status, d); throw new ErrorVisible("Stripe no pudo iniciar el pago. Intenta de nuevo."); }
  return { url: d.url as string, id: String(d.id) };
}

async function verificarMP(token: string, id: string, ref: string) {
  if (!/^\d{1,20}$/.test(id)) throw new ErrorVisible("Pago no válido.");
  const r = await fetch(`${MP}/v1/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) return { pagado: false, estado: "no-encontrado", monto: 0 };
  const deEsteCobro = d.external_reference === ref;
  return { pagado: deEsteCobro && d.status === "approved", estado: deEsteCobro ? String(d.status) : "otra-referencia", monto: Number(d.transaction_amount) || 0 };
}

async function verificarStripe(key: string, id: string, ref: string) {
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) throw new ErrorVisible("Pago no válido.");
  const r = await fetch(`${STRIPE}/checkout/sessions/${id}`, { headers: { Authorization: `Bearer ${key}` } });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) return { pagado: false, estado: "no-encontrado", monto: 0 };
  const deEsteCobro = d.client_reference_id === ref;
  return { pagado: deEsteCobro && d.payment_status === "paid", estado: deEsteCobro ? String(d.payment_status) : "otra-referencia", monto: (Number(d.amount_total) || 0) / 100 };
}

// ---------- Código por SMS ----------
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function firmar(secreto: string, texto: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(texto)));
}
function igual(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function leerTelefono(b: Record<string, unknown>, env: Env) {
  const d = String(b.telefono || "").replace(/\D/g, "");
  if (d.length === 10) return "+" + (env("BN_PAIS") || "52") + d;
  if (d.length >= 11 && d.length <= 15) return "+" + d;
  throw new ErrorVisible("Escribe un celular a 10 dígitos.");
}
/** Solo la página del salón puede pedir códigos (evita que otros sitios manden SMS con tu cuenta). */
function revisarOrigen(req: Request, env: Env) {
  const permitidos = (env("BN_ORIGENES") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (permitidos.length && !permitidos.includes(req.headers.get("origin") || "")) throw new ErrorVisible("Este dominio no está autorizado.");
}
const VIGENCIA = 10 * 60 * 1000;

async function codigoEnviar(b: Record<string, unknown>, req: Request, env: Env) {
  const sid = env("BN_TWILIO_SID"), tok = env("BN_TWILIO_TOKEN"), from = env("BN_TWILIO_FROM");
  if (!sid || !tok || !from) throw new ErrorVisible("El envío de códigos no está configurado en el salón.");
  revisarOrigen(req, env);
  const tel = leerTelefono(b, env);
  const n = new Uint32Array(1); crypto.getRandomValues(n);
  const codigo = String(n[0] % 10000).padStart(4, "0");
  const datos = b64u(enc.encode(JSON.stringify({ t: tel, e: Date.now() + VIGENCIA })));
  const token = datos + "." + await firmar(env("BN_CODIGO_SECRETO") || tok, datos + "|" + codigo);
  const f = new URLSearchParams({ To: tel, Body: `BeatyNails: tu código para confirmar tu cita es ${codigo}. Vence en 10 minutos.` });
  f.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: f.toString(),
  });
  if (!r.ok) { console.error("Twilio", r.status, await r.text().catch(() => "")); throw new ErrorVisible("No pudimos mandar el código a ese número. Revísalo e intenta de nuevo."); }
  return { token };
}

async function codigoVerificar(b: Record<string, unknown>, env: Env) {
  const tok = env("BN_TWILIO_TOKEN") || "";
  const tel = leerTelefono(b, env), codigo = String(b.codigo || ""), [datos, firma] = String(b.token || "").split(".");
  if (!/^\d{4}$/.test(codigo) || !datos || !firma) return { ok: false, motivo: "incorrecto" };
  let info: { t?: string; e?: number } = {};
  try { info = JSON.parse(atob(datos.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return { ok: false, motivo: "incorrecto" }; }
  if (info.t !== tel) return { ok: false, motivo: "incorrecto" };
  if (!info.e || info.e < Date.now()) return { ok: false, motivo: "vencido" };
  const ok = igual(await firmar(env("BN_CODIGO_SECRETO") || tok, datos + "|" + codigo), firma);
  return ok ? { ok: true } : { ok: false, motivo: "incorrecto" };
}

export async function manejar(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const mp = env("BN_MP_ACCESS_TOKEN") || "", stripe = env("BN_STRIPE_SECRET_KEY") || "", moneda = env("BN_MONEDA") || "MXN";
  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (b.accion === "estado") return json({ mp: !!mp, stripe: !!stripe, moneda, sms: !!(env("BN_TWILIO_SID") && env("BN_TWILIO_TOKEN") && env("BN_TWILIO_FROM")) });
    if (b.accion === "codigo-enviar") return json(await codigoEnviar(b, req, env));
    if (b.accion === "codigo-verificar") return json(await codigoVerificar(b, env));
    const proveedor = String(b.proveedor || "");
    if (proveedor !== "mp" && proveedor !== "stripe") throw new ErrorVisible("Elige Mercado Pago o Stripe.");
    if (proveedor === "mp" && !mp) throw new ErrorVisible("Mercado Pago no está configurado en el salón.");
    if (proveedor === "stripe" && !stripe) throw new ErrorVisible("Stripe no está configurado en el salón.");
    const ref = String(b.referencia || "");
    if (!REF.test(ref)) throw new ErrorVisible("Referencia no válida.");

    if (b.accion === "crear") {
      const items = leerItems(b), regreso = leerRegreso(b, req, env);
      const cliente = String((b.cliente as Record<string, unknown>)?.nombre || "");
      const r = proveedor === "mp" ? await crearMP(mp, ref, items, cliente, regreso, moneda) : await crearStripe(stripe, ref, items, regreso, moneda);
      return json({ ...r, monto: items.reduce((a, i) => a + i.cantidad * i.precio, 0) });
    }
    if (b.accion === "verificar") {
      const id = String(b.id || "");
      return json(proveedor === "mp" ? await verificarMP(mp, id, ref) : await verificarStripe(stripe, id, ref));
    }
    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    if (e instanceof ErrorVisible) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: "Ocurrió un error con el pago. Intenta de nuevo." }, 500);
  }
}

// @ts-ignore: Deno solo existe al desplegar en Supabase
if (typeof Deno !== "undefined") Deno.serve((req: Request) => manejar(req, (k) => Deno.env.get(k)));
