/* Saved-record mirror only. No cloud result is ever written into Store.
 * Durable source records + per-account acknowledgments form a resumable outbox.
 * This module has no Firebase, UI, draft, notebook or settings dependencies. */
(function (g) {
  'use strict';
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function project(record, definitions, deletedAt) {
    var r = {};
    ['id', 'flownAt', 'stage', 'answers', 'createdAt', 'updatedAt', 'course', 'syllabusEntry'].forEach(function (key) {
      if (record[key] !== undefined) r[key] = record[key];
    });
    if (!r.id || (r.stage !== 'brief' && r.stage !== 'done')) throw Error('INVALID_TRAINING_RECORD');
    var answers = r.answers || {}, questions = Object.keys(answers).sort().map(function (id) {
      var q = (definitions || []).find(function (x) { return x.id === id; });
      var out = { id: id, label: id, type: 'text' };
      if (q) ['label', 'type', 'role', 'stage', 'options', 'order', 'archived', 'inDebrief'].forEach(function (key) {
        if (q[key] !== undefined) out[key] = q[key];
      });
      return out;
    });
    // Deep clone prevents a form subsequently mutating the pending payload.
    return JSON.parse(canonical({ schema: 1, record: r, questions: questions, deletedAt: deletedAt || null }));
  }
  function create(o) {
    var user = null, running = null, again = false, generation = 0, phase = 'signin', info = { pending: 0, conflicts: 0, lastSync: null };
    var bindingKey = 'sortie:cloud-binding';
    function read(key, fallback) {
      var raw = o.storage.getItem(key);
      if (!raw) return fallback;
      try { return JSON.parse(raw); } catch (_) { throw Error('CLOUD_JOURNAL_DAMAGED'); }
    }
    function write(key, value) { o.storage.setItem(key, JSON.stringify(value)); }
    function key() { return 'sortie:cloud-journal:' + user.uid; }
    function journal() {
      var state = read(key(), { schema: 1, ack: {}, conflicts: {}, lastSync: null });
      if (state.schema !== 1 || !state.ack || !state.conflicts) throw Error('CLOUD_JOURNAL_DAMAGED');
      state.ack = Object.assign(Object.create(null), state.ack);
      state.conflicts = Object.assign(Object.create(null), state.conflicts);
      return state;
    }
    function status() { return Object.assign({ phase: phase, email: user && user.email, uid: user && user.uid }, info); }
    function emit(p) { if (p) phase = p; if (o.changed) o.changed(status()); }
    function authorized() {
      var binding = read(bindingKey, null);
      return user && binding && binding.uid === user.uid && binding.email === user.email;
    }
    async function cycle() {
      if (!user) { emit('signin'); return; }
      if (!authorized()) { emit(read(bindingKey, null) ? 'account-mismatch' : 'unlinked'); return; }
      var activeUser = user, run = generation, state = journal(), source = o.snapshot(), work = [];
      for (var item of source) {
        // Do not migrate old trash; mirror deletions only for an uploaded flight.
        if (item.deletedAt && !state.ack[item.record.id]) continue;
        var payload = canonical(project(item.record, item.questions, item.deletedAt));
        var digest = await o.hash(payload);
        if (run !== generation) return;
        if (state.ack[item.record.id] !== digest) work.push({ id: item.record.id, payload: payload, digest: digest });
      }
      info.pending = work.length; info.lastSync = state.lastSync;
      info.conflicts = Object.keys(state.conflicts).length;
      if (o.online && !o.online()) { emit('offline'); return; }
      if (!work.length) { emit(info.conflicts ? 'conflict' : 'synced'); return; }
      emit('syncing');
      for (var item of work) {
        if (user !== activeUser || !authorized()) return;
        if (state.conflicts[item.id] === item.digest) continue;
        var result = await o.adapter.put(activeUser.uid, item, state.ack[item.id] || null);
        if (user !== activeUser || !authorized()) return;
        if (result.conflict) {
          state.conflicts[item.id] = item.digest;
        } else {
          state.ack[item.id] = item.digest;
          delete state.conflicts[item.id];
          info.pending--;
        }
        // An interrupted write retries the same content-addressed cloud revision.
        write(key(), state);
        info.conflicts = Object.keys(state.conflicts).length;
        emit();
      }
      if (info.pending === 0) {
        await o.adapter.complete(activeUser.uid);
        if (run !== generation || !authorized()) return;
        state.lastSync = new Date().toISOString(); write(key(), state); info.lastSync = state.lastSync;
      }
      emit(info.conflicts ? 'conflict' : 'synced');
    }
    function sync() {
      if (running) { again = true; return running; }
      running = Promise.resolve().then(function () {
        return o.lock ? o.lock(cycle) : cycle();
      }).catch(function (err) {
        info.error = String(err.code || err.message || 'CLOUD_ERROR'); emit('error');
      }).finally(function () { running = null; if (again) { again = false; sync(); } });
      return running;
    }
    return {
      status: status,
      identity: function (next) { generation++; user = next; info = { pending: 0, conflicts: 0, lastSync: null }; emit(next ? 'unlinked' : 'signin'); },
      link: function () {
        if (!user) throw Error('SIGN_IN_REQUIRED');
        var old = read(bindingKey, null);
        if (old && (old.uid !== user.uid || old.email !== user.email)) throw Error('ACCOUNT_MISMATCH');
        write(bindingKey, { uid: user.uid, email: user.email }); return sync();
      },
      sync: sync
    };
  }
  g.CloudCore = { create: create, project: project, canonical: canonical };
})(window);
