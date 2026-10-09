// Datos compartidos entre la página (index.html) y el panel (admin.html).
// Todo se guarda en el navegador (localStorage). Los valores de DEFAULTS se usan
// mientras el panel no haya guardado cambios.
(function () {
  var DEFAULTS = {
    services: [
      { id: "mani-gel", name: "Manicura en gel", min: 60, price: 350, desc: "Limado, cutícula, esmalte en gel con 21 días de duración." },
      { id: "acrilico", name: "Uñas acrílicas (set completo)", min: 120, price: 650, desc: "Extensión con molde o tip, forma y largo a elegir." },
      { id: "relleno", name: "Relleno de acrílico", min: 90, price: 450, desc: "Mantenimiento de tu set a las 2 o 3 semanas." },
      { id: "rubber", name: "Rubber base / nivelación", min: 75, price: 420, desc: "Refuerza la uña natural con acabado liso y brillante." },
      { id: "pedi-spa", name: "Pedicura spa", min: 75, price: 400, desc: "Exfoliación, mascarilla, masaje y esmalte tradicional." },
      { id: "pedi-gel", name: "Pedicura con gel", min: 90, price: 480, desc: "Pedicura spa completa con esmalte en gel." },
      { id: "diseno", name: "Diseño a mano (por uña)", min: 15, price: 40, desc: "Flores, french, efecto mármol, cromo o pedrería." },
      { id: "retiro", name: "Retiro de gel o acrílico", min: 30, price: 150, desc: "Retiro seguro sin dañar la uña natural." }
    ],
    staff: ["Daniela", "Fernanda", "Valeria"],
    // Minutos desde medianoche [abre, cierra] por día de la semana; null = cerrado (0 = domingo)
    hours: { 0: null, 1: [600, 1200], 2: [600, 1200], 3: [600, 1200], 4: [600, 1200], 5: [600, 1200], 6: [600, 1080] },
    settings: {
      step: 30, shipping: 99, freeFrom: 800,
      // Código de 4 números por SMS para confirmar la cita (demo: se muestra en pantalla, no se manda)
      codigo: { activo: true, demo: true },
      // Cobro en línea: la llave secreta vive en la función del servidor, nunca aquí
      pagos: {
        url: "", key: "", demo: true, mp: true, stripe: true,
        citas: { completo: true, anticipo: true, sucursal: true }, pct: 50,
        tienda: { linea: true, sucursal: true }
      }
    },
    products: [
      { id: "p1", cat: "Esmaltes", name: "Esmalte en gel Rojo Cereza", desc: "15 ml · curado UV/LED", price: 189, stock: 24, active: true, art: ["bottle", "#b0123a"], tag: "Favorito" },
      { id: "p2", cat: "Esmaltes", name: "Esmalte en gel Nude Rosado", desc: "15 ml · curado UV/LED", price: 189, stock: 18, active: true, art: ["bottle", "#e7b5a8"] },
      { id: "p3", cat: "Esmaltes", name: "Esmalte en gel Lila Pastel", desc: "15 ml · curado UV/LED", price: 189, stock: 12, active: true, art: ["bottle", "#b9a3e3"] },
      { id: "p4", cat: "Esmaltes", name: "Top coat brillo espejo", desc: "15 ml · sin capa pegajosa", price: 210, stock: 30, active: true, art: ["bottle", "#f3eef0"] },
      { id: "p5", cat: "Cuidado", name: "Aceite de cutícula almendra", desc: "30 ml · con vitamina E", price: 149, stock: 3, active: true, art: ["dropper", "#e6b34a"], tag: "Nuevo" },
      { id: "p6", cat: "Cuidado", name: "Crema de manos karité", desc: "100 ml · absorción rápida", price: 179, stock: 15, active: true, art: ["tube", "#f1c6d3"] },
      { id: "p7", cat: "Herramientas", name: "Lima de vidrio", desc: "Grano fino, no daña la uña", price: 99, stock: 40, active: true, art: ["file", "#9fc7d9"] },
      { id: "p8", cat: "Herramientas", name: "Lámpara UV/LED 48 W", desc: "Temporizador 30/60/90 s", price: 749, stock: 0, active: true, art: ["lamp", "#d9d3d6"] },
      { id: "p9", cat: "Kits", name: "Kit de manicura en casa", desc: "Base, top, 2 colores, lima y aceite", price: 690, stock: 8, active: true, art: ["kit", "#8c1d40"], tag: "Ahorra 15%" }
    ]
  };

  // ---------- Utilidades ----------
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { n = Math.round(n); return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-MX"); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function hm(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function toMin(s) { var p = String(s).split(":"); return +p[0] * 60 + +(p[1] || 0); }
  function parseDate(s) { var p = s.split("-"); return new Date(+p[0], p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parseDate(s); d.setDate(d.getDate() + n); return ymd(d); }
  var DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function niceDate(s) { var d = parseDate(s); return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; }

  // ---------- Ilustraciones de producto (cuando no hay foto subida) ----------
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var m = function (c) { return Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f))); };
    return "#" + ((1 << 24) + (m(r) << 16) + (m(g) << 8) + m(b)).toString(16).slice(1);
  }
  var ART_KINDS = { bottle: "Frasco de esmalte", dropper: "Gotero", tube: "Tubo de crema", file: "Lima", lamp: "Lámpara", kit: "Kit" };
  function art(kind, c) {
    var bg1 = shade(c, .82), bg2 = shade(c, .62), dk = shade(c, -.35);
    var defs = '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + bg1 + '"/><stop offset="1" stop-color="' + bg2 + '"/></linearGradient>' +
      '<linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + dk + '"/><stop offset=".45" stop-color="' + c + '"/><stop offset="1" stop-color="' + dk + '"/></linearGradient>' +
      '<linearGradient id="cap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1418"/><stop offset=".4" stop-color="#4a3d44"/><stop offset="1" stop-color="#1b1418"/></linearGradient>' +
      '<radialGradient id="sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>';
    var floor = '<rect width="400" height="500" fill="url(#bg)"/><rect y="370" width="400" height="130" fill="' + bg2 + '" opacity=".7"/><ellipse cx="200" cy="402" rx="120" ry="16" fill="url(#sh)"/>';
    var s = "";
    if (kind === "dropper") {
      s = '<ellipse cx="200" cy="120" rx="22" ry="34" fill="#2a2025"/><rect x="176" y="148" width="48" height="40" rx="6" fill="url(#cap)"/>' +
        '<rect x="150" y="188" width="100" height="210" rx="18" fill="url(#gl)" opacity=".92"/><rect x="162" y="198" width="14" height="186" rx="7" fill="#fff" opacity=".35"/>' +
        '<rect x="166" y="262" width="68" height="70" rx="4" fill="#fff" opacity=".88"/><text x="200" y="290" font-family="Georgia,serif" font-size="11" text-anchor="middle" fill="#2a1520">ACEITE</text><text x="200" y="306" font-family="Georgia,serif" font-size="9" text-anchor="middle" fill="#2a1520">cutícula</text>';
    } else if (kind === "tube") {
      s = '<g transform="rotate(-14 200 260)"><rect x="168" y="94" width="64" height="40" rx="6" fill="#f7f2f4"/><path d="M162 134 h76 l12 250 h-100z" fill="url(#gl)"/>' +
        '<rect x="148" y="378" width="104" height="18" rx="3" fill="' + dk + '"/><path d="M174 150 h10 l6 220 h-10z" fill="#fff" opacity=".35"/>' +
        '<text x="200" y="260" font-family="Georgia,serif" font-size="16" text-anchor="middle" fill="#2a1520">karité</text></g>';
    } else if (kind === "file") {
      s = '<g transform="rotate(-28 200 260)"><rect x="186" y="70" width="28" height="330" rx="14" fill="url(#gl)"/><rect x="190" y="80" width="6" height="310" rx="3" fill="#fff" opacity=".5"/></g>' +
        '<rect x="110" y="330" width="180" height="56" rx="8" fill="#fff" opacity=".75"/><text x="200" y="364" font-family="Georgia,serif" font-size="15" text-anchor="middle" fill="#2a1520">vidrio templado</text>';
    } else if (kind === "lamp") {
      s = '<path d="M90 380 q0 -160 110 -160 q110 0 110 160z" fill="url(#gl)"/><path d="M130 380 q0 -110 70 -110 q70 0 70 110z" fill="#2a1520" opacity=".85"/>' +
        '<rect x="80" y="376" width="240" height="20" rx="10" fill="' + dk + '"/><circle cx="200" cy="246" r="6" fill="#9be7ff"/><rect x="176" y="300" width="48" height="6" rx="3" fill="#b8a4ff" opacity=".8"/>';
    } else if (kind === "kit") {
      s = '<rect x="80" y="210" width="240" height="180" rx="12" fill="url(#gl)"/><rect x="80" y="210" width="240" height="40" rx="12" fill="' + dk + '"/>' +
        '<text x="200" y="236" font-family="Georgia,serif" font-size="16" text-anchor="middle" fill="#fff">BEATYNAILS KIT</text>' +
        '<rect x="104" y="268" width="36" height="96" rx="8" fill="#e7b5a8"/><rect x="152" y="268" width="36" height="96" rx="8" fill="#b0123a"/><rect x="200" y="268" width="36" height="96" rx="8" fill="#f3eef0"/><rect x="250" y="276" width="14" height="96" rx="7" fill="#9fc7d9"/><rect x="276" y="268" width="24" height="96" rx="8" fill="#e6b34a"/>';
    } else {
      s = '<rect x="168" y="110" width="64" height="120" rx="8" fill="url(#cap)"/><rect x="176" y="118" width="10" height="104" rx="5" fill="#fff" opacity=".18"/>' +
        '<rect x="160" y="226" width="80" height="14" rx="3" fill="#2a2025"/>' +
        '<path d="M130 250 q0 -12 14 -12 h112 q14 0 14 12 v130 q0 22 -22 22 h-96 q-22 0 -22 -22z" fill="url(#gl)"/>' +
        '<path d="M144 256 h14 v130 h-14 q-6 0 -6 -6 v-118 q0 -6 6 -6z" fill="#fff" opacity=".35"/>' +
        '<rect x="168" y="300" width="64" height="40" rx="4" fill="#fff" opacity=".85"/><text x="200" y="318" font-family="Georgia,serif" font-size="11" text-anchor="middle" fill="#2a1520">BEATY</text><text x="200" y="332" font-family="Georgia,serif" font-size="9" text-anchor="middle" fill="#2a1520">NAILS</text>';
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' + defs + floor + s + '</svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  var artCache = {};
  // Foto del producto: la subida en el panel, o la ilustración de ejemplo
  function productImg(p) {
    if (p.photo) return p.photo;
    var a = p.art || ["bottle", "#c98aa0"], k = a[0] + a[1];
    return artCache[k] || (artCache[k] = art(a[0], a[1]));
  }

  // ---------- Lectura y guardado ----------
  var BN = {
    DAYS: DAYS, MONTHS: MONTHS, ART_KINDS: ART_KINDS,
    load: load, save: save, esc: esc, money: money, pad: pad, ymd: ymd, hm: hm, toMin: toMin,
    parseDate: parseDate, addDays: addDays, niceDate: niceDate, productImg: productImg,
    services: function () { return load("bn_services", clone(DEFAULTS.services)); },
    staff: function () { return load("bn_staff", clone(DEFAULTS.staff)); },
    hours: function () { return load("bn_hours", clone(DEFAULTS.hours)); },
    settings: function () {
      var s = load("bn_settings", {}), d = clone(DEFAULTS.settings), k;
      for (k in s) if (k !== "pagos") d[k] = s[k];
      var p = s.pagos || {};
      for (k in p) d.pagos[k] = (p[k] && typeof p[k] === "object") ? Object.assign(d.pagos[k] || {}, p[k]) : p[k];
      return d;
    },
    products: function () { return load("bn_products", clone(DEFAULTS.products)); },
    bookings: function () { return load("bn_bookings", []); },
    orders: function () { return load("bn_orders", []); },
    sales: function () { return load("bn_sales", []); },
    stamp: function () { var d = new Date(); return ymd(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); },
    // Ocupada si otra cita activa de la misma manicurista se cruza con ese horario
    busy: function (bookings, staff, date, start, len, ignoreId) {
      return bookings.some(function (b) {
        return b.id !== ignoreId && b.status !== "cancelada" && b.staff === staff && b.date === date && start < b.start + b.min && b.start < start + len;
      });
    }
  };

  // ---------- Datos de ejemplo (marcados con demo: true; se borran desde el panel) ----------
  BN.seed = function () {
    seedV2();
    seedSales();
    seedPayments();
  };
  // Ventas de mostrador de ejemplo: cobra parte de las citas de ejemplo ya atendidas y agrega
  // algunas compras de productos sin cita
  // Algunas citas y pedidos de ejemplo pagados en línea
  function seedPayments() {
    if (load("bn_seed_v4", false)) return;
    var seedN = 5, today = ymd(new Date());
    function rnd() { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; }
    function when() { return addDays(today, -Math.floor(rnd() * 4)) + "T" + pad(9 + Math.floor(rnd() * 10)) + ":" + pad(Math.floor(rnd() * 60)) + ":00"; }
    var bookings = BN.bookings(), orders = BN.orders(), pct = BN.settings().pagos.pct;
    bookings.forEach(function (b) {
      if (!b.demo || b.status !== "confirmada" || b.payment || rnd() > .45) return;
      var full = rnd() < .4, due = full ? b.price : Math.round(b.price * pct / 100), d = when();
      if (d.slice(0, 10) > b.date) d = b.date + "T09:00:00";
      b.payment = { mode: full ? "completo" : "anticipo", provider: rnd() < .6 ? "mp" : "stripe", status: "pagado", due: due, paid: due, id: "DEMO-" + b.id, date: d };
    });
    orders.forEach(function (o) {
      if (!o.demo || o.payment || o.status === "cancelado" || rnd() > .5) return;
      o.payment = { mode: "linea", provider: rnd() < .6 ? "mp" : "stripe", status: "pagado", due: o.total, paid: o.total, id: "DEMO-" + o.id, date: o.created };
    });
    save("bn_bookings", bookings); save("bn_orders", orders); save("bn_seed_v4", true);
  }
  function seedSales() {
    if (load("bn_seed_v3", false)) return;
    var seedN = 11;
    function rnd() { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    var bookings = BN.bookings(), products = BN.products(), sales = BN.sales().filter(function (x) { return !x.demo; });
    var methods = ["efectivo", "efectivo", "tarjeta", "tarjeta", "transferencia"], n = 0;
    function addSale(date, time, name, staff, items, bookingId) {
      var sub = items.reduce(function (a, i) { return a + i.q * i.price; }, 0), disc = rnd() < .15 ? Math.round(sub * .1) : 0, total = sub - disc, m = pick(methods);
      var rec = m === "efectivo" ? Math.ceil(total / 100) * 100 + (rnd() < .4 ? 100 : 0) : null;
      sales.push({ id: "M-" + (800 + n++), demo: true, created: date + "T" + time, name: name, staff: staff, items: items, subtotal: sub, discount: disc, total: total, method: m, received: rec, change: rec != null ? rec - total : null, status: "pagada", bookingId: bookingId || null });
    }
    bookings.forEach(function (b) {
      if (!b.demo || b.status !== "completada" || rnd() > .7) return;
      var items = [{ type: "servicio", id: b.service, name: b.serviceName, q: 1, price: b.price }];
      if (rnd() < .25) { var p = pick(products); items.push({ type: "producto", id: p.id, name: p.name, q: 1, price: p.price }); }
      var id = "M-" + (800 + n);
      addSale(b.date, hm(b.start + b.min) + ":00", b.name, b.staff, items, b.id);
      b.saleId = id;
    });
    var today = ymd(new Date());
    for (var off = -13; off <= 0; off++) {
      if (rnd() < .5) continue;
      var p = pick(products);
      addSale(addDays(today, off), pad(11 + Math.floor(rnd() * 7)) + ":" + pad(Math.floor(rnd() * 60)) + ":00", "", "", [{ type: "producto", id: p.id, name: p.name, q: 1 + Math.floor(rnd() * 2), price: p.price }]);
    }
    save("bn_bookings", bookings); save("bn_sales", sales); save("bn_seed_v3", true);
  }
  function seedV2() {
    if (load("bn_seed_v2", false)) return;
    var seedN = 7;
    function rnd() { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    var services = BN.services().filter(function (s) { return s.min >= 30; }), staff = BN.staff(), hours = BN.hours(), step = BN.settings().step;
    var products = BN.products();
    var names = ["Ana López", "Sofía Ramírez", "Mariana Cruz", "Lucía Torres", "Paola Méndez", "Karla Ruiz", "Andrea Gómez", "Valentina Díaz", "Regina Flores", "Camila Herrera", "Fernanda Ortiz", "Ximena Vargas", "Daniela Castro", "Renata Morales"];
    var bookings = BN.bookings().filter(function (b) { return !b.demo; });
    var orders = BN.orders().filter(function (o) { return !o.demo; });
    var today = ymd(new Date()), n = 0;
    for (var off = -20; off <= 6; off++) {
      var date = addDays(today, off), h = hours[parseDate(date).getDay()];
      if (!h) continue;
      var want = off < 0 ? 4 + Math.floor(rnd() * 4) : off === 0 ? 6 : 2 + Math.floor(rnd() * 4);
      for (var t = 0; t < want * 3 && want > 0; t++) {
        var s = pick(services), who = pick(staff), slots = Math.floor((h[1] - h[0] - s.min) / step) + 1;
        var start = h[0] + Math.floor(rnd() * slots) * step;
        if (BN.busy(bookings, who, date, start, s.min)) continue;
        var r = rnd(), status = off < 0 ? (r < .82 ? "completada" : r < .92 ? "no-asistio" : "cancelada") : (off === 0 && start < 780 ? "completada" : "confirmada");
        bookings.push({ id: "demo-b" + n++, service: s.id, serviceName: s.name, price: s.price, staff: who, date: date, start: start, min: s.min, name: pick(names), phone: "55" + String(10000000 + Math.floor(rnd() * 89999999)), status: status, demo: true, created: date + "T09:00:00" });
        want--;
      }
      if (off <= 0) {
        var no = Math.floor(rnd() * 3.2);
        for (var j = 0; j < no; j++) {
          var items = [], k = 1 + Math.floor(rnd() * 3);
          for (var q = 0; q < k; q++) { var p = pick(products); items.push({ id: p.id, name: p.name, q: 1 + Math.floor(rnd() * 2), price: p.price }); }
          var sub = items.reduce(function (a, i) { return a + i.q * i.price; }, 0), del = rnd() < .35 ? "envio" : "recoger";
          var ship = del === "envio" && sub < 800 ? 99 : 0;
          orders.push({ id: "BN-" + (900 + n++), demo: true, created: date + "T" + pad(10 + Math.floor(rnd() * 9)) + ":" + pad(Math.floor(rnd() * 60)) + ":00", name: pick(names), phone: "5512345678", delivery: del, address: del === "envio" ? "Col. Roma Norte, CDMX" : "", items: items, subtotal: sub, shipping: ship, total: sub + ship, status: off < -2 ? "entregado" : off < 0 ? (rnd() < .5 ? "listo" : "entregado") : "nuevo" });
        }
      }
    }
    save("bn_bookings", bookings); save("bn_orders", orders); save("bn_seed_v2", true); save("bn_seeded", true);
  }
  BN.clearDemo = function () {
    save("bn_bookings", BN.bookings().filter(function (b) { return !b.demo; }));
    save("bn_orders", BN.orders().filter(function (o) { return !o.demo; }));
    save("bn_sales", BN.sales().filter(function (x) { return !x.demo; }));
  };

  window.BN = BN;
})();
