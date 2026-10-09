/* BeatyNails · código de 4 números por SMS para confirmar la cita.
   El código lo genera y lo manda la función del servidor (Twilio); la página solo recibe un token
   firmado y le pregunta a la función si el código que escribió la clienta es el correcto.
   En modo de prueba el código se genera aquí y se muestra en pantalla. */
(function () {
  function cfg() { return BN.settings().codigo; }
  function live() { var c = cfg(); return !c.demo; }

  /** Manda el código. Devuelve {token} o, en modo de prueba, {token:"demo", demo:"1234"}. */
  function enviar(tel) {
    if (!live()) {
      var a = new Uint32Array(1); crypto.getRandomValues(a);
      var code = String(a[0] % 10000).padStart(4, "0");
      return Promise.resolve({ token: "demo", demo: code });
    }
    if (!Pagos.cfg().url) return Promise.reject(new Error("El envío de códigos no está configurado en el salón."));
    return Pagos.call({ accion: "codigo-enviar", telefono: tel });
  }
  /** Revisa el código. Devuelve {ok, motivo}. */
  function verificar(tel, envio, codigo) {
    if (envio.token === "demo") return Promise.resolve({ ok: codigo === envio.demo, motivo: codigo === envio.demo ? "" : "incorrecto" });
    return Pagos.call({ accion: "codigo-verificar", telefono: tel, token: envio.token, codigo: codigo });
  }
  // Un número ya confirmado no vuelve a pedir código en esta visita (30 minutos)
  var KEY = "bn_tel_ok";
  function yaConfirmado(tel) { try { var v = JSON.parse(sessionStorage.getItem(KEY)); return !!(v && v.tel === tel && v.exp > Date.now()); } catch (e) { return false; } }
  function recordar(tel) { try { sessionStorage.setItem(KEY, JSON.stringify({ tel: tel, exp: Date.now() + 30 * 60000 })); } catch (e) {} }

  window.Codigo = { cfg: cfg, live: live, enviar: enviar, verificar: verificar, yaConfirmado: yaConfirmado, recordar: recordar };
})();
