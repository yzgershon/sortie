/* Opt-in deployment switch. Local saving never waits for network or authentication. */
(function (g) {
  'use strict';
  var adapter, engine, access, user, started = false, timer, generation = 0;
  var ownerIssue = false, ownerKey = 'sortie:cloud-local-owner';
  var verifiedKey = 'sortie:verified-access', lastCheck = 0;
  var state = { phase: 'disabled', pending: 0, conflicts: 0 };
  function enabled() { var c = g.CLOUD_CONFIG; return !!(c && c.enabled && c.firebase && c.firebase.projectId && c.firebase.apiKey); }
  // Remember the account attached to pre-cloud local history before sign-out or
  // a Google return replaces it. This private hint never leaves this device.
  function rememberLocalOwner(email) {
    if (!enabled() || !email || !g.Store) return;
    var hasWork = g.Store.count() || Object.keys(g.Store.drafts()).length || g.Store.nextGoals().length ||
      (g.Workspace && g.Workspace.all().notes.length);
    if (!hasWork) return;
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
  function requireLocalAccount(identity) {
    if (!localOwnerMatches(identity.email)) throw Error('LOCAL_ACCOUNT_MISMATCH');
    var raw = localStorage.getItem('sortie:cloud-binding');
    if (!raw) return;
    var binding = JSON.parse(raw);
    if (!binding || binding.uid !== identity.uid || binding.email !== identity.email) throw Error('LOCAL_ACCOUNT_MISMATCH');
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
  // This is an offline convenience receipt, not a server credential. Device
  // storage is not a protection boundary against someone controlling the device.
  function rememberVerified(identity) {
    localStorage.setItem(verifiedKey, JSON.stringify({ uid: identity.uid, email: identity.email, at: Date.now() }));
  }
  function forgetVerified() { try { localStorage.removeItem(verifiedKey); } catch (_) {} }
  function wasVerified(identity) {
    try {
      var receipt = JSON.parse(localStorage.getItem(verifiedKey));
      return !!(identity && identity.verified && receipt && receipt.uid === identity.uid && receipt.email === identity.email && receipt.at > 0);
    } catch (_) { return false; }
  }
  function transient(err) {
    return ['unavailable', 'deadline-exceeded', 'auth/network-request-failed', 'VERIFY_TIMEOUT'].includes(String(err.code || err.message));
  }
  function denied(err) {
    return ['permission-denied', 'unauthenticated', 'auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token', 'NOT_ENROLLED', 'INSTRUCTOR_REQUIRED'].includes(String(err.code || err.message));
  }
  function bounded(promise) {
    var timeout;
    return Promise.race([promise, new Promise(function (_, reject) {
      timeout = setTimeout(function () { reject(Error('VERIFY_TIMEOUT')); }, 12000);
    })]).finally(function () { clearTimeout(timeout); });
  }
  async function membershipFor(identity) {
    var membership = await api().access(identity.uid);
    if (!membership || membership.active !== true || !['cadet', 'instructor'].includes(membership.role)) throw Error('NOT_ENROLLED');
    return membership;
  }
  function invalidate(err) {
    forgetVerified(); access = null; if (engine) engine.identity(null);
    changed({ phase: 'not-enrolled', error: String(err.code || err.message) });
    g.dispatchEvent(new CustomEvent('sortie:access-denied'));
  }
  async function verifySession(email) {
    var identity;
    try { identity = await bounded(api().restore()); }
    catch (err) { if (denied(err)) { forgetVerified(); throw Error('NOT_ENROLLED'); } throw err; }
    if (!identity || !identity.verified || identity.email !== email) throw Error('ACCOUNT_MISMATCH');
    requireLocalAccount(identity);
    if (navigator.onLine === false) {
      if (wasVerified(identity)) return Object.assign({}, identity, { offline: true });
      throw Error('OFFLINE_NOT_VERIFIED');
    }
    try {
      await bounded(membershipFor(identity));
      rememberVerified(identity); lastCheck = Date.now(); return identity;
    } catch (err) {
      if (denied(err)) { forgetVerified(); throw Error('NOT_ENROLLED'); }
      if (transient(err) && wasVerified(identity)) return Object.assign({}, identity, { offline: true });
      throw err;
    }
  }
  function hash(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function sessionEnded() {
    forgetVerified();
    g.dispatchEvent(new CustomEvent('sortie:session-ended'));
  }
  async function identify(next) {
    var hadUser = !!user, run = ++generation; user = next; access = null; engine.identity(null);
    if (!next) { if (hadUser || g.Auth.rawSession()) sessionEnded(); return; }
    var session = g.Auth.rawSession();
    if (!next.verified || !session || session.email !== next.email) {
      changed({ phase: 'account-mismatch' }); sessionEnded(); return;
    }
    changed({ phase: 'connecting', email: next.email });
    try {
      var membership = await bounded(membershipFor(next));
      if (run !== generation) return;
      rememberVerified(next); lastCheck = Date.now();
      access = membership;
      if (membership.role === 'instructor') { changed({ phase: 'instructor', email: next.email }); return; }
      if (membership.role !== 'cadet') throw Error('INVALID_ROLE');
      if (!localOwnerMatches(next.email)) { changed({ phase: 'account-mismatch', email: next.email }); return; }
      engine.identity(next); await engine.link();
    } catch (err) {
      if (run === generation && denied(err)) { invalidate(err); return; }
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
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false && Date.now() - lastCheck > 60000) identify(user);
    });
    g.addEventListener('storage', function (e) {
      if (e.key === 'sortie:auth') identify(user);
      else if (['sortie:mirror', 'sortie:trash', 'sortie:settings'].indexOf(e.key) !== -1) schedule();
    });
    // Retry failed/interrupted uploads while the app is in use, with bounded traffic.
    setInterval(function () {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false) {
        if (Date.now() - lastCheck > 5 * 60000) identify(user);
        else if (access && access.role === 'cadet') schedule();
      }
    }, 60000);
  }
  g.Cloud = {
    enabled: enabled, start: start, verifySession: verifySession, rememberLocalOwner: rememberLocalOwner, status: function () { return Object.assign({}, state); },
    acceptGoogle: async function (token, expectedEmail) {
      if (!enabled()) throw Error('CLOUD_DISABLED');
      var cancelled = false;
      forgetVerified();
      try {
        return await bounded((async function () {
          var identity = await api().signIn(token);
          if (!identity || !identity.verified || identity.email !== expectedEmail) throw Error('ACCOUNT_MISMATCH');
          await membershipFor(identity);
          requireLocalAccount(identity);
          if (cancelled) throw Error('SIGNIN_CANCELLED');
          rememberVerified(identity); lastCheck = Date.now();
          return identity;
        })());
      }
      catch (err) { cancelled = true; forgetVerified(); changed({ phase: 'error', error: String(err.code || err.message) }); throw err; }
    },
    signOut: async function () {
      generation++; access = null; user = null; if (engine) engine.identity(null);
      forgetVerified();
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
