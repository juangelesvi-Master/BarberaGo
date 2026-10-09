/* BeatyNails · cobro en línea con Mercado Pago y Stripe.
   La página nunca ve llaves secretas: pide la liga de pago a la función
   beatynails-pagos (Supabase) y, al regresar, le pide que confirme el pago
   con el proveedor. En modo demostración simula el cobro sin salir de la página. */
(function () {
  var NAMES = { mp: "Mercado Pago", stripe: "Stripe" };

  function cfg() { return BN.settings().pagos; }
  function providers() { var c = cfg(); return ["mp", "stripe"].filter(function (k) { return c[k]; }).map(function (k) { return { id: k, name: NAMES[k] }; }); }
  /** Hay cobro en línea si hay al menos un proveedor y la función está configurada (o es demostración). */
  function ready() { var c = cfg(); return providers().length > 0 && (c.demo || !!c.url); }

  function call(body) {
    var c = cfg(), h = { "Content-Type": "application/json" };
    if (c.key) { h.apikey = c.key; h.Authorization = "Bearer " + c.key; }
    return fetch(c.url, { method: "POST", headers: h, body: JSON.stringify(body) })
      .catch(function () { throw new Error("No hay conexión con el servicio de pagos."); })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || d.error) throw new Error(d.error || "El servicio de pagos no respondió (" + r.status + ")."); return d; }); });
  }

  // ---------- Ventana (también la usa la simulación) ----------
  var css = '.pg-scrim{position:fixed;inset:0;background:rgb(20 8 14 / .5);z-index:70;display:grid;place-items:center;padding:16px}' +
    '.pg-box{background:var(--surface,#fff);color:var(--ink,#222);border-radius:16px;padding:24px;width:min(420px,100%);box-shadow:0 20px 60px rgb(0 0 0 / .25);display:grid;gap:12px}' +
    '.pg-box h2{margin:0;font-size:24px}.pg-box p{margin:0;font-size:15px;color:var(--muted,#666)}.pg-box .pg-amt{font-size:30px;font-weight:700;color:var(--ink,#222)}' +
    '.pg-sim{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:var(--blush,#f6e6ea);color:var(--lacquer,#8c1d40);padding:4px 9px;border-radius:999px;justify-self:start}' +
    '.pg-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.pg-btns button{flex:1 1 140px}';
  function modal(o) {
    if (!document.getElementById("pg-css")) { var st = document.createElement("style"); st.id = "pg-css"; st.textContent = css; document.head.appendChild(st); }
    close();
    var s = document.createElement("div"); s.className = "pg-scrim"; s.id = "pgModal";
    s.innerHTML = '<div class="pg-box" role="dialog" aria-modal="true" aria-labelledby="pgT">' + (o.badge ? '<span class="pg-sim">' + BN.esc(o.badge) + '</span>' : "") +
      '<h2 id="pgT">' + BN.esc(o.title) + '</h2>' + (o.html || "") + '<div class="pg-btns">' +
      (o.buttons || []).map(function (b, i) { return '<button type="button" class="btn ' + (b.primary ? "btn-primary" : "btn-ghost") + '" data-pg="' + i + '">' + BN.esc(b.label) + '</button>'; }).join("") + '</div></div>';
    s.addEventListener("click", function (e) { var b = e.target.closest("[data-pg]"); if (!b) return; var f = o.buttons[+b.dataset.pg].onClick; close(); if (f) f(); });
    document.body.appendChild(s);
    var first = s.querySelector("[data-pg]"); if (first) first.focus();
  }
  function close() { var m = document.getElementById("pgModal"); if (m) m.remove(); }

  /** Inicia el cobro. En vivo redirige al proveedor; en demostración devuelve el resultado simulado. */
  function start(o) {
    var c = cfg(), total = o.items.reduce(function (a, i) { return a + i.cantidad * i.precio; }, 0);
    if (c.demo) return new Promise(function (ok) {
      modal({
        badge: "Simulación · no se cobra", title: "Pagar con " + NAMES[o.prov],
        html: '<p>' + BN.esc(o.desc || "") + '</p><div class="pg-amt num">' + BN.money(total) + '</div><p>Así se verá el cobro cuando conectes tu cuenta de ' + NAMES[o.prov] + ' en el panel.</p>',
        buttons: [
          { label: "Aprobar pago", primary: true, onClick: function () { ok({ pagado: true, estado: "aprobado", monto: total, id: "SIM-" + Date.now().toString(36).toUpperCase() }); } },
          { label: "Rechazar", onClick: function () { ok({ pagado: false, estado: "rechazado", monto: 0 }); } }
        ]
      });
    });
    var back = location.origin + location.pathname;
    return call({ accion: "crear", proveedor: o.prov, referencia: o.ref, items: o.items, cliente: { nombre: o.name || "" }, regreso: back })
      .then(function (d) { location.href = d.url; return new Promise(function () {}); });
  }

  function verify(prov, id, ref) { return call({ accion: "verificar", proveedor: prov, id: id, referencia: ref }); }

  /** Lee y limpia de la dirección los datos con los que regresa el proveedor. */
  function readReturn() {
    var q = new URLSearchParams(location.search), pago = q.get("pago");
    if (!pago || !q.get("ref")) return null;
    var r = { pago: pago, prov: q.get("prov"), ref: q.get("ref"), id: q.get("id") || q.get("payment_id") || q.get("collection_id") || "" };
    ["pago", "prov", "ref", "id", "payment_id", "collection_id", "collection_status", "status", "external_reference", "payment_type", "merchant_order_id", "preference_id", "site_id", "processing_mode", "merchant_account_id"].forEach(function (k) { q.delete(k); });
    var s = q.toString();
    history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
    if (r.id === "null") r.id = "";
    return r;
  }

  /** Guarda el resultado en el pedido o la cita con esa referencia. Devuelve {kind, rec} o null. */
  function apply(ref, res) {
    var lists = [["o", "bn_orders", BN.orders()], ["b", "bn_bookings", BN.bookings()]];
    for (var i = 0; i < lists.length; i++) {
      var arr = lists[i][2], rec = arr.find(function (x) { return x.id === ref; });
      if (!rec || !rec.payment) continue;
      var p = rec.payment;
      if (p.status !== "pagado") {
        if (res.pagado) { p.status = "pagado"; p.paid = res.monto || p.due; p.id = res.id || p.id || ""; p.date = BN.stamp(); }
        else p.status = "rechazado";
        BN.save(lists[i][1], arr);
      }
      return { kind: lists[i][0], rec: rec };
    }
    return null;
  }

  window.Pagos = { NAMES: NAMES, cfg: cfg, providers: providers, ready: ready, call: call, start: start, verify: verify, readReturn: readReturn, apply: apply, modal: modal, close: close };
})();
