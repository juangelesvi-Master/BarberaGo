// Puente de impresión de BeatyNails: recibe tickets del panel y los manda a una impresora
// térmica de red (puerto 9100). El navegador no puede abrir ese puerto por sí mismo.
//
// Uso, en una computadora del salón conectada a la misma red que la impresora:
//   node puente-impresora.js
// Deja la ventana abierta. En el panel, sección Impresora, elige "Red (IP)".
//
// Solo acepta conexiones desde esta misma computadora y solo imprime en direcciones de red
// local (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
// Variables opcionales: PUERTO (por defecto 9123).
const http = require("http");
const net = require("net");

const PUERTO = Number(process.env.PUERTO || 9123);

function esRedLocal(ip) {
  if (!net.isIPv4(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function responder(res, codigo, cuerpo) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(cuerpo));
}

function imprimir(host, port, datos) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port, timeout: 5000 }, () => s.end(datos, resolve));
    s.on("timeout", () => { s.destroy(); reject(new Error(`La impresora ${host}:${port} no respondió.`)); });
    s.on("error", (e) => reject(new Error(`No se pudo conectar con ${host}:${port} (${e.code || e.message}).`)));
  });
}

http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.method === "GET" && req.url === "/estado") return responder(res, 200, { ok: true });
  if (req.method !== "POST" || req.url !== "/imprimir") return responder(res, 404, { ok: false, error: "Ruta no encontrada" });

  let cuerpo = "";
  req.on("data", (c) => { cuerpo += c; if (cuerpo.length > 1e6) req.destroy(); });
  req.on("end", async () => {
    try {
      const { host, port = 9100, data } = JSON.parse(cuerpo);
      if (!esRedLocal(host)) return responder(res, 400, { ok: false, error: "La IP de la impresora debe ser de la red local (por ejemplo 192.168.1.50)." });
      const datos = Buffer.from(String(data || ""), "base64");
      if (!datos.length) return responder(res, 400, { ok: false, error: "El ticket llegó vacío." });
      await imprimir(host, Number(port), datos);
      console.log(new Date().toLocaleString("es-MX"), `Ticket enviado a ${host}:${port} (${datos.length} bytes)`);
      responder(res, 200, { ok: true });
    } catch (e) {
      console.error(e.message);
      responder(res, 502, { ok: false, error: e.message });
    }
  });
}).listen(PUERTO, "127.0.0.1", () => {
  console.log(`Puente de impresión listo en http://localhost:${PUERTO}`);
  console.log("Deja esta ventana abierta mientras uses el panel.");
});
