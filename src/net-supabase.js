/* Live rooms over Supabase Realtime presence.
   Exposes the same small room API the game uses inside Claude (presence, onPeers, join, leave),
   so the game code is identical everywhere. */
(function () {
  var cfg = window.ZK_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || cfg.supabaseUrl.indexOf('__') === 0) return;
  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } }
  });
  var tab = Math.random().toString(36).slice(2, 12);

  function mkRoom(name) {
    var ch = sb.channel('zk:' + name, { config: { presence: { key: tab } } });
    var mine = {}, subs = [], connSubs = [], connected = false, joined = false, timer = null;
    function snap() {
      var st = ch.presenceState(), out = [];
      Object.keys(st).forEach(function (k) {
        var metas = st[k] || [], m = metas[metas.length - 1] || {}, p = {};
        Object.keys(m).forEach(function (f) { if (f !== 'presence_ref') p[f] = m[f]; });
        out.push({ peer: k, presence: p, isMe: k === tab, sameTab: k === tab, by: null, kind: 'viewer', guest: false, updatedAt: Date.now() });
      });
      return out;
    }
    function fire() {
      var s = snap();
      subs.forEach(function (f) { try { f({ peers: s, joined: [], left: [], updated: [] }); } catch (e) { console.error(e); } });
    }
    function setConn(v) { connected = v; connSubs.forEach(function (f) { try { f(v); } catch (e) {} }); }
    function flush() { timer = null; if (joined) ch.track(mine).catch(function () {}); }
    ch.on('presence', { event: 'sync' }, fire);
    var R = {
      name: name,
      presence: function (patch) {
        var n = {}; Object.keys(mine).forEach(function (k) { n[k] = mine[k]; });
        Object.keys(patch || {}).forEach(function (k) { if (patch[k] === null) delete n[k]; else n[k] = patch[k]; });
        mine = n; if (!timer) timer = setTimeout(flush, 60);
        return Promise.resolve();
      },
      onPeers: function (f) { subs.push(f); setTimeout(function () { f({ peers: snap(), joined: [], left: [], updated: [] }); }, 0); return function () { subs = subs.filter(function (x) { return x !== f; }); }; },
      peers: snap,
      connected: function () { return connected; },
      onConnection: function (f) { connSubs.push(f); setTimeout(function () { f(connected); }, 0); return function () {}; },
      emit: function () { return Promise.resolve(); },
      on: function () { return function () {}; },
      leave: function () { joined = false; return ch.untrack().catch(function () {}).then(function () { return sb.removeChannel(ch); }).catch(function () {}); }
    };
    R._ready = new Promise(function (res) {
      ch.subscribe(function (status) {
        if (status === 'SUBSCRIBED') { joined = true; setConn(true); ch.track(mine).catch(function () {}); res(R); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { setConn(false); res(null); }
      });
      setTimeout(function () { res(joined ? R : null); }, 9000);
    });
    return R;
  }

  var lobby = mkRoom('lobby');
  lobby.join = function (n) { var r = mkRoom(n); return r._ready.then(function (x) { if (!x) throw { code: 'upstream_error' }; return x; }); };
  window.claude = { use: function (n) { if (n !== 'room') return Promise.resolve(null); return lobby._ready; } };
})();
