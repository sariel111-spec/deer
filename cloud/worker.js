// 小鹿的云端推送。
// 小鹿离开前台时，把「他接下来要说的话」连同时间交到这里；到点由这里把通知推到手机。
// 小鹿回到前台时会把还没发的收回去，自己在聊天里补上同样的话。
//
// 需要两样东西（都在 Cloudflare 后台里配，免费档够用）：
//   1. 一个 D1 数据库，绑定名 DB（表会自己建）
//   2. 一个每分钟一次的定时触发：* * * * *
// 推送用的密钥第一次用到时自己生成、存在数据库里，谁都不用经手。

const SITE = 'https://sariel111-spec.github.io';
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
const MAX_SUBS = 8, MAX_ITEMS = 12, AHEAD = 72 * 3600e3, STALE = 6 * 3600e3;

const enc = new TextEncoder();
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
const cut = (s, n) => [...String(s ?? '')].slice(0, n).join('');

/* ── 数据库 ── */
let ready = false;
async function ensure(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS subs (id TEXT PRIMARY KEY, sub TEXT NOT NULL, seen INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, sid TEXT NOT NULL, at INTEGER NOT NULL, payload TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS items_at ON items (at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS items_sid ON items (sid)'),
  ]);
  ready = true;
}

/* ── 推送密钥（VAPID）：第一次用到时生成 ── */
let keys = null;
async function vapid(db) {
  if (keys) return keys;
  let row = await db.prepare("SELECT v FROM kv WHERE k='vapid'").first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    // 两个请求同时赶上第一次：只留先写进去的那一把
    await db.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ jwk, pub })).run();
    row = await db.prepare("SELECT v FROM kv WHERE k='vapid'").first();
  }
  const { jwk, pub } = JSON.parse(row.v);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return keys = { key, pub };
}
const tokens = new Map();
async function bearer(db, aud, site) {
  const now = Math.floor(Date.now() / 1000), had = tokens.get(aud);
  if (had && had.exp - now > 600) return had.t;
  const { key } = await vapid(db), exp = now + 12 * 3600;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), body = b64u(enc.encode(JSON.stringify({ aud, exp, sub: site })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  const t = head + '.' + body + '.' + b64u(sig);
  tokens.set(aud, { t, exp });
  return t;
}

/* ── 发一条推送（RFC 8291 的 aes128gcm 加密 + RFC 8292 的签名） ── */
async function push(env, sub, payload, ttl = 6 * 3600) {
  const site = env.SITE || SITE;
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const mine = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', mine.publicKey));
  const theirs = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, mine.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), ua, as), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, cat(enc.encode(payload), new Uint8Array([2]))));
  const body = cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([as.length]), as, sealed);
  const { pub } = await vapid(env.DB);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: String(ttl), urgency: 'high',
      authorization: `vapid t=${await bearer(env.DB, new URL(sub.endpoint).origin, site)}, k=${pub}`,
    },
    body,
  });
  return res.status;
}

/* ── 收到的东西先验一遍 ── */
function okSub(env, s) {
  try {
    const u = new URL(s.endpoint);
    if (typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string' || s.endpoint.length > 1000) return false;
    if (env.DEV) return true;
    return u.protocol === 'https:' && PUSH_HOSTS.some(r => r.test(u.hostname));
  } catch { return false; }
}
const sidOf = async endpoint => b64u(await crypto.subtle.digest('SHA-256', enc.encode(endpoint))).slice(0, 32);
// 一条通知的内容。带 web_push:8030 的这种写法，新一点的 iPhone 会由系统直接弹出来，不用先叫醒网页
function message(site, home, it) {
  const title = cut(it.title, 60) || '小鹿', body = cut(it.body, 300), pid = cut(it.pid, 40);
  const badge = Number.isFinite(it.badge) ? Math.max(0, Math.min(999, Math.round(it.badge))) : undefined;
  const base = typeof home === 'string' && home.startsWith(site + '/') ? home.split('#')[0] : site + '/';
  return JSON.stringify({
    web_push: 8030,
    notification: { title, body, navigate: base + '#/c/' + encodeURIComponent(pid), ...(badge === undefined ? {} : { app_badge: String(badge) }) },
    title, body, pid, badge, tag: 'cx-' + pid + '-' + Math.round(it.at || Date.now()),
  });
}

const cors = origin => ({ 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' });
const json = (data, status, origin) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...(origin ? cors(origin) : {}) } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), site = env.SITE || SITE, origin = req.headers.get('origin') || '';
    const allowed = origin === site || (!!env.DEV && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin));
    if (req.method === 'GET' && url.pathname === '/') return new Response('小鹿的云端推送在这里。', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (!allowed) return json({ error: 'origin' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (!env.DB) return json({ error: 'no-db' }, 500, origin);
    try {
      await ensure(env.DB);
      if (req.method === 'GET' && url.pathname === '/key') return json({ key: (await vapid(env.DB)).pub }, 200, origin);
      if (req.method !== 'POST') return json({ error: 'method' }, 405, origin);
      const text = await req.text();
      if (text.length > 20000) return json({ error: 'too-big' }, 413, origin);
      let d; try { d = JSON.parse(text); } catch { return json({ error: 'json' }, 400, origin); }
      if (!d || !okSub(env, d.sub)) return json({ error: 'sub' }, 400, origin);
      const sub = { endpoint: d.sub.endpoint, keys: { p256dh: d.sub.keys.p256dh, auth: d.sub.keys.auth } };
      const sid = await sidOf(sub.endpoint), now = Date.now(), db = env.DB;

      if (url.pathname === '/test') {
        const status = await push(env, sub, message(site, d.home, { title: d.title, body: d.body, pid: d.pid, at: now }), 300);
        return json({ ok: status >= 200 && status < 300, status }, 200, origin);
      }
      if (url.pathname === '/plan') {
        const items = (Array.isArray(d.items) ? d.items : []).filter(it => it && Number.isFinite(it.at) && it.at > now - 60e3 && it.at < now + AHEAD).slice(0, MAX_ITEMS);
        await db.batch([
          db.prepare('INSERT INTO subs (id, sub, seen) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET sub = excluded.sub, seen = excluded.seen').bind(sid, JSON.stringify(sub), now),
          db.prepare('DELETE FROM items WHERE sid = ?').bind(sid),
          ...items.map(it => db.prepare('INSERT INTO items (sid, at, payload) VALUES (?, ?, ?)').bind(sid, Math.round(it.at), message(site, d.home, it))),
          // 只留最近用过的几台设备
          db.prepare('DELETE FROM items WHERE sid NOT IN (SELECT id FROM subs ORDER BY seen DESC LIMIT ?)').bind(MAX_SUBS),
          db.prepare('DELETE FROM subs WHERE id NOT IN (SELECT id FROM subs ORDER BY seen DESC LIMIT ?)').bind(MAX_SUBS),
        ]);
        return json({ ok: true, held: items.length }, 200, origin);
      }
      if (url.pathname === '/leave') {
        await db.batch([db.prepare('DELETE FROM items WHERE sid = ?').bind(sid), db.prepare('DELETE FROM subs WHERE id = ?').bind(sid)]);
        return json({ ok: true }, 200, origin);
      }
      return json({ error: 'path' }, 404, origin);
    } catch (e) {
      return json({ error: 'server', detail: String(e && e.message || e).slice(0, 200) }, 500, origin);
    }
  },

  // 每分钟看一眼：到点的发出去。只晚不早：通知弹出来的时候，小鹿的聊天里一定已经能补上这一句
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const db = env.DB; if (!db) return;
      await ensure(db);
      const now = Date.now();
      await db.prepare('DELETE FROM items WHERE at < ?').bind(now - STALE).run();
      const due = (await db.prepare('SELECT i.id, i.sid, i.payload, s.sub FROM items i JOIN subs s ON s.id = i.sid WHERE i.at <= ? ORDER BY i.at LIMIT 12').bind(now).all()).results || [];
      const gone = new Set();
      for (const it of due) {
        if (gone.has(it.sid)) continue;
        let status = 0;
        try { status = await push(env, JSON.parse(it.sub), it.payload); } catch { status = 0; }
        // 404 / 410：这台设备已经不收推送了，连同它名下的都清掉
        if (status === 404 || status === 410) { gone.add(it.sid); continue; }
        // 推送服务一时不通（5xx、网络）：留着下一分钟再试；其余情况都算处理完
        if (status === 0 || status >= 500) continue;
        await db.prepare('DELETE FROM items WHERE id = ?').bind(it.id).run();
      }
      for (const sid of gone) await db.batch([db.prepare('DELETE FROM items WHERE sid = ?').bind(sid), db.prepare('DELETE FROM subs WHERE id = ?').bind(sid)]);
    })());
  },
};
