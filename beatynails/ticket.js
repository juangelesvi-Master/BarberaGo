// Tickets para impresoras térmicas (ESC/POS) del panel del salón.
// Tres formas de imprimir:
//   - Bluetooth: Web Bluetooth (Chrome o Edge en Android, Windows, Mac; no funciona en iPhone).
//   - Red IP:    el navegador no puede abrir el puerto 9100 de la impresora, así que manda el ticket
//                al "puente" (impresora/puente-impresora.js) que corre en una computadora del salón.
//   - Navegador: el diálogo de impresión normal, para cualquier impresora instalada en el equipo.
(function () {
  var DEFAULT_PRINTER = {
    mode: "bluetooth", width: 58, ip: "", port: 9100, bridge: "http://localhost:9123",
    name: "BeatyNails", address: "Av. Siempre Viva 123, Local 4, CDMX", phone: "55 0000 0000",
    footer: "¡Gracias por tu visita!\nSíguenos en @beatynails", cut: true
  };
  function config() { var c = BN.load("bn_printer", {}), d = JSON.parse(JSON.stringify(DEFAULT_PRINTER)); for (var k in c) d[k] = c[k]; return d; }
  function cols(cfg) { return +cfg.width === 80 ? 48 : 32; }

  // ---------- Contenido del ticket (líneas independientes de la impresora) ----------
  // Cada línea: { t: texto, a: "l"|"c"|"r", b: negrita, big: doble tamaño } o { hr: true } o { lr: [izq, der] }
  function header(cfg) {
    var L = [{ t: cfg.name || "BeatyNails", a: "c", big: true, b: true }];
    if (cfg.address) L.push({ t: cfg.address, a: "c" });
    if (cfg.phone) L.push({ t: "Tel. " + cfg.phone, a: "c" });
    L.push({ hr: true });
    return L;
  }
  function footer(cfg) {
    var L = [{ hr: true }];
    String(cfg.footer || "").split("\n").forEach(function (t) { if (t.trim()) L.push({ t: t.trim(), a: "c" }); });
    L.push({ t: "Impreso " + fmtStamp(BN.stamp()), a: "c" });
    return L;
  }
  function fmtStamp(s) { return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) + " " + s.slice(11, 16); }
  function fmtDate(ymd) { return ymd.slice(8, 10) + "/" + ymd.slice(5, 7) + "/" + ymd.slice(0, 4); }

  var B_LABEL = { "confirmada": "Confirmada", "completada": "Pagada", "no-asistio": "No asistió", "cancelada": "Cancelada" };
  var O_LABEL = { "nuevo": "Pendiente", "listo": "Listo para entregar", "entregado": "Entregado", "cancelado": "Cancelado" };

  function orderLines(o, cfg) {
    var L = header(cfg);
    L.push({ t: "PEDIDO " + o.id, a: "c", b: true });
    L.push({ lr: ["Fecha", fmtStamp(o.created || BN.stamp())] });
    L.push({ lr: ["Clienta", o.name || ""] });
    if (o.phone) L.push({ lr: ["Teléfono", o.phone] });
    L.push({ lr: ["Entrega", o.delivery === "envio" ? "Envío a domicilio" : "Recoge en salón"] });
    if (o.delivery === "envio" && o.address) L.push({ t: o.address });
    L.push({ hr: true });
    o.items.forEach(function (i) {
      L.push({ t: (i.name || i.id) });
      L.push({ lr: ["  " + i.q + " x " + BN.money(i.price), BN.money(i.q * i.price)] });
    });
    L.push({ hr: true });
    var sub = o.subtotal != null ? o.subtotal : o.items.reduce(function (a, i) { return a + i.q * i.price; }, 0);
    var ship = o.shipping != null ? o.shipping : o.total - sub;
    L.push({ lr: ["Subtotal", BN.money(sub)] });
    if (o.delivery === "envio") L.push({ lr: ["Envío", ship ? BN.money(ship) : "Gratis"] });
    L.push({ lr: ["TOTAL", BN.money(o.total)], b: true, big: true });
    payLines(L, o.payment, o.total);
    L.push({ lr: ["Estado", O_LABEL[o.status] || o.status || ""] });
    return L.concat(footer(cfg));
  }

  // Pago en línea (Mercado Pago o Stripe) de un pedido o cita
  function payLines(L, p, total) {
    if (!p || p.mode === "sucursal") return;
    var prov = { mp: "Mercado Pago", stripe: "Stripe" }[p.provider] || p.provider || "";
    if (p.status !== "pagado") { L.push({ lr: ["Pago en línea", p.status === "rechazado" ? "Rechazado" : "Pendiente"] }); return; }
    L.push({ lr: ["Pagado " + prov, BN.money(p.paid)] });
    if (total - p.paid >= 1) L.push({ lr: ["Por pagar", BN.money(total - p.paid)], b: true });
  }

  function bookingLines(b, svcName, price, cfg) {
    var L = header(cfg);
    L.push({ t: "CITA", a: "c", b: true });
    L.push({ lr: ["Fecha", fmtDate(b.date)] });
    L.push({ lr: ["Hora", BN.hm(b.start) + " a " + BN.hm(b.start + b.min)] });
    L.push({ lr: ["Clienta", b.name || ""] });
    if (b.phone) L.push({ lr: ["Teléfono", b.phone] });
    L.push({ lr: ["Atendió", b.staff || ""] });
    L.push({ hr: true });
    L.push({ t: svcName });
    L.push({ lr: ["  " + b.min + " min", BN.money(price)] });
    L.push({ hr: true });
    L.push({ lr: ["TOTAL", BN.money(price)], b: true, big: true });
    payLines(L, b.payment, price);
    L.push({ lr: ["Estado", B_LABEL[b.status] || b.status || ""] });
    if (b.notes) { L.push({ t: "Notas:" }); L.push({ t: b.notes }); }
    return L.concat(footer(cfg));
  }

  var METHOD = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" };
  function saleLines(v, cfg) {
    var L = header(cfg);
    L.push({ t: "VENTA " + v.id, a: "c", b: true });
    L.push({ lr: ["Fecha", fmtStamp(v.created || BN.stamp())] });
    if (v.name) L.push({ lr: ["Clienta", v.name] });
    if (v.staff) L.push({ lr: ["Atendió", v.staff] });
    L.push({ hr: true });
    v.items.forEach(function (i) {
      L.push({ t: i.name });
      L.push({ lr: ["  " + i.q + " x " + BN.money(i.price), BN.money(i.q * i.price)] });
    });
    L.push({ hr: true });
    L.push({ lr: ["Subtotal", BN.money(v.subtotal)] });
    if (v.discount) L.push({ lr: ["Descuento", "-" + BN.money(v.discount)] });
    L.push({ lr: ["TOTAL", BN.money(v.total)], b: true, big: true });
    L.push({ lr: ["Pago", METHOD[v.method] || v.method] });
    if (v.method === "efectivo" && v.received != null) { L.push({ lr: ["Recibido", BN.money(v.received)] }); L.push({ lr: ["Cambio", BN.money(v.change || 0)] }); }
    if (v.status === "cancelada") L.push({ t: "VENTA CANCELADA", a: "c", b: true });
    return L.concat(footer(cfg));
  }

  function testLines(cfg) {
    var L = header(cfg);
    L.push({ t: "PRUEBA DE IMPRESIÓN", a: "c", b: true });
    L.push({ t: "Si lees esto, la impresora quedó bien conectada." });
    L.push({ lr: ["Papel", cfg.width + " mm (" + cols(cfg) + " letras)"] });
    L.push({ lr: ["Acentos", "á é í ó ú ñ ¿ ¡"] });
    return L.concat(footer(cfg));
  }

  // ---------- Texto plano (vista previa y renglones por ancho) ----------
  function wrap(text, w) {
    var out = [], words = String(text).split(/\s+/), line = "";
    words.forEach(function (word) {
      while (word.length > w) { if (line) { out.push(line); line = ""; } out.push(word.slice(0, w)); word = word.slice(w); }
      if (!line) line = word; else if ((line + " " + word).length <= w) line += " " + word; else { out.push(line); line = word; }
    });
    if (line || !out.length) out.push(line);
    return out;
  }
  function lr(l, r, w) {
    l = String(l); r = String(r);
    if (l.length + 1 + r.length <= w) return [l + Array(w - l.length - r.length + 1).join(" ") + r];
    var rows = wrap(l, w); rows.push(Array(Math.max(0, w - r.length) + 1).join(" ") + r.slice(-w)); return rows;
  }
  function align(t, a, w) {
    if (a === "c") { var p = Math.max(0, Math.floor((w - t.length) / 2)); return Array(p + 1).join(" ") + t; }
    if (a === "r") return Array(Math.max(0, w - t.length) + 1).join(" ") + t;
    return t;
  }
  // Devuelve renglones ya acomodados al ancho: [{ s, b, big }]
  function layout(lines, cfg) {
    var W = cols(cfg), out = [];
    lines.forEach(function (ln) {
      var w = ln.big ? Math.floor(W / 2) : W;
      if (ln.hr) { out.push({ s: Array(W + 1).join("-") }); return; }
      var rows = ln.lr ? lr(ln.lr[0], ln.lr[1], w) : wrap(ln.t, w).map(function (r) { return align(r, ln.a, w); });
      rows.forEach(function (r) { out.push({ s: r, b: ln.b, big: ln.big }); });
    });
    return out;
  }
  function toText(lines, cfg) { return layout(lines, cfg).map(function (r) { return r.s; }).join("\n"); }

  // ---------- ESC/POS ----------
  // Página de códigos 850 (ESC t 2), la que traen casi todas las impresoras térmicas para el español
  var CP850 = { "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ü": 0x81, "Ü": 0x9a, "Á": 0xb5, "É": 0x90, "Í": 0xd6, "Ó": 0xe0, "Ú": 0xe9, "¿": 0xa8, "¡": 0xad, "°": 0xf8, "·": 0xfa };
  function enc(s, out) {
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = ch.charCodeAt(0);
      if (c < 128) out.push(c);
      else if (CP850[ch] != null) out.push(CP850[ch]);
      else { var plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, ""); out.push(plain.charCodeAt(0) < 128 ? plain.charCodeAt(0) : 0x3f); }
    }
  }
  function escpos(lines, cfg) {
    var out = [0x1b, 0x40, 0x1b, 0x74, 0x02]; // reiniciar, página de códigos 850
    layout(lines, cfg).forEach(function (r) {
      out.push(0x1b, 0x45, r.b ? 1 : 0);          // negrita
      out.push(0x1d, 0x21, r.big ? 0x11 : 0x00);   // doble alto y ancho
      enc(r.s, out); out.push(0x0a);
    });
    out.push(0x1b, 0x45, 0, 0x1d, 0x21, 0, 0x1b, 0x64, 4); // avanzar 4 renglones
    if (cfg.cut) out.push(0x1d, 0x56, 0x42, 0x00);         // corte parcial
    return new Uint8Array(out);
  }

  // ---------- Bluetooth ----------
  var BT_SERVICES = [
    "000018f0-0000-1000-8000-00805f9b34fb", // impresoras térmicas genéricas
    "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
    "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    "0000ff00-0000-1000-8000-00805f9b34fb",
    "0000fee7-0000-1000-8000-00805f9b34fb",
    "0000ae30-0000-1000-8000-00805f9b34fb",
    "0000ffe0-0000-1000-8000-00805f9b34fb"
  ];
  var bt = { device: null, ch: null };
  function btSupported() { return !!(navigator.bluetooth && navigator.bluetooth.requestDevice); }
  function btName() { return bt.device ? (bt.device.name || "Impresora Bluetooth") : ""; }
  function findWritable(server) {
    return server.getPrimaryServices().then(function (services) {
      var i = 0;
      function next() {
        if (i >= services.length) throw new Error("La impresora no tiene un canal para recibir tickets. ¿Es una impresora térmica ESC/POS?");
        return services[i++].getCharacteristics().then(function (chs) {
          var w = chs.find(function (c) { return c.properties.writeWithoutResponse || c.properties.write; });
          return w || next();
        }, next);
      }
      return next();
    });
  }
  function btConnect(choose) {
    if (!btSupported()) return Promise.reject(new Error("Este navegador no puede usar Bluetooth. Usa Chrome o Edge en Android o en computadora (en iPhone no funciona)."));
    if (bt.ch && bt.device && bt.device.gatt.connected && !choose) return Promise.resolve(bt.ch);
    var pick = bt.device && !choose ? Promise.resolve(bt.device) : navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
    return pick.then(function (dev) {
      bt.device = dev;
      dev.addEventListener("gattserverdisconnected", function () { bt.ch = null; });
      return dev.gatt.connect();
    }).then(findWritable).then(function (ch) { bt.ch = ch; return ch; });
  }
  function btSend(bytes) {
    return btConnect(false).then(function (ch) {
      var i = 0, size = 100;
      function next() {
        if (i >= bytes.length) return Promise.resolve();
        var part = bytes.slice(i, i + size); i += size;
        var p = ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse ? ch.writeValueWithoutResponse(part) : ch.writeValue(part);
        return p.then(function () { return new Promise(function (r) { setTimeout(r, 20); }); }).then(next);
      }
      return next();
    });
  }

  // ---------- Red IP (a través del puente) ----------
  function b64(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function ipSend(bytes, cfg) {
    if (!cfg.ip) return Promise.reject(new Error("Escribe la dirección IP de la impresora en Impresora."));
    var url = String(cfg.bridge || "").replace(/\/+$/, "") + "/imprimir";
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: cfg.ip, port: +cfg.port || 9100, data: b64(bytes) }) })
      .catch(function () { throw new Error("No se pudo hablar con el puente de impresión en " + cfg.bridge + ". Revisa que esté abierto en la computadora del salón."); })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || "El puente no pudo imprimir."); }); });
  }

  // ---------- Navegador ----------
  function browserPrint(lines, cfg) {
    var area = document.getElementById("printArea");
    area.style.setProperty("--paper", (+cfg.width === 80 ? 72 : 48) + "mm");
    area.innerHTML = layout(lines, cfg).map(function (r) { return '<div class="' + (r.b ? "b " : "") + (r.big ? "big" : "") + '">' + (BN.esc(r.s) || "&nbsp;") + "</div>"; }).join("");
    window.print();
    return Promise.resolve();
  }

  function print(lines, how) {
    var cfg = config(), mode = how || cfg.mode;
    if (mode === "navegador") return browserPrint(lines, cfg);
    var bytes = escpos(lines, cfg);
    return mode === "ip" ? ipSend(bytes, cfg) : btSend(bytes);
  }

  window.Ticket = {
    DEFAULT: DEFAULT_PRINTER, config: config, cols: cols,
    order: orderLines, booking: bookingLines, sale: saleLines, test: testLines,
    toText: toText, layout: layout, escpos: escpos, print: print,
    bt: { supported: btSupported, connect: btConnect, name: btName }
  };
})();
