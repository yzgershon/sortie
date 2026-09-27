/* Opt-in deployment switch. Local saving never waits for network or authentication. */
(function (g) {
  'use strict';
  var adapter, engine, access, user, started = false, timer, generation = 0;
  var ownerIssue = false, ownerKey = 'sortie:cloud-local-owner';
  var state = { phase: 'disabled', pending: 0, conflicts: 0 };
  function enabled() { var c = g.CLOUD_CONFIG; return !!(c && c.enabled && c.firebase && c.firebase.projectId && c.firebase.apiKey); }
  // Remember the account attached to pre-cloud local history before sign-out or
  // a Google return replaces it. This private hint never leaves this device.
  function rememberLocalOwner(email) {
    if (!enabled() || !email || !g.Store || !g.Store.count()) return;
    try {
      if (!localStorage.getItem('sortie:cloud-binding') && !localStorage.getItem(ownerKey))
        localStorage.setItem(ownerKey, JSON.stringify(String(email).trim().toLowerCase()));
    } catch (_) { ownerIssue = true; }
  }
  function localOwnerMatches(email) {
    if (ownerIssue) throw Error('LOCAL_OWNER_UNAVAILABLE');
    var raw = localStorage.getItem(ownerKey);
    if (!raw) return true;
    var owner = JSON.parse(raw);
    if (typeof owner !== 'string' || !owner) throw Error('LOCAL_OWNER_DAMAGED');
    return owner === email;
  }
  function changed(next) {
    state = Object.assign({}, next, { role: access && access.role });
    g.dispatchEvent(new CustomEvent('sortie:cloud-status'));
  }
  function api() {
    if (!enabled()) throw Error('CLOUD_DISABLED');
    if (!adapter) adapter = g.FirebaseAdapter(g.CLOUD_CONFIG.firebase);
    return adapter;
  }
  function hash(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    });
  }
  async function identify(next) {
    var run = ++generation; user = next; access = null; engine.identity(null);
    if (!next) return;
    var session = g.Auth.rawSession();
    if (!next.verified || !session || session.email !== next.email) { changed({ phase: 'account-mismatch' }); return; }
    changed({ phase: 'connecting', email: next.email });
    try {
      var membership = await api().access(next.uid);
      if (run !== generation) return;
      if (!membership || !membership.active) { changed({ phase: 'not-enrolled', email: next.email }); return; }
      access = membership;
      if (membership.role === 'instructor') { changed({ phase: 'instructor', email: next.email }); return; }
      if (membership.role !== 'cadet') throw Error('INVALID_ROLE');
      if (!localOwnerMatches(next.email)) { changed({ phase: 'account-mismatch', email: next.email }); return; }
      engine.identity(next); await engine.link();
    } catch (err) {
      if (run === generation) changed({ phase: err.message === 'ACCOUNT_MISMATCH' ? 'account-mismatch' : navigator.onLine === false ? 'offline' : 'error', error: String(err.code || err.message) });
    }
  }
  function schedule() {
    if (!engine || !access || access.role !== 'cadet') return;
    clearTimeout(timer); timer = setTimeout(function () { engine.sync(); }, 400);
  }
  function start() {
    if (started || !enabled()) return; started = true;
    engine = g.CloudCore.create({ storage: localStorage, snapshot: g.Store.trainingSnapshot, hash: hash,
      adapter: api(), changed: changed, online: function () { return navigator.onLine !== false; },
      lock: navigator.locks ? function (fn) { return navigator.locks.request('sortie-training-sync', fn); } : null });
    changed({ phase: 'connecting' });
    api().onUser(identify);
    g.addEventListener('sortie:training-saved', schedule);
    g.addEventListener('online', function () { identify(user); });
    g.addEventListener('offline', function () { if (access && access.role === 'cadet') engine.sync(); });
    g.addEventListener('storage', function (e) {
      if (e.key === 'sortie:auth') identify(user);
      else if (['sortie:mirror', 'sortie:trash', 'sortie:settings'].indexOf(e.key) !== -1) schedule();
    });
    // Retry failed/interrupted uploads while the app is in use, with bounded traffic.
    setInterval(function () {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false) {
        if (access && access.role === 'cadet') schedule();
      }
    }, 60000);
  }
  g.Cloud = {
    enabled: enabled, start: start, rememberLocalOwner: rememberLocalOwner, status: function () { return Object.assign({}, state); },
    acceptGoogle: async function (token) {
      if (!enabled()) return;
      var timeout;
      try {
        await Promise.race([api().signIn(token), new Promise(function (_, reject) {
          timeout = setTimeout(function () { reject(Error('CLOUD_SIGNIN_TIMEOUT')); }, 15000);
        })]);
      }
      catch (err) { changed({ phase: 'error', error: String(err.code || err.message) }); }
      finally { clearTimeout(timeout); }
    },
    signOut: async function () {
      generation++; access = null; user = null; if (engine) engine.identity(null);
      if (adapter) await adapter.signOut();
    },
    link: function () {
      if (!access || access.role !== 'cadet') return Promise.reject(Error('NOT_ENROLLED'));
      return engine.link();
    },
    retry: function () { return identify(user); },
    roster: function () {
      if (!access || access.role !== 'instructor') return Promise.reject(Error('INSTRUCTOR_REQUIRED'));
      return api().roster(user.uid);
    },
    flights: function (uid) {
      if (!access || access.role !== 'instructor') return Promise.reject(Error('INSTRUCTOR_REQUIRED'));
      return api().flights(uid);
    },
    revisions: function (uid, id) {
      if (!access || access.role !== 'instructor') return Promise.reject(Error('INSTRUCTOR_REQUIRED'));
      return api().revisions(uid, id);
    }
  };
})(window);
