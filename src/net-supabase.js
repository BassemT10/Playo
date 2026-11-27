/* Live rooms over Supabase Realtime.
   Exposes the same small room API the game uses inside Claude (presence, onPeers, join, leave),
   so the game code is identical everywhere.

   Supabase allows each client only 5 Presence updates per 30 seconds and closes the channel when a
   client goes over (ClientPresenceRateLimitReached). Game state changes many times a second, so:
   - every state change is sent as a Broadcast message (fast, no such limit), plus a heartbeat so a
     phone that missed a message catches up within a couple of seconds;
   - Presence is only used to know who is in the room, and is re-tracked at most every 10 seconds
     with the latest state (so players who join late still get it).
   Each state carries a version number; the newest copy (broadcast or presence) wins. */
(function () {
  var cfg = window.ZK_CONFIG || {};
  if (!window.supabase || !cfg.supabaseUrl || cfg.supabaseUrl.indexOf('__') === 0) return;
  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 40 } }
  });
  var tab = Math.random().toString(36).slice(2, 12);
  var ver = Date.now();
  var TRACK_GAP = 10500;         // ≥ 10.5 s between Presence updates → never more than 3 per 30 s
  var SEND_GAP = 40;             // batch rapid state changes into one broadcast
  var BEAT_ROOM = 3000, BEAT_LOBBY = 6000, STALE = 9000;

  function mkRoom(name, isLobby) {
    var ch = sb.channel('zk:' + name, { config: { presence: { key: tab }, broadcast: { self: false, ack: false } } });
    var mine = { _v: ++ver }, bc = {}, subs = [], connSubs = [], connected = false, joined = false, left = false;
    var sendTimer = null, trackTimer = null, lastTrack = 0, tracked = -1, beat = null, fireQ = false;

    function clean(m) { var p = {}; Object.keys(m || {}).forEach(function (f) { if (f !== 'presence_ref' && f !== '_v') p[f] = m[f]; }); return p; }
    function snap() {
      var st = ch.presenceState(), now = Date.now(), seen = {}, out = [];
      function add(k, m) {
        if (seen[k]) return; seen[k] = 1;
        out.push({ peer: k, presence: clean(m), isMe: k === tab, sameTab: k === tab, by: null, kind: 'viewer', guest: false, updatedAt: now });
      }
      add(tab, mine);
      Object.keys(st).forEach(function (k) {
        if (k === tab) return;
        var metas = st[k] || [], m = metas[metas.length - 1] || {}, b = bc[k];
        add(k, b && (b.v || 0) >= (m._v || 0) ? b.p : m);
      });
      /* someone whose broadcasts arrive before their presence does */
      /* Presence briefly drops a player while their state is re-sent (a leave then a join for the same player), so a player
         who just "left" stays listed for 3 s; a real departure still disappears after that. */
      Object.keys(bc).forEach(function (k) { if (!seen[k] && now - bc[k].at < STALE && (!bc[k].gone || now - bc[k].gone < 3000)) add(k, bc[k].p); });
      return out;
    }
    function fire() {
      if (fireQ) return; fireQ = true;
      setTimeout(function () {
        fireQ = false; var s = snap();
        subs.forEach(function (f) { try { f({ peers: s, joined: [], left: [], updated: [] }); } catch (e) { console.error(e); } });
      }, 0);
    }
    function setConn(v) { connected = v; connSubs.forEach(function (f) { try { f(v); } catch (e) {} }); }

    function sendNow() {
      sendTimer = null; if (!joined || left) return;
      ch.send({ type: 'broadcast', event: 's', payload: { k: tab, v: mine._v, p: mine } }).catch(function () {});
    }
    function track() {
      trackTimer = null; if (!joined || left) return;
      var wait = lastTrack + TRACK_GAP - Date.now();
      if (wait > 0) { trackTimer = setTimeout(track, wait); return; }
      if (tracked === mine._v) return;
      lastTrack = Date.now(); tracked = mine._v;
      ch.track(mine).catch(function () {});
    }
    function schedule() {
      if (!sendTimer) sendTimer = setTimeout(sendNow, SEND_GAP);
      if (!trackTimer) trackTimer = setTimeout(track, Math.max(0, lastTrack + TRACK_GAP - Date.now()));
    }
    function hasLobbyState() { return mine.seek || mine.assign; }

    ch.on('presence', { event: 'sync' }, fire);
    ch.on('presence', { event: 'leave' }, function (e) { if (e && e.key && bc[e.key]) bc[e.key].gone = Date.now(); fire(); setTimeout(fire, 3100); });
    ch.on('presence', { event: 'join' }, function (e) { if (e && e.key && bc[e.key]) bc[e.key].gone = false; if (joined) sendNow(); });
    ch.on('broadcast', { event: 's' }, function (msg) {
      var d = msg && msg.payload; if (!d || !d.k || d.k === tab) return;
      var b = bc[d.k];
      if (b && (b.v || 0) > (d.v || 0)) { b.at = Date.now(); return; }
      bc[d.k] = { v: d.v, p: d.p || {}, at: Date.now(), gone: false };
      fire();
    });

    var R = {
      name: name,
      presence: function (patch) {
        var n = {}; Object.keys(mine).forEach(function (k) { n[k] = mine[k]; });
        Object.keys(patch || {}).forEach(function (k) { if (patch[k] === null) delete n[k]; else n[k] = patch[k]; });
        n._v = ++ver; mine = n; schedule(); fire();
        return Promise.resolve();
      },
      onPeers: function (f) { subs.push(f); setTimeout(function () { f({ peers: snap(), joined: [], left: [], updated: [] }); }, 0); return function () { subs = subs.filter(function (x) { return x !== f; }); }; },
      peers: snap,
      connected: function () { return connected; },
      onConnection: function (f) { connSubs.push(f); setTimeout(function () { f(connected); }, 0); return function () {}; },
      emit: function () { return Promise.resolve(); },
      on: function () { return function () {}; },
      leave: function () {
        left = true; joined = false; clearInterval(beat); clearTimeout(sendTimer); clearTimeout(trackTimer);
        return ch.untrack().catch(function () {}).then(function () { return sb.removeChannel(ch); }).catch(function () {});
      }
    };
    R._ready = new Promise(function (res) {
      ch.subscribe(function (status) {
        if (left) return;
        if (status === 'SUBSCRIBED') {
          /* first join and every automatic re-join after a dropped connection */
          joined = true; setConn(true); tracked = -1; lastTrack = Math.min(lastTrack, Date.now() - TRACK_GAP);
          track(); sendNow(); res(R);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { setConn(false); res(null); }
      });
      setTimeout(function () { res(joined ? R : null); }, 9000);
    });
    /* heartbeat: resend my state so anyone who missed a message (or just arrived) catches up */
    beat = setInterval(function () {
      if (!joined || left) return;
      if (isLobby && !hasLobbyState()) return;
      sendNow();
      var now = Date.now(); Object.keys(bc).forEach(function (k) { if (now - bc[k].at > STALE * 4) delete bc[k]; });
    }, isLobby ? BEAT_LOBBY : BEAT_ROOM);
    return R;
  }

  var lobby = mkRoom('lobby', true);
  lobby.join = function (n) { var r = mkRoom(n, false); return r._ready.then(function (x) { if (!x) throw { code: 'upstream_error' }; return x; }); };
  window.claude = { use: function (n) { if (n !== 'room') return Promise.resolve(null); return lobby._ready; } };
})();
