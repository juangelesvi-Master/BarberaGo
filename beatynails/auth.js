/* BeatyNails · acceso al panel del salón.
   La contraseña nunca se guarda: se guarda su huella (PBKDF2-SHA256 con sal) en este navegador,
   igual que los datos del panel. Protege el panel en el equipo del salón; cuando los datos pasen
   a una base de datos, el acceso pasará a Supabase Auth. */
(function () {
  var KEY = "bn_auth", SESS = "bn_session", ITER = 150000, DAYS = 30;
  var enc = new TextEncoder();

  function read(k, store) { try { return JSON.parse((store || localStorage).getItem(k)); } catch (e) { return null; } }
  function write(k, v, store) { try { (store || localStorage).setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function randHex(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); }
  function norm(u) { return String(u || "").trim().toLowerCase(); }

  function derive(secret, salt, iter) {
    return crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"])
      .then(function (k) { return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: iter }, k, 256); })
      .then(hex);
  }
  // Comparación en tiempo constante
  function same(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

  // Código de recuperación: 12 letras y números fáciles de leer, en grupos de 4
  function recoveryCode() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", a = new Uint8Array(12), s = "";
    crypto.getRandomValues(a);
    for (var i = 0; i < 12; i++) s += abc[a[i] % abc.length] + (i % 4 === 3 && i < 11 ? "-" : "");
    return s;
  }
  function normCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

  function checkPassword(p) {
    if (String(p).length < 8) return "La contraseña debe tener al menos 8 caracteres.";
    return "";
  }

  function store(user, pass, code) {
    var salt = randHex(16), rsalt = randHex(16);
    return Promise.all([derive(pass, salt, ITER), derive(normCode(code), rsalt, ITER)]).then(function (h) {
      var a = { user: norm(user), name: String(user).trim(), salt: salt, hash: h[0], rsalt: rsalt, rhash: h[1], iter: ITER, created: new Date().toISOString() };
      if (!write(KEY, a)) throw new Error("El navegador no dejó guardar la contraseña.");
      return a;
    });
  }

  function startSession(a, remember) {
    var s = { user: a.user, sig: a.hash.slice(0, 24), exp: Date.now() + (remember ? DAYS * 864e5 : 12 * 36e5) };
    try { localStorage.removeItem(SESS); sessionStorage.removeItem(SESS); } catch (e) {}
    write(SESS, s, remember ? localStorage : sessionStorage);
  }

  // Intentos fallidos: tras 5 seguidos, espera 30 segundos
  var LOCK = "bn_auth_fails";
  function lockedFor() { var f = read(LOCK) || {}; return f.until && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }
  function fail() { var f = read(LOCK) || { n: 0 }; f.n = (f.n || 0) + 1; if (f.n >= 5) { f.until = Date.now() + 30000; f.n = 0; } write(LOCK, f); }
  function clearFails() { try { localStorage.removeItem(LOCK); } catch (e) {} }

  var Auth = {
    exists: function () { var a = read(KEY); return !!(a && a.hash); },
    name: function () { var a = read(KEY); return a ? a.name || a.user : ""; },
    checkPassword: checkPassword,
    /** Sesión válida: existe la cuenta, no ha vencido y la contraseña no ha cambiado desde que se abrió. */
    session: function () {
      var a = read(KEY), s = read(SESS, sessionStorage) || read(SESS);
      return !!(a && s && s.user === a.user && s.sig === a.hash.slice(0, 24) && s.exp > Date.now());
    },
    /** Crea la cuenta del salón. Devuelve el código de recuperación para que lo guarden. */
    create: function (user, pass) {
      if (Auth.exists()) return Promise.reject(new Error("Ya hay una cuenta creada en este navegador."));
      if (!norm(user)) return Promise.reject(new Error("Escribe un usuario."));
      var e = checkPassword(pass); if (e) return Promise.reject(new Error(e));
      var code = recoveryCode();
      return store(user, pass, code).then(function (a) { startSession(a, false); return code; });
    },
    login: function (user, pass, remember) {
      var wait = lockedFor(); if (wait) return Promise.reject(new Error("Demasiados intentos. Espera " + wait + " segundos."));
      var a = read(KEY); if (!a) return Promise.reject(new Error("Todavía no hay cuenta en este navegador."));
      return derive(pass, a.salt, a.iter || ITER).then(function (h) {
        if (norm(user) !== a.user || !same(h, a.hash)) { fail(); throw new Error("Usuario o contraseña incorrectos."); }
        clearFails(); startSession(a, remember);
      });
    },
    logout: function () { try { localStorage.removeItem(SESS); sessionStorage.removeItem(SESS); } catch (e) {} },
    /** Cambia la contraseña conociendo la actual. Cierra las demás sesiones. */
    change: function (oldPass, newPass) {
      var a = read(KEY); if (!a) return Promise.reject(new Error("No hay cuenta."));
      var e = checkPassword(newPass); if (e) return Promise.reject(new Error(e));
      return derive(oldPass, a.salt, a.iter || ITER).then(function (h) {
        if (!same(h, a.hash)) throw new Error("La contraseña actual no es correcta.");
        var salt = randHex(16);
        return derive(newPass, salt, ITER).then(function (nh) { a.salt = salt; a.hash = nh; a.iter = ITER; write(KEY, a); startSession(a, !!read(SESS)); });
      });
    },
    /** Con el código de recuperación pone una contraseña nueva y entrega un código nuevo. */
    recover: function (user, code, newPass) {
      var wait = lockedFor(); if (wait) return Promise.reject(new Error("Demasiados intentos. Espera " + wait + " segundos."));
      var a = read(KEY); if (!a) return Promise.reject(new Error("No hay cuenta."));
      var e = checkPassword(newPass); if (e) return Promise.reject(new Error(e));
      return derive(normCode(code), a.rsalt, a.iter || ITER).then(function (h) {
        if (norm(user) !== a.user || !same(h, a.rhash)) { fail(); throw new Error("Usuario o código de recuperación incorrectos."); }
        clearFails();
        var next = recoveryCode();
        return store(a.name || a.user, newPass, next).then(function (na) { startSession(na, false); return next; });
      });
    },
    /** Lleva a la pantalla de entrada si no hay sesión. Se llama al principio del panel. */
    guard: function (loginPage) {
      if (Auth.session()) return true;
      var next = location.pathname.split("/").pop() + location.hash;
      location.replace((loginPage || "entrar.html") + "?next=" + encodeURIComponent(next));
      return false;
    }
  };
  window.Auth = Auth;
})();
